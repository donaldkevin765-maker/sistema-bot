#!/usr/bin/env python3
"""Dashboard web locale — apri http://localhost:8501"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import uvicorn
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from database import init_db, lista_bot, get_statistiche, get_attivita, get_errori

init_db()
app = FastAPI(title="Sistema Bot Dashboard")

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
<button onclick="show('log')">Attività</button>
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
<th>ID</th><th>Tipo</th><th>Descrizione</th><th>Successo</th><th>Durata</th><th>Timestamp</th>
</tr></thead><tbody id="log-table"></tbody></table></div>
</div>
<div id="errors" class="panel"><div class="card" style="overflow-x:auto"><table><thead><tr>
<th>ID</th><th>Bot</th><th>Piattaforma</th><th>Errore</th><th>Timestamp</th>
</tr></thead><tbody id="err-table"></tbody></table></div></div>

<script>
function show(id){document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));document.getElementById(id).classList.add('active');document.querySelectorAll('nav button').forEach(b=>b.classList.remove('active'));event.target.classList.add('active')}
async function caricaStats(){const r=await fetch('/api/stats');const d=await r.json();document.getElementById('stat-grid').innerHTML=
'<div class="stat card"><div class="val">'+d.totale_bot+'</div><div class="lab">Totale Bot</div></div>'+
'<div class="stat card"><div class="val">'+d.attivita_oggi+'</div><div class="lab">Attività Oggi</div></div>'+
'<div class="stat card"><div class="val">'+Object.values(d.per_stato).reduce((a,b)=>a+b,0)+'</div><div class="lab">Bot con stato</div></div>'+
Object.entries(d.per_piattaforma).map(([k,v])=>'<div class="stat card"><div class="val">'+v+'</div><div class="lab">'+k+'</div></div>').join('')}
async function caricaBot(){const r=await fetch('/api/bots?stato='+document.getElementById('filtro-stato').value+'&piattaforma='+document.getElementById('filtro-piattaforma').value);const d=await r.json();document.getElementById('bot-table').innerHTML=d.map(b=>'<tr><td>'+b.bot_id+'</td><td>'+b.username+'</td><td>'+(b.piattaforma||'-')+'</td><td><span class="status '+b.stato+'">'+b.stato+'</span></td><td>'+(b.ip_address||'-')+'</td><td>'+(b.ultimo_heartbeat||'-')+'</td><td>'+b.error_count+'</td></tr>').join('')}
async function caricaLog(){const r=await fetch('/api/attivita/'+document.getElementById('bot-id').value);const d=await r.json();document.getElementById('log-table').innerHTML=d.map(a=>'<tr><td>'+a.azione_id+'</td><td>'+a.tipo_azione+'</td><td>'+(a.descrizione||'-')+'</td><td>'+(a.success?'✅':'❌')+'</td><td>'+(a.durata_ms?a.durata_ms+'ms':'-')+'</td><td>'+a.timestamp+'</td></tr>').join('')}
async function caricaErrori(){const r=await fetch('/api/errori');const d=await r.json();document.getElementById('err-table').innerHTML=d.map(e=>'<tr><td>'+e.azione_id+'</td><td>'+(e.username||'-')+'</td><td>'+(e.piattaforma||'-')+'</td><td>'+(e.error_message||'-')+'</td><td>'+e.timestamp+'</td></tr>').join('')}
caricaStats();caricaBot();caricaLog();caricaErrori();
setInterval(()=>{caricaStats();caricaBot();caricaErrori()},5000)
</script>
</body>
</html>"""


@app.get("/")
def index():
    return HTMLResponse(HTML)


@app.get("/api/stats")
def api_stats():
    return get_statistiche()


@app.get("/api/bots")
def api_bots(stato: str = "", piattaforma: str = ""):
    return lista_bot(stato=stato if stato else None, piattaforma=piattaforma if piattaforma else None)


@app.get("/api/attivita/{bot_id}")
def api_attivita(bot_id: int):
    return get_attivita(bot_id)


@app.get("/api/errori")
def api_errori():
    return get_errori()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8501
    uvicorn.run(app, host="0.0.0.0", port=port)
