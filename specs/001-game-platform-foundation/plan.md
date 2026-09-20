# Implementation Plan: Mobile Game Platform Foundation

**Branch**: `001-game-platform-foundation` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-game-platform-foundation/spec.md`

## Summary

Build a reusable Expo/React Native foundation for small games in which **identity
and persistence are configuration, not architecture**. Three identity tiers
(device-only, anonymous cloud, Google account) and three storage adapters
(local, cloud, offline-first hybrid) sit behind two ports. A single config file
selects the combination; factories are the only code that reads it. A
containerized Supabase stack provides Postgres, GoTrue auth, and PostgREST, with
row-level security on every player-data table. Progress-preserving upgrade from
anonymous to Google uses identity linking so the owning user id never changes, and
cross-device transfer without an account uses hashed, single-use codes redeemed by
an atomic database function.

## Technical Context

**Language/Version**: TypeScript 6.0 (`strict`), React 19.2, Node 22+ for tooling

**Primary Dependencies**: Expo SDK 57, `expo-router` 57, React Native 0.86,
`@supabase/supabase-js` 2.x, `expo-secure-store`, `expo-web-browser`,
`expo-linking`, `@react-native-async-storage/async-storage`, `zustand` 5, `zod` 4

**Storage**: PostgreSQL 15 (self-hosted Supabase) for cloud tiers; AsyncStorage
for local records and the sync queue; Keychain/Keystore via `expo-secure-store`
for sessions and the device key

**Testing**: Jest on the plain `node` environment, with native modules mocked in
`jest.setup.js`. One shared contract suite executed against every adapter of a
port; unit tests for conflict resolution and migrations. The `jest-expo` preset
was not used: the logic under test is pure TypeScript with no renderer
dependency, and the preset's React Native transform pipeline costs startup time
and native-module surface for no benefit here. Add it later if component tests
arrive.

**Target Platform**: iOS 16+, Android 8+ (API 26+). Web supported as a
development convenience only

**Project Type**: Mobile application plus containerized backend services

**Performance Goals**: Cold launch to interactive main screen under 3 s on
mid-range hardware; local read under 16 ms (one frame); 60 fps during gameplay

**Constraints**: Fully functional offline in device and hybrid modes; no
privileged key in the client bundle; queued writes survive process death; no
embedded OAuth client secret

**Scale/Scope**: Single-player games, one player per device session, tens of save
records per player, ~8 screens plus one reference game

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I. Ports and Adapters | No feature/screen/game file imports an adapter or vendor SDK | **PASS** — `IdentityPort` and `SaveStorePort` in `src/core/`; features consume hooks only. Enforced by an ESLint `no-restricted-imports` rule on `src/features/**` and `src/app/**` |
| II. One Switch | Exactly one file encodes wiring choices | **PASS** — `src/config/app.config.ts`; branches confined to `src/core/*/index.ts` factories |
| III. Progress Not Gated by Login | App playable and persisting with no account | **PASS** — device tier requires no network; auth surfaces hidden when unsupported (FR-006) |
| IV. Offline by Default | Local-first reads, queued durable writes, named conflict strategy | **PASS** — hybrid adapter; strategies are named exports with unit tests (R7) |
| V. Game as Plugin | One folder + one registry entry, cleanly removable | **PASS** — `src/games/<id>/` plus a `GameDefinition` in the registry |
| VI. Typed Boundaries | `strict` on, trust boundaries schema-validated, versioned saves | **PASS** — Zod at DB/storage/deep-link edges; `SaveRecord.schemaVersion` with migrations |
| Security: RLS mandatory | Every player-data table has RLS | **PASS** — enabled in migration `0001`; verified by `npm run check:rls` |
| Security: no service key in client | Client holds anon key only | **PASS** — client reads `EXPO_PUBLIC_SUPABASE_ANON_KEY`; `npm run check:secrets` fails the build on a privileged key |
| Security: OAuth PKCE, no client secret | PKCE, secret server-side only | **PASS** — R4; secret lives in the GoTrue container |
| Security: transfer codes hashed/single-use | Hashed, expiring, throttled, never logged | **PASS** — R10; redemption in a `SECURITY DEFINER` function |
| Security: redacted logs | No tokens/PII in logs | **PASS** — all logging goes through `src/core/logging` which redacts by key name |

**Result: PASS.** No violations to justify; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-game-platform-foundation/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: decisions and rejected alternatives
├── data-model.md        # Phase 1: entities, schema, migrations
├── quickstart.md        # Phase 1: developer setup and switching guide
├── contracts/           # Phase 1: port and service contracts
│   ├── identity-port.md
│   ├── save-store-port.md
│   ├── game-registry.md
│   └── database-api.md
└── tasks.md             # Phase 2: ordered task breakdown
```

### Source Code (repository root)

