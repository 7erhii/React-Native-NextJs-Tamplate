/**
 * Identity composition root.
 *
 * The second and last file that reads `app.config.ts`. Everything downstream
 * receives an `IdentityPort` and cannot tell which adapter it got, which is what
 * lets a game work identically with no account, an anonymous cloud account, or a
 * Google account.
 */

import { appConfig, type AppConfig } from '@/config/app.config';
import { createLogger } from '@/core/logging';
import { createDeviceIdentity } from './device-identity.adapter';
import { createSupabaseIdentity } from './supabase-identity.adapter';
import type { IdentityPort } from './types';

const log = createLogger('identity');

export type {
  AccountSummary,
  AuthProvider,
  IdentityCapabilities,
  IdentityPort,
  IdentityTier,
  PlayerIdentity,
  SignInOutcome,
} from './types';

let port: IdentityPort | null = null;

function build(config: AppConfig): IdentityPort {
  switch (config.identity.mode) {
    case 'device':
      return createDeviceIdentity();
    case 'anonymous':
      return createSupabaseIdentity({ allowGoogle: false });
    case 'google':
      return createSupabaseIdentity({ allowGoogle: true });
  }
}

export function getIdentity(config: AppConfig = appConfig): IdentityPort {
  if (!port) {
    port = build(config);
    log.info(`Identity ready: ${port.id}`, port.capabilities);
  }
  return port;
}

/** Test seam: forces the next call to rebuild from configuration. */
export function resetIdentity(): void {
  port = null;
}
