# Mobile World

Monorepo skeleton: **Expo app + optional Next.js website + optional Supabase**.

Clone this repo as the starting point for a new product. Default is case A:
phone only, no account, no website. Turn those on in `packages/config` when
the product actually needs them.

License: [MIT](./LICENSE).

The switch lives in `packages/config`. Registration is a marker on each
surface (`web.auth`, `mobile.auth`) — the site and the app decide independently,
not only the database. `authSource: 'config+db'` is reserved for a later overlay.

What we are building, in one place:
[`docs/what-we-discussed.md`](docs/what-we-discussed.md).
Design tokens live in `packages/tokens`; the catalog is `/ds` on the site.

```bash
npm install
npm start        # Expo — case A: phone only, no account, no site
npm run web      # Next.js website (apps/web), not Expo web
npm run stack:up # website + Supabase (Postgres, Auth, API) in Docker
```

Node **22** (see `.nvmrc`). Expo SDK 57 does not support Node 23.

Cloud modes: `cp .env.example .env` at the **repo root**. Both apps load that file.

EAS (when you are ready to ship a build): `apps/mobile/eas.json` — profiles `development`, `preview`, `production`. Version: bump `packages/config/src/release.json` (`version` + `build`); EAS reads it locally.

---

## Why this exists

Small products have different shells. A one-screen game should not drag a
website. A bank needs a site with a cabinet and an app on the same database.
The mistake is baking one of those into the foundation.

Identity and persistence stay behind ports. The website is a separate frontend.

### Four identity tiers

| Tier | Player experience | Progress reaches another device |
|---|---|---|
| **Device** | No account. No network. Ever. | No |
| **Anonymous cloud** | No account, no login screen, but progress is in the database | Via a transfer code |
| **Transfer code** | Writes down a short code, types it on the new phone | Yes |
| **Google account** | Optional sign-in that *absorbs* existing progress | Yes |

---

## The switch

One file: `packages/config/src/app.config.ts`.

```ts
export const appConfig: AppConfig = {
  web:    { enabled: false, auth: false },  // Next.js site + Sign in on the site
  mobile: { auth: false, authWall: 'none' },
  authSource: 'config',                     // later: 'config+db'
  identity: { mode: 'device' },
  persistence: { mode: 'local', /* … */ },
};
```

| Case | web.enabled | web.auth | mobile.auth | db |
|---|---|---|---|---|
| A — phone only | false | false | false | no |
| B — phone + registration | false | false | true | yes |
| C — ads site + Install | true | false | as needed | no |
| D — bank: site cabinet + app | true | true | true | yes |

`web.auth` and `mobile.auth` are independent. Case C can have login only on the
phone. The Install button is the website default when `web.auth` is false.

---

## Architecture

```text
apps/
  mobile/     Expo — the phone app
  web/        Next.js — the website (not Expo)
packages/
  config/     ★ the switch both apps read
infra/
  supabase/   optional Postgres + Auth
```

The dependency direction is strictly `games → platform → core`. Games and screens
talk to ports; they never import an adapter or a vendor SDK. That rule is
**enforced by ESLint**, not by convention, because it is the boundary that erodes
quietly: a single `import { supabase }` inside a game screen is enough to make the
one-file-switch claim false, and nothing else would fail.

### What a game sees

```ts
export function MyGameScreen() {
  const { data, save } = useSaveState(myGame);   // persistence
  const { identity } = useIdentity();            // who is playing

  return <Button onPress={() => save({ ...data, best: 10 })} />;
}
```

That is the entire persistence API. `useSaveState` injects the game's key prefix
so games cannot collide, validates every read against the game's schema, and
applies migrations when a stored save is from an older version — so a game never
handles absence, namespacing, or migration itself.

### Adding a game

```text
apps/mobile/src/games/my-game/
├── definition.ts   # the registry entry
├── screen.tsx      # the game
└── save.ts         # schema, version, migrations, initial state
```

Plus one import and one array entry in `apps/mobile/src/core/games/registry.ts`. That is the
whole procedure. See [`docs/adding-a-game.md`](docs/adding-a-game.md).

---

## Running the backend

```bash
cp infra/supabase/.env.example infra/supabase/.env   # then fill it in
npm run db:bootstrap                                 # fetch pinned upstream stack
cd infra/supabase/docker && docker compose up -d
```

Then set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in a root
`.env`, and flip `app.config.ts` to a cloud mode.

Full walkthrough including Google OAuth setup:
[`specs/001-game-platform-foundation/quickstart.md`](specs/001-game-platform-foundation/quickstart.md).

---

## Verification

```bash
npm run typecheck
npm run lint           # includes the architecture boundary rule
npm test               # includes the shared adapter contract suite
npm run check:rls      # fails if a player-data table lacks RLS
npm run check:secrets  # fails if a privileged key is committed
npm run verify         # all of the above
```

