# Sistema Bot

Bot farm di 1000 identità su telefoni Android reali via USB tethering. Controllo remoto via Firebase.

## Architettura

```
agents/main.py          ← Entry point (Firebase listener)
  └─ src/system.py      ← Orchestrator (init, fleet management)
       ├─ src/orchestrator/brain.py      ← Decision loop per bot
       ├─ src/adapters/{youtube,tiktok,instagram}.py  ← Platform adapter
       ├─ src/driver/bot_driver.py       ← Browser context + stealth
       └─ src/bot/behaviors/{youtube,tiktok,instagram}_warmer.py  ← Warming
```

## Requisiti

- Python 3.10+
- Node.js 18+ (solo per dashboard Vercel)
- ADB (Android Debug Bridge): `brew install android-platform-tools`
- 1+ telefoni Android con debug USB e tethering attivato

## Installazione

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
```

## Configurazione

```bash
cp .env.example .env
# Modifica .env con le tue credenziali Firebase e Telegram
```

## Avvio rapido

```bash
# 1. Genera 1000 profili bot
python scripts/generate_profiles.py --count 1000 --db

# 2. Avvia l'agente (ascolta comandi Firebase)
python agents/main.py
```

## Comandi Firebase

| Comando | Effetto |
|---|---|
| `START_FLOTTA` | Avvia tutti i bot su una piattaforma |
| `STOP_FLOTTA` | Ferma tutta la flotta |
| `STATUS` | Restituisce statistiche flotta |

## Struttura directory

```
data/
  passports/       ← Identità bot (1 per cartella)
  profiles/        ← Cookies e storage per bot
  logs/            ← Log strutturati JSON
  screenshots/     ← Screenshot per debug
  cache/           ← Cache HTTP persistente per bot
scripts/
  generate_profiles.py  ← Generatore batch identità
  setup.py              ← Setup automatico
```

## Warmup fasi

| Fase | Durata | Like/giorno | Follow/giorno | Commenti/giorno |
|---|---|---|---|---|
| Incubazione | 14gg | 0 | 0 | 0 |
| Esplorazione | 14gg | 2 | 0 | 0 |
| Attivazione | 14gg | 3 | 1 | 0 |
| Consolidamento | 7gg | 5 | 2 | 1 |
| Maturità | 7gg | 10 | 3 | 2 |
| Stabile | ∞ | 15 | 5 | 5 |

## Anti-detection

- Canvas/WebGL/Audio noise deterministico per bot
- WebRTC leak prevention
- IP ancorato a interfaccia telefono (RNDIS)
- Rotazione IP via modalità aereo ADB
- VPN detection integrata
- Adaptive speed (rallenta su errori/captcha)
- Path dependence (nessuna sequenza ripetitiva)
- Crisis mode (3 ban → 24h pausa flotta)
- Risoluzione e font randomizzati per bot
- Eventi touch simulati + microdistrazioni

## Multi-carrier

Supporto nativo per più telefoni con operatori diversi. I bot vengono distribuiti
automaticamente sui device disponibili con rotazione carrier opzionale.
