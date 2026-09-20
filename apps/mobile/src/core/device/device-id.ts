/**
 * A stable per-installation id, stamped onto every save record as the last
 * writer. It exists for diagnostics and as a deterministic tiebreak when two
 * devices produce records with identical revisions and timestamps.
 *
 * It is not an identity and grants nothing.
 */

import * as Crypto from 'expo-crypto';

import { createSecureKv } from '@/core/storage/secure-store.kv';

const STORAGE_KEY = 'device-id';
const kv = createSecureKv('mw.device');

let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  const existing = await kv.get(STORAGE_KEY);
  if (existing) {
    cached = existing;
    return existing;
  }

  const created = Crypto.randomUUID();
  await kv.set(STORAGE_KEY, created);
  cached = created;
  return created;
}

/**
 * Synchronous accessor for hot paths that cannot await, such as building a
 * record inside a resolver. Returns a placeholder until the real id has loaded,
 * which is acceptable because the field is diagnostic.
 */
export function getDeviceIdSync(): string {
  return cached ?? 'unknown-device';
}

/** Called once during startup so the sync accessor is populated before use. */
export async function primeDeviceId(): Promise<string> {
  return getDeviceId();
}
