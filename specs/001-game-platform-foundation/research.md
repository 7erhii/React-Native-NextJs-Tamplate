# Phase 0 Research: Mobile Game Platform Foundation

**Feature**: `001-game-platform-foundation` | **Date**: 2026-08-18

Each entry records what was chosen, why, and what was rejected. The rejections
matter more than the choices: they are what stop a future reader from
"simplifying" the design back into a corner.

---

## R1. React Native flavour — Expo (SDK 57)

**Decision**: Expo SDK 57 with `expo-router` for file-based navigation, using
development builds (not Expo Go) once native auth modules are involved.

**Why**: The deliverable is a foundation that must be cheap to start new projects
from. Expo removes the Xcode/Gradle maintenance burden that would otherwise be
paid once per game, gives config-plugin-based native setup, and provides
`expo-secure-store`, `expo-web-browser`, and `expo-linking` — exactly the three
primitives the OAuth and secure-session requirements need. `expo-router`'s typed
routes also mean a new game's screen is a file, which supports the
"game is a plugin" principle.

**Rejected — bare React Native CLI**: Full native control, but it moves per-project
setup cost from zero to days and makes the "add a game in one folder" promise
harder to keep. No requirement in the spec needs native control that Expo config
plugins cannot express.

**Consequence**: Expo Go is insufficient once native Google sign-in is added. The
chosen OAuth approach (R4) deliberately works without native modules so that
Expo Go remains usable for the default path.

---

## R2. Self-hosted stack — Supabase via official Docker Compose, fetched by script

**Decision**: `infra/supabase/` contains a bootstrap script that fetches the
official `supabase/docker` Compose stack pinned to a known revision, plus **our
own** committed artifacts layered on top: `.env.example`, an override file for
Google and anonymous auth settings, and our SQL migrations mounted into the
database's initialization directory.

**Why**: The Supabase stack is not one service; it is Postgres, GoTrue (auth),
PostgREST, Realtime, Storage, the API gateway, and Studio, with a web of
inter-service secrets and JWT expectations. Hand-writing that Compose file means
owning a subtle, version-sensitive integration surface for no benefit. Fetching
the upstream file pinned to a revision gives a stack that is known to work, while
keeping everything project-specific — env template, auth flags, schema — in this
repository under version control.

**Rejected — hand-written minimal Compose (Postgres + GoTrue + PostgREST +
gateway)**: Attractive because we would own every line, and genuinely smaller.
Rejected because auth misconfiguration in a self-hosted GoTrue is the single most
time-expensive failure mode in this stack, and the upstream compose file is the
reference that avoids it. Revisit only if the full stack proves too heavy for
local development.

**Rejected — Supabase Cloud only**: The request explicitly asked for Docker.
Cloud also makes offline-mode development harder to exercise honestly.

**Consequence**: `infra/supabase/docker/` is generated, not committed. The
bootstrap script is idempotent and the pinned revision is recorded so two
developers get byte-identical stacks. Client code must not care which it talks
to: only environment values differ between local and hosted.

---

## R3. Anonymous identity — Supabase anonymous sign-in, plus a device-only tier below it

**Decision**: Three identity tiers behind one port. **Device** creates a UUID in
secure storage and never contacts a server. **Anonymous cloud** uses Supabase
`signInAnonymously()`, producing a real user row and a real JWT with no player
input. **Account** is Google sign-in.

**Why**: This directly answers the open question in the request — how games with
no registration still save and move progress. An anonymous Supabase user is a
genuine authenticated principal, so row-level security works normally and cloud
saves need no special-cased "guest" code path. The device tier sits below it for
games that want no backend at all, and its existence is what lets the same game
code run with zero infrastructure.

**Rejected — a custom "guest token" scheme**: Would require inventing
authentication, which is the wrong thing to invent. Anonymous sign-in already
produces the exact primitive needed.

**Rejected — treating the device UUID as the cloud row key with no auth**: Would
require permissive table policies, violating the mandatory row-level security
requirement. Anyone could read anyone's saves by guessing a UUID.

**Consequence**: Anonymous users must be enabled in GoTrue configuration.
Anonymous accounts accumulate server-side and need a retention policy; that is
noted as a follow-up, not solved here.

---

## R4. Google sign-in — PKCE authorization-code flow via the system browser

**Decision**: `signInWithOAuth({ provider: 'google', skipBrowserRedirect: true })`
to obtain an authorization URL, opened with `expo-web-browser`'s auth session, and
the returned code exchanged via `exchangeCodeForSession`. The redirect target is
the app's custom scheme. PKCE throughout.

