/**
 * Tap Rush save shape.
 *
 * Intentionally shipped at version 2 with a migration from version 1, so the
 * versioning mechanism is exercised by real code rather than only described in a
 * document. Copy this file as the starting point for a new game.
 */

import { z } from 'zod';

export const tapRushSaveSchema = z.object({
  bestScore: z.number().int().nonnegative(),
  roundsPlayed: z.number().int().nonnegative(),
  totalTaps: z.number().int().nonnegative(),
  lastPlayedAt: z.string().nullable(),
});

export type TapRushSave = z.infer<typeof tapRushSaveSchema>;

export const tapRushSaveVersion = 2;

export const tapRushInitialSave: TapRushSave = {
  bestScore: 0,
  roundsPlayed: 0,
  totalTaps: 0,
  lastPlayedAt: null,
};

/**
 * Version 1 stored a single `score` field. The upgrade keeps that value as the
 * best score and backfills the counters that did not exist yet, so a returning
 * player never sees their record reset to zero.
 */
export const tapRushMigrations: Record<number, (data: unknown) => unknown> = {
  1: (data) => {
    const legacy = (data ?? {}) as { score?: unknown; roundsPlayed?: unknown };
    const score = typeof legacy.score === 'number' ? legacy.score : 0;
    const rounds = typeof legacy.roundsPlayed === 'number' ? legacy.roundsPlayed : 0;

    return {
      bestScore: score,
      roundsPlayed: rounds,
      totalTaps: score,
      lastPlayedAt: null,
    } satisfies TapRushSave;
  },
};
