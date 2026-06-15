#!/bin/bash
# ============================================================================
# CREA PROGETTO FIREBASE E CONFIGURA AUTOMATICAMENTE
# ============================================================================
# Uso: bash scripts/firebase-crea.sh
# Richiede: firebase-tools (npm install -g firebase-tools) + login
# ============================================================================

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "╔══════════════════════════════════════════════════╗"
echo "║        CREAZIONE PROGETTO FIREBASE              ║"
echo "╚══════════════════════════════════════════════════╝"

# Controlla firebase-tools
if ! command -v firebase &>/dev/null && ! [ -f "node_modules/.bin/firebase" ]; then
    echo "❌ firebase-tools non trovato."
    echo "   Installa: npm install -g firebase-tools"
    exit 1
fi

FIREBASE="$(command -v firebase || echo './node_modules/.bin/firebase')"

# Login
echo ""
echo "▶ Login Firebase..."
$FIREBASE login --no-localhost
echo ""

# Crea progetto
PROJECT_ID="sistema-bot-$(date +%s)"
echo "▶ Creazione progetto: $PROJECT_ID"
$FIREBASE projects:create "$PROJECT_ID" --display-name "Sistema Bot" || {
    echo "⚠️  Creazione fallita, forse il progetto esiste già."
    read -p "   Inserisci PROJECT_ID esistente: " PROJECT_ID
}

# Attiva Realtime Database
echo ""
echo "▶ Attivazione Realtime Database..."
$FIREBASE firebase databases:instance:create "$PROJECT_ID-default-rtdb" --project "$PROJECT_ID" 2>/dev/null || true

# Imposta regole di test
echo ""
echo "▶ Impostazione regole di sicurezza (modalità test)..."
cat > firebase.json <<EOF
{
  "database": {
    "rules": {
      "rules": {
        ".read": true,
        ".write": true
      }
    }
  }
}
EOF

$FIREBASE deploy --only database --project "$PROJECT_ID"

# Ottieni le credenziali
echo ""
echo "▶ Ottenimento credenziali..."
API_KEY=$($FIREBASE apps:list --project "$PROJECT_ID" 2>/dev/null | grep -oP '"apiKey": "\K[^"]+' | head -1 || echo "DA OTTENERE DALLA CONSOLE")

# Scrivi .env
echo ""
echo "▶ Scrittura .env..."
cat > .env <<EOF
# Firebase — Progetto: $PROJECT_ID
FIREBASE_API_KEY=${API_KEY:-your-api-key}
FIREBASE_AUTH_DOMAIN=$PROJECT_ID.firebaseapp.com
FIREBASE_DATABASE_URL=https://$PROJECT_ID-default-rtdb.firebaseio.com
FIREBASE_PROJECT_ID=$PROJECT_ID
FIREBASE_STORAGE_BUCKET=$PROJECT_ID.appspot.com

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# ADB
ADB_DEVICE_SERIAL=

# Sicurezza
COOKIE_ENCRYPTION_KEY=cambia-questa-chiave-con-una-sicura

# YouTube
WATCH_TIME_MIN=120
WATCH_TIME_MAX=240
DEFAULT_KEYWORD=music

# TikTok
TIKTOK_WATCH_TIME_MIN=60
TIKTOK_WATCH_TIME_MAX=180
TIKTOK_DEFAULT_HASHTAG=music

# Instagram
INSTAGRAM_WATCH_TIME_MIN=30
INSTAGRAM_WATCH_TIME_MAX=90
INSTAGRAM_DEFAULT_HASHTAG=music
EOF

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  FIREBASE CONFIGURATO!                          ║"
echo "║                                                ║"
echo "║  Project: $PROJECT_ID"
echo "║  .env aggiornato                               ║"
echo "║                                                ║"
echo "║  Ora aggiungi le stesse 5 variabili su Vercel: ║"
echo "║  https://vercel.com/donaldkevin765-makers-projects/web/settings/environment-variables ║"
echo "╚══════════════════════════════════════════════════╝"
