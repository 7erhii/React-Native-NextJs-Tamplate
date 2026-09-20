/**
 * Offline-first store: local storage is the source of truth for reads, and the
 * remote is reached through a durable queue.
 *
 * This is the recommended adapter for real games, because it is the only one
 * that satisfies both constraints the project was asked to reconcile — progress
 * works with no account and no network, *and* progress can move between devices.
 */

import { createLogger } from '@/core/logging';
import { getCurrentOwner, requireCurrentOwner } from '@/core/session/current-owner';
import type { ResolveOptions } from '@/core/sync/conflict';
import { createSyncEngine, type SyncEngine } from '@/core/sync/engine';
import { createSyncQueue } from '@/core/sync/queue';
import { createLocalStore } from './local.store';
import type { SaveRecord, SaveStorePort, SyncReport, WriteOptions } from './types';

const log = createLogger('hybrid-store');

export interface HybridStoreOptions {
  conflict: ResolveOptions;
  syncIntervalMs: number;
  maxRetries: number;
  resolveOwner?: () => string;
}

export interface HybridStore extends SaveStorePort {
  readonly engine: SyncEngine;
}

export function createHybridStore(options: HybridStoreOptions): HybridStore {
  const resolveOwner = options.resolveOwner ?? requireCurrentOwner;
  const local = createLocalStore({ resolveOwner });
  const queue = createSyncQueue(resolveOwner);

  const engine = createSyncEngine({
    queue,
    local,
    resolveOwner: getCurrentOwner,
    conflict: options.conflict,
    intervalMs: options.syncIntervalMs,
    maxRetries: options.maxRetries,
  });

  return {
    id: 'hybrid',

    capabilities: {
      crossDevice: true,
      offline: true,
      queued: true,
    },

    engine,

    /** Local only: a read must never wait on a network round trip. */
    async read<T>(key: string): Promise<SaveRecord<T> | null> {
      return local.read<T>(key);
    },

    async write<T>(key: string, data: T, writeOptions?: WriteOptions): Promise<SaveRecord<T>> {
      // Commit locally first so the write is durable regardless of connectivity,
      // then record the intent to replicate.
      const record = await local.write<T>(key, data, writeOptions);
      await queue.enqueue(record);

      if (writeOptions?.requireDurable) {
        // The caller explicitly refused eventual consistency, so replicate now
        // and let the failure reach them.
        const report = await engine.flush();
        if (report.failed > 0) {
          throw new Error(report.errors[0] ?? 'Durable write could not be replicated');
        }
      } else {
        // Opportunistic: a successful flush makes the common online case feel
        // immediate, and a failure is already safely queued.
        void engine.flush().catch((error) => log.debug('Opportunistic sync failed', error));
      }

      return record;
    },

    async remove(key: string): Promise<void> {
      await local.remove(key);
      // Tombstones are not yet modelled, so a delete is local until the next
      // full reconciliation. Documented as a known limitation rather than
      // papered over: a remote copy can currently reappear on pull.
      log.debug('Removed locally; remote deletion requires a tombstone (not yet implemented)', {
        key,
      });
    },

    list(prefix?: string): Promise<readonly string[]> {
      return local.list(prefix);
    },

    sync(): Promise<SyncReport> {
      return engine.flush();
    },

    subscribe(listener) {
      return local.subscribe(listener);
    },
  };
}