**Why**: This satisfies the requirement that no client secret is embedded in the
app. The Google client secret lives only in the GoTrue container, which is a
confidential server-side client and the correct place for it. The flow needs only
`expo-web-browser` and `expo-linking`, so it works in Expo Go, in development
builds, and on web, keeping the default path dependency-light.

**Rejected — native Google Sign-In (`@react-native-google-signin/google-signin`)
with `signInWithIdToken`**: Genuinely better UX — account picker sheet, no browser
bounce. Rejected as the *default* because it requires a development build,
platform-specific client IDs, and native configuration, all of which raise the
cost of starting a new project. It is documented as a drop-in second adapter
behind the same identity port, which is precisely what the port is for.

**Rejected — implicit flow**: Returns tokens in a redirect URL. Insecure on mobile
and prohibited by the constitution.

---

## R5. Progress-preserving upgrade — identity linking, not data copying

**Decision**: Upgrading anonymous to Google uses Supabase `linkIdentity()`, which
attaches the Google identity to the **existing** user, keeping the same user id.
Save records are keyed by that user id, so no data moves.

**Why**: The cheapest correct migration is no migration. Because ownership is the
user id and the user id does not change, "100% of progress retained" is a
structural property rather than the outcome of a copy routine that could
half-fail. Copying rows between users would need transactional care, dedup
handling, and a rollback path — all avoidable.

**Rejected — sign out anonymously, sign in with Google, then copy rows across**:
The obvious approach and the wrong one. It introduces a window where two profiles
exist, requires merge logic, and can partially fail leaving the player worse off
than before they tried to secure their data.

**Consequence**: Manual linking must be enabled in GoTrue. The case where the
Google account **already exists** with its own progress cannot be solved by
linking — two real histories exist. The spec's edge case stands: ask the player
which to keep. The port surfaces this as a distinct, explicit outcome rather than
an error.

---

## R6. Local storage — AsyncStorage for data, chunked SecureStore for sessions

**Decision**: Save records and the sync queue use `AsyncStorage`. The auth session
uses `expo-secure-store` behind a chunking wrapper.

**Why**: AsyncStorage is available on iOS, Android, and web with one API, needs no
native configuration, and is the storage backend `supabase-js` already expects on
React Native. That uniformity is worth more here than raw speed, because the
device tier must work everywhere with zero setup. Sessions are a different
matter: they are bearer credentials and the constitution requires secure storage,
so they go to the Keychain/Keystore. SecureStore has a per-item size limit that
real JWT-bearing sessions can exceed, hence the chunking wrapper.

**Rejected — MMKV**: Substantially faster synchronous storage. Rejected because it
requires a native module and therefore a development build, breaking the
zero-setup device tier. It is a legitimate later swap: it sits behind the
key-value port, so replacing it touches one adapter.

**Rejected — `expo-sqlite`**: Better for querying and for large datasets. Rejected
as premature: save records are read by exact key, never queried. Revisit if a game
needs indexed local queries.

**Rejected — SecureStore for save data**: Wrong tool. Size-limited, slower, and
progress is not a credential.

---

## R7. Conflict resolution — monotonic revision first, then a named strategy

**Decision**: Every save record carries a `revision` that increments on write and
an `updatedAt`. Comparison prefers the strictly higher revision. When revisions
are equal — meaning two devices diverged from the same base — a **named,
configured strategy** decides: `last-write-wins`, `highest-value` (for scores),
`prefer-local`, `prefer-remote`, or a custom resolver per key. Nothing resolves
implicitly.

**Why**: Revision comparison handles the common case (one device ahead of another)
without consulting clocks at all, which matters because device clocks are wrong
often enough to be a real bug source. Reserving timestamps for genuine ties limits
the damage a skewed clock can do. Requiring the strategy to be *named* is what
makes SC-007's determinism testable, and `highest-value` exists because
last-write-wins is actively wrong for a high score.

**Rejected — pure last-write-wins on timestamp**: Simple, and the standard way
this gets built. Rejected because a device with a fast clock wins every future
conflict permanently, and because it silently destroys a better high score.

**Rejected — CRDTs**: Correct merge semantics without coordination, and genuinely
the right answer for collaborative editing. Rejected as vastly disproportionate:
these are single-player games with per-key documents, and the spec assumes no
multiplayer.

**Rejected — surfacing every conflict to the player**: Honest but hostile. A
player who played the same puzzle on two devices should not be handed a merge
dialog. Reserved for the one case where it is unavoidable: two real account
histories (R5).

---

## R8. Composition — a single config object read only by factories

