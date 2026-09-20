import type { KeyValuePort } from '../types';

/**
 * In-memory KeyValuePort for tests. Lets the store contract suite run without
 * any native module, which keeps the suite fast and portable enough to be worth
 * running against every adapter.
 */
export function createMemoryKv(): KeyValuePort & { dump(): Map<string, string> } {
  const store = new Map<string, string>();

  return {
    async get(key) {
      return store.get(key) ?? null;
    },
    async set(key, value) {
      store.set(key, value);
    },
    async remove(key) {
      store.delete(key);
    },
    async keys(prefix) {
      const all = [...store.keys()];
      return prefix ? all.filter((key) => key.startsWith(prefix)) : all;
    },
    dump() {
      return store;
    },
  };
}
