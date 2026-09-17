import release from './release.json';

/**
 * "1.2.0 · BUILD 6", shown at the bottom of the Record tab.
 *
 *  - The version changes only with a new app build or an update that adds a
 *    feature.
 *  - The build number goes up with every release of any kind, including
 *    small OTA fixes, and never goes back down.
 *
 * Both live in src/release.json rather than app.json: `version` in app.json is
 * part of the runtime fingerprint, so a feature update that bumped it there
 * would never reach installed phones. release.json ships inside the JS bundle
 * and is not fingerprinted (verified with `fingerprint:generate`).
 */
export function appVersion(): string {
  return `${release.version} · BUILD ${release.build}`;
}
