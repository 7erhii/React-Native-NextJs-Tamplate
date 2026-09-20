/**
 * KeyValuePort backed by the OS keychain/keystore, used for auth sessions and
 * the device key. Sessions are bearer credentials, so they do not belong in the
 * same plain storage as save data.
 *
 * Two wrinkles are handled here:
 *
 *   1. SecureStore rejects values above roughly 2KB, and a real session carrying
 *      JWTs exceeds that. Values are therefore split across numbered chunks with
 *      a count entry, and reassembled on read.
 *   2. SecureStore does not exist on web. There, this falls back to AsyncStorage,
 *      which is *not* secure storage — acceptable only because web is a
 *      development convenience and not a shipping target.
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { createLogger } from '@/core/logging';
import { createAsyncStorageKv } from './async-storage.kv';
import type { KeyValuePort } from './types';

const log = createLogger('secure-store');

/** Comfortably under the platform limit, leaving room for key overhead. */
const CHUNK_SIZE = 1800;
const COUNT_SUFFIX = '__chunks';

/** SecureStore keys accept only alphanumerics, dot, dash, and underscore. */
function sanitize(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

function createNativeSecureKv(namespace: string): KeyValuePort {
  const scoped = (key: string) => sanitize(`${namespace}.${key}`);
  const chunkKey = (key: string, index: number) => `${scoped(key)}.${index}`;
  const countKey = (key: string) => `${scoped(key)}.${COUNT_SUFFIX}`;

  async function readCount(key: string): Promise<number> {
    const raw = await SecureStore.getItemAsync(countKey(key));
    const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  async function clearChunks(key: string, from: number, to: number): Promise<void> {
    for (let index = from; index < to; index += 1) {
      await SecureStore.deleteItemAsync(chunkKey(key, index));
    }
  }

  return {
    async get(key) {
      try {
        const count = await readCount(key);
        if (count === 0) return null;

        const parts: string[] = [];
        for (let index = 0; index < count; index += 1) {
          const part = await SecureStore.getItemAsync(chunkKey(key, index));
          // A missing chunk means the value is unrecoverable; treat the whole
          // entry as absent rather than returning a truncated credential.
          if (part === null) {
            log.warn('Discarding incomplete secure value', { chunk: index, of: count });
            return null;
          }
          parts.push(part);
        }
        return parts.join('');
      } catch (error) {
        log.warn('Secure read failed', error);
        return null;
      }
    },

    async set(key, value) {
      const previousCount = await readCount(key);

      const chunks: string[] = [];
      for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
        chunks.push(value.slice(offset, offset + CHUNK_SIZE));
      }
      // An empty string is still a value, and needs one chunk to round-trip.
      if (chunks.length === 0) chunks.push('');

      for (let index = 0; index < chunks.length; index += 1) {
        await SecureStore.setItemAsync(chunkKey(key, index), chunks[index]);
      }
      await SecureStore.setItemAsync(countKey(key), String(chunks.length));

      // A shorter value than last time would otherwise leave stale trailing
      // chunks that a future longer write could splice back in.
      if (previousCount > chunks.length) {
        await clearChunks(key, chunks.length, previousCount);
      }
    },

    async remove(key) {
      const count = await readCount(key);
      await clearChunks(key, 0, count);
      await SecureStore.deleteItemAsync(countKey(key));
    },
  };
}

export function createSecureKv(namespace = 'mw'): KeyValuePort {
  if (Platform.OS === 'web') {
    log.warn(
      'Secure storage is unavailable on web; falling back to AsyncStorage. ' +
        'Sessions are not stored securely in this environment.',
    );
    return createAsyncStorageKv(`${namespace}:insecure-fallback`);
  }
  return createNativeSecureKv(namespace);
}

/**
 * Adapter shaped for the Supabase auth client's storage option. Deliberately
 * swallows nothing: a failed session read must look like "no session" rather
 * than crash the app on launch.
 */
export function createSupabaseAuthStorage() {
  const kv = createSecureKv('mw.auth');
  return {
    getItem: (key: string) => kv.get(key),
    setItem: (key: string, value: string) => kv.set(key, value),
    removeItem: (key: string) => kv.remove(key),
  };
}
