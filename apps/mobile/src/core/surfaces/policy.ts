/**
 * Mobile routing policy. The website is a separate Next.js app — this file
 * never returns a marketing route.
 */

import type { AuthWall } from '@world/config';
import type { IdentityTier } from '@/core/identity/types';

export type AppHref = '/sign-in' | '/sign-up' | '/home';

export function isWallSatisfied(
  authWall: AuthWall,
  identityTier: IdentityTier | null,
): boolean {
  if (authWall !== 'required') return true;
  return identityTier === 'account';
}

export function resolveEntryRoute(input: {
  mobileAuth: boolean;
  authWall: AuthWall;
  identityTier: IdentityTier | null;
}): AppHref {
  if (!input.mobileAuth) return '/home';
  if (!isWallSatisfied(input.authWall, input.identityTier)) return '/sign-in';
  return '/home';
}

export function showAuthRoutes(mobileAuth: boolean): boolean {
  return mobileAuth;
}
