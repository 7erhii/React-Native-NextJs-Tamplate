/**
 * Holds the id of the player who currently owns saved data.
 *
 * This exists so that `core/storage` can namespace records per player without
 * importing anything from `src/platform`, which would invert the layering and
 * create a cycle. The composition root pushes the value in whenever identity
 * changes; storage adapters pull it out when they need an owner.
 */

import { AppError } from '@/core/errors';

let currentOwnerId: string | null = null;

export function setCurrentOwner(ownerId: string | null): void {
  currentOwnerId = ownerId;
}

export function getCurrentOwner(): string | null {
  return currentOwnerId;
}

/**
 * Every storage read and write is owner-scoped, so an absent owner is a
 * programming error — identity restore must complete before storage is used.
 */
export function requireCurrentOwner(): string {
  if (!currentOwnerId) {
    throw new AppError(
      'unknown',
      'No player identity is active yet. Identity must be restored before storage is used.',
    );
  }
  return currentOwnerId;
}

export type OwnerResolver = () => string;
