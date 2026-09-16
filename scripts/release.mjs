/**
 * Ship a new build or an OTA update, bumping the version as part of it.
 *
 *   npm run build:android              -> 1.2.x  becomes 1.3.0, then EAS build
 *   npm run update -- "what changed"   -> 1.3.0  becomes 1.3.1, then EAS update
 *
 * If the EAS command fails, the version bump is rolled back so the number in
 * the repo always matches what actually shipped.
 *
 * MAJOR.MINOR live in app.json `version` (part of the runtime fingerprint, so
 * they only change with a build). The update counter lives in src/release.json
 * (not part of the fingerprint, so OTA updates still reach installed builds).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const APP = 'app.json';
const RELEASE = 'src/release.json';

const [kind, ...rest] = process.argv.slice(2);
const words = rest[0] === '--message' ? rest.slice(1) : rest;
const note = words.join(' ').trim();

const original = { app: readFileSync(APP, 'utf8'), release: readFileSync(RELEASE, 'utf8') };
const app = JSON.parse(original.app);
const release = JSON.parse(original.release);
const [major, minor] = String(app.expo.version).split('.').map(Number);

let version;
let args;

if (kind === 'build') {
  version = `${major}.${minor + 1}.0`;
  app.expo.version = version;
  release.update = 0;
  args = ['eas-cli', 'build', '--platform', 'android', '--profile', 'preview',
    '--message', `v${version}${note ? `: ${note}` : ''}`, '--non-interactive', '--no-wait'];
} else if (kind === 'update') {
  release.update += 1;
  version = `${major}.${minor}.${release.update}`;
  args = ['eas-cli', 'update', '--channel', 'preview', '--environment', 'preview',
    '--platform', 'android', '--message', `v${version}: ${note || 'Update'}`, '--non-interactive'];
} else {
  console.error('Usage: node scripts/release.mjs build|update ["what changed"]');
  process.exit(1);
}

writeFileSync(APP, JSON.stringify(app, null, 2) + '\n');
writeFileSync(RELEASE, JSON.stringify(release, null, 2) + '\n');
console.log(`\nReleasing v${version} (${kind})\n`);

// One quoted command string: Windows' shell would otherwise split a message
// with spaces into separate arguments.
const quote = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
const result = spawnSync(['npx', ...args].map(quote).join(' '), {
  stdio: 'inherit',
  shell: true,
});

if (result.status !== 0) {
  writeFileSync(APP, original.app);
  writeFileSync(RELEASE, original.release);
  console.error(`\n${kind} failed — version rolled back to ${major}.${minor}.${JSON.parse(original.release).update}`);
  process.exit(result.status ?? 1);
}

console.log(`\nShipped v${version}`);