```text
src/
├── app/                          # expo-router routes (thin: layout + wiring only)
│   ├── _layout.tsx               # providers, session restore, splash gate
│   ├── index.tsx                 # main screen — game hub
│   ├── profile.tsx               # identity: sign in, link, transfer codes
│   ├── settings.tsx              # persistence diagnostics, sync status
│   └── play/[gameId].tsx         # generic game host, resolves from registry
│
├── config/
│   ├── app.config.ts             # ★ THE SWITCH — the only wiring file
│   ├── env.ts                    # validated environment access
│   └── app.config.schema.ts      # startup validation of the switch
│
├── core/                         # ports + adapters; no React, no screens
│   ├── identity/
│   │   ├── types.ts              # IdentityPort, PlayerIdentity, SignInOutcome
│   │   ├── device-identity.adapter.ts
│   │   ├── supabase-identity.adapter.ts   # anonymous + Google, via linking
│   │   └── index.ts              # factory: reads config, returns IdentityPort
│   ├── storage/
│   │   ├── types.ts              # SaveStorePort, SaveRecord, KeyValuePort
│   │   ├── async-storage.kv.ts   # KeyValuePort impl
│   │   ├── secure-store.kv.ts    # chunked, for sessions/device key
│   │   ├── local.store.ts        # device-local SaveStorePort
│   │   ├── supabase.store.ts     # cloud SaveStorePort
│   │   ├── hybrid.store.ts       # local-first + replication
│   │   └── index.ts              # factory: reads config, returns SaveStorePort
│   ├── sync/
│   │   ├── conflict.ts           # named strategies (last-write-wins, highest-value, …)
│   │   ├── queue.ts              # durable pending-write queue
│   │   └── engine.ts             # drains queue, reconciles on reconnect
│   ├── transfer/
│   │   └── transfer-code.service.ts
│   ├── games/
│   │   ├── types.ts              # GameDefinition, save schema + migrations
│   │   └── registry.ts           # ★ one line per game
│   ├── supabase/
│   │   └── client.ts             # only file importing @supabase/supabase-js
│   └── logging/
│       └── index.ts              # redacting logger
│
├── platform/                     # React surface over core (what games consume)
│   ├── providers.tsx             # composition root
│   ├── use-identity.ts
│   ├── use-save-state.ts         # the hook a game uses for progress
│   └── use-sync-status.ts
│
├── games/
│   └── tap-rush/                 # reference game: one folder, self-contained
│       ├── definition.ts         # registry entry
│       ├── screen.tsx
│       └── save.ts               # schema + migrations
│
├── components/                   # shared UI primitives
├── constants/theme.ts
└── hooks/

infra/supabase/
├── bootstrap.sh                  # fetches pinned upstream compose stack
├── docker-compose.override.yml   # our auth flags (anonymous, Google, linking)
├── .env.example                  # placeholders only — never real secrets
└── migrations/
    ├── 0001_init.sql             # profiles, save_records, scores + RLS
    └── 0002_transfer_codes.sql   # codes + SECURITY DEFINER redemption

scripts/
├── check-rls.mjs                 # fails if a player-data table lacks RLS
└── check-secrets.mjs             # fails if a privileged key is committed
```

**Structure Decision**: Mobile + containerized API, matching the spec's two
consumers. The load-bearing split is `core/` (pure ports and adapters, no React)
versus `platform/` (the React surface games consume) versus `games/` (plugins).
That boundary is what Principle I protects and what the ESLint restriction
enforces mechanically: a file in `src/games/**` or `src/app/**` that imports from
`src/core/*/\*.adapter.ts`, `src/core/supabase/client`, or `@supabase/supabase-js`
fails lint. Without that rule, Principle I degrades quietly within weeks.

`src/config/app.config.ts` is marked ★ because SC-002 is measured against it: a
persistence change must show up as a one-file diff.

## Phased Delivery

| Phase | Contents | Gate |
|---|---|---|
| **1. Setup** | Expo scaffold, TypeScript strict, lint rules incl. Principle I enforcement, theme | App builds and runs |
| **2. Foundational** | Ports, config switch + validation, KV adapters, local store, device identity, logging, game registry | Story 1 unblocked; contract suite runs green against local adapter |
| **3. Story 1 (P1)** | Main screen hub, generic game host, reference game with persisted best score | Playable offline, progress survives restart, no auth UI |
| **4. Story 2 (P2)** | Supabase client, cloud store, hybrid store, sync queue + engine, conflict strategies, container stack, migrations, RLS | Mode switch verified as a one-file diff; all adapters pass one contract suite |
| **5. Story 3 (P2)** | Anonymous sign-in, Google PKCE flow, identity linking, profile screen | Progress survives upgrade; second device shows same progress |
| **6. Story 4 (P3)** | Transfer code generation, redemption function, throttling, UI | Code moves progress once, then fails |
| **7. Story 5 (P3)** | Plugin documentation, second-game walkthrough, removability check | Add and remove a game with no platform edits |
| **8. Polish** | Security scans in CI, migration tests, quickstart validation, README | SC-008 through SC-012 verified |

Phases 3 and 4 are where the spec's core promise is proven; phase 4's contract
suite running unchanged against all three adapters is the single most important
test in the project, because it is what makes SC-011 — and therefore the whole
switchability claim — true rather than aspirational.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified.

No violations. Constitution Check passed on both the pre-research and
post-design re-check.
