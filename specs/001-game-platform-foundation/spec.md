# Feature Specification: Mobile Game Platform Foundation

**Feature Branch**: `001-game-platform-foundation`

**Created**: 2026-08-18

**Status**: Draft

**Input**: User description: "React Native mobile app for small games, with a
database and Google auth running in Docker (Supabase). It should be a *base* for
creating mobile applications. There will be a main screen where
registration/authorization is optional — some games won't have it at all, and
then it's unclear how to save progress. Some games have no registration yet still
save and transfer progress between devices. The base must let me change, by
switching something in code, the path by which data is saved."

## Context

This feature delivers the foundation itself, not a finished game. Its primary
consumer is a developer starting a new small game; its secondary consumer is the
player of any game built on it. Both are treated as first-class users below,
because a foundation that is pleasant for players but painful for developers has
failed at its actual job.

The defining constraint is that **the persistence target is a configuration
choice, not an architectural commitment**. A game may ship with no accounts at
all, with silent anonymous cloud saves, or with full Google sign-in, and moving
between those modes must not touch game code.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Play immediately, keep progress, no account (Priority: P1)

A player opens the app for the first time and is taken straight to a main screen
listing the available games. They pick one, play it, and close the app. When they
reopen it days later, their progress, high score, and settings are exactly as
they left them. They were never shown a login wall and never created an account.

**Why this priority**: This is the floor. Without it there is no app, and it
encodes the project's central rule that progress is never held hostage by a
login. It is also the only story that must work with zero external
infrastructure — no Docker, no network, no configuration.

**Independent Test**: Install the app on a clean device with networking disabled
and no backend running. Play a game, produce a score, force-quit, relaunch.
Progress is intact and no authentication UI ever appeared.

**Acceptance Scenarios**:

1. **Given** a fresh install with no stored data, **When** the app launches,
   **Then** the main screen appears with the game list and a player profile that
   was created automatically, with no sign-in prompt.
2. **Given** a player mid-progress in a game, **When** they force-quit and
   relaunch the app, **Then** the previously saved progress is restored.
3. **Given** the device is fully offline and no backend is reachable, **When**
   the player plays and progress is saved, **Then** the save succeeds and no
   error is surfaced.
4. **Given** a player has a personal best, **When** they finish a worse round,
   **Then** the personal best is retained rather than overwritten.

---

### User Story 2 - Change where data is saved by changing one value (Priority: P2)

A developer building on the foundation decides their game should sync to the
cloud instead of storing progress only on the device. They open a single
configuration file, change the persistence mode, and restart. Progress now
replicates to the database. No screen, game, or store file is edited.

**Why this priority**: This is the explicit reason the foundation exists. It is
second only because Story 1 must exist for there to be anything to switch.

**Independent Test**: With a game working in device-local mode, change the single
persistence setting to the cloud-backed mode and restart. The same game code now
reads and writes through the database, verified by inspecting stored rows. Diff
the working tree: exactly one configuration file changed.

**Acceptance Scenarios**:

1. **Given** the app configured for device-local storage, **When** the developer
   switches the persistence mode to cloud-backed and restarts, **Then** game
   saves are written to the database with no other source change.
2. **Given** the app configured for the offline-first hybrid mode, **When** a
   save is written while offline and connectivity later returns, **Then** the
   pending save replicates automatically without player action.
3. **Given** any configured persistence mode, **When** a game reads or writes
   progress, **Then** the game code path is byte-for-byte identical across
   modes.
4. **Given** an invalid or incoherent configuration combination, **When** the app
   starts, **Then** it fails loudly at startup with a message naming the
   offending setting, rather than degrading silently.

---

### User Story 3 - Sign in with Google without losing what you had (Priority: P2)

A player has been playing for a week without an account and has meaningful
progress. They want that progress safe, so they sign in with Google from the
profile screen. Their existing progress carries over into the account. On a
second device, signing in with the same Google account shows that same progress.

**Why this priority**: Account sign-in is the durable path to cross-device play
and the reason the database exists. The progress-preserving upgrade is the part
that is easy to get wrong and expensive to retrofit, so it is specified here
rather than discovered later.