The **shared contract suite** is the most important test here. One suite runs
unchanged against every storage adapter, which is what makes "the adapters are
interchangeable" a verified property rather than a claim.

To check the switchability promise yourself: change `persistence.mode`, then run
`git diff --stat` and confirm exactly one file changed.

---

## Specifications

This project was specified before it was built, following
[spec-kit](https://github.com/github/spec-kit) conventions.

| Document | Contents |
|---|---|
| [`.specify/memory/constitution.md`](.specify/memory/constitution.md) | Non-negotiable principles and security gates |
| [`spec.md`](specs/001-game-platform-foundation/spec.md) | Prioritized user stories, requirements, success criteria |
| [`plan.md`](specs/001-game-platform-foundation/plan.md) | Technical context, constitution check, phased delivery |
| [`research.md`](specs/001-game-platform-foundation/research.md) | Every decision, and what was rejected and why |
| [`data-model.md`](specs/001-game-platform-foundation/data-model.md) | Entities, schema, conflict rules, migrations |
| [`contracts/`](specs/001-game-platform-foundation/contracts/) | Port contracts and access policies |
| [`tasks.md`](specs/001-game-platform-foundation/tasks.md) | Task breakdown and current status |

`research.md` is the most useful one to read second: it records the alternatives
that were rejected, which is what stops a future reader from "simplifying" the
design back into the corner it was built to avoid.

---

## Deliberately not built yet

Each of these has a designated place to land, which is why leaving it out now
does not cost a redesign later.

| Deferred | Where it goes | Why it waits |
|---|---|---|
| Anonymous-account retention policy | A scheduled job in the database | Needed before production, not before the first game. Anonymous rows accumulate without bound. |
| Server-validated leaderboards | `is_validated` on `scores`, flipped by a server-side check | The column and the honest `false` default exist. Ranking untrusted client scores would be worse than having no ranking. |
| Game Center / Play Games saves | A fourth `SaveStorePort` adapter | The port already fits it. It buys cross-device sync without a backend, but only per-platform, so it complements rather than replaces the cloud adapter. |
| Realtime sync | Supabase Realtime, feeding the existing sync engine | Interval polling is adequate for turn-based games. Add it when a game needs live opponents. |
| Delete tombstones | `save_records`, plus the hybrid pull path | Deletes are currently local-only, so a removed record can return from the remote. Needs a schema change, so it belongs in a considered migration. |

---

## SECURITY NOTES

**Risks this design takes seriously**

- Cross-player data access if row-level security is missing or misconfigured.
- The service-role key, which bypasses RLS entirely, leaking into the app bundle.
- Transfer-code brute force, or a leaked code table being replayable.
- Session theft from insecure storage.
- OAuth redirect hijacking, or an embedded OAuth client secret being extracted.
- Fabricated scores submitted by a modified client.

**Assumptions**

- Postgres is not exposed to the internet; only the API gateway is.
- The OS keychain/keystore is trustworthy. On **web** it is not available and
  sessions fall back to browser storage — web is a development convenience, not a
  shipping target.
- Local device storage is readable by anyone with device access, so nothing secret
  belongs in a save payload.
- Data written by *previous versions of this app* is untrusted input, because it
  is the most common source of crash-on-launch after an update.

**Safeguards in place**

- RLS enabled on every player-data table, in the same migration that creates it,
  verified by `npm run check:rls` as a build gate.
- The client holds only the anon key. A more privileged key is detected at
  startup and refuses to boot; `npm run check:secrets` covers the repository.
- OAuth uses PKCE with an app-scheme redirect and an explicit allow-list. The
  Google client secret exists only inside the auth container.
- Transfer codes: CSPRNG-generated with rejection sampling, stored only as
  SHA-256 hashes, hashed **server-side** so a leaked table is not replayable,
  single-use, expiring, and throttled per caller. Never logged.
- Ownership reassignment happens only inside a `SECURITY DEFINER` function that
  is revoked from `public`, and atomically, so a failed transfer cannot split a
  history between two owners.
- All logging goes through one redacting logger; tokens, emails, codes, and full
  user ids never reach a log.
- Scores carry `is_validated = false` and are not client-writable to `true`. They
  must not be presented as a verified ranking until server-side validation
  exists.

**Known residual risks**

- **Anonymous accounts accumulate** without bound. A retention policy is required
  before production.
- **Leaderboards are not trustworthy** yet, by design — score storage exists,
  server-side validation does not.
- **Hybrid deletes are local-only.** Tombstones are not modelled, so a deleted
  record can currently reappear from the remote on the next pull.
- **A lost transfer code with no account means lost progress.** That is the honest
  cost of not requiring registration, and the UI says so plainly rather than
  implying a safety net that does not exist.

---

## License

[MIT](./LICENSE). Clone it, rename it, ship a product. Keep the copyright
notice; you do not owe this repo your app's code.
