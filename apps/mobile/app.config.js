require('../../scripts/load-root-env.cjs');

const release = require('../../packages/config/src/release.json');

/**
 * Loads root `.env`, then stamps native version from release.json
 * (same numbers Settings and the website footer show).
 */
module.exports = ({ config }) => ({
  ...config,
  version: release.version,
  ios: { ...config.ios, buildNumber: String(release.build) },
  android: { ...config.android, versionCode: release.build },
});
