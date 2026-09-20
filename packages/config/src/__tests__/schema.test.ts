import type { AppConfig } from '../app.config';
import { appConfig, formatProductRelease } from '../app.config';
import { findConfigProblems } from '../schema';

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    product: {
      name: 'Test',
      tagline: 'Tagline',
      description: 'Description long enough to read.',
      version: '0.1.0',
      build: 1,
      installUrl: '',
    },
    web: { enabled: false, auth: false },
    mobile: { auth: false, authWall: 'none' },
    authSource: 'config',
    persistence: {
      mode: 'local',
      conflictStrategy: 'last-write-wins',
      conflictValuePath: 'bestScore',
      syncIntervalMs: 30_000,
      maxRetries: 5,
    },
    identity: { mode: 'device' },
    features: { transferCodes: false, diagnostics: true },
    ...overrides,
  };
}

describe('shared configuration', () => {
  it('accepts the shipped default (case A: phone only, no auth, no site)', () => {
    expect(findConfigProblems(config())).toEqual([]);
    expect(findConfigProblems(appConfig)).toEqual([]);
  });

  it('rejects Sign in on a website that is not enabled', () => {
    const problems = findConfigProblems(config({ web: { enabled: false, auth: true } }));
    expect(problems.some((p) => p.setting.includes('web.auth'))).toBe(true);
  });

  it('rejects a required wall when mobile.auth is off', () => {
    const problems = findConfigProblems(
      config({ mobile: { auth: false, authWall: 'required' } }),
    );
    expect(problems.some((p) => p.setting.includes('authWall'))).toBe(true);
  });

  it('accepts marketing site without registration (case C)', () => {
    expect(
      findConfigProblems(config({ web: { enabled: true, auth: false } })),
    ).toEqual([]);
  });

  it('accepts bank-shaped: site + app auth, google, hybrid', () => {
    const problems = findConfigProblems(
      config({
        web: { enabled: true, auth: true },
        mobile: { auth: true, authWall: 'required' },
        identity: { mode: 'google' },
        persistence: {
          mode: 'hybrid',
          conflictStrategy: 'last-write-wins',
          conflictValuePath: 'bestScore',
          syncIntervalMs: 30_000,
          maxRetries: 5,
        },
      }),
    );
    expect(problems.filter((p) => p.setting !== 'environment')).toEqual([]);
  });

  it('rejects a version that is not semver', () => {
    const problems = findConfigProblems(
      config({ product: { ...config().product, version: 'v1' } }),
    );
    expect(problems.some((p) => p.setting === 'product.version')).toBe(true);
  });

  it('rejects a build number below 1', () => {
    const problems = findConfigProblems(
      config({ product: { ...config().product, build: 0 } }),
    );
    expect(problems.some((p) => p.setting === 'product.build')).toBe(true);
  });

  it('formats the shipped release as version (build)', () => {
    expect(formatProductRelease(appConfig)).toBe(
      `${appConfig.product.version} (${appConfig.product.build})`,
    );
  });

  it('rejects a cloud store with a device-only identity', () => {
    const problems = findConfigProblems(
      config({
        persistence: { ...config().persistence, mode: 'cloud' },
        identity: { mode: 'device' },
      }),
    );
    expect(problems[0]?.setting).toContain('identity.mode');
  });
});
