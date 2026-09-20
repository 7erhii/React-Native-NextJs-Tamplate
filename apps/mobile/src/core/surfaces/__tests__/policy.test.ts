import type { AuthWall } from '@world/config';
import { isWallSatisfied, resolveEntryRoute, showAuthRoutes } from '../policy';

describe('mobile surface policy', () => {
  it('opens home when registration is off', () => {
    expect(
      resolveEntryRoute({
        mobileAuth: false,
        authWall: 'required',
        identityTier: 'device',
      }),
    ).toBe('/home');
    expect(showAuthRoutes(false)).toBe(false);
  });

  it('gates home behind sign-in when the wall is required', () => {
    expect(
      resolveEntryRoute({
        mobileAuth: true,
        authWall: 'required',
        identityTier: 'anonymous',
      }),
    ).toBe('/sign-in');
    expect(isWallSatisfied('required', 'account')).toBe(true);
  });

  it('does not invent a website route — web is Next.js', () => {
    const href = resolveEntryRoute({
      mobileAuth: false,
      authWall: 'none' as AuthWall,
      identityTier: 'device',
    });
    expect(href).toBe('/home');
  });
});
