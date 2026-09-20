import { appConfig, mobileShowsAuth } from '@/config/app.config';
import { isWallSatisfied, resolveEntryRoute, showAuthRoutes } from '@/core/surfaces';
import { useIdentity } from './use-identity';

export function useSurfaceState() {
  const identity = useIdentity((state) => state.identity);
  const capabilities = useIdentity((state) => state.capabilities);
  const identityTier = identity?.tier ?? null;
  const mobileAuth = mobileShowsAuth();
  const authWall = appConfig.mobile.authWall;
  const wallSatisfied = !mobileAuth || isWallSatisfied(authWall, identityTier);

  return {
    product: appConfig.product,
    mobileAuth,
    showAuthRoutes: showAuthRoutes(mobileAuth),
    showAppRoutes: wallSatisfied,
    wallSatisfied,
    entry: resolveEntryRoute({
      mobileAuth,
      authWall,
      identityTier,
    }),
    capabilities,
    identity,
  };
}