**Decision**: `src/config/app.config.ts` holds the persistence mode, identity
mode, conflict strategy, and feature toggles. Factories in `src/core/*/index.ts`
read it once and construct adapters. The configuration is validated at startup and
an incoherent combination throws immediately.

**Why**: This is the mechanism behind the request's core requirement. Confining
every branch to factories is what keeps `if (mode === ...)` out of screens, which
is what keeps SC-002 true — one file changed, zero game code touched. Startup
validation exists because the failure mode of a silently-wrong config is a game
that appears to save and does not.

**Rejected — environment variables as the switch**: Attractive for deployment, but
it puts an architectural decision somewhere untyped, unvalidated at compile time,
and invisible in a diff. Environment holds *secrets and endpoints*; code holds
*structure*. Endpoints do come from environment.

**Rejected — a dependency-injection container**: More flexible than needed for
three ports. Plain factory functions are inspectable and require no library.

---

## R9. State and validation — Zustand for platform state, Zod at trust boundaries

**Decision**: Zustand stores hold identity and save-state for the UI. Zod schemas
validate anything crossing a trust boundary: database responses, stored JSON,
deep-link payloads. Persisted shapes carry a version and a migration function.

**Why**: Zustand is small, needs no provider tree gymnastics, and its stores are
readable from outside React — useful because the sync engine is not a component.
Zod gives one declaration that serves as both runtime guard and static type, which
is what makes the versioned-migration requirement practical: the schema is the
thing being migrated.

**Rejected — React Context alone**: Adequate, but re-render behaviour gets awkward
once the sync engine pushes frequent updates, and non-React consumers cannot read
it.

**Rejected — Redux Toolkit**: Fine, but heavier ceremony than three ports justify.

**Rejected — trusting stored JSON**: Stored data is written by *previous versions
of the app*, which makes it as untrusted as network input. This is the requirement
that most often gets skipped and most often causes crash-on-launch after an update.

---

## R10. Transfer codes — hashed, single-use, redeemed by a privileged database function

**Decision**: A short code is generated from a crypto-strength random source using
an unambiguous alphabet (no `0/O`, `1/I/L`). Only its hash is stored, alongside
owner, expiry, and redemption state. Redemption calls a `SECURITY DEFINER`
function that verifies the hash, checks expiry and single use, reassigns save
ownership to the calling user, and marks the code redeemed — all in one
transaction. Failed attempts are counted and throttled.

**Why**: The code is a bearer credential for a player's entire progress, so it gets
credential handling: hashed at rest, never logged, expiring, single-use. Ownership
reassignment must be atomic or a failure mid-transfer could leave progress owned by
neither device, so it belongs in one database function rather than several client
calls. `SECURITY DEFINER` is required because the redeeming user has no
row-level-security right to touch rows they do not yet own — which is exactly the
point.

**Rejected — QR code containing a session or refresh token**: Better UX, and worth
adding later as a *carrier* for the same code. Rejected as the primitive because a
transferable long-lived token that grants account access is a much larger blast
radius than a single-use, expiring, revocable code.

**Rejected — email-based transfer**: Requires collecting an email, which
reintroduces the registration this tier exists to avoid.

**Consequence**: The unambiguous alphabet is a deliberate usability choice — the
player transcribes this by hand between two devices. Code length must be long
enough that throttled guessing is infeasible.

---

## R11. Reference game — one trivially simple game, deliberately

**Decision**: Ship exactly one game ("Tap Rush": tap targets before a timer
expires). It exercises the full platform contract — persisted best score,
persisted settings, versioned save shape, identity-scoped data — and nothing else.

**Why**: The request explicitly deferred game selection and asked not to focus
there. The reference game's job is to be the executable proof that the platform
contracts are usable, and the template a developer copies. A more elaborate game
would obscure the contract it is meant to demonstrate and would imply product
decisions the request declined to make.

**Consequence**: The game is not meant to be fun, and the code says so. Real games
are separate features that add a folder and a registry line.

---

## Open questions deferred to later features

- **Anonymous account retention.** Abandoned anonymous users accumulate in the
  database indefinitely. Needs a documented retention and cleanup policy.
- **Server-validated leaderboards.** Score storage exists; trustworthy ranking
  requires server-side validation of submitted scores. Out of scope per spec.
- **Platform-native saved games** (iCloud / Google Play Games Saved Games). Would
  give cross-device transfer with no code entry at all, at the cost of platform
  lock-in and per-store configuration. Worth evaluating as a fourth adapter.
- **Realtime sync.** The Supabase stack includes Realtime; the current design
  polls and pushes on demand. Live sync would be an additive change behind the
  existing store port.
