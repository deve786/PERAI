import Constants from 'expo-constants';
import release from './release.json';

/**
 * The version shown in the app: MAJOR.MINOR.UPDATE
 *
 *  - MAJOR.MINOR come from `version` in app.json and change only with a new
 *    build (`npm run build:android` bumps MINOR).
 *  - UPDATE counts OTA updates published on top of that build
 *    (`npm run update` bumps it), and resets to 0 on the next build.
 *
 * Why two sources: `version` is part of the runtime fingerprint, so bumping it
 * for an OTA update would stop that update from reaching installed phones. The
 * counter lives in src/release.json, which ships in the JS bundle and does not
 * affect the fingerprint. Both were verified against `fingerprint:generate`.
 */
export function appVersion(): string {
  const native = Constants.expoConfig?.version ?? '1.0.0';
  const [major = '1', minor = '0'] = native.split('.');
  return `${major}.${minor}.${release.update}`;
}
