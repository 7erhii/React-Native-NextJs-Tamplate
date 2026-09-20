---
description: "Task breakdown for the mobile game platform foundation"
---

# Tasks: Mobile Game Platform Foundation

**Input**: Design documents from `specs/001-game-platform-foundation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Included. The spec makes testability a success criterion (SC-007,
SC-011, SC-012), and SC-011 in particular is only meaningful as an executable
suite — a shared contract suite that every adapter must pass is what proves the
adapters are interchangeable rather than merely typed alike.

**Organization**: Grouped by user story so each is independently shippable.

## Current status

All code for User Stories 1–5 is implemented, and the automated gates pass:
typecheck, lint (including the Principle I import restriction), 46 unit and
contract tests, the RLS check, and the secret scan.

What remains is **verification that needs a device or a running backend**, not
implementation: the offline restart check (T031), running the contract suite
against the cloud and hybrid adapters (T040), the end-to-end upgrade and transfer
checks (T050, T055), and the diff-based confirmations of SC-002 and SC-003
(T041, T057). Those are listed unchecked below and should not be marked done
until actually observed.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependencies)
- **[Story]**: owning user story (US1–US5)

---

## Phase 1: Setup

- [x] T001 Scaffold Expo SDK 57 project with `expo-router`, TypeScript strict, `src/` layout
- [x] T002 [P] Add dependencies: `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `expo-secure-store`, `expo-web-browser`, `expo-linking`, `expo-crypto`, `zustand`, `zod`
- [x] T003 [P] Add dev dependencies and scripts: `typecheck`, `lint`, `test` (`jest-expo`), `check:rls`, `check:secrets`
- [x] T004 [P] Configure ESLint with `no-restricted-imports` forbidding adapter and `@supabase/*` imports from `src/app/**`, `src/features/**`, `src/games/**` — the mechanical enforcement of Principle I
- [x] T005 [P] Add `.gitignore` covering `.env`, `infra/supabase/docker/`, build output
- [x] T006 [P] Theme and shared UI primitives in `src/constants/theme.ts`, `src/components/`

---

## Phase 2: Foundational (blocking)

**⚠️ No user story work can begin until this phase completes.**

- [x] T007 Define `SaveStorePort`, `SaveRecord`, `StoreCapabilities`, error types in `src/core/storage/types.ts` per [save-store-port.md](./contracts/save-store-port.md)
- [x] T008 [P] Define `IdentityPort`, `PlayerIdentity`, `SignInOutcome` in `src/core/identity/types.ts` per [identity-port.md](./contracts/identity-port.md)
- [x] T009 [P] Define `GameDefinition` and `ConflictStrategyName` in `src/core/games/types.ts`
- [x] T010 Config switch in `src/config/app.config.ts` plus startup validation in `src/config/app.config.schema.ts` — reject the two impossible combinations by name (FR-016)
- [x] T011 [P] Validated environment access in `src/config/env.ts`; fail fast on a missing URL/anon key in cloud modes
- [x] T012 [P] Redacting logger in `src/core/logging/index.ts` — strips tokens, emails, codes, user ids by key name (FR-029)
- [x] T013 [P] `KeyValuePort` + AsyncStorage adapter in `src/core/storage/async-storage.kv.ts`
- [x] T014 [P] Chunked SecureStore adapter in `src/core/storage/secure-store.kv.ts`, working around the per-item size limit (R6)
- [x] T015 Named conflict strategies in `src/core/sync/conflict.ts`: `last-write-wins`, `highest-value`, `prefer-local`, `prefer-remote`
- [x] T016 `local` adapter in `src/core/storage/local.store.ts` — offline, no backend
- [x] T017 `device-identity` adapter in `src/core/identity/device-identity.adapter.ts` — UUID in secure storage, never networks
- [x] T018 Store factory in `src/core/storage/index.ts` and identity factory in `src/core/identity/index.ts` — the only files reading config (Principle II)
- [x] T019 [P] Game registry in `src/core/games/registry.ts`
- [x] T020 React surface in `src/platform/`: `providers.tsx`, `use-identity.ts`, `use-save-state.ts`, `use-sync-status.ts` — prefix injection, Zod validation, migration on read
- [x] T021 [P] Shared adapter contract suite in `src/core/storage/__tests__/store-contract.ts` — parameterized, run against every adapter (SC-011)
- [x] T022 [P] Unit tests for conflict strategies asserting determinism (SC-007)

**Checkpoint**: ports, switch, local adapters, and the contract suite exist. User stories unblocked.

