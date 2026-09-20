/**
 * KeyValuePort backed by AsyncStorage.
 *
 * Chosen over MMKV because it needs no native module, which is what keeps the
 * device tier usable with zero setup on iOS, Android, and web. Swapping in MMKV
 * later means replacing this one file.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { KeyValuePort } from './types';

export function createAsyncStorageKv(namespace = 'mw:v1'): KeyValuePort {
  const scoped = (key: string) => `${namespace}:${key}`;
  const unscoped = (key: string) => key.slice(namespace.length + 1);

  return {
    async get(key) {
      return AsyncStorage.getItem(scoped(key));
    },

    async set(key, value) {
      await AsyncStorage.setItem(scoped(key), value);
    },

    async remove(key) {
      await AsyncStorage.removeItem(scoped(key));
    },

    async keys(prefix) {
      const all = await AsyncStorage.getAllKeys();
      const search = scoped(prefix ?? '');
      return all.filter((key) => key.startsWith(search)).map(unscoped);
    },
  };
}
