/**
 * The identity port.
 *
 * Contract: specs/001-game-platform-foundation/contracts/identity-port.md
 *
 * The load-bearing rule is that `playerId` survives an upgrade from anonymous to
 * a real account. Because save records are owned by that id, "progress is
 * preserved on sign-in" becomes a structural property rather than the outcome of
 * a copy routine that could half-fail.
 */

export type IdentityTier =
  /** UUID in secure storage. No account, no network, no cross-device. */
  | 'device'
  /** A real cloud user created without any player input. */
  | 'anonymous'
  /** A cloud user with a linked third-party account. */
  | 'account';

export type AuthProvider = 'google';

export interface PlayerIdentity {
  /** Ownership key for every save record. Stable across an upgrade. */
  playerId: string;
  tier: IdentityTier;
  displayName: string;
  avatarUrl?: string;
  /** Present only for the `account` tier. */
  email?: string;
  /** Can this identity still become a real account? */
  canUpgrade: boolean;
  /** Can progress under this identity reach another device? */
  supportsCrossDevice: boolean;
}

export interface IdentityCapabilities {
  /** Whether any sign-in affordance should render at all. */
  canSignIn: boolean;
  canUpgrade: boolean;
  canTransfer: boolean;
  providers: readonly AuthProvider[];
}

export interface AccountSummary {
  provider: AuthProvider;
  email?: string;
  detail: string;
}

export type SignInOutcome =
  | { status: 'signed-in'; identity: PlayerIdentity }
  /** Anonymous became permanent. `playerId` unchanged, progress intact. */
  | { status: 'upgraded'; identity: PlayerIdentity }
  /**
   * The target account already exists with its own progress. Two real histories
   * exist and neither may be destroyed without asking, so callers MUST surface
   * this to the player rather than resolve it.
   */
  | { status: 'conflict'; existing: AccountSummary; current: PlayerIdentity }
  | { status: 'cancelled' };

export interface SignOutOptions {
  /** Drop queued writes instead of flushing them first. */
  discardPendingWrites?: boolean;
}

export type IdentityListener = (identity: PlayerIdentity) => void;

export interface IdentityPort {
  /** Adapter id, for diagnostics only. Never branch on this. */
  readonly id: string;
  readonly capabilities: IdentityCapabilities;

  /** Resolves the current identity, creating one if absent. Never returns null. */
  restore(): Promise<PlayerIdentity>;

  /** Interactive sign-in. Rejects with NotSupportedError when unsupported. */
  signIn(provider: AuthProvider): Promise<SignInOutcome>;

  /** Upgrades the current anonymous identity in place, preserving `playerId`. */
  upgrade(provider: AuthProvider): Promise<SignInOutcome>;

  /** Returns to an anonymous/device identity; the app stays playable. */
  signOut(options?: SignOutOptions): Promise<PlayerIdentity>;

  subscribe(listener: IdentityListener): () => void;

  /** Bearer token for cloud adapters; null for the device adapter. */
  getAccessToken(): Promise<string | null>;
}

/**
 * A stable, friendly name derived from the player id, so an anonymous player is
 * addressable without ever being asked for anything.
 */
export function friendlyNameFor(playerId: string): string {
  let hash = 0;
  for (let index = 0; index < playerId.length; index += 1) {
    hash = (hash * 31 + playerId.charCodeAt(index)) % 100_000;
  }
  return `Player ${String(hash).padStart(4, '0').slice(0, 4)}`;
}
