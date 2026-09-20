# Contract: Save Store Port

**Feature**: `001-game-platform-foundation` | **Implements**: FR-008 – FR-016

The single interface all game and feature code uses to persist progress. Swapping
the adapter behind it is the requirement this whole project exists to satisfy, so
this contract is the one that must not bend.

## Interface

```ts
export interface SaveRecord<T = unknown> {
  key: string;
  data: T;
  /** Shape version of `data`. Drives client-side migration. */
  schemaVersion: number;
  /** Monotonic per key. Primary conflict input. */
  revision: number;
  /** ISO-8601. Secondary conflict input, consulted only on equal revisions. */
  updatedAt: string;
  /** Last writer, for diagnostics and tiebreaking. */
  deviceId: string;
}

export interface StoreCapabilities {
  /** Can progress reach another device through this store? */
  crossDevice: boolean;
  /** Do reads and writes work with no network? */
  offline: boolean;
  /** Does the store queue writes for later replication? */
  queued: boolean;
}

export interface WriteOptions {
  /** Optimistic concurrency. Mismatch yields a ConflictError instead of overwriting. */
  expectedRevision?: number;
  /** Skip the queue and fail loudly if replication is impossible. */
  requireDurable?: boolean;
}

export interface SyncReport {
  pushed: number;
  pulled: number;
  conflicts: number;
  failed: number;
  /** Redacted messages, safe to log. */
  errors: readonly string[];
}

export interface SaveStorePort {
  readonly id: string;
  readonly capabilities: StoreCapabilities;

  read<T>(key: string): Promise<SaveRecord<T> | null>;
  write<T>(key: string, data: T, options?: WriteOptions): Promise<SaveRecord<T>>;
  remove(key: string): Promise<void>;
  list(prefix?: string): Promise<readonly string[]>;

  /** Force reconciliation. No-op returning zeroes for stores without a remote. */
  sync(): Promise<SyncReport>;

  /** Fires on any change, including changes arriving from a remote. */
  subscribe(listener: (record: SaveRecord) => void): () => void;
}
```

## Behavioural guarantees

The shared contract suite runs **unchanged against every adapter**. That is what
makes SC-011 true and the switchability claim real rather than aspirational.

1. **Read-your-writes.** A `read` immediately following a resolved `write`
   returns that written value, in every adapter and every mode.
2. **Revision monotonicity.** Each successful `write` to a key returns a strictly
   greater `revision` than the previous one.
3. **Missing is null, not an error.** `read` of an absent key returns `null`.
   Absence is normal — first launch is the common case.
4. **Optimistic concurrency is honoured.** With `expectedRevision` supplied and
   stale, `write` rejects with `ConflictError` and does not modify stored state.
5. **Isolation.** `list(prefix)` returns only keys under that prefix, and no
   operation can reach another player's data.
6. **Offline honesty.** When `capabilities.offline` is true, reads and writes
   succeed with no network. When it is false, they fail with a typed
   `OfflineError` — never a silent success, which would be the worst outcome
   available.
7. **Durability across restarts.** With `capabilities.queued`, a write accepted
   while offline replicates after a process restart without player action.
8. **Migration on read.** A record whose `schemaVersion` is below the game's
   current version is migrated before being returned, and the upgraded record is
   written back.
9. **Corruption is contained.** An unparseable record is treated as absent,
   quarantined rather than deleted, and reported once. It must not prevent launch.
10. **Deterministic conflict resolution.** Identical inputs produce an identical
    winner on every device.

## Adapters

| Adapter | crossDevice | offline | queued | Requires backend |
|---|---|---|---|---|
| `local` | false | **true** | false | no |
| `cloud` | **true** | false | false | yes |
| `hybrid` | **true** | **true** | **true** | yes, eventually |

`local` is the zero-infrastructure default and the only one that satisfies User
Story 1 with the stack switched off.

`cloud` reads and writes through PostgREST with RLS enforcing ownership. It is
deliberately **not** offline-capable: a store that claims durability it cannot
deliver is more dangerous than one that fails loudly.

`hybrid` is the recommended default for real games. Reads resolve from local
storage without awaiting the network (FR-013). Writes commit locally, then enqueue
(FR-014). The sync engine drains the queue with exponential backoff and reconciles
using the configured strategy. It is the only adapter that satisfies both "works
with no account" and "moves between devices" — the two constraints the original
request put in tension.

## Key namespace

```text
platform:<name>          # platform-owned, e.g. platform:preferences
game:<gameId>:<slot>     # game-owned,     e.g. game:tap-rush:progress
```

A game never writes a raw key. The `useSaveState` hook injects the
`game:<gameId>:` prefix from the registry entry, so a game cannot address another
game's data even by accident. Enforcing this in the hook rather than by convention
is what makes FR-011 hold under maintenance.

## Conflict strategies

Named exports in `src/core/sync/conflict.ts`, selected in `app.config.ts` or
per-game in a `GameDefinition`.

| Name | Rule | Correct for |
|---|---|---|
| `last-write-wins` | Later `updatedAt`, then `deviceId` | Settings, mutable state |
| `highest-value` | Larger value at a configured path | Best scores, unlocks |
| `prefer-local` | Local always | Device-authoritative state |
| `prefer-remote` | Remote always | Server-authoritative state |
| custom | Game-supplied pure function | Genuinely mergeable state |

Resolution always happens on **equal revisions only** — unequal revisions are
decided by revision alone, which keeps a wrong device clock from mattering in the
ordinary case. A tie-resolved record is written at `revision + 1` so the decision
is itself a recorded fact and the same tie cannot be re-resolved on every
subsequent sync pass. A record that won on revision alone is kept unchanged,
since there was no divergence to record.

`highest-value` exists because `last-write-wins` is not merely suboptimal for a
high score, it is wrong: it discards the better result whenever the worse one was
written later.

## Configuration

```ts
// src/config/app.config.ts — the only file that changes to switch persistence
export const appConfig = {
  persistence: {
    mode: 'local',            // 'local' | 'cloud' | 'hybrid'
    conflictStrategy: 'last-write-wins',
    syncIntervalMs: 30_000,
    maxRetries: 5,
  },
  identity: {
    mode: 'device',           // 'device' | 'anonymous' | 'google'
  },
  features: {
    transferCodes: false,
  },
} as const;
```

Invalid combinations must throw at startup with the offending setting named
(FR-016). Two are structurally impossible and must be rejected rather than
half-working:

- `persistence.mode` of `cloud` or `hybrid` with `identity.mode: 'device'` — there
  is no authenticated principal, so RLS would reject every row.
- `features.transferCodes: true` with `persistence.mode: 'local'` — there is no
  remote to transfer ownership within.

## Security notes

- **Risks**: cross-player data access; tampered payloads; unbounded local growth;
  leaking progress via logs.
- **Assumptions**: RLS is enabled on every player-data table and is the real
  boundary; the client holds only the anon key; local device storage is readable by
  anyone with device access, so nothing secret belongs in a save.
- **Safeguards**: ownership enforced by composite primary key plus RLS rather than
  by client filtering; Zod validation of every record read from storage or network
  (stored data is written by *older app versions* and is therefore untrusted);
  quarantine instead of deletion on corruption; redacted logging; no credentials in
  save payloads.
