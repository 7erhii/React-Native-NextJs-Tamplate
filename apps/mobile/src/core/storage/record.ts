/**
 * Save-record envelope handling.
 *
 * Stored records are treated as untrusted input. Not because an attacker wrote
 * them, but because a *previous version of this app* did — which is the most
 * common source of crash-on-launch after an update, and the reason validation
 * here is not optional.
 */

import { z } from 'zod';

import { getDeviceIdSync } from '@/core/device/device-id';
import type { SaveRecord } from './types';

export const saveRecordEnvelopeSchema = z.object({
  key: z.string().min(1),
  data: z.unknown(),
  schemaVersion: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  updatedAt: z.string().min(1),
  deviceId: z.string().min(1),
});

export type SaveRecordEnvelope = z.infer<typeof saveRecordEnvelopeSchema>;

export function parseEnvelope(raw: string): SaveRecord | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = saveRecordEnvelopeSchema.safeParse(json);
  return result.success ? (result.data as SaveRecord) : null;
}

export function serializeEnvelope(record: SaveRecord): string {
  return JSON.stringify(record);
}

export function createRecord<T>(
  key: string,
  data: T,
  options?: { schemaVersion?: number; revision?: number },
): SaveRecord<T> {
  return {
    key,
    data,
    schemaVersion: options?.schemaVersion ?? 1,
    revision: options?.revision ?? 1,
    updatedAt: new Date().toISOString(),
    deviceId: getDeviceIdSync(),
  };
}

export function nextRecord<T>(previous: SaveRecord | null, key: string, data: T, schemaVersion?: number): SaveRecord<T> {
  return {
    key,
    data,
    schemaVersion: schemaVersion ?? previous?.schemaVersion ?? 1,
    revision: (previous?.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    deviceId: getDeviceIdSync(),
  };
}

/** Simple observable used by every store adapter to notify subscribers. */
export function createRecordEmitter() {
  const listeners = new Set<(record: SaveRecord) => void>();

  return {
    subscribe(listener: (record: SaveRecord) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(record: SaveRecord) {
      for (const listener of listeners) {
        // One misbehaving subscriber must not stop the others from updating.
        try {
          listener(record);
        } catch {
          /* ignored deliberately */
        }
      }
    },
  };
}
