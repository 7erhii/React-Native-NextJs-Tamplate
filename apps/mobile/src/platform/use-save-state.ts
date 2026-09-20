/**
 * The hook a game uses for its progress. The only persistence API games touch.
 *
 * Three guarantees live here rather than in each game, because they are exactly
 * the things that are easy to get wrong once and then wrong forever:
 *
 *   - **Namespacing.** The `game:<id>:` prefix is injected from the definition,
 *     so a game cannot address another game's data even by accident.
 *   - **Validation.** Stored payloads were written by *older versions of this
 *     app* and are therefore untrusted; every read is schema-checked.
 *   - **Migration.** An outdated payload is brought forward and written back, so
 *     a game only ever sees its current shape.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { GameDefinition } from '@/core/games/types';
import { migrateSave } from '@/core/games/types';
import { createLogger, redactedMessage } from '@/core/logging';
import { getSaveStore } from '@/core/storage';
import { gameKey, type SaveRecord } from '@/core/storage/types';
import { useIdentity } from './use-identity';

const log = createLogger('use-save-state');

export type SaveStatus = 'loading' | 'ready' | 'saving' | 'error';

export interface SaveStateHandle<T> {
  data: T;
  status: SaveStatus;
  error: string | null;
  /** Revision of the loaded record; 0 when nothing is stored yet. */
  revision: number;
  save(next: T | ((previous: T) => T)): Promise<void>;
  reset(): Promise<void>;
  reload(): Promise<void>;
}

export function useSaveState<T>(
  definition: GameDefinition<T>,
  slot = 'progress',
): SaveStateHandle<T> {
  const identity = useIdentity((state) => state.identity);
  const key = gameKey(definition.id, slot);

  const [data, setData] = useState<T>(definition.initialSave);
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  /**
   * Mirrored into state as well as a ref: the ref is read from callbacks (where
   * it must be current), and the state is what render reads. Reading the ref
   * during render would make the displayed revision unreliable.
   */
  const [revision, setRevision] = useState(0);
  const recordRef = useRef<SaveRecord<T> | null>(null);

  const adoptRecord = useCallback((record: SaveRecord<T> | null) => {
    recordRef.current = record;
    setRevision(record?.revision ?? 0);
  }, []);

  const applyRecord = useCallback(
    async (record: SaveRecord<T> | null): Promise<void> => {
      if (!record) {
        // Absence is the normal first-launch case, not an error. Nothing is
        // written yet — the initial state is materialized on first save.
        adoptRecord(null);
        setData(definition.initialSave);
        return;
      }

      const result = migrateSave(definition, record.data, record.schemaVersion);

      if (!result) {
        // Unusable payload. The record itself is left in place (and quarantined
        // by the store when unparseable), so the failure is recoverable rather
        // than a crash on launch.
        log.warn('Save could not be migrated or validated; starting fresh', {
          game: definition.id,
          storedVersion: record.schemaVersion,
        });
        adoptRecord(null);
        setData(definition.initialSave);
        return;
      }

      adoptRecord({ ...record, data: result.data });
      setData(result.data);

      if (result.migrated) {
        // Pay the migration once rather than on every subsequent read.
        const upgraded = await getSaveStore().write<T>(key, result.data, {
          schemaVersion: definition.saveVersion,
        });
        adoptRecord(upgraded);
      }
    },
    [adoptRecord, definition, key],
  );

  const load = useCallback(async () => {
    if (!identity) return;
    setStatus('loading');
    setError(null);

    try {
      const record = await getSaveStore().read<T>(key);
      await applyRecord(record);
      setStatus('ready');
    } catch (caught) {
      log.error('Failed to load save', caught);
      setError(redactedMessage(caught));
      setStatus('error');
    }
  }, [applyRecord, identity, key]);

  useEffect(() => {
    // Reading persisted state is exactly the "synchronize with an external
    // system" case effects exist for. The lint rule cannot distinguish it from an
    // accidental render-driven state update, so it is silenced here specifically.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading persisted state from storage
    void load();
  }, [load]);

  // Records arriving from a sync pull must land in the UI without a reload.
  useEffect(() => {
    if (!identity) return undefined;

    return getSaveStore().subscribe((record) => {
      if (record.key !== key) return;
      if (record.revision <= (recordRef.current?.revision ?? 0)) return;
      void applyRecord(record as SaveRecord<T>);
    });
  }, [applyRecord, identity, key]);

  const save = useCallback(
    async (next: T | ((previous: T) => T)) => {
      const resolved =
        typeof next === 'function' ? (next as (previous: T) => T)(data) : next;

      // Optimistic: the UI updates immediately and the store is the durable
      // record. In hybrid mode the write is already local-first anyway.
      setData(resolved);
      setStatus('saving');
      setError(null);

      try {
        const record = await getSaveStore().write<T>(key, resolved, {
          schemaVersion: definition.saveVersion,
        });
        adoptRecord(record);
        setStatus('ready');
      } catch (caught) {
        log.error('Failed to save', caught);
        setError(redactedMessage(caught));
        setStatus('error');
      }
    },
    [adoptRecord, data, definition.saveVersion, key],
  );

  const reset = useCallback(async () => {
    await getSaveStore().remove(key);
    adoptRecord(null);
    setData(definition.initialSave);
    setStatus('ready');
  }, [adoptRecord, definition.initialSave, key]);

  return {
    data,
    status,
    error,
    revision,
    save,
    reset,
    reload: load,
  };
}
