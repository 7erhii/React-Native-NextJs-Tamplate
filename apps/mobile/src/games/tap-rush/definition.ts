/**
 * Tap Rush registry entry.
 *
 * This is the whole surface a game presents to the platform. Adding a game means
 * writing one of these and adding one line to the registry.
 */

import type { GameDefinition } from '@/core/games/types';
import { TapRushScreen } from './screen';
import {
  tapRushInitialSave,
  tapRushMigrations,
  tapRushSaveSchema,
  tapRushSaveVersion,
  type TapRushSave,
} from './save';

export const tapRush: GameDefinition<TapRushSave> = {
  id: 'tap-rush',
  title: 'Tap Rush',
  description: 'Hit the target as many times as you can before the clock runs out.',
  icon: '🎯',
  component: TapRushScreen,

  saveSchema: tapRushSaveSchema,
  saveVersion: tapRushSaveVersion,
  migrations: tapRushMigrations,
  initialSave: tapRushInitialSave,

  scoring: {
    direction: 'higher-is-better',
    valuePath: 'bestScore',
    // A best score must never be lost to a later, worse write from another
    // device — which is exactly what last-write-wins would do.
    conflictStrategy: 'highest-value',
  },
};
