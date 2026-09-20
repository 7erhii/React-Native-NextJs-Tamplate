/**
 * The game registry — the single place the platform learns a game exists.
 *
 * Adding a game is one import and one array entry. Removing one is deleting
 * both, plus the game's folder. If either ever needs more than that, the plugin
 * contract has been violated.
 */

import { tapRush } from '@/games/tap-rush/definition';
import type { GameDefinition } from './types';

/**
 * Typed as `unknown` rather than a union: the registry is heterogeneous by
 * nature, and each game re-narrows its own save shape through its definition
 * when `useSaveState` is called with it.
 */
export const gameRegistry: readonly GameDefinition<never>[] = [
  tapRush as GameDefinition<never>,
];

export function findGame(gameId: string | undefined): GameDefinition | undefined {
  if (!gameId) return undefined;
  return gameRegistry.find((game) => game.id === gameId);
}

export type { GameDefinition } from './types';
