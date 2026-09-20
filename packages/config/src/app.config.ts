/**
 * ★ THE SWITCH ★
 *
 * Shared by the Next.js site and the Expo app. Flip values here — not in a
 * screen, not only in the database.
 *
 * Registration is a marker on each surface:
 *   web.auth     — the website shows Sign in
 *   mobile.auth  — the app shows Sign in
 * They are independent. A marketing site with Install and a logged-in phone
 * is a valid clone. A bank (both true) is also a valid clone.
 *
 * authSource is 'config' today. 'config+db' is reserved: a later overlay may
 * read a row and override these flags at runtime. The files in this package
 * still win when the database is down or disabled.
 *
 * Version lives in release.json (one file for Expo native, Settings, footer).
 */

import release from './release.json';

export type PersistenceMode = 'local' | 'cloud' | 'hybrid';

export type IdentityMode = 'device' | 'anonymous' | 'google';

export type ConflictStrategyName =
  | 'last-write-wins'
  | 'highest-value'
  | 'prefer-local'
  | 'prefer-remote';

export type AuthWall = 'none' | 'optional' | 'required';

export type AuthSource = 'config' | 'config+db';

export interface AppConfig {
  product: {
    name: string;
    tagline: string;
    description: string;
    /**
     * User-facing semver. Bump in release.json — Expo, Settings, and the
     * website footer all read this.
     */
    version: string;
    /**
     * Store build: iOS CFBundleVersion / Android versionCode.
     * Integer, starts at 1, must go up on every store upload.
     */
    build: number;
    /** Store / TestFlight / Play URL for the website Install button. */
    installUrl: string;
  };
  web: {
    /** This clone ships a real website (Next.js). Case A leaves this false. */
    enabled: boolean;
    /** Registration / login on the website. Independent of mobile.auth. */
    auth: boolean;
  };
  mobile: {
    /** Registration / login in the app. Independent of web.auth. */
    auth: boolean;
    /**
     * How hard the app gates home. Ignored when mobile.auth is false.
     * none | optional | required
     */
    authWall: AuthWall;
  };
  /**
   * Where the auth markers are read from.
   * config      — this file (and env) only
   * config+db   — this file, then an overlay row if the database is up
   */
  authSource: AuthSource;
  persistence: {
    mode: PersistenceMode;
    conflictStrategy: ConflictStrategyName;
    conflictValuePath: string;
    syncIntervalMs: number;
    maxRetries: number;
  };
  identity: {
    mode: IdentityMode;
  };
  features: {
    transferCodes: boolean;
    diagnostics: boolean;
  };
}

export const appConfig: AppConfig = {
  product: {
    name: 'Mobile World',
    tagline: 'The same product on the phone and, when you need it, on the web.',
    description:
      'Clone this repo. Turn on the website, the database, and registration per surface when the product actually needs them.',
    version: release.version,
    build: release.build,
    installUrl: '',
  },
  web: {
    enabled: false,
    auth: false,
  },
  mobile: {
    auth: false,
    authWall: 'none',
  },
  authSource: 'config',
  persistence: {
    mode: 'local',
    conflictStrategy: 'last-write-wins',
    conflictValuePath: 'bestScore',
    syncIntervalMs: 30_000,
    maxRetries: 5,
  },
  identity: {
    mode: 'device',
  },
  features: {
    transferCodes: false,
    diagnostics: true,
  },
};

export function usesBackend(config: AppConfig = appConfig): boolean {
  return (
    config.persistence.mode !== 'local' ||
    config.identity.mode !== 'device' ||
    config.web.auth ||
    config.mobile.auth
  );
}

export function webShowsAuth(config: AppConfig = appConfig): boolean {
  return config.web.enabled && config.web.auth;
}

export function mobileShowsAuth(config: AppConfig = appConfig): boolean {
  return config.mobile.auth;
}

/** Settings, footer, diagnostics — same string everywhere. */
export function formatProductRelease(config: AppConfig = appConfig): string {
  return `${config.product.version} (${config.product.build})`;
}
