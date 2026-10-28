import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const HOST = '127.0.0.1';
export const PORT = 4173;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
export function createAdminServer(api = process.env.ONMAP_ADMIN_API_URL ?? '') {
  if (api) {
    const u = new URL(api);
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      throw new Error(
        'ONMAP_ADMIN_API_URL must be a credential-free HTTPS URL',
      );
  }
  return createServer(async (req, res) => {
    if (req.headers.host !== `${HOST}:${PORT}`) {
      res.writeHead(403).end();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; connect-src 'self' https:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; worker-src blob:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }
    const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
    if (url.pathname === '/config.json') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ apiUrl: api }));
      return;
    }
    let requested;
    try {
      requested = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const target = path.resolve(
      root,
      requested === '/' ? 'index.html' : requested.slice(1),
    );
    if (!target.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if (!(await stat(target)).isFile()) throw new Error('not_file');
      const mime =
        {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.woff2': 'font/woff2',
          '.svg': 'image/svg+xml',
        }[path.extname(target)] ?? 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      res.end(await readFile(target));
    } catch {
      res.writeHead(404).end();
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  createAdminServer().listen(PORT, HOST, () =>
    console.log(
      `OnMap: http://${HOST}:${PORT}. API configuration contains no credentials.`,
    ),
  );
