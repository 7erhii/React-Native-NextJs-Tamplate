/**
 * Mobile-side startup validation: shared switch rules plus Expo env gates.
 */

import {
  appConfig,
  findConfigProblems as findSharedProblems,
  usesBackend,
  type AppConfig,
  type ConfigProblem,
} from '@world/config';
import { ConfigurationError } from '@/core/errors';
import { assertNoPrivilegedKeys, getBackendEnv } from './env';

export type { ConfigProblem };

const CONFIG_PATH = 'packages/config/src/app.config.ts';

export function findConfigProblems(config: AppConfig = appConfig): ConfigProblem[] {
  const problems = findSharedProblems(config);

  if (usesBackend(config) && !getBackendEnv()) {
    problems.push({
      setting: 'environment',
      detail:
        `This clone needs a backend (cloud persistence or registration), ` +
        `but EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set.`,
      fix:
        `Create .env at the repo root (see .env.example), ` +
        `or turn auth off and set persistence.mode='local' with identity.mode='device'.`,
    });
  }

  return problems;
}

export function assertValidConfig(config: AppConfig = appConfig): void {
  const problems = findConfigProblems(config);

  if (problems.length > 0) {
    const report = problems
      .map((p, i) => `${i + 1}. ${p.setting}\n   ${p.detail}\n   Fix: ${p.fix}`)
      .join('\n\n');

    throw new ConfigurationError(`Invalid configuration in ${CONFIG_PATH}:\n\n${report}`);
  }

  assertNoPrivilegedKeys();
}