**Independent Test**: Accumulate progress with no account. Sign in with Google.
Confirm the same progress is present and attributed to the account, and that no
second empty profile was created. Sign in on a second device and confirm the
progress appears.

**Acceptance Scenarios**:

1. **Given** an anonymous player with progress, **When** they sign in with
   Google, **Then** their existing progress is attributed to the Google account
   and remains visible.
2. **Given** a signed-in player on device A, **When** they sign in with the same
   account on device B, **Then** device B shows the progress from device A.
3. **Given** a player signs out, **When** they return to the main screen,
   **Then** the app remains playable and progress-saving continues under an
   anonymous identity.
4. **Given** the sign-in flow is dismissed or cancelled midway, **When** control
   returns to the app, **Then** the previous identity and progress are unchanged.
5. **Given** the identity provider is configured as device-only, **When** the
   profile screen renders, **Then** no sign-in affordance is shown at all.

---

### User Story 4 - Move progress to a new device without an account (Priority: P3)

A player with no account gets a new phone. On the old phone they open the profile
screen and generate a short transfer code. On the new phone they enter that code.
Their progress moves across. The code then stops working.

**Why this priority**: This answers the open question in the original request —
how games with no registration still move progress between devices. It is P3
because it requires the cloud modes from Stories 2 and 3 to be in place first.

**Independent Test**: On device A with an anonymous profile and progress,
generate a code. Enter it on device B. Device B shows device A's progress.
Re-entering the same code fails. An expired code fails.

**Acceptance Scenarios**:

1. **Given** an anonymous player with progress, **When** they request a transfer
   code, **Then** a short human-transcribable code with a visible expiry is
   shown.
2. **Given** a valid unredeemed code, **When** it is entered on a second device,
   **Then** that device's profile takes over the original progress.
3. **Given** a code that has already been redeemed, **When** it is entered again,
   **Then** redemption is refused and the entering device keeps its own state.
4. **Given** a code past its expiry, **When** it is entered, **Then** redemption
   is refused with a clear reason.
5. **Given** repeated wrong codes from one device, **When** attempts exceed the
   limit, **Then** further attempts are throttled.
6. **Given** the app is in device-local mode where transfer is impossible,
   **When** the profile screen renders, **Then** transfer is not offered.

---

### User Story 5 - Add a new game as a self-contained plugin (Priority: P3)

A developer adds a second game. They create one folder for it, declare it in the
game registry, and it appears on the main screen with working persistence and
scoring. They never touch storage or authentication code. Later they delete the
folder and the registry line, and the game is gone with nothing left behind.

**Why this priority**: This is what makes the base reusable rather than a
one-off. It is P3 because the platform capabilities it exposes must exist first.

**Independent Test**: Add a trivial game in a new folder plus one registry entry.
It appears on the main screen, saves and restores its own state, and shares the
platform's identity. Then remove both and confirm the app builds and runs clean.

**Acceptance Scenarios**:

1. **Given** a new game folder and registry entry, **When** the app starts,
   **Then** the game is listed on the main screen and launchable.
2. **Given** a game saving its own state, **When** another game saves state,
   **Then** neither game can read or clobber the other's saved data.
3. **Given** a registered game, **When** its folder and registry entry are
   removed, **Then** the app builds and runs with no dangling references.
4. **Given** a game whose stored save shape has changed between versions,
   **When** an old save is loaded, **Then** it is migrated to the current shape
   rather than crashing or being discarded.

---

### Edge Cases

- **Two devices edit the same save while both offline.** Both reconnect. The
  configured conflict strategy decides the winner, deterministically and
  identically on both devices. For score-like values the higher value must win
  regardless of which write landed last.
- **Backend unreachable in a cloud-only mode.** The app must state plainly that
  progress cannot be saved right now, rather than pretending success or crashing.
- **Corrupt or unparseable local save.** Treated as absent, quarantined rather
  than deleted, and reported once. The app still starts.
- **Same Google account signs in over a *different* anonymous profile that also
  has progress.** Two histories exist and one cannot be silently destroyed; the
  player must be asked which to keep.
