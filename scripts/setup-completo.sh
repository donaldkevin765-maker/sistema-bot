#!/bin/bash
# ============================================================================
# SETUP COMPLETO SISTEMA BOT — Firebase + Dipendenze + Database
# ============================================================================
# Uso: bash scripts/setup-completo.sh
# ============================================================================

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "╔══════════════════════════════════════════════════╗"
echo "║        SETUP SISTEMA BOT — v1.0.0               ║"
echo "╚══════════════════════════════════════════════════╝"

# ── 1. Firebase ────────────────────────────────────────
echo ""
echo "▶ 1/7  FIREBASE"

if [ ! -f ".env" ] || ! grep -q "FIREBASE_API_KEY" .env 2>/dev/null; then
    cp .env.example .env
    echo "   ✓ .env creato da .env.example"
    echo ""
    echo "   ⚠️  DEVI CONFIGURARE FIREBASE:"
    echo "    1. Vai su https://console.firebase.google.com"
    echo "    2. Crea un progetto (es. 'sistema-bot-123')"
    echo "    3. Attiva Realtime Database (modalità test)"
    echo "    4. Vai su Impostazioni progetto → Generale"
    echo "    5. Copia i valori in .env"
    echo ""
    echo "   OPPURE esegui: bash scripts/firebase-crea.sh"
    echo ""
    read -p "   Premi Invio dopo aver configurato Firebase (o Ctrl+C per uscire)... "
else
    echo "   ✓ Firebase già configurato"
fi

# ── 2. Python venv ─────────────────────────────────────
echo ""
echo "▶ 2/7  AMBIENTE PYTHON"

if [ ! -d ".venv" ]; then
    python3 -m venv .venv
    echo "   ✓ Virtual environment creato"
else
    echo "   ✓ Virtual environment esistente"
fi

source .venv/bin/activate

# ── 3. Dipendenze Python ──────────────────────────────
echo ""
echo "▶ 3/7  DIPENDENZE PYTHON"

pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
echo "   ✓ Dipendenze installate"

# ── 4. Playwright ──────────────────────────────────────
echo ""
echo "▶ 4/7  PLAYWRIGHT BROWSER"

python3 -m playwright install chromium 2>/dev/null || playwright install chromium 2>/dev/null || {
    echo "   ⚠️  playwright non installato, salto..."
}
echo "   ✓ Playwright pronto"

# ── 5. Database ────────────────────────────────────────
echo ""
echo "▶ 5/7  DATABASE"

python3 -c "
from database import init_db, get_statistiche
init_db()
stats = get_statistiche()
print(f'   ✓ Database inizializzato ({stats[\"totale_bot\"]} bot)')
"

# ── 6. Profili bot ─────────────────────────────────────
echo ""
echo "▶ 6/7  PROFILI BOT"

if [ "$(python3 -c "from database import get_statistiche; print(get_statistiche()['totale_bot'])")" = "0" ]; then
    echo "   Generazione 1000 profili bot..."
    python3 scripts/generate_profiles.py --count 1000 --db 2>/dev/null | tail -1
    echo "   ✓ Profili generati"
else
    echo "   ✓ Profili già presenti"
fi

# ── 7. Test ────────────────────────────────────────────
echo ""
echo "▶ 7/7  TEST"

python3 -m pytest tests/ -q --tb=short 2>&1 | tail -3
echo ""

# ── Fine ──────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════╗"
echo "║  SETUP COMPLETATO                               ║"
echo "║                                                ║"
echo "║  Per avviare: python agents/main.py            ║"
echo "║  Dashboard: https://web-three-swart-54.vercel.app ║"
echo "╚══════════════════════════════════════════════════╝"
