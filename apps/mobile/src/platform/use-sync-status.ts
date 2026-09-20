/**
 * Read-only view of replication state, for diagnostics and for telling the
 * player honestly whether their progress has left the device yet.
 */

import { useEffect, useState } from 'react';

import { getSaveStore, getSyncEngine } from '@/core/storage';
import type { SyncStatus } from '@/core/sync/engine';

const IDLE: SyncStatus = {
  running: false,
  pending: 0,
  lastSyncAt: null,
  lastReport: null,
  lastError: null,
};

export interface SyncStatusHandle extends SyncStatus {
  /** False in modes with no deferred replication, where the panel is meaningless. */
  available: boolean;
  storeId: string;
  crossDevice: boolean;
  offlineCapable: boolean;
  flush(): Promise<void>;
}

export function useSyncStatus(): SyncStatusHandle {
  const [status, setStatus] = useState<SyncStatus>(IDLE);
  const engine = getSyncEngine();
  const store = getSaveStore();

  useEffect(() => {
    if (!engine) return undefined;
    return engine.subscribe(setStatus);
  }, [engine]);

  return {
    ...status,
    available: engine !== null,
    storeId: store.id,
    crossDevice: store.capabilities.crossDevice,
    offlineCapable: store.capabilities.offline,
    async flush() {
      await store.sync();
    },
  };
}
