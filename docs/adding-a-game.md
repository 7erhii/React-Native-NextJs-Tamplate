# Adding a game

A game is a plugin: one folder plus one line in the registry. If adding one ever
requires touching `apps/mobile/src/core/` or `apps/mobile/src/platform/`, the plugin contract has been
violated and the platform is missing a capability that should be added there
instead.

## 1. Create the folder

```text
apps/mobile/src/games/my-game/
├── save.ts        # what gets persisted
├── definition.ts  # the registry entry
└── screen.tsx     # the game itself
```

## 2. Declare what you persist — `save.ts`

The schema is not decoration. Stored payloads were written by *older versions of
your app*, which makes them as untrusted as network input and the most common
cause of crash-on-launch after an update.

```ts
import { z } from 'zod';

export const mySaveSchema = z.object({
  bestScore: z.number().int().nonnegative(),
  level: z.number().int().positive(),
});

export type MySave = z.infer<typeof mySaveSchema>;

export const mySaveVersion = 1;

export const myInitialSave: MySave = { bestScore: 0, level: 1 };
```

## 3. Register the shape — `definition.ts`

```ts
import type { GameDefinition } from '@/core/games/types';
import { MyGameScreen } from './screen';
import { myInitialSave, mySaveSchema, mySaveVersion, type MySave } from './save';

export const myGame: GameDefinition<MySave> = {
  id: 'my-game',           // permanent: it is embedded in every save key
  title: 'My Game',
  description: 'One sentence for the hub.',
  icon: '🎮',
  component: MyGameScreen,

  saveSchema: mySaveSchema,
  saveVersion: mySaveVersion,
  initialSave: myInitialSave,

  scoring: {
    direction: 'higher-is-better',
    valuePath: 'bestScore',
    // Without this, a better score can be lost to a later, worse write from
    // another device.
    conflictStrategy: 'highest-value',
  },
};
```

**`id` is permanent.** It becomes part of every save key for this game, so
renaming it after release orphans every existing player's progress.

## 4. Write the game — `screen.tsx`

```tsx
import { useSaveState } from '@/platform/use-save-state';
import { myGame } from './definition';

export function MyGameScreen() {
  const { data, save } = useSaveState(myGame);

  return (
    <Button
      title={`Best: ${data.bestScore}`}
      onPress={() => save((prev) => ({ ...prev, bestScore: prev.bestScore + 1 }))}
    />
  );
}
```

`useSaveState` handles namespacing, validation, migration, and the
no-save-yet case, so the game never sees a `null` and never picks its own key.

## 5. Register it

```ts
// apps/mobile/src/core/games/registry.ts
import { myGame } from '@/games/my-game/definition';
import { tapRush } from '@/games/tap-rush/definition';

export const gameRegistry: readonly GameDefinition<never>[] = [
  tapRush as GameDefinition<never>,
  myGame as GameDefinition<never>,
];
```

Done. The game appears on the hub, routes at `/play/my-game`, and persists
through whichever adapter the configuration selected.

---

## Rules

**Never import storage or auth directly.** Use `useSaveState`, `useIdentity`, and
`useSyncStatus`. ESLint rejects adapter and Supabase imports from `apps/mobile/src/games/**`,
because one such import is enough to make the persistence switch stop working
while nothing else visibly breaks.

**Never write a raw save key.** The `game:<id>:` prefix is injected for you. This
is what stops two games from colliding.

**Bump `saveVersion` whenever the shape changes**, and add a migration for the
version you are leaving behind:

```ts
export const mySaveVersion = 2;

export const myMigrations: Record<number, (data: unknown) => unknown> = {
  1: (old: any) => ({ bestScore: old.score ?? 0, level: 1 }),
};
```

Migrations are applied in ascending order on read and the upgraded record is
written back, so the cost is paid once. A payload that cannot be migrated is
treated as "no save" rather than crashing — the player loses that game's
progress, not the ability to launch the app.

**Multiple save slots** are available when a game needs them:

```ts
const progress = useSaveState(myGame);                 // game:my-game:progress
const settings = useSaveState(myGame, 'settings');     // game:my-game:settings
```

---

## Removing a game

Delete the folder and the registry line. That must leave the app building with no
dangling references — if it does not, something reached across the plugin
boundary and should be fixed rather than worked around.

Saved data for a removed game stays in storage, orphaned but harmless. Purge it
deliberately if you care, rather than as a side effect of deleting code.
