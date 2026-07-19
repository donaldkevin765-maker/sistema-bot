// Gateway: unifica tutti i 6 giochi G1-G6 sotto un'unica porta
// Proxy HTTP + WebSocket verso i server interni (3001-3006)

const httpProxy = require('http-proxy');
const http = require('http');
const path = require('path');

const GAMES = {
  g1: { port: 3001, name: 'G1 - PONG' },
  g2: { port: 3002, name: 'G2 - SNAKE' },
  g3: { port: 3003, name: 'G3 - TETRIS' },
  g4: { port: 3004, name: 'G4 - VOID RACERS' },
  g5: { port: 3005, name: 'G5 - ARENA' },
  g6: { port: 3006, name: 'G6 - RING OF FIRE' },
};

const GATEWAY_PORT = process.env.PORT || 8081;

const proxy = httpProxy.createProxyServer({
  ws: true,
});

// Errori proxy silenziosi (non far crashare il gateway)
proxy.on('error', (err, req, res) => {
  if (res && !res.headersSent && res.writeHead) {
    try {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Gateway error');
    } catch (_) {}
  }
});

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  const match = url.match(/^\/(g[1-6])(\/|$)/);

  if (match) {
    const game = match[1];
    const config = GAMES[game];
    if (config) {
      req.url = url.replace(`/${game}`, '') || '/';
      proxy.web(req, res, {
        target: `http://127.0.0.1:${config.port}`,
        proxyTimeout: 10000,
      });
      return;
    }
  }

  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderHomepage());
    return;
  }

  res.writeHead(302, { Location: '/' });
  res.end();
});

// Proxy WebSocket
server.on('upgrade', (req, socket, head) => {
  const match = (req.url || '').match(/^\/(g[1-6])(\/|$)/);
  if (match) {
    const config = GAMES[match[1]];
    if (config) {
      req.url = (req.url || '').replace(`/${match[1]}`, '') || '/';
      proxy.ws(req, socket, head, {
        target: `http://127.0.0.1:${config.port}`,
      });
      return;
    }
  }
  socket.destroy();
});

process.on('uncaughtException', (err) => {
  console.error('[gateway] uncaught:', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('[gateway] unhandled:', err.message);
});

server.listen(GATEWAY_PORT, () => {
  console.log(`\n  🎮 Gateway giochi attivo su http://localhost:${GATEWAY_PORT}\n`);
  for (const [id, g] of Object.entries(GAMES)) {
    console.log(`  http://localhost:${GATEWAY_PORT}/${id}  →  ${g.name} (porta ${g.port})`);
  }
  console.log(`\n  cloudflared tunnel --url http://localhost:${GATEWAY_PORT}\n`);
});

function renderHomepage() {
  let cards = '';
  for (const [id, g] of Object.entries(GAMES)) {
    cards += `<a href="/${id}/" class="card" style="--ac: ${id === 'g1' ? '#4488ff' : id === 'g2' ? '#44ff88' : id === 'g3' ? '#ff66cc' : id === 'g4' ? '#00ccff' : id === 'g5' ? '#ffaa00' : '#ff4400'}"><span class="num">${id.toUpperCase()}</span><span class="title">${g.name}</span></a>`;
  }
  return `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Giochi</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#050510;color:#e0e0ff;font-family:'Segoe UI',system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px}
h1{font-size:28px;margin-bottom:4px;background:linear-gradient(90deg,#4488ff,#44ff88,#ff66cc,#00ccff,#ffaa00,#ff4400);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
p.sub{color:#888;font-size:13px;margin-bottom:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;width:100%;max-width:700px}
.card{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;border-radius:10px;text-decoration:none;background:#0e0e1e;border:1px solid #1a1a3a;transition:.2s}
.card:hover{transform:translateY(-3px);border-color:var(--ac);box-shadow:0 0 20px rgba(255,255,255,.05)}
.num{font-size:24px;font-weight:900;color:var(--ac);letter-spacing:2px}
.title{color:#ccc;font-size:14px;margin-top:4px}
</style></head><body>
<h1>🎮 Giochi</h1><p class="sub">Seleziona un gioco</p>
<div class="grid">${cards}</div>
</body></html>`;
}
