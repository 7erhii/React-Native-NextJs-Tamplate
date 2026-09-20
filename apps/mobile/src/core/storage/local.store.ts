/**
 * Device-local save store.
 *
 * The zero-infrastructure adapter: no network, no account, no backend. It is
 * what makes "play immediately and keep progress" testable with the whole stack
 * switched off, and it is the default the project ships with.
 */

import { ConflictError } from '@/core/errors';
import { createLogger } from '@/core/logging';
import { requireCurrentOwner } from '@/core/session/current-owner';
import { createAsyncStorageKv } from './async-storage.kv';
import { createRecordEmitter, nextRecord, parseEnvelope, serializeEnvelope } from './record';
import type { KeyValuePort, SaveRecord, SaveStorePort, SyncReport, WriteOptions } from './types';
import { EMPTY_SYNC_REPORT } from './types';

const log = createLogger('local-store');

export interface LocalStoreOptions {
  kv?: KeyValuePort;
  /** Overridable so tests can pin an owner without a real identity. */
  resolveOwner?: () => string;
}

export function createLocalStore(options: LocalStoreOptions = {}): SaveStorePort {
  const kv = options.kv ?? createAsyncStorageKv();
  const resolveOwner = options.resolveOwner ?? requireCurrentOwner;
  const emitter = createRecordEmitter();

  /**
   * Owner is part of the storage key, so one player's data is unreachable while
   * another is active. Isolation by construction rather than by filtering.
   */
  const storageKey = (owner: string, key: string) => `save:${owner}:${key}`;
  const keyPrefix = (owner: string) => `save:${owner}:`;

  /**
   * Corrupt records are moved aside rather than deleted. Deleting destroys the
   * only evidence of a bug that has already cost the player their progress.
   */
  async function quarantine(owner: string, key: string, raw: string): Promise<void> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await kv.set(`quarantine:${owner}:${key}:${stamp}`, raw);
    await kv.remove(storageKey(owner, key));
    log.warn('Quarantined unreadable save record', { key });
  }

  async function readRaw(owner: string, key: string): Promise<SaveRecord | null> {
    const raw = await kv.get(storageKey(owner, key));
    if (raw === null) return null;

    const record = parseEnvelope(raw);
    if (!record) {
      await quarantine(owner, key, raw);
      return null;
    }
    return record;
  }

  return {
    id: 'local',

    capabilities: {
      crossDevice: false,
      offline: true,
      queued: false,
    },

    async read<T>(key: string): Promise<SaveRecord<T> | null> {
      const owner = resolveOwner();
      return (await readRaw(owner, key)) as SaveRecord<T> | null;
    },

    async write<T>(key: string, data: T, writeOptions?: WriteOptions): Promise<SaveRecord<T>> {
      const owner = resolveOwner();
      const previous = await readRaw(owner, key);

      if (
        writeOptions?.expectedRevision !== undefined &&
        (previous?.revision ?? 0) !== writeOptions.expectedRevision
      ) {
        throw new ConflictError(writeOptions.expectedRevision, previous?.revision ?? 0);
      }

      const record = nextRecord<T>(previous, key, data, writeOptions?.schemaVersion);
      await kv.set(storageKey(owner, key), serializeEnvelope(record));
      emitter.emit(record);
      return record;
    },

    async remove(key: string): Promise<void> {
      const owner = resolveOwner();
      await kv.remove(storageKey(owner, key));
    },

    async list(prefix?: string): Promise<readonly string[]> {
      const owner = resolveOwner();
      if (!kv.keys) return [];

      const scopePrefix = keyPrefix(owner);
      const stored = await kv.keys(scopePrefix + (prefix ?? ''));
      return stored.map((key) => key.slice(scopePrefix.length));
    },

    /** Nothing to reconcile: there is no remote. */
    async sync(): Promise<SyncReport> {
      return EMPTY_SYNC_REPORT;
    },

    subscribe(listener) {
      return emitter.subscribe(listener);
    },
  };
}
