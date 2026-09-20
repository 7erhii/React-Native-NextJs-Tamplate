/**
 * Conflict resolution.
 *
 * Two-stage by design:
 *
 *   Stage 1 — whichever record has the strictly higher `revision` wins. This is
 *   the ordinary case (one device simply ahead of another) and it consults no
 *   clock at all, so a device with a wrong clock cannot corrupt normal
 *   operation.
 *
 *   Stage 2 — equal revisions mean the two devices genuinely diverged from the
 *   same base. Only here does a named strategy decide, and only here can a
 *   timestamp matter. Confining clock-sensitivity to true ties is what keeps
 *   clock skew from being a permanent advantage.
 *
 * Every resolver is a pure function of its two inputs, so all devices reach the
 * same verdict independently.
 */

import type { ConflictStrategyName } from '@/config/app.config';
import { getDeviceIdSync } from '@/core/device/device-id';
import type { SaveRecord } from '@/core/storage/types';

export type ConflictSide = 'local' | 'remote';

export interface ConflictResolution<T = unknown> {
  record: SaveRecord<T>;
  winner: ConflictSide;
  /** True when the revisions were equal and a strategy had to decide. */
  diverged: boolean;
  reason: string;
}

export type ConflictResolver<T = unknown> = (
  local: SaveRecord<T>,
  remote: SaveRecord<T>,
) => ConflictSide;

export interface ResolveOptions {
  strategy: ConflictStrategyName | ConflictResolver;
  /** Dot path to the comparable value. Used only by 'highest-value'. */
  valuePath?: string;
}

/** Reads a nested value by dot path, returning undefined rather than throwing. */
export function readPath(source: unknown, path: string): unknown {
  if (!path) return undefined;
  return path.split('.').reduce<unknown>((value, segment) => {
    if (value === null || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[segment];
  }, source);
}

function numericAt(record: SaveRecord, path: string): number {
  const value = readPath(record.data, path);
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

/**
 * Final tiebreak when timestamps are also identical. Comparing device ids is
 * arbitrary but *stable*, which is the only property that matters: both devices
 * must pick the same side.
 */
function tiebreakByDevice(local: SaveRecord, remote: SaveRecord): ConflictSide {
  return local.deviceId <= remote.deviceId ? 'local' : 'remote';
}

const lastWriteWins: ConflictResolver = (local, remote) => {
  const localTime = Date.parse(local.updatedAt);
  const remoteTime = Date.parse(remote.updatedAt);
  if (Number.isNaN(localTime) && Number.isNaN(remoteTime)) return tiebreakByDevice(local, remote);
  if (Number.isNaN(localTime)) return 'remote';
  if (Number.isNaN(remoteTime)) return 'local';
  if (localTime === remoteTime) return tiebreakByDevice(local, remote);
  return localTime > remoteTime ? 'local' : 'remote';
};

/**
 * For score-like values, last-write-wins is not merely suboptimal, it is wrong:
 * it discards the better result whenever the worse one happened to be written
 * later. This keeps the larger value.
 */
function highestValue(valuePath: string): ConflictResolver {
  return (local, remote) => {
    const localValue = numericAt(local, valuePath);
    const remoteValue = numericAt(remote, valuePath);
    if (localValue === remoteValue) return lastWriteWins(local, remote);
    return localValue > remoteValue ? 'local' : 'remote';
  };
}

const preferLocal: ConflictResolver = () => 'local';
const preferRemote: ConflictResolver = () => 'remote';

export function resolverFor(
  strategy: ConflictStrategyName | ConflictResolver,
  valuePath = 'bestScore',
): ConflictResolver {
  if (typeof strategy === 'function') return strategy;

  switch (strategy) {
    case 'highest-value':
      return highestValue(valuePath);
    case 'prefer-local':
      return preferLocal;
    case 'prefer-remote':
      return preferRemote;
    case 'last-write-wins':
      return lastWriteWins;
  }
}

export function resolveConflict<T>(
  local: SaveRecord<T>,
  remote: SaveRecord<T>,
  options: ResolveOptions,
): ConflictResolution<T> {
  // Stage 1: revision alone decides, no clock involved.
  if (local.revision !== remote.revision) {
    const winner: ConflictSide = local.revision > remote.revision ? 'local' : 'remote';
    return {
      record: winner === 'local' ? local : remote,
      winner,
      diverged: false,
      reason: `higher revision (${Math.max(local.revision, remote.revision)})`,
    };
  }

  // Stage 2: genuine divergence from a shared base.
  const resolve = resolverFor(options.strategy, options.valuePath);
  const winner = resolve(local, remote);
  const chosen = winner === 'local' ? local : remote;

  return {
    // The resolution is itself a new fact, so it is recorded at a higher
    // revision. Without this, the same tie would be re-resolved forever.
    record: {
      ...chosen,
      revision: local.revision + 1,
      updatedAt: new Date().toISOString(),
      deviceId: getDeviceIdSync(),
    },
    winner,
    diverged: true,
    reason:
      typeof options.strategy === 'function'
        ? 'custom strategy'
        : `equal revisions, resolved by '${options.strategy}'`,
  };
}

export const CONFLICT_STRATEGY_NAMES: readonly ConflictStrategyName[] = [
  'last-write-wins',
  'highest-value',
  'prefer-local',
  'prefer-remote',
];
