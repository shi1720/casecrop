import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

// Serve the exact static export locally, including clean URLs and RSC assets.
const root = resolve('dist/client');
const portIndex = process.argv.indexOf('--port');
const port = Number(
  portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 3000,
);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.rsc': 'text/x-component',
};
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method || '')) {
    res.writeHead(405);
    res.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(
      new URL(req.url || '/', 'http://localhost').pathname,
    );
    const target = resolve(root, '.' + pathname);
    if (target !== root && !target.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    for (const candidate of [
      target,
      target + '.html',
      resolve(target, 'index.html'),
    ]) {
      if (candidate !== root && !candidate.startsWith(root + sep)) continue;
      try {
        if (!(await stat(candidate)).isFile()) continue;
        const body = await readFile(candidate);
        res.writeHead(200, {
          'Content-Type':
            types[extname(candidate)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(req.method === 'HEAD' ? undefined : body);
        return;
      } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      }
    }
    res.writeHead(404);
    res.end('Not found');
  } catch {
    res.writeHead(400);
    res.end('Invalid request');
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Static export: http://localhost:${port}`),
);
