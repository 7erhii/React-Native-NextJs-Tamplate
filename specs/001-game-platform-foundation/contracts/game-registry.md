# Contract: Game Registry

**Feature**: `001-game-platform-foundation` | **Implements**: FR-022 – FR-025

How a game plugs into the platform. The measure of this contract is SC-003: one
new folder and one registry line, with no edits to platform internals.

## Interface

```ts
export type ScoreDirection = 'higher-is-better' | 'lower-is-better';

export interface GameScoring {
  direction: ScoreDirection;
  /** Path within the save payload holding the comparable value, e.g. 'bestScore'. */
  valuePath: string;
  /** Overrides the global strategy for this game's records. */
  conflictStrategy?: ConflictStrategyName;
}

export interface GameDefinition<TSave = unknown> {
  /** Stable slug. Becomes part of every save key — renaming it orphans saves. */
  id: string;
  title: string;
  description: string;
  /** Emoji or icon token rendered by the hub. */
  icon: string;
  /** Entry screen. Receives no props; uses platform hooks for state. */
  component: React.ComponentType;
  /** Validates the payload on every read. Stored data is untrusted input. */
  saveSchema: ZodType<TSave>;
  /** Version this game currently writes. */
  saveVersion: number;
  /** version → upgrade function, applied in ascending order on load. */
  migrations?: Record<number, (data: unknown) => unknown>;
  /** Initial state for a player with no save yet. */
  initialSave: TSave;
  scoring?: GameScoring;
}
```

## Registration

One entry, one line of intent:

```ts
// src/core/games/registry.ts
import { tapRush } from '@/games/tap-rush/definition';

export const gameRegistry: readonly GameDefinition<any>[] = [tapRush];
```

The hub renders from this array and `play/[gameId]` resolves from it. Nothing else
in the platform knows a game exists.

## What a game consumes

A game reaches persistence and identity only through hooks. Direct adapter or
vendor SDK imports from `src/games/**` fail lint (Principle I).

```ts
function TapRushScreen() {
  const { data, save, status } = useSaveState(tapRush);   // prefix injected, migrations applied
  const { identity } = useIdentity();                     // read-only view
  const { pending, lastSyncAt } = useSyncStatus();        // optional, for UI
}
```

`useSaveState` is where the guarantees live: it injects the `game:<id>:` prefix so
a game cannot address another's data, validates against `saveSchema` on read,
applies `migrations` when the stored `schemaVersion` is behind, and returns
`initialSave` when nothing is stored. A game therefore never handles absence,
migration, or namespacing itself — which is what keeps those three easy-to-get-wrong
concerns correct across every future game.

## Requirements on a game

1. **Self-contained.** All code under `src/games/<id>/`. Deleting that folder plus
   its registry line leaves the app building with no dangling references (FR-023).
2. **No platform edits.** Adding a game touches no file under `src/core/` or
   `src/platform/` other than the one registry line.
3. **Declared save shape.** `saveSchema` and `saveVersion` are mandatory. Any
   shape change increments `saveVersion` and adds a migration.
4. **Never touches storage or auth directly.** Hooks only.
5. **Stable `id`.** Treated as permanent once shipped, because it is embedded in
   save keys.

## Adding a game

```text
src/games/my-game/
├── definition.ts   # GameDefinition — the registry entry
├── screen.tsx      # the game itself
└── save.ts         # Zod schema, version, migrations, initial state
```

Then one import and one array element in `registry.ts`. That is the whole
procedure, and if it ever requires more, this contract has been violated.

## Migration example

```ts
// save.ts — v1 stored `score`; v2 renames it to `bestScore` and adds `rounds`
export const saveVersion = 2;

export const migrations = {
  // applied when a stored record is at version 1
  1: (old: any) => ({ bestScore: old.score ?? 0, rounds: 0 }),
};
```

The platform applies migrations in ascending order until the record reaches
`saveVersion`, then writes it back so the upgrade is paid once (SC-012).

## Security notes

- **Risks**: a game reading or clobbering another game's saves; malformed stored
  data crashing launch; a game submitting fabricated scores.
- **Assumptions**: game code is first-party and reviewed; stored payloads are
  untrusted because they were written by earlier app versions.
- **Safeguards**: key prefix injected by the hook rather than supplied by the game;
  Zod validation on every read; lint-enforced import restrictions; scores stored as
  unvalidated until server-side validation exists, and never presented as verified.
