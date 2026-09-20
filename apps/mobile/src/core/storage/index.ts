/**
 * Storage composition root.
 *
 * One of only two files that read `app.config.ts`. Every `switch` on the
 * persistence mode lives here, which is what keeps mode-awareness out of
 * screens and games — and therefore what makes switching persistence a
 * one-file change for the developer rather than a refactor.
 */

import { appConfig, type AppConfig } from '@/config/app.config';
import { createLogger } from '@/core/logging';
import type { ResolveOptions } from '@/core/sync/conflict';
import type { SyncEngine } from '@/core/sync/engine';
import { createCloudStore } from './supabase.store';
import { createHybridStore } from './hybrid.store';
import { createLocalStore } from './local.store';
import type { SaveStorePort } from './types';

const log = createLogger('storage');

export type { SaveRecord, SaveStorePort, StoreCapabilities, SyncReport, WriteOptions } from './types';
export { gameKey, platformKey, KEY_PREFIX } from './types';

let store: SaveStorePort | null = null;
let engine: SyncEngine | null = null;

function conflictOptions(config: AppConfig): ResolveOptions {
  return {
    strategy: config.persistence.conflictStrategy,
    valuePath: config.persistence.conflictValuePath,
  };
}

function build(config: AppConfig): { store: SaveStorePort; engine: SyncEngine | null } {
  switch (config.persistence.mode) {
    case 'local':
      return { store: createLocalStore(), engine: null };

    case 'cloud':
      return { store: createCloudStore(), engine: null };

    case 'hybrid': {
      const hybrid = createHybridStore({
        conflict: conflictOptions(config),
        syncIntervalMs: config.persistence.syncIntervalMs,
        maxRetries: config.persistence.maxRetries,
      });
      return { store: hybrid, engine: hybrid.engine };
    }
  }
}

export function getSaveStore(config: AppConfig = appConfig): SaveStorePort {
  if (!store) {
    const built = build(config);
    store = built.store;
    engine = built.engine;
    log.info(`Save store ready: ${store.id}`, store.capabilities);
  }
  return store;
}

/** Null in modes with no deferred replication. */
export function getSyncEngine(): SyncEngine | null {
  getSaveStore();
  return engine;
}

/** Test seam: forces the next call to rebuild from configuration. */
export function resetSaveStore(): void {
  engine?.stop();
  store = null;
  engine = null;
}
