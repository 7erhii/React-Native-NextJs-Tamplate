/**
 * Validated access to environment values.
 *
 * Only `EXPO_PUBLIC_*` variables are inlined into the JavaScript bundle, which
 * means **everything readable here is readable by anyone who downloads the app**.
 * That is why only the public anon key lives here. The service-role key belongs
 * exclusively to `infra/supabase/.env` and must never be referenced from this
 * directory.
 */

import { ConfigurationError } from '@/core/errors';

export interface BackendEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

function read(name: string): string | undefined {
  // Statically indexed so the bundler can inline the value.
  const raw =
    name === 'EXPO_PUBLIC_SUPABASE_URL'
      ? process.env.EXPO_PUBLIC_SUPABASE_URL
      : name === 'EXPO_PUBLIC_SUPABASE_ANON_KEY'
        ? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
        : undefined;

  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

export function getBackendEnv(): BackendEnv | null {
  const supabaseUrl = read('EXPO_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = read('EXPO_PUBLIC_SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) return null;
  return { supabaseUrl, supabaseAnonKey };
}

/**
 * Used by cloud-backed adapters, which cannot function without a backend. The
 * message names the missing variables and points at the fix, because this is
 * the error a developer hits within their first ten minutes.
 */
export function requireBackendEnv(): BackendEnv {
  const env = getBackendEnv();
  if (env) return env;

  const missing = [
    !read('EXPO_PUBLIC_SUPABASE_URL') && 'EXPO_PUBLIC_SUPABASE_URL',
    !read('EXPO_PUBLIC_SUPABASE_ANON_KEY') && 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  ].filter(Boolean);

  throw new ConfigurationError(
    `Cloud persistence is configured but ${missing.join(' and ')} ${
      missing.length > 1 ? 'are' : 'is'
    } missing. Add them to .env at the project root, or set ` +
      `persistence.mode to 'local' and identity.mode to 'device' in packages/config/src/app.config.ts. ` +
      `See specs/001-game-platform-foundation/quickstart.md.`,
  );
}

/**
 * A privileged key reaching the client is a security incident, not a
 * misconfiguration, so it is detected at startup rather than left to a reviewer.
 * The committed `check:secrets` script covers the repository; this covers the
 * running app.
 */
export function assertNoPrivilegedKeys(): void {
  const anonKey = read('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!anonKey) return;

  // Supabase keys are JWTs whose payload carries the granted role.
  try {
    const [, payload] = anonKey.split('.');
    if (!payload) return;
    const decoded = JSON.parse(
      globalThis.atob ? globalThis.atob(payload) : '{}',
    ) as { role?: string };

    if (decoded.role && decoded.role !== 'anon') {
      throw new ConfigurationError(
        `EXPO_PUBLIC_SUPABASE_ANON_KEY grants the '${decoded.role}' role. ` +
          `Only the 'anon' key may be exposed to the client — anything prefixed ` +
          `EXPO_PUBLIC_ ships inside the app bundle. Replace it with the anon key.`,
      );
    }
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    // An unparseable key is not proof of a problem; the client will fail loudly
    // on first use with a clearer message than we could produce here.
  }
}
