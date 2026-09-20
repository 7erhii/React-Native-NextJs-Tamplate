/**
 * The React view of the identity port.
 *
 * Screens read from here and never construct an adapter. Whenever the identity
 * changes, the owning player id is pushed into `core/session` so that storage
 * adapters namespace records correctly without depending on React.
 */

import { create } from 'zustand';

import { getIdentity } from '@/core/identity';
import type {
  AccountSummary,
  AuthProvider,
  IdentityCapabilities,
  PlayerIdentity,
  SignInOutcome,
} from '@/core/identity/types';
import { createLogger, redactedMessage } from '@/core/logging';
import { setCurrentOwner } from '@/core/session/current-owner';

const log = createLogger('use-identity');

const NO_CAPABILITIES: IdentityCapabilities = {
  canSignIn: false,
  canUpgrade: false,
  canTransfer: false,
  providers: [],
};

export interface IdentityConflict {
  existing: AccountSummary;
  current: PlayerIdentity;
}

export interface IdentityState {
  identity: PlayerIdentity | null;
  capabilities: IdentityCapabilities;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  busy: boolean;
  /**
   * Set when signing in would collide with an existing account that has its own
   * progress. Held here rather than resolved, because destroying either history
   * without asking is data loss.
   */
  conflict: IdentityConflict | null;

  restore(): Promise<void>;
  signIn(provider: AuthProvider): Promise<SignInOutcome | null>;
  upgrade(provider: AuthProvider): Promise<SignInOutcome | null>;
  signOut(): Promise<void>;
  dismissConflict(): void;
}

function adopt(identity: PlayerIdentity): void {
  setCurrentOwner(identity.playerId);
}

export const useIdentity = create<IdentityState>((set, get) => ({
  identity: null,
  capabilities: NO_CAPABILITIES,
  status: 'idle',
  error: null,
  busy: false,
  conflict: null,

  async restore() {
    if (get().status === 'loading') return;
    set({ status: 'loading', error: null });

    try {
      const port = getIdentity();
      const identity = await port.restore();
      adopt(identity);

      // Keep the store in step with token refreshes and any sign-in completed
      // outside an explicit call, such as a deep link during a cold start.
      port.subscribe((next) => {
        adopt(next);
        set({ identity: next });
      });

      set({ identity, capabilities: port.capabilities, status: 'ready' });
    } catch (error) {
      log.error('Identity restore failed', error);
      set({ status: 'error', error: redactedMessage(error) });
    }
  },

  async signIn(provider) {
    return runAuthAction(set, get, () => getIdentity().signIn(provider));
  },

  async upgrade(provider) {
    return runAuthAction(set, get, () => getIdentity().upgrade(provider));
  },

  async signOut() {
    set({ busy: true, error: null });
    try {
      const identity = await getIdentity().signOut();
      adopt(identity);
      set({ identity, conflict: null });
    } catch (error) {
      set({ error: redactedMessage(error) });
    } finally {
      set({ busy: false });
    }
  },

  dismissConflict() {
    set({ conflict: null });
  },
}));

type SetState = (partial: Partial<IdentityState>) => void;
type GetState = () => IdentityState;

async function runAuthAction(
  set: SetState,
  get: GetState,
  action: () => Promise<SignInOutcome>,
): Promise<SignInOutcome | null> {
  if (get().busy) return null;
  set({ busy: true, error: null, conflict: null });

  try {
    const outcome = await action();

    if (outcome.status === 'signed-in' || outcome.status === 'upgraded') {
      adopt(outcome.identity);
      set({ identity: outcome.identity });
    } else if (outcome.status === 'conflict') {
      set({ conflict: { existing: outcome.existing, current: outcome.current } });
    }

    return outcome;
  } catch (error) {
    log.warn('Authentication action failed', error);
    set({ error: redactedMessage(error) });
    return null;
  } finally {
    set({ busy: false });
  }
}