- **Storage full on write.** The write fails as a reportable error; already-saved
  data is not corrupted by a partial write.
- **Clock skew between devices.** Timestamp-based conflict resolution must not
  let a device with a wrong clock permanently win every future conflict.
- **Player signs out with unsynced local writes pending.** Pending writes are
  either flushed first or explicitly and visibly discarded, never silently lost.
- **Deep link or OAuth callback arrives while the app is cold-starting.** The
  callback is handled after initialization rather than dropped.

## Requirements *(mandatory)*

### Functional Requirements

**Identity**

- **FR-001**: System MUST create a usable player identity automatically on first
  launch, with no player action and no network.
- **FR-002**: System MUST support at least three interchangeable identity
  strategies: device-only, anonymous cloud, and authenticated account.
- **FR-003**: System MUST support Google sign-in for the authenticated strategy,
  using an authorization flow that requires no embedded client secret.
- **FR-004**: System MUST preserve all existing progress when an anonymous
  identity is upgraded to an authenticated account.
- **FR-005**: System MUST keep the app fully playable after sign-out, reverting
  to an anonymous identity.
- **FR-006**: System MUST hide every authentication affordance when configured
  with a strategy that does not support accounts.
- **FR-007**: System MUST persist the active session across app restarts using
  the platform's secure storage, not plain storage.

**Persistence**

- **FR-008**: System MUST expose a single storage interface to game and feature
  code, with the concrete target selectable by configuration.
- **FR-009**: System MUST provide at least three storage adapters: device-local,
  cloud-backed, and offline-first hybrid.
- **FR-010**: Switching persistence target MUST require changing exactly one
  configuration file and no feature, screen, or game source file.
- **FR-011**: System MUST namespace saved data per player and per game so no game
  can read or overwrite another's data.
- **FR-012**: System MUST version every persisted record and apply a declared
  migration when a stored version is older than the current one.
- **FR-013**: In hybrid mode, reads MUST be served from local storage without
  awaiting the network.
- **FR-014**: In hybrid mode, writes MUST be committed locally first and queued
  for replication, surviving app restarts while queued.
- **FR-015**: System MUST resolve sync conflicts using a named, configurable
  strategy, and MUST provide at least last-write-wins and highest-value
  strategies.
- **FR-016**: System MUST fail at startup with a specific, actionable message
  when the configuration is internally inconsistent.

**Cross-device transfer**

- **FR-017**: System MUST let a player holding an anonymous identity generate a
  short transfer code that moves their progress to another device.
- **FR-018**: Transfer codes MUST be single-use and MUST expire.
- **FR-019**: System MUST store transfer codes only as irreversible hashes and
  MUST never log them.
- **FR-020**: System MUST throttle repeated failed redemption attempts.
- **FR-021**: Transfer affordances MUST be hidden when the configured mode cannot
  support cross-device transfer.

**Platform and games**

- **FR-022**: System MUST present a main screen listing all registered games as
  the app's entry point.
- **FR-023**: System MUST let a game be added via one self-contained module plus
  one registry entry, with no changes to platform internals.
- **FR-024**: System MUST give each game access to persistence and identity
  through platform-provided hooks rather than direct adapter access.
- **FR-025**: System MUST let a game declare its own save shape and scoring
  behaviour in its registry entry.

**Security and data protection**

- **FR-026**: Every table containing player data MUST enforce row-level access
  control restricting rows to their owning player.
- **FR-027**: The client MUST only ever hold a public, restricted API key.
  Privileged keys MUST NOT be present in the client bundle or repository.
- **FR-028**: System MUST validate all data crossing a trust boundary before use.
- **FR-029**: System MUST redact tokens, credentials, transfer codes, and
  personal identifiers from all logs.
- **FR-030**: System MUST treat client-submitted scores as untrusted and MUST NOT
  present them as verified without server-side validation.

**Operations**

- **FR-031**: The database and authentication services MUST be runnable locally
  in containers via a single documented command.
- **FR-032**: All configuration secrets MUST be supplied by environment, with
  only a placeholder template committed.