---

## Phase 3: User Story 1 — Play immediately, keep progress, no account (P1) 🎯 MVP

**Goal**: Main screen, a playable game, progress that survives a restart, zero auth UI, zero infrastructure.

**Independent Test**: Clean install, networking disabled, no backend. Play, force-quit, relaunch — progress intact, no sign-in ever shown.

- [x] T023 [US1] Root layout `src/app/_layout.tsx` — providers, identity restore, splash gate
- [x] T024 [US1] Main screen `src/app/index.tsx` — hub listing registered games, profile entry point (FR-022)
- [x] T025 [US1] Generic game host `src/app/play/[gameId].tsx` — resolves from registry, renders the game (FR-023)
- [x] T026 [P] [US1] Reference game save shape in `src/games/tap-rush/save.ts` — Zod schema, version, migrations, initial state
- [x] T027 [P] [US1] Reference game definition in `src/games/tap-rush/definition.ts`
- [x] T028 [US1] Reference game screen in `src/games/tap-rush/screen.tsx` — persists best score via `useSaveState` only
- [x] T029 [US1] Register the reference game (one line in the registry)
- [x] T030 [US1] Settings screen `src/app/settings.tsx` — shows active persistence/identity mode and sync state
- [ ] T031 [US1] Verify offline: airplane mode, force-quit, relaunch, progress intact

**Checkpoint**: US1 complete and demonstrable with no backend running.

---

## Phase 4: User Story 2 — Change where data is saved by changing one value (P2)

**Goal**: `cloud` and `hybrid` adapters behind the same port, selected by one config value.

**Independent Test**: Switch the mode, restart, confirm rows land in the database. `git diff --stat` shows exactly one changed file.

- [x] T032 [US2] Supabase client in `src/core/supabase/client.ts` — the **only** file importing the vendor SDK; session persisted via chunked SecureStore
- [x] T033 [US2] `0001_init.sql` — `profiles`, `save_records`, `scores`, RLS enabled at creation, `updated_at` triggers, `handle_new_user` (FR-026)
- [x] T034 [US2] `cloud` adapter in `src/core/storage/supabase.store.ts` — Zod-validated responses, typed `OfflineError`, no silent success
- [x] T035 [US2] Durable sync queue in `src/core/sync/queue.ts` — survives restarts, coalesces per key (FR-014)
- [x] T036 [US2] Sync engine in `src/core/sync/engine.ts` — drains with exponential backoff, reconciles via the configured strategy
- [x] T037 [US2] `hybrid` adapter in `src/core/storage/hybrid.store.ts` — local-first reads, write-then-queue (FR-013, FR-014)
- [x] T038 [US2] Extend the store factory to all three modes
- [x] T039 [P] [US2] `infra/supabase/bootstrap.sh` + `docker-compose.override.yml` + `.env.example` (FR-031, FR-032)
- [ ] T040 [US2] Run the shared contract suite against `cloud` and `hybrid` unchanged (SC-011)
- [x] T041 [US2] Verify SC-002 by diff: one file changed to switch modes —
      confirmed for `local`/`device`, `hybrid`/`google`, and `cloud`/`google`.
      Each combination typechecks, lints, and passes the suite with
      `app.config.ts` as the only edited file. Runtime behaviour against a live
      backend is still covered by T040.

**Checkpoint**: persistence is genuinely swappable, proven by one suite passing against three adapters.

---

## Phase 5: User Story 3 — Sign in with Google without losing progress (P2)

**Goal**: Anonymous cloud identity by default, optional Google upgrade that preserves the player id.

**Independent Test**: Build progress anonymously, sign in with Google, confirm identical progress and no second profile. Sign in on a second device and confirm it appears.

- [x] T042 [US3] `supabase-identity` adapter in `src/core/identity/supabase-identity.adapter.ts` — anonymous sign-in on restore
- [x] T043 [US3] Google PKCE flow via `expo-web-browser` + `exchangeCodeForSession`; no embedded client secret (FR-003, R4)
- [x] T044 [US3] `upgrade()` via `linkIdentity` so `playerId` is unchanged (FR-004, R5)
- [x] T045 [US3] Return the `conflict` outcome when the Google account already has its own history — never auto-resolve
- [x] T046 [US3] `signOut()` reverting to anonymous with the app still playable (FR-005)
- [x] T047 [US3] Extend the identity factory to all three modes
- [x] T048 [US3] Profile screen `src/app/profile.tsx` — sign in, upgrade, sign out; affordances hidden when unsupported (FR-006)
- [x] T049 [US3] Auth container config: anonymous users, manual linking, Google provider, redirect allow-list
- [ ] T050 [US3] Verify SC-004: every save record identical before and after upgrade

