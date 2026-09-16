/**
 * Static server for the exported web build, with cross-origin isolation.
 *
 *   npm run web
 *
 * expo-sqlite's web backend (wa-sqlite) needs SharedArrayBuffer, which browsers
 * only expose to cross-origin-isolated pages. That requires COOP/COEP response
 * headers. Expo's dev server does not let you set them — Metro's
 * `enhanceMiddleware` hook is bypassed by the Expo CLI, and the `headers`
 * option on the expo-router plugin applies to EAS Hosting only — so the web
 * build is exported and served from here instead.
 *
 * Trade-off: no hot reload. Re-run `npm run web` after changing code.
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] ?? 'dist-web');
const PORT = Number(process.env.PORT ?? 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

async function resolveFile(urlPath) {
  // Strip query/hash, then block traversal outside ROOT.
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const candidate = resolve(join(ROOT, normalize(clean)));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + '\\') && !candidate.startsWith(ROOT + '/')) {
    return null;
  }

  try {
    const info = await stat(candidate);
    if (info.isDirectory()) {
      const index = join(candidate, 'index.html');
      await stat(index);
      return index;
    }
    return candidate;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  // The two headers that make the page cross-origin isolated.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cache-Control', 'no-store');

  let file = await resolveFile(req.url ?? '/');

  // Expo Router is a SPA: unknown paths fall back to index.html so deep links
  // and client-side routes resolve.
  if (!file) file = await resolveFile('/index.html');

  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Not found. Did you run the export first? Looked in ${ROOT}`);
    return;
  }

  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`\n  PERAI web build serving at http://localhost:${PORT}`);
  console.log('  cross-origin isolated (COOP + COEP) so expo-sqlite can run\n');
});
