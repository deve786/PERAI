/**
 * Ship a release, numbering it as part of the release.
 *
 *   npm run update -- "fixed x"                 1.2.0 (6)  ->  1.2.1 (7)   OTA fix
 *   npm run update -- --feature "added y"       1.2.1 (7)  ->  1.3.0 (8)   OTA feature
 *   npm run build:android -- "what changed"     1.3.0 (8)  ->  1.4.0 (9)   new APK
 *
 * The build number goes up on every release and never resets. The version now
 * goes up on every release too, not just a feature or a new build: the last
 * number for a plain fix, the middle number (resetting the last back to 0)
 * for a feature or a new build.
 *
 * Numbers live in src/release.json, which is not part of the runtime
 * fingerprint, so an OTA update can raise the version and still reach
 * installed phones. A new build also writes the version into app.json, where
 * Android shows it under App info (that changes the fingerprint, which is fine
 * for a build — it is a new runtime anyway).
 *
 * If the EAS command fails, every number is rolled back.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const APP = 'app.json';
const RELEASE = 'src/release.json';

const [kind, ...rest] = process.argv.slice(2);
const feature = rest.includes('--feature');
const note = rest
  .filter((word) => word !== '--feature' && word !== '--message' && word !== '--')
  .join(' ')
  .trim();

const original = { app: readFileSync(APP, 'utf8'), release: readFileSync(RELEASE, 'utf8') };
const app = JSON.parse(original.app);
const release = JSON.parse(original.release);

const parse = (v) => String(v).split('.').map((n) => Number(n) || 0);
const newer = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? a : b;
  return a;
};
const nextMinor = (v) => {
  const [major, minor] = parse(v);
  return `${major}.${minor + 1}.0`;
};
const nextPatch = (v) => {
  const [major, minor, patch] = parse(v);
  return `${major}.${minor}.${patch + 1}`;
};

let args;

if (kind === 'build') {
  // Continue from whichever is ahead: a feature update may have raised
  // release.json past the last build's app.json.
  release.version = nextMinor(newer(release.version, app.expo.version));
  release.build += 1;
  app.expo.version = release.version;
  args = ['eas-cli', 'build', '--platform', 'android', '--profile', 'preview'];
} else if (kind === 'update') {
  release.version = feature ? nextMinor(release.version) : nextPatch(release.version);
  release.build += 1;
  args = ['eas-cli', 'update', '--channel', 'preview', '--environment', 'preview', '--platform', 'android'];
} else {
  console.error('Usage: node scripts/release.mjs build|update [--feature] ["what changed"]');
  process.exit(1);
}

const CHANGELOG = 'src/expense/changelog.ts';
const originalChangelog = readFileSync(CHANGELOG, 'utf8');

const label = `${release.version} (build ${release.build})`;
args.push('--message', `${label}${note ? `: ${note}` : ''}`, '--non-interactive');
if (kind === 'build') args.push('--no-wait');

// Update changelog with the new version, build number, date, and time
const now = new Date();
const dateStr = now.toISOString().split('T')[0];
const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
const entryNote = note || (kind === 'build' ? 'New APK build release' : 'OTA update with enhancements and bug fixes');
const changelogMarker = 'export const CHANGELOG: ChangelogEntry[] = [\n';
const newChangelogEntry = `  {\n    version: '${release.version}',\n    build: ${release.build},\n    type: '${kind === 'build' ? 'build' : 'ota'}',\n    date: '${dateStr}',\n    time: '${timeStr}',\n    highlights: [\n      '${entryNote.replace(/'/g, "\\'")}',\n    ],\n  },\n`;

if (originalChangelog.includes(changelogMarker)) {
  const updatedChangelog = originalChangelog.replace(changelogMarker, changelogMarker + newChangelogEntry);
  writeFileSync(CHANGELOG, updatedChangelog);
}

writeFileSync(APP, JSON.stringify(app, null, 2) + '\n');
writeFileSync(RELEASE, JSON.stringify(release, null, 2) + '\n');
console.log(`\nReleasing ${label} — ${kind}${feature ? ' (feature)' : ''}\n`);

// One quoted command string: Windows' shell would otherwise split a message
// with spaces into separate arguments.
const quote = (a) => (/[\s"()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
const result = spawnSync(['npx', ...args].map(quote).join(' '), { stdio: 'inherit', shell: true });

if (result.status !== 0) {
  writeFileSync(APP, original.app);
  writeFileSync(RELEASE, original.release);
  writeFileSync(CHANGELOG, originalChangelog);
  const was = JSON.parse(original.release);
  console.error(`\n${kind} failed — rolled back to ${was.version} (build ${was.build})`);
  process.exit(result.status ?? 1);
}

console.log(`\nShipped ${label}`);

try {
  spawnSync('git', ['add', APP, RELEASE, CHANGELOG], { stdio: 'inherit' });
  const commitRes = spawnSync('git', ['commit', '-m', `chore(release): ${label}`], { stdio: 'inherit' });
  if (commitRes.status === 0) {
    spawnSync('git', ['push', 'origin', 'master'], { stdio: 'inherit' });
    console.log(`\nPushed release ${label} to origin/master ✓`);
  }
} catch (e) {
  console.warn('Auto-git commit/push error:', e);
}
