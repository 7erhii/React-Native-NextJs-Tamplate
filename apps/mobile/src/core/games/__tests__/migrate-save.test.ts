import { z } from 'zod';

import {
  tapRushInitialSave,
  tapRushMigrations,
  tapRushSaveSchema,
  tapRushSaveVersion,
  type TapRushSave,
} from '@/games/tap-rush/save';
import type { GameDefinition } from '../types';
import { migrateSave } from '../types';

/**
 * Built from the game's real schema and migrations, but with a stub component,
 * so this stays a unit test of the migration mechanism rather than dragging a
 * screen and the whole React Native surface into it.
 */
const tapRush: GameDefinition<TapRushSave> = {
  id: 'tap-rush',
  title: 'Tap Rush',
  description: 'test double',
  icon: '🎯',
  component: () => null,
  saveSchema: tapRushSaveSchema,
  saveVersion: tapRushSaveVersion,
  migrations: tapRushMigrations,
  initialSave: tapRushInitialSave,
};

describe('save migration', () => {
  it('passes through a current-version payload unchanged', () => {
    const current = { bestScore: 12, roundsPlayed: 3, totalTaps: 40, lastPlayedAt: null };

    const result = migrateSave(tapRush, current, tapRush.saveVersion);

    expect(result).toEqual({ data: current, migrated: false });
  });

  // SC-012: a save written by an older app version must survive an update.
  it('upgrades a version 1 payload and preserves the score', () => {
    const legacy = { score: 77, roundsPlayed: 5 };

    const result = migrateSave(tapRush, legacy, 1);

    expect(result).not.toBeNull();
    expect(result?.migrated).toBe(true);
    expect(result?.data.bestScore).toBe(77);
    expect(result?.data.roundsPlayed).toBe(5);
  });

  it('backfills fields that did not exist in the old shape', () => {
    const result = migrateSave(tapRush, { score: 10 }, 1);

    expect(result?.data.totalTaps).toBe(10);
    expect(result?.data.lastPlayedAt).toBeNull();
  });

  // Returning null rather than throwing is what keeps a bad save from becoming
  // a crash on launch.
  it('returns null when a payload fails validation after migration', () => {
    expect(migrateSave(tapRush, { bestScore: 'not a number' }, tapRush.saveVersion)).toBeNull();
  });

  it('returns null when no migration path exists for the stored version', () => {
    const gapped: GameDefinition<{ v: number }> = {
      ...tapRush,
      saveSchema: z.object({ v: z.number() }),
      saveVersion: 5,
      migrations: { 4: (data: unknown) => data }, // nothing registered for version 2
      initialSave: { v: 0 },
    } as unknown as GameDefinition<{ v: number }>;

    expect(migrateSave(gapped, { v: 1 }, 2)).toBeNull();
  });

  it('applies multiple migration steps in ascending order', () => {
    const chained: GameDefinition<{ total: number }> = {
      ...tapRush,
      saveSchema: z.object({ total: z.number() }),
      saveVersion: 3,
      initialSave: { total: 0 },
      migrations: {
        1: (data: unknown) => ({ total: (data as { total: number }).total + 1 }),
        2: (data: unknown) => ({ total: (data as { total: number }).total * 10 }),
      },
    } as unknown as GameDefinition<{ total: number }>;

    // (0 + 1) * 10 — proves ordering, not just that both ran.
    expect(migrateSave(chained, { total: 0 }, 1)?.data.total).toBe(10);
  });
});
