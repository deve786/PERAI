/**
 * What counts toward the runtime fingerprint that OTA updates are matched on.
 *
 * npm scripts are skipped: they never change the native app, but by default
 * editing one (e.g. the release scripts) changes the fingerprint and silently
 * stops OTA updates from reaching phones already installed. Verified with
 * `npx expo-updates fingerprint:generate` before and after a script edit.
 */
const { SourceSkips } = require('expo/fingerprint');

/** @type {import('expo/fingerprint').Config} */
module.exports = {
  sourceSkips: SourceSkips.PackageJsonScriptsAll,
};
