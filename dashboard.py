#!/usr/bin/env python3
"""Dashboard web locale — apri http://localhost:8501
Zero dipendenze esterne: usa solo la libreria standard Python."""

import http.server
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from database import init_db, lista_bot, get_statistiche, get_attivita, get_errori

init_db()

HTML = """<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sistema Bot Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:20px}
h1{font-size:1.5rem;margin-bottom:8px;color:#38bdf8}
nav{display:flex;gap:8px;margin:16px 0;flex-wrap:wrap}
nav button{padding:8px 20px;border:1px solid #334155;border-radius:8px;background:#1e293b;color:#e2e8f0;cursor:pointer;font-size:.9rem}
nav button:hover{background:#334155}
nav button.active{background:#38bdf8;color:#0f172a;border-color:#38bdf8}
.panel{display:none}
.panel.active{display:block}
.card{background:#1e293b;border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid #334155}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.stat{text-align:center;padding:12px}
.stat .val{font-size:2rem;font-weight:700;color:#38bdf8}
.stat .lab{font-size:.8rem;color:#94a3b8;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #334155}
th{color:#94a3b8;font-weight:600}
tr:hover{background:#334155}
.filtri{display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.filtri select{padding:6px 12px;border-radius:6px;background:#1e293b;color:#e2e8f0;border:1px solid #334155}
.status{display:inline-block;padding:2px 10px;border-radius:99px;font-size:.75rem}
.status.ATTIVO{background:#22c55e20;color:#22c55e;border:1px solid #22c55e}
.status.WARMING{background:#f59e0b20;color:#f59e0b;border:1px solid #f59e0b}
.status.PAUSED{background:#64748b20;color:#94a3b8;border:1px solid #94a3b8}
.status.SPENTO{background:#ef444420;color:#ef4444;border:1px solid #ef4444}
</style>
</head>
<body>
<h1>Sistema Bot Dashboard</h1>
<nav>
<button class="active" onclick="show('stats')">Statistiche</button>
<button onclick="show('bots')">Bot</button>
<button onclick="show('log')">Attivit\u00e0</button>
<button onclick="show('errors')">Errori</button>
</nav>
<div id="stats" class="panel active"><div class="grid" id="stat-grid"></div></div>
<div id="bots" class="panel">
<div class="filtri">
<select id="filtro-stato" onchange="caricaBot()">
<option value="">Tutti stati</option>
<option value="WARMING">Warming</option>
<option value="ATTIVO">Attivo</option>
<option value="PAUSED">Pausa</option>
<option value="SPENTO">Spento</option>
</select>
<select id="filtro-piattaforma" onchange="caricaBot()">
<option value="">Tutte piattaforme</option>
<option value="youtube">YouTube</option>
<option value="instagram">Instagram</option>
<option value="tiktok">TikTok</option>
<option value="facebook">Facebook</option>
<option value="x">X</option>
</select>
</div>
<div class="card" style="overflow-x:auto"><table><thead><tr>
<th>ID</th><th>Username</th><th>Piattaforma</th><th>Stato</th><th>IP</th><th>Heartbeat</th><th>Errori</th>
</tr></thead><tbody id="bot-table"></tbody></table></div>
</div>
<div id="log" class="panel">
<div class="filtri"><input type="number" id="bot-id" value="1" min="1" style="padding:6px 12px;border-radius:6px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;width:100px">
<button onclick="caricaLog()" style="padding:6px 16px;border-radius:6px;background:#38bdf8;color:#0f172a;border:none;cursor:pointer">Vedi</button></div>
<div class="card" style="overflow-x:auto"><table><thead><tr>
<th>ID</th><th>Tipo</th><th>Descrizione</th><th>Esito</th><th>Durata</th><th>Timestamp</th>
</tr></thead><tbody id="log-table"></tbody></table></div>
</div>
<div id="errors" class="panel"><div class="card" style="overflow-x:auto"><table><thead><tr>
<th>ID</th><th>Bot</th><th>Piattaforma</th><th>Errore</th><th>Timestamp</th>
</tr></thead><tbody id="err-table"></tbody></table></div></div>
<script>
function show(i){document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));document.getElementById(i).classList.add('active');document.querySelectorAll('nav button').forEach(b=>b.classList.remove('active'));event.target.classList.add('active')}
async function g(u){let r=await fetch(u);return r.json()}
async function caricaStats(){let d=await g('/api/stats');let h='<div class="stat card"><div class="val">'+d.totale_bot+'</div><div class="lab">Totale Bot</div></div><div class="stat card"><div class="val">'+d.attivita_oggi+'</div><div class="lab">Attivit\u00e0 Oggi</div></div>';for(let[k,v]of Object.entries(d.per_piattaforma))h+='<div class="stat card"><div class="val">'+v+'</div><div class="lab">'+k+'</div></div>';document.getElementById('stat-grid').innerHTML=h}
async function caricaBot(){let s=document.getElementById('filtro-stato').value,p=document.getElementById('filtro-piattaforma').value;let d=await g('/api/bots?stato='+s+'&piattaforma='+p);document.getElementById('bot-table').innerHTML=d.map(b=>'<tr><td>'+b.bot_id+'</td><td>'+b.username+'</td><td>'+(b.piattaforma||'-')+'</td><td><span class="status '+b.stato+'">'+b.stato+'</span></td><td>'+(b.ip_address||'-')+'</td><td>'+(b.ultimo_heartbeat||'-')+'</td><td>'+b.error_count+'</td></tr>').join('')}
async function caricaLog(){let d=await g('/api/attivita/'+document.getElementById('bot-id').value);document.getElementById('log-table').innerHTML=d.map(a=>'<tr><td>'+a.azione_id+'</td><td>'+a.tipo_azione+'</td><td>'+(a.descrizione||'-')+'</td><td>'+(a.success?'OK':'ERR')+'</td><td>'+(a.durata_ms?a.durata_ms+'ms':'-')+'</td><td>'+a.timestamp+'</td></tr>').join('')}
async function caricaErrori(){let d=await g('/api/errori');document.getElementById('err-table').innerHTML=d.map(e=>'<tr><td>'+e.azione_id+'</td><td>'+(e.username||'-')+'</td><td>'+(e.piattaforma||'-')+'</td><td>'+(e.error_message||'-')+'</td><td>'+e.timestamp+'</td></tr>').join('')}
caricaStats();caricaBot();caricaLog();caricaErrori();setInterval(()=>{caricaStats();caricaBot();caricaErrori()},5000)
</script>
</body>
</html>"""


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _json(self, data, status=200):
        body = json.dumps(data, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _html(self, content, status=200):
        body = content.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/")
        params = urllib.parse.parse_qs(parsed.query)

        if path == "" or path == "/":
            return self._html(HTML)

        if path == "/api/stats":
            return self._json(get_statistiche())

        if path == "/api/bots":
            stato = params.get("stato", [None])[0] or None
            piattaforma = params.get("piattaforma", [None])[0] or None
            return self._json(lista_bot(stato=stato, piattaforma=piattaforma))

        if path.startswith("/api/attivita/"):
            try:
                bot_id = int(path.split("/")[-1])
                return self._json(get_attivita(bot_id))
            except (ValueError, IndexError):
                return self._json({"error": "invalid bot_id"}, 400)

        if path == "/api/errori":
            return self._json(get_errori())

        return self._json({"error": "not found"}, 404)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8501
    server = http.server.HTTPServer(("0.0.0.0", port), Handler)
    print(f"Dashboard su http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
