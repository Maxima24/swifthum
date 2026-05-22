import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = fileURLToPath(new URL('.', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.wasm': 'application/wasm',
};

const send = (res, code, body, headers = {}) => {
  res.writeHead(code, {
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    ...headers,
  });
  res.end(body);
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';

    const safe = normalize(path).replace(/^([/\\]+)/, '');
    const file = join(ROOT, safe);
    if (!file.startsWith(ROOT)) return send(res, 403, 'forbidden');

    const s = await stat(file).catch(() => null);
    if (!s || !s.isFile()) return send(res, 404, 'not found');

    const body = await readFile(file);
    const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
    send(res, 200, body, { 'content-type': type });
  } catch (e) {
    send(res, 500, `server error: ${e.message}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`spike server: http://localhost:${PORT}/`);
  console.log(`tunnel:       cloudflared tunnel --url http://localhost:${PORT}`);
});
