/**
 * Cloud identity: anonymous by default, upgradable to Google.
 *
 * Two decisions here carry most of the weight:
 *
 *   1. `restore()` signs in **anonymously** when no session exists. That gives a
 *      real authenticated principal with no player input, so row-level security
 *      works normally and cloud saves need no special-cased "guest" path.
 *
 *   2. `upgrade()` uses `linkIdentity`, which attaches Google to the *existing*
 *      user and leaves the user id unchanged. Save records are owned by that id,
 *      so no data moves and there is no window where two profiles exist. The
 *      obvious alternative — sign out, sign in with Google, copy rows — is the
 *      one that loses progress when it half-fails.
 */

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { AuthError, Session, SupabaseClient, User } from '@supabase/supabase-js';

import { AppError, NotSupportedError } from '@/core/errors';
import { createLogger, redactId } from '@/core/logging';
import { getSupabase } from '@/core/supabase/client';
import {
  friendlyNameFor,
  type AuthProvider,
  type IdentityCapabilities,
  type IdentityListener,
  type IdentityPort,
  type PlayerIdentity,
  type SignInOutcome,
} from './types';

const log = createLogger('cloud-identity');

const REDIRECT_PATH = 'auth-callback';

export interface SupabaseIdentityOptions {
  /** False for the `anonymous` mode, which offers no sign-in at all. */
  allowGoogle: boolean;
}

