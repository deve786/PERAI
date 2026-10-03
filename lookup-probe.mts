import { readFileSync } from 'node:fs';
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { lookUpTitle } = await import('file:///I:/PERAI/src/ai/spelling.ts');
for (const [heard, type] of [['ghost of yachty', 'play'], ['hollow knight', 'play']] as const) {
  try {
    const r = await lookUpTitle(heard, type);
    console.log(`"${heard}" via ${r?.source} (${r?.model}, ${r?.seconds}s) replied "${r?.replied}" -> ${r?.accepted ? `accepted "${r.accepted}"` : 'kept yours'}`);
  } catch (err) {
    console.log(`"${heard}" FAILED: ${err instanceof Error ? err.message.slice(0, 60) : err}`);
  }
}
