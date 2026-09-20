/**
 * How a game plugs into the platform.
 *
 * Contract: specs/001-game-platform-foundation/contracts/game-registry.md
 *
 * A game declares itself once here and receives persistence and identity through
 * hooks. It never imports an adapter, never touches storage, and never knows
 * which persistence mode is active.
 */

import type { ComponentType } from 'react';
import type { ZodType } from 'zod';

import type { ConflictStrategyName } from '@/config/app.config';

export type ScoreDirection = 'higher-is-better' | 'lower-is-better';

export interface GameScoring {
  direction: ScoreDirection;
  /** Dot path into the save payload holding the comparable value. */
  valuePath: string;
  /** Overrides the global conflict strategy for this game's records. */
  conflictStrategy?: ConflictStrategyName;
}

export interface GameDefinition<TSave = unknown> {
  /**
   * Stable slug, embedded in every save key for this game. Treat it as
   * permanent once shipped: renaming it orphans every existing save.
   */
  id: string;
  title: string;
  description: string;
  /** Emoji or short token rendered on the hub. */
  icon: string;
  component: ComponentType;

  /** Validates the payload on every read; stored data is untrusted input. */
  saveSchema: ZodType<TSave>;
  /** The version this game currently writes. */
  saveVersion: number;
  /** `storedVersion → upgraded payload`, applied in ascending order. */
  migrations?: Record<number, (data: unknown) => unknown>;
  /** Returned when the player has no save yet, so games never handle absence. */
  initialSave: TSave;

  scoring?: GameScoring;
}

/**
 * Walks a stored payload up to the game's current version.
 *
 * Returns `null` when the data cannot be brought forward, which the caller
 * treats as "no save" rather than crashing. Losing one game's progress is bad;
 * failing to launch is worse, and the quarantined original is still on disk.
 */
export function migrateSave<TSave>(
  definition: GameDefinition<TSave>,
  data: unknown,
  storedVersion: number,
): { data: TSave; migrated: boolean } | null {
  let working = data;
  let version = storedVersion;
  let migrated = false;

  while (version < definition.saveVersion) {
    const step = definition.migrations?.[version];
    if (!step) return null;
    working = step(working);
    version += 1;
    migrated = true;
  }

  const parsed = definition.saveSchema.safeParse(working);
  if (!parsed.success) return null;

  return { data: parsed.data, migrated };
}
