/**
 * The save-store port. Every game and feature talks to this interface and never
 * to an adapter, which is what makes the persistence target a configuration
 * choice instead of an architectural commitment.
 *
 * Contract: specs/001-game-platform-foundation/contracts/save-store-port.md
 */

export interface SaveRecord<T = unknown> {
  key: string;
  data: T;
  /** Shape version of `data`. Drives client-side migration on read. */
  schemaVersion: number;
  /**
   * Monotonic per key, and the primary input to conflict resolution. Compared
   * before any timestamp so that an incorrect device clock cannot affect the
   * ordinary case.
   */
  revision: number;
  /** ISO-8601. Consulted only when revisions are equal. */
  updatedAt: string;
  /** Last writer. Diagnostics, and a deterministic tiebreak of last resort. */
  deviceId: string;
}

export interface StoreCapabilities {
  /** Can progress reach another device through this store? */
  crossDevice: boolean;
  /** Do reads and writes work with no network? */
  offline: boolean;
  /** Does this store queue writes for later replication? */
  queued: boolean;
}

export interface WriteOptions {
  /**
   * Optimistic concurrency. When supplied and stale, the write rejects with
   * ConflictError instead of overwriting — this is what turns "last write wins"
   * from an accident into a deliberate choice.
   */
  expectedRevision?: number;
  /** Refuse to queue: fail loudly if the write cannot reach the backend now. */
  requireDurable?: boolean;
  /**
   * Shape version of the payload being written. Supplied by the platform hook
   * from the game's definition; carrying it forward is what lets a future
   * version know which migrations a stored record still needs.
   */
  schemaVersion?: number;
}

export interface SyncReport {
  pushed: number;
  pulled: number;
  conflicts: number;
  failed: number;
  /** Already redacted, therefore safe to log or display. */
  errors: readonly string[];
}

export const EMPTY_SYNC_REPORT: SyncReport = {
  pushed: 0,
  pulled: 0,
  conflicts: 0,
  failed: 0,
  errors: [],
};

export type SaveRecordListener = (record: SaveRecord) => void;
export type Unsubscribe = () => void;

export interface SaveStorePort {
  /** Adapter id, for diagnostics only. Never branch on this. */
  readonly id: string;
  readonly capabilities: StoreCapabilities;

  read<T>(key: string): Promise<SaveRecord<T> | null>;
  write<T>(key: string, data: T, options?: WriteOptions): Promise<SaveRecord<T>>;
  remove(key: string): Promise<void>;
  list(prefix?: string): Promise<readonly string[]>;

  /** Force reconciliation. Resolves to zeroes for stores with no remote. */
  sync(): Promise<SyncReport>;

  /** Fires on any change, including changes arriving from a remote. */
  subscribe(listener: SaveRecordListener): Unsubscribe;
}

/**
 * A minimal string key-value store. Both AsyncStorage and SecureStore are
 * expressed through this so that swapping either (for example to MMKV) touches
 * exactly one adapter.
 */
export interface KeyValuePort {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Enumerates stored keys. Optional because secure storage cannot enumerate. */
  keys?(prefix?: string): Promise<readonly string[]>;
}

/** Namespace prefixes for save keys. Enforced by the platform hook, not by convention. */
export const KEY_PREFIX = {
  platform: 'platform:',
  game: 'game:',
} as const;

export function gameKey(gameId: string, slot: string): string {
  return `${KEY_PREFIX.game}${gameId}:${slot}`;
}

export function platformKey(name: string): string {
  return `${KEY_PREFIX.platform}${name}`;
}
