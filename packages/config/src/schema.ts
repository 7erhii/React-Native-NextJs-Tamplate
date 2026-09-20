import type { AppConfig } from './app.config';

export interface ConfigProblem {
  setting: string;
  detail: string;
  fix: string;
}

/**
 * Combinations that cannot work, independent of Expo/Next env vars.
 * Each app adds its own env checks on top of this.
 */
export function findConfigProblems(config: AppConfig): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const { product, persistence, identity, features, web, mobile, authSource } = config;

  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(product.version)) {
    problems.push({
      setting: 'product.version',
      detail: `product.version is '${product.version}', which is not a semver like 1.2.3.`,
      fix: `Bump packages/config/src/release.json — version is the store listing string.`,
    });
  }

  if (!Number.isInteger(product.build) || product.build < 1) {
    problems.push({
      setting: 'product.build',
      detail: `product.build is ${product.build}. Stores need an integer ≥ 1 that only goes up.`,
      fix: `Set build to 1 in release.json, then increment on every store upload.`,
    });
  }

  const cloudBacked = persistence.mode === 'cloud' || persistence.mode === 'hybrid';
  const accountCapable = identity.mode === 'google';
  const anyAuth = web.auth || mobile.auth;

  if (web.auth && !web.enabled) {
    problems.push({
      setting: 'web.auth + web.enabled',
      detail: `web.auth is true but web.enabled is false. There is no website to show Sign in on.`,
      fix: `Set web.enabled to true, or set web.auth to false.`,
    });
  }

  if (mobile.authWall !== 'none' && !mobile.auth) {
    problems.push({
      setting: 'mobile.authWall + mobile.auth',
      detail: `mobile.authWall is '${mobile.authWall}' but mobile.auth is false. A wall with no registration marker has nothing to gate on.`,
      fix: `Set mobile.auth to true, or set mobile.authWall to 'none'.`,
    });
  }

  if (anyAuth && !accountCapable) {
    problems.push({
      setting: 'auth + identity.mode',
      detail:
        `Registration is on (web.auth=${web.auth}, mobile.auth=${mobile.auth}) but identity.mode is '${identity.mode}'. ` +
        `Device never signs in; anonymous is cloud-without-registration.`,
      fix: `Set identity.mode to 'google', or turn auth off on both surfaces.`,
    });
  }

  if (cloudBacked && identity.mode === 'device') {
    problems.push({
      setting: 'persistence.mode + identity.mode',
      detail:
        `persistence.mode is '${persistence.mode}' but identity.mode is 'device'. ` +
        `The device tier never signs in, so there is no authenticated user to own saved rows.`,
      fix: `Either set identity.mode to 'anonymous' or 'google', or set persistence.mode to 'local'.`,
    });
  }

  if (features.transferCodes && persistence.mode === 'local') {
    problems.push({
      setting: 'features.transferCodes',
      detail: `transferCodes is enabled but persistence.mode is 'local'. There is no remote to move ownership within.`,
      fix: `Set persistence.mode to 'hybrid' or 'cloud', or disable features.transferCodes.`,
    });
  }

  if (features.transferCodes && identity.mode === 'device') {
    problems.push({
      setting: 'features.transferCodes',
      detail: `transferCodes is enabled but identity.mode is 'device', which has no cloud identity to transfer.`,
      fix: `Set identity.mode to 'anonymous' or 'google', or disable features.transferCodes.`,
    });
  }

  if (authSource === 'config+db' && persistence.mode === 'local') {
    problems.push({
      setting: 'authSource',
      detail: `authSource is 'config+db' but persistence.mode is 'local'. There is no database to overlay flags from.`,
      fix: `Set authSource to 'config', or enable a cloud/hybrid persistence mode.`,
    });
  }

  if (persistence.syncIntervalMs < 1_000) {
    problems.push({
      setting: 'persistence.syncIntervalMs',
      detail: `syncIntervalMs is ${persistence.syncIntervalMs}ms, which will hammer the backend and drain the battery.`,
      fix: 'Use at least 1000ms; 30000ms is a sensible default.',
    });
  }

  if (persistence.maxRetries < 1) {
    problems.push({
      setting: 'persistence.maxRetries',
      detail: 'maxRetries below 1 means a queued write is discarded on its first failure.',
      fix: 'Use at least 1; 5 is a sensible default.',
    });
  }

  if (persistence.conflictStrategy === 'highest-value' && !persistence.conflictValuePath) {
    problems.push({
      setting: 'persistence.conflictValuePath',
      detail: `conflictStrategy is 'highest-value' but conflictValuePath is empty.`,
      fix: `Set conflictValuePath to the dot path of the comparable field, e.g. 'bestScore'.`,
    });
  }

  return problems;
}