/** Reads a query parameter without relying on a complete URL implementation. */
function paramFrom(url: string, name: string): string | null {
  const match = new RegExp(`[?&#]${name}=([^&#]+)`).exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Supabase signals an already-linked third-party account in several shapes. */
function isIdentityConflict(error: AuthError | null): boolean {
  if (!error) return false;
  const code = (error as AuthError & { code?: string }).code ?? '';
  return (
    code === 'identity_already_exists' ||
    error.status === 422 ||
    /already (been )?(registered|linked|exists)/i.test(error.message)
  );
}

export function createSupabaseIdentity(options: SupabaseIdentityOptions): IdentityPort {
  const listeners = new Set<IdentityListener>();
  let current: PlayerIdentity | null = null;
  let authSubscribed = false;

  const capabilities: IdentityCapabilities = {
    canSignIn: options.allowGoogle,
    canUpgrade: options.allowGoogle,
    canTransfer: true,
    providers: options.allowGoogle ? ['google'] : [],
  };

  function mapUser(user: User): PlayerIdentity {
    const isAnonymous = user.is_anonymous === true;
    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const name =
      (typeof metadata.full_name === 'string' && metadata.full_name) ||
      (typeof metadata.name === 'string' && metadata.name) ||
      friendlyNameFor(user.id);
    const avatar =
      (typeof metadata.avatar_url === 'string' && metadata.avatar_url) ||
      (typeof metadata.picture === 'string' && metadata.picture) ||
      undefined;

    return {
      playerId: user.id,
      tier: isAnonymous ? 'anonymous' : 'account',
      displayName: name,
      avatarUrl: avatar,
      email: user.email ?? undefined,
      canUpgrade: isAnonymous && options.allowGoogle,
      supportsCrossDevice: true,
    };
  }

  function notify(identity: PlayerIdentity): void {
    current = identity;
    for (const listener of listeners) {
      try {
        listener(identity);
      } catch {
        /* a failing subscriber must not break auth handling */
      }
    }
  }

  /**
   * Keeps the port's view in step with token refreshes and any sign-in that
   * happened outside an explicit call, such as a deep link arriving during a
   * cold start.
   */
  function watchAuth(client: SupabaseClient): void {
    if (authSubscribed) return;
    authSubscribed = true;

    client.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        notify(mapUser(session.user));
      }
      log.debug(`Auth event: ${event}`, { playerId: redactId(session?.user?.id) });
    });
  }

  async function ensureSession(client: SupabaseClient): Promise<Session> {
    const { data, error } = await client.auth.getSession();
    if (error) throw new AppError('unknown', error.message, { cause: error });
    if (data.session) return data.session;

    // No session yet: create a real user with no player interaction. This is the
    // mechanism behind "cloud saves without registration".
    const anon = await client.auth.signInAnonymously();
    if (anon.error || !anon.data.session) {
      throw new AppError(
        'unknown',
        `Anonymous sign-in failed: ${anon.error?.message ?? 'no session returned'}. ` +
          `Confirm anonymous users are enabled in the auth container.`,
        { cause: anon.error },
      );
    }
    log.info('Created anonymous cloud identity', { playerId: redactId(anon.data.user?.id) });
    return anon.data.session;
  }

  /**
   * Runs the browser half of a PKCE flow and exchanges the returned code.
   * The app never holds an OAuth client secret; the exchange is authenticated by
   * the PKCE verifier the SDK generated.
   */
  async function completeBrowserFlow(
    client: SupabaseClient,
    authUrl: string,
    redirectTo: string,
  ): Promise<'cancelled' | 'signed-in'> {
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);

    if (result.type !== 'success') return 'cancelled';

    const returnedError = paramFrom(result.url, 'error_description') ?? paramFrom(result.url, 'error');
    if (returnedError) {
      throw new AppError('unknown', `Sign-in was rejected: ${returnedError}`);
    }

    const code = paramFrom(result.url, 'code');
    if (!code) {
      throw new AppError(
        'unknown',
        'The sign-in redirect contained no authorization code. Check the redirect allow-list in the auth container.',
      );
    }

    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw new AppError('unknown', error.message, { cause: error });

    return 'signed-in';
  }

  function requireGoogle(): void {
    if (!options.allowGoogle) {
      throw new NotSupportedError(
        `Google sign-in is not available with identity.mode: 'anonymous'. ` +
          `Set identity.mode to 'google' in packages/config/src/app.config.ts.`,
      );
    }
  }

  const port: IdentityPort = {
    id: options.allowGoogle ? 'supabase-google' : 'supabase-anonymous',
    capabilities,

    async restore(): Promise<PlayerIdentity> {
      const client = getSupabase();
      watchAuth(client);

      const session = await ensureSession(client);
      const identity = mapUser(session.user);
      notify(identity);
      return identity;
    },

    async signIn(provider: AuthProvider): Promise<SignInOutcome> {
      requireGoogle();

      // An anonymous session already exists at this point, and signing in
      // "fresh" would abandon its progress. Routing to upgrade is what keeps the
      // spec's promise that authentication never costs the player anything.
      const identity = current ?? (await port.restore());
      if (identity.tier === 'anonymous') {
        return port.upgrade(provider);
      }
      return { status: 'signed-in', identity };
    },

    async upgrade(provider: AuthProvider): Promise<SignInOutcome> {
      requireGoogle();

      const client = getSupabase();
      const before = current ?? (await port.restore());
      const redirectTo = Linking.createURL(REDIRECT_PATH);

      const { data, error } = await client.auth.linkIdentity({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });

      if (isIdentityConflict(error)) {
        // Two real histories exist. Resolving this silently would destroy one of
        // them, so it is handed back to the caller as an explicit outcome.
        log.warn('Google account already linked to another player');
        return {
          status: 'conflict',
          existing: {
            provider,
            detail:
              'This Google account is already linked to a different player. ' +
              'Choose which progress to keep before continuing.',
          },
          current: before,
        };
      }

      if (error || !data?.url) {
        throw new AppError(
          'unknown',
          `Could not start account linking: ${error?.message ?? 'no authorization URL returned'}. ` +
            `Confirm manual linking is enabled in the auth container.`,
          { cause: error },
        );
      }

      const outcome = await completeBrowserFlow(client, data.url, redirectTo);
      if (outcome === 'cancelled') return { status: 'cancelled' };

      const { data: refreshed } = await client.auth.getUser();
      if (!refreshed.user) throw new AppError('unknown', 'Linking completed but no user was returned');

      const identity = mapUser(refreshed.user);
      notify(identity);

      // The invariant that makes progress preservation structural rather than
      // procedural. If it ever breaks, saves have been orphaned.
      if (identity.playerId !== before.playerId) {
        log.error('Player id changed during upgrade; saved progress may be orphaned', {
          before: redactId(before.playerId),
          after: redactId(identity.playerId),
        });
      }

      log.info('Upgraded to a permanent account', { playerId: redactId(identity.playerId) });
      return { status: 'upgraded', identity };
    },

    async signOut(): Promise<PlayerIdentity> {
      const client = getSupabase();
      await client.auth.signOut();

      // Immediately establish a fresh anonymous identity so the app stays
      // playable and progress-saving continues, per the spec.
      current = null;
      return port.restore();
    },

    subscribe(listener) {
      listeners.add(listener);
      if (current) listener(current);
      return () => listeners.delete(listener);
    },

    async getAccessToken(): Promise<string | null> {
      const { data } = await getSupabase().auth.getSession();
      return data.session?.access_token ?? null;
    },
  };

  return port;
}
