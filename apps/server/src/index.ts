import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg } from '@bim/sim';
import { Lobby, type Conn } from './rooms';

/**
 * Bim: Grow the Island game server.
 * Serves the built game page and runs online rooms over a WebSocket at /ws. One process, one port, so a single
 * free web service (Render, Fly.io…) can host everything.
 */
const PORT = Number(process.env.PORT ?? 8787);
const here = dirname(fileURLToPath(import.meta.url));
const STATIC = resolve(process.env.STATIC_DIR ?? join(here, '../../client/dist'));
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

const lobby = new Lobby();

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: lobby.rooms.size }));
    return;
  }
  // static files from the client build; anything unknown falls back to the game page
  let p = normalize(join(STATIC, decodeURIComponent(url.pathname)));
  if (!p.startsWith(STATIC)) { res.writeHead(403); res.end(); return; }
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(STATIC, 'index.html');
  if (!existsSync(p)) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Game files not built. Run npm run build.'); return; }
  const ext = extname(p);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    // hashed assets can be cached for good; the page itself must always be fresh
    'cache-control': p.includes(`${join('dist', 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(p).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
wss.on('connection', (ws: WebSocket) => {
  let alive = true;
  const conn: Conn = {
    send: (m) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); },
    close: () => { try { ws.close(); } catch { /* already closed */ } },
  };
  ws.on('pong', () => (alive = true));
  ws.on('message', (data) => {
    let m: ClientMsg;
    try { m = JSON.parse(String(data)); } catch { return; }
    try { lobby.handle(conn, m); } catch (e) { console.error('message failed', e); }
  });
  ws.on('close', () => lobby.drop(conn));
  // drop sockets that stop answering pings (phone went to sleep, network changed)
  const ping = setInterval(() => { if (!alive) { ws.terminate(); clearInterval(ping); return; } alive = false; ws.ping(); }, 20_000);
  ws.on('close', () => clearInterval(ping));
});

setInterval(() => lobby.update(Date.now()), 20);

server.listen(PORT, () => console.log(`Bim: Grow the Island server on :${PORT} (game files from ${STATIC})`));
