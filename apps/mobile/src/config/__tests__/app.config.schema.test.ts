import type { AppConfig } from '../app.config';
import { appConfig } from '../app.config';
import { findConfigProblems } from '../app.config.schema';

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

describe('mobile configuration validation', () => {
  it('accepts the shipped default, which needs no backend', () => {
    expect(findConfigProblems(config())).toEqual([]);
    expect(findConfigProblems(appConfig)).toEqual([]);
  });

  it('rejects a cloud store with a device-only identity', () => {
    const problems = findConfigProblems(
      config({
        persistence: { ...config().persistence, mode: 'cloud' },
        identity: { mode: 'device' },
      }),
    );

    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].setting).toContain('identity.mode');
    expect(problems[0].fix).toMatch(/anonymous|google|local/);
  });

  it('rejects a hybrid store with a device-only identity', () => {
    const problems = findConfigProblems(
      config({
        persistence: { ...config().persistence, mode: 'hybrid' },
        identity: { mode: 'device' },
      }),
    );

    expect(problems.some((p) => p.setting.includes('identity.mode'))).toBe(true);
  });

  it('rejects transfer codes with local-only storage', () => {
    const problems = findConfigProblems(
      config({ features: { transferCodes: true, diagnostics: true } }),
    );

    expect(problems.some((p) => p.setting === 'features.transferCodes')).toBe(true);
  });

  it('rejects a sync interval that would hammer the backend', () => {
    const problems = findConfigProblems(
      config({ persistence: { ...config().persistence, syncIntervalMs: 50 } }),
    );

    expect(problems.some((p) => p.setting === 'persistence.syncIntervalMs')).toBe(true);
  });

  it('rejects a retry budget that discards a write on first failure', () => {
    const problems = findConfigProblems(
      config({ persistence: { ...config().persistence, maxRetries: 0 } }),
    );

    expect(problems.some((p) => p.setting === 'persistence.maxRetries')).toBe(true);
  });

  it('rejects highest-value with no value path to compare', () => {
    const problems = findConfigProblems(
      config({
        persistence: {
          ...config().persistence,
          conflictStrategy: 'highest-value',
          conflictValuePath: '',
        },
      }),
    );

    expect(problems.some((p) => p.setting === 'persistence.conflictValuePath')).toBe(true);
  });

  it('explains every problem with both a cause and a fix', () => {
    const problems = findConfigProblems(
      config({
        persistence: { ...config().persistence, mode: 'cloud' },
        identity: { mode: 'device' },
        features: { transferCodes: true, diagnostics: true },
      }),
    );

    expect(problems.length).toBeGreaterThan(1);
    for (const problem of problems) {
      expect(problem.detail.length).toBeGreaterThan(20);
      expect(problem.fix.length).toBeGreaterThan(10);
    }
  });
});