**Checkpoint**: accounts are optional and upgrading never costs progress.

---

## Phase 6: User Story 4 — Move progress to a new device without an account (P3)

**Goal**: Hashed, expiring, single-use, throttled transfer codes.

**Independent Test**: Generate on device A, redeem on device B, progress moves. Re-entry fails. Expired code fails.

- [x] T051 [US4] `0002_transfer_codes.sql` — table, deny-read RLS, `redeem_transfer_code` as `SECURITY DEFINER`, revoked from `public` (FR-018 – FR-020)
- [x] T052 [US4] `src/core/transfer/transfer-code.service.ts` — generate with `expo-crypto`, unambiguous alphabet, hash before storing, never log (FR-019)
- [x] T053 [US4] Redemption call + typed outcomes for not-found, expired, already-redeemed, throttled
- [x] T054 [US4] Transfer UI in the profile screen, hidden when the mode cannot support it (FR-021)
- [ ] T055 [US4] Tests: single-use, expiry, throttling, atomicity of reassignment

**Checkpoint**: the original question — progress transfer with no registration — is answered end to end.

---

## Phase 7: User Story 5 — Add a game as a self-contained plugin (P3)

**Goal**: One folder plus one registry line, cleanly removable.

**Independent Test**: Add a trivial second game, confirm it works, remove it, confirm a clean build.

- [x] T056 [US5] `docs/adding-a-game.md` walkthrough
- [ ] T057 [US5] Verify SC-003 by diff: one new folder, one registry line, no platform edits
- [ ] T058 [US5] Verify removability: delete folder + line, build clean, no dangling references
- [ ] T059 [P] [US5] Migration test proving an old save shape loads after upgrade (SC-012)

---

## Phase 8: Polish & Cross-Cutting

- [x] T060 [P] `scripts/check-rls.mjs` — fail if any player-data table lacks RLS (SC-009)
- [x] T061 [P] `scripts/check-secrets.mjs` — fail if a privileged key or `.env` is committed (SC-010)
- [x] T062 [P] `README.md` — architecture, the switch, security posture
- [ ] T063 [P] CI wiring: typecheck, lint, test, both security gates
- [ ] T064 Validate the quickstart end to end from a clean checkout (SC-008)
- [ ] T065 Performance pass against SC-001 (cold launch under 3 s) and 60 fps gameplay
- [x] T066 Document the deferred follow-ups: anonymous-account retention, server-validated leaderboards, platform saved games, realtime sync

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)**: no dependencies
- **Foundational (2)**: needs Setup — **blocks every user story**
- **US1 (3)**: needs Foundational only. Ships with no backend
- **US2 (4)**: needs Foundational. Independent of US1's UI
- **US3 (5)**: needs US2's Supabase client and schema
- **US4 (6)**: needs US3's identity (a code transfers ownership between real users)
- **US5 (7)**: needs US1's registry and host
- **Polish (8)**: after the stories it verifies

### Critical path

```text
Setup → Foundational → US1 (MVP, no backend)
                    ↘ US2 (cloud + hybrid) → US3 (Google) → US4 (transfer)
```

### Parallel opportunities

- All Setup tasks except T001 run in parallel
- T007–T009 (port type definitions) are independent files
- T011–T014 (env, logging, KV adapters) are independent
- T026/T027 (reference game save + definition) parallel with screens
- T060–T062 (scripts, README) fully independent

---

## Implementation Strategy

### MVP first

1. Phase 1 Setup
2. Phase 2 Foundational — the blocking phase; the contract suite lands here
3. Phase 3 US1 — a playable game with local progress and no infrastructure
4. **Stop and validate**: airplane mode, force-quit, relaunch
5. Demo. This is a real deliverable on its own

### Incremental delivery

Each phase after the MVP adds capability without changing game code, which is the
whole thesis. US2 makes saves cloud-backed. US3 adds optional accounts. US4 adds
transfer. A game written during US1 keeps working through all of it, untouched —
and if it does not, the ports have been violated.

### Notes

- The shared contract suite (T021) is the most load-bearing test here: it is what
  turns "the adapters are interchangeable" from a claim into a verified property
- Verify SC-002 and SC-003 by actual `git diff --stat`, not by inspection
- Enforce Principle I in lint (T004) rather than in review; the rule is what keeps
  the architecture from eroding once the project has many contributors
