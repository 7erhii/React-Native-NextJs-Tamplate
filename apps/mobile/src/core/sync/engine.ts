/**
 * Drains the pending-write queue and reconciles local state with the remote.
 *
 * There is no connectivity library here on purpose: attempting the request *is*
 * the connectivity check. A reachability probe can disagree with the actual
 * request outcome, and when it does, the probe is the one that is wrong.
 */

import { hasErrorCode } from '@/core/errors';
import { createLogger, redactedMessage } from '@/core/logging';
import { fetchAllRecords, pushRecord } from '@/core/storage/supabase.store';
import type { SaveRecord, SaveStorePort, SyncReport } from '@/core/storage/types';
import { resolveConflict, type ResolveOptions } from './conflict';
import { backoffMs, type SyncQueue } from './queue';

const log = createLogger('sync-engine');

export interface SyncStatus {
  running: boolean;
  pending: number;
  lastSyncAt: string | null;
  lastReport: SyncReport | null;
  lastError: string | null;
}

export interface SyncEngine {
  start(): void;
  stop(): void;
  flush(): Promise<SyncReport>;
  status(): SyncStatus;
  subscribe(listener: (status: SyncStatus) => void): () => void;
}

export interface SyncEngineOptions {
  queue: SyncQueue;
  /** Local store, used to land records pulled from the remote. */
  local: SaveStorePort;
  resolveOwner: () => string | null;
  conflict: ResolveOptions;
  intervalMs: number;
  maxRetries: number;
}

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const { queue, local, resolveOwner, conflict, intervalMs, maxRetries } = options;

  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;
  const listeners = new Set<(status: SyncStatus) => void>();

  let status: SyncStatus = {
    running: false,
    pending: 0,
    lastSyncAt: null,
    lastReport: null,
    lastError: null,
  };

  function publish(next: Partial<SyncStatus>): void {
    status = { ...status, ...next };
    for (const listener of listeners) {
      try {
        listener(status);
      } catch {
        /* a failing subscriber must not stop replication */
      }
    }
  }

  /** Push queued local writes. Returns counts and leaves failures queued. */
  async function push(ownerId: string): Promise<{ pushed: number; failed: number; errors: string[] }> {
    const entries = await queue.pending();
    let pushed = 0;
    let failed = 0;
    const errors: string[] = [];
    const now = Date.now();

    for (const entry of entries) {
      // Respect backoff so a persistent failure does not retry every tick.
      if (entry.attempts > 0) {
        const readyAt = Date.parse(entry.createdAt) + backoffMs(entry.attempts);
        if (Number.isFinite(readyAt) && now < readyAt) continue;
      }

      try {
        await pushRecord(ownerId, entry.record as SaveRecord);
        await queue.resolve(entry.id);
        pushed += 1;
      } catch (error) {
        const message = redactedMessage(error);
        await queue.fail(entry.id, message, maxRetries);
        failed += 1;
        errors.push(message);

        // Offline means every remaining entry will fail identically; stopping
        // early avoids burning the retry budget of the whole queue on one outage.
        if (hasErrorCode(error, 'offline')) break;
      }
    }

    return { pushed, failed, errors };
  }

  /** Pull remote records and reconcile them against local state. */
  async function pull(ownerId: string): Promise<{ pulled: number; conflicts: number; errors: string[] }> {
    const remoteRecords = await fetchAllRecords(ownerId);
    let pulled = 0;
    let conflicts = 0;
    const errors: string[] = [];

    for (const remote of remoteRecords) {
      try {
        const localRecord = await local.read(remote.key);

        if (!localRecord) {
          await local.write(remote.key, remote.data);
          pulled += 1;
          continue;
        }

        if (localRecord.revision === remote.revision && localRecord.updatedAt === remote.updatedAt) {
          continue;
        }

        const resolution = resolveConflict(localRecord, remote, conflict);
        if (resolution.diverged) conflicts += 1;

        if (resolution.winner === 'remote' || resolution.diverged) {
          await local.write(remote.key, resolution.record.data);
          pulled += 1;
        }

        // A local win means the remote is behind, so re-queue the local record.
        if (resolution.winner === 'local' && localRecord.revision > remote.revision) {
          await queue.enqueue(localRecord);
        }
      } catch (error) {
        errors.push(redactedMessage(error));
      }
    }

    return { pulled, conflicts, errors };
  }

  async function flush(): Promise<SyncReport> {
    const ownerId = resolveOwner();
    if (!ownerId || inFlight) {
      return { pushed: 0, pulled: 0, conflicts: 0, failed: 0, errors: [] };
    }

    inFlight = true;
    try {
      const pushResult = await push(ownerId);
      const pullResult = await pull(ownerId);

      const report: SyncReport = {
        pushed: pushResult.pushed,
        pulled: pullResult.pulled,
        conflicts: pullResult.conflicts,
        failed: pushResult.failed,
        errors: [...pushResult.errors, ...pullResult.errors],
      };

      publish({
        pending: await queue.size(),
        lastSyncAt: new Date().toISOString(),
        lastReport: report,
        lastError: report.errors[0] ?? null,
      });

      log.debug('Sync pass complete', report);
      return report;
    } catch (error) {
      const message = redactedMessage(error);
      publish({ lastError: message, pending: await queue.size() });
      return { pushed: 0, pulled: 0, conflicts: 0, failed: 0, errors: [message] };
    } finally {
      inFlight = false;
    }
  }

  return {
    start() {
      if (timer) return;
      publish({ running: true });
      void flush();
      timer = setInterval(() => void flush(), intervalMs);
    },

    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      publish({ running: false });
    },

    flush,
    status: () => status,

    subscribe(listener) {
      listeners.add(listener);
      listener(status);
      return () => listeners.delete(listener);
    },
  };
}
