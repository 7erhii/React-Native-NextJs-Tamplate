/**
 * Durable queue of writes awaiting replication.
 *
 * Persisted rather than held in memory because the requirement is that a write
 * accepted while offline still reaches the backend after the process is killed.
 * An in-memory queue would satisfy every test short of the one that matters.
 */

import { z } from 'zod';

import { createLogger } from '@/core/logging';
import { createAsyncStorageKv } from '@/core/storage/async-storage.kv';
import { saveRecordEnvelopeSchema } from '@/core/storage/record';
import type { KeyValuePort, SaveRecord } from '@/core/storage/types';

const log = createLogger('sync-queue');

const entrySchema = z.object({
  id: z.string(),
  record: saveRecordEnvelopeSchema,
  attempts: z.number().int().nonnegative(),
  lastError: z.string().optional(),
  createdAt: z.string(),
  /** Set once attempts exceed the retry budget; parked entries are not retried. */
  parked: z.boolean().optional(),
});

export type SyncQueueEntry = z.infer<typeof entrySchema>;

const queueSchema = z.array(entrySchema);

export interface SyncQueue {
  enqueue(record: SaveRecord): Promise<void>;
  /** Entries eligible for a replication attempt, oldest first. */
  pending(): Promise<readonly SyncQueueEntry[]>;
  all(): Promise<readonly SyncQueueEntry[]>;
  resolve(id: string): Promise<void>;
  fail(id: string, error: string, maxRetries: number): Promise<void>;
  size(): Promise<number>;
  clear(): Promise<void>;
}

export function createSyncQueue(
  resolveOwner: () => string,
  kv: KeyValuePort = createAsyncStorageKv(),
): SyncQueue {
  const queueKey = () => `syncqueue:${resolveOwner()}`;

  async function load(): Promise<SyncQueueEntry[]> {
    const raw = await kv.get(queueKey());
    if (!raw) return [];

    try {
      const parsed = queueSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      /* fall through */
    }

    // A corrupt queue is dropped rather than allowed to block replication
    // forever. The records themselves still exist in local storage, so the next
    // write re-queues them; only the pending metadata is lost.
    log.warn('Discarding unreadable sync queue');
    return [];
  }

  async function save(entries: SyncQueueEntry[]): Promise<void> {
    await kv.set(queueKey(), JSON.stringify(entries));
  }

  return {
    async enqueue(record) {
      const entries = await load();

      // Coalesce per key: replicating superseded intermediate states wastes
      // requests, and if they landed out of order could resurrect stale data.
      const withoutKey = entries.filter((entry) => entry.record.key !== record.key);

      withoutKey.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        record,
        attempts: 0,
        createdAt: new Date().toISOString(),
      });

      await save(withoutKey);
    },

    async pending() {
      const entries = await load();
      return entries.filter((entry) => !entry.parked);
    },

    async all() {
      return load();
    },

    async resolve(id) {
      const entries = await load();
      await save(entries.filter((entry) => entry.id !== id));
    },

    async fail(id, error, maxRetries) {
      const entries = await load();
      const updated = entries.map((entry) => {
        if (entry.id !== id) return entry;
        const attempts = entry.attempts + 1;
        return {
          ...entry,
          attempts,
          lastError: error,
          // Parked rather than deleted: the player's data is still in local
          // storage and discarding the intent silently would be data loss.
          parked: attempts >= maxRetries,
        };
      });
      await save(updated);
    },

    async size() {
      return (await load()).length;
    },

    async clear() {
      await kv.remove(queueKey());
    },
  };
}

/** Exponential backoff with a ceiling, so a long outage does not spin. */
export function backoffMs(attempts: number, baseMs = 1_000, ceilingMs = 300_000): number {
  return Math.min(baseMs * 2 ** attempts, ceilingMs);
}
