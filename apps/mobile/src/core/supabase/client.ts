/**
 * The only file in the app permitted to import the Supabase SDK.
 *
 * Lint forbids `@supabase/*` imports from screens, games, and features. That rule
 * is what keeps the vendor swappable: replacing the backend means writing new
 * adapters against the existing ports, not auditing the whole codebase for
 * scattered SDK calls.
 *
 * The client is created lazily so that device-local mode — which needs no
 * backend and no environment variables — never constructs it at all.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { requireBackendEnv } from '@/config/env';
import { createSupabaseAuthStorage } from '@/core/storage/secure-store.kv';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const { supabaseUrl, supabaseAnonKey } = requireBackendEnv();

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Sessions are bearer credentials, so they go to the keychain rather than
      // to the same plain storage that holds save data.
      storage: createSupabaseAuthStorage(),
      persistSession: true,
      autoRefreshToken: true,
      // On native the redirect is delivered as a deep link and handled
      // explicitly; only the web build should scrape the address bar.
      detectSessionInUrl: Platform.OS === 'web',
      // Authorization-code flow with PKCE. The app is a public client and holds
      // no OAuth secret; the secret lives only in the auth container.
      flowType: 'pkce',
    },
    global: {
      headers: { 'x-application-name': 'mobile-world' },
    },
  });

  return client;
}

/** True when a backend is configured, without constructing the client. */
export function hasSupabaseConfig(): boolean {
  try {
    requireBackendEnv();
    return true;
  } catch {
    return false;
  }
}

/** Test seam: drops the memoized client so a fresh one is built on next use. */
export function resetSupabaseClient(): void {
  client = null;
}
