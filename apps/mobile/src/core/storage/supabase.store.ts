/**
 * Cloud save store, reading and writing `save_records` through PostgREST.
 *
 * Deliberately **not** offline-capable. A store that claims durability it cannot
 * deliver is more dangerous than one that fails loudly, so every operation here
 * surfaces an OfflineError rather than pretending to succeed. Use the hybrid
 * adapter when offline support is wanted.
 *
 * Ownership is enforced by row-level security in the database. The `owner_id`
 * filter below is for efficiency, not security — if it were removed, the
 * database would still refuse to return another player's rows.
 */

import { z } from 'zod';

import { ConflictError, OfflineError, ValidationError } from '@/core/errors';
import { createLogger, redactedMessage } from '@/core/logging';
import { requireCurrentOwner } from '@/core/session/current-owner';
import { getSupabase } from '@/core/supabase/client';
import { createRecordEmitter, nextRecord } from './record';
import type { SaveRecord, SaveStorePort, SyncReport, WriteOptions } from './types';
import { EMPTY_SYNC_REPORT } from './types';

const log = createLogger('cloud-store');

export const TABLE = 'save_records';

const rowSchema = z.object({
  key: z.string(),
  data: z.unknown(),
  schema_version: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  updated_at: z.string(),
  device_id: z.string().nullable(),
});

type Row = z.infer<typeof rowSchema>;

function toRecord(row: Row): SaveRecord {
  return {
    key: row.key,
    data: row.data,
    schemaVersion: row.schema_version,
    revision: row.revision,
    updatedAt: row.updated_at,
    deviceId: row.device_id ?? 'unknown-device',
  };
}

function toRow(ownerId: string, record: SaveRecord) {
  return {
    owner_id: ownerId,
    key: record.key,
    data: record.data,
    schema_version: record.schemaVersion,
    revision: record.revision,
    updated_at: record.updatedAt,
    device_id: record.deviceId,
  };
}

/**
 * PostgREST reports transport failures and permission failures very
 * differently, and conflating them would mislead the caller badly: one means
 * "try again later", the other means "you are misconfigured".
 */
function translateError(error: { message: string; code?: string }): Error {
  const message = error.message ?? '';
  const isTransport =
    /network|fetch|timeout|econn|enotfound|failed to fetch/i.test(message) || error.code === '';

  if (isTransport) return new OfflineError('Cannot reach the backend', { cause: error });
  return new Error(message);
}

export interface CloudStoreOptions {
  resolveOwner?: () => string;
}

export function createCloudStore(options: CloudStoreOptions = {}): SaveStorePort {
  const resolveOwner = options.resolveOwner ?? requireCurrentOwner;
  const emitter = createRecordEmitter();

  async function readRow(ownerId: string, key: string): Promise<SaveRecord | null> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select('key, data, schema_version, revision, updated_at, device_id')
      .eq('owner_id', ownerId)
      .eq('key', key)
      .maybeSingle();

    if (error) throw translateError(error);
    if (!data) return null;

    const parsed = rowSchema.safeParse(data);
    if (!parsed.success) {
      throw new ValidationError(`Malformed save row for key '${key}'`, { cause: parsed.error });
    }
    return toRecord(parsed.data);
  }

  return {
    id: 'cloud',

    capabilities: {
      crossDevice: true,
      offline: false,
      queued: false,
    },

    async read<T>(key: string): Promise<SaveRecord<T> | null> {
      return (await readRow(resolveOwner(), key)) as SaveRecord<T> | null;
    },

    async write<T>(key: string, data: T, writeOptions?: WriteOptions): Promise<SaveRecord<T>> {
      const ownerId = resolveOwner();
      const previous = await readRow(ownerId, key);

      if (
        writeOptions?.expectedRevision !== undefined &&
        (previous?.revision ?? 0) !== writeOptions.expectedRevision
      ) {
        throw new ConflictError(writeOptions.expectedRevision, previous?.revision ?? 0);
      }

      const record = nextRecord<T>(previous, key, data, writeOptions?.schemaVersion);

      const { error } = await getSupabase()
        .from(TABLE)
        .upsert(toRow(ownerId, record), { onConflict: 'owner_id,key' });

      if (error) throw translateError(error);

      emitter.emit(record);
      return record;
    },

    async remove(key: string): Promise<void> {
      const { error } = await getSupabase()
        .from(TABLE)
        .delete()
        .eq('owner_id', resolveOwner())
        .eq('key', key);

      if (error) throw translateError(error);
    },

    async list(prefix?: string): Promise<readonly string[]> {
      let query = getSupabase().from(TABLE).select('key').eq('owner_id', resolveOwner());
      if (prefix) query = query.like('key', `${prefix}%`);

      const { data, error } = await query;
      if (error) throw translateError(error);

      return (data ?? []).map((row) => String((row as { key: unknown }).key));
    },

    /** Reads and writes already go straight to the remote; nothing is deferred. */
    async sync(): Promise<SyncReport> {
      return EMPTY_SYNC_REPORT;
    },

    subscribe(listener) {
      return emitter.subscribe(listener);
    },
  };
}

/** Pulls every record for the owner. Used by the hybrid adapter during sync. */
export async function fetchAllRecords(ownerId: string): Promise<readonly SaveRecord[]> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('key, data, schema_version, revision, updated_at, device_id')
    .eq('owner_id', ownerId);

  if (error) throw translateError(error);

  const records: SaveRecord[] = [];
  for (const row of data ?? []) {
    const parsed = rowSchema.safeParse(row);
    if (parsed.success) {
      records.push(toRecord(parsed.data));
    } else {
      // One bad row must not abort the whole reconciliation pass.
      log.warn('Skipping malformed remote row', { error: redactedMessage(parsed.error) });
    }
  }
  return records;
}

export async function pushRecord(ownerId: string, record: SaveRecord): Promise<void> {
  const { error } = await getSupabase()
    .from(TABLE)
    .upsert(toRow(ownerId, record), { onConflict: 'owner_id,key' });

  if (error) throw translateError(error);
}
