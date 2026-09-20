/**
 * Device-only identity: a UUID in secure storage and nothing else.
 *
 * This adapter never touches the network, which is what makes "play immediately
 * and keep progress" demonstrable with the entire backend switched off. It
 * reports `canSignIn: false`, so the UI renders no authentication affordance at
 * all rather than showing one that cannot work.
 */

import * as Crypto from 'expo-crypto';

import { NotSupportedError } from '@/core/errors';
import { createLogger, redactId } from '@/core/logging';
import { createSecureKv } from '@/core/storage/secure-store.kv';
import {
  friendlyNameFor,
  type AuthProvider,
  type IdentityCapabilities,
  type IdentityPort,
  type PlayerIdentity,
  type SignInOutcome,
} from './types';

const log = createLogger('device-identity');
const PLAYER_ID_KEY = 'player-id';
const DISPLAY_NAME_KEY = 'display-name';

const capabilities: IdentityCapabilities = {
  canSignIn: false,
  canUpgrade: false,
  canTransfer: false,
  providers: [],
};

export function createDeviceIdentity(): IdentityPort {
  const kv = createSecureKv('mw.identity');
  const listeners = new Set<(identity: PlayerIdentity) => void>();
  let current: PlayerIdentity | null = null;

  function notify(identity: PlayerIdentity): void {
    current = identity;
    for (const listener of listeners) {
      try {
        listener(identity);
      } catch {
        /* a failing subscriber must not break identity restore */
      }
    }
  }

  function build(playerId: string, displayName: string): PlayerIdentity {
    return {
      playerId,
      tier: 'device',
      displayName,
      canUpgrade: false,
      supportsCrossDevice: false,
    };
  }

  const unsupported = (action: string) =>
    new NotSupportedError(
      `${action} is not available with identity.mode: 'device'. ` +
        `Set identity.mode to 'anonymous' or 'google' in packages/config/src/app.config.ts.`,
    );

  return {
    id: 'device',
    capabilities,

    async restore(): Promise<PlayerIdentity> {
      if (current) return current;

      let playerId = await kv.get(PLAYER_ID_KEY);
      if (!playerId) {
        playerId = Crypto.randomUUID();
        await kv.set(PLAYER_ID_KEY, playerId);
        log.info('Created device identity', { playerId: redactId(playerId) });
      }

      let displayName = await kv.get(DISPLAY_NAME_KEY);
      if (!displayName) {
        displayName = friendlyNameFor(playerId);
        await kv.set(DISPLAY_NAME_KEY, displayName);
      }

      const identity = build(playerId, displayName);
      notify(identity);
      return identity;
    },

    async signIn(_provider: AuthProvider): Promise<SignInOutcome> {
      throw unsupported('Signing in');
    },

    async upgrade(_provider: AuthProvider): Promise<SignInOutcome> {
      throw unsupported('Upgrading to an account');
    },

    /**
     * There is no session to end. Returning the same identity keeps the app
     * playable, which is the guarantee that matters, and avoids destroying
     * progress as a side effect of a button the UI should not even show.
     */
    async signOut(): Promise<PlayerIdentity> {
      return current ?? this.restore();
    },

    subscribe(listener) {
      listeners.add(listener);
      if (current) listener(current);
      return () => listeners.delete(listener);
    },

    async getAccessToken(): Promise<string | null> {
      return null;
    },
  };
}