- **FR-033**: Database schema changes MUST be expressed as ordered, replayable
  migration files.

### Key Entities

- **Player Profile**: The person playing. Holds a stable player id, a display
  name, an avatar, and whether the identity is currently anonymous or
  authenticated. Owns all save records. Survives the anonymous-to-account
  upgrade with the same progress attached.
- **Save Record**: One addressable unit of persisted state, identified by owning
  player plus a namespaced key. Carries the payload, a schema version, a
  monotonic revision, a last-writer device, and an update timestamp. Revision
  and timestamp together are what make conflict resolution decidable.
- **Game Definition**: A game's registry entry. Declares id, title, description,
  icon, entry component, save schema and version, migrations, and scoring
  behaviour. The single place the platform learns a game exists.
- **Score Entry**: A recorded result for one player in one game, with value and
  achieved-at time, plus whether it has been server-validated. Distinct from a
  save record because it is comparable across players.
- **Transfer Code**: A short-lived, single-use credential that reassigns
  ownership of an anonymous player's save records to another device. Stored as a
  hash with owner, expiry, and redemption state.
- **Sync Queue Entry**: A local write awaiting replication. Holds target key,
  payload, attempt count, and last error. Persisted so it survives restarts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player reaches a playable game from a cold first launch in under
  3 seconds on mid-range hardware, with zero taps on any authentication UI.
- **SC-002**: Changing the persistence target from device-local to cloud-backed
  requires editing exactly **1** file and **0** lines of game, screen, or store
  code, verified by diff.
- **SC-003**: Adding a new game to the platform requires **1** new folder and
  **1** registry line, with no edits to platform internals, verified by diff.
- **SC-004**: 100% of progress is retained across an anonymous-to-Google
  upgrade, measured by comparing every save record before and after.
- **SC-005**: With the network disabled, 100% of save and load operations
  succeed in device-local and hybrid modes.
- **SC-006**: Every queued offline write replicates within 30 seconds of
  connectivity returning, with no player action.
- **SC-007**: Given the same pair of conflicting records, every device resolves
  to the identical winner, verified by a deterministic test suite.
- **SC-008**: A developer brings the containerized database and auth stack up
  from a clean checkout in under 10 minutes following the quickstart, with no
  undocumented manual step.
- **SC-009**: Every table holding player data has row-level access control
  enabled, verified by an automated check that fails the build otherwise.
- **SC-010**: No privileged key or secret value appears anywhere in the
  repository, verified by an automated scan.
- **SC-011**: Every storage adapter passes the identical shared contract test
  suite, proving the adapters are genuinely interchangeable.
- **SC-012**: A save record written by a previous schema version loads
  successfully after migration in 100% of declared migration paths.

## Assumptions

These were chosen as reasonable defaults where the original request left the
detail open. Each is a decision that can be revisited without redesign.

- **Which games ship is deliberately out of scope.** The request explicitly
  deferred this. The foundation ships exactly one minimal reference game, whose
  purpose is to prove the platform contracts are usable, not to be fun. Real
  games are separate features.
- **Expo is the React Native flavour**, targeting iOS and Android, with web
  treated as a development convenience rather than a supported target.
- **The database and auth stack is self-hosted via containers** for local
  development, per the request. The same client code must work unchanged against
  a hosted instance by changing only environment values.
- **Google is the only third-party sign-in provider** in this feature. The
  identity port must not make adding others structurally difficult.
- **The offline-first hybrid mode is the recommended default** for new games,
  because it is the only mode that satisfies both "works with no account" and
  "moves between devices". Device-local is the default for a game that
  deliberately wants no backend at all.
- **Single-player games are assumed.** Real-time multiplayer would impose
  authority and latency requirements this design does not attempt to meet.
- **Competitive leaderboards are out of scope.** Score storage exists, but a
  leaderboard presented as trustworthy needs server-side score validation, which
  is deferred to its own feature.
- **Players are assumed to accept that a lost transfer code with no account
  means lost progress.** This is the honest cost of not requiring registration,
  and the UI must say so plainly rather than imply durability it cannot provide.
