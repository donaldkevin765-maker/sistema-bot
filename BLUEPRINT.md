# SISTEMA BOT - BLUEPRINT COMPLETO
# Architettura, flussi, componenti e roadmap

================================================================================
1. ARCHITETTURA LOGICA (3 Layer + Infrastruttura)
================================================================================

┌─────────────────────────────────────────────────────────────────────────────┐
│                        LAYER 1: CERVELLO (Orchestrator)                     │
│                         Decide COSA fare, quando, quanto                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Brain (brain.py)                                                            │
│  ├── Legge: WarmupScheduler → in che fase sono? quanti like oggi?            │
│  ├── Legge: BiologicalScheduler → è ora di dormire?                          │
│  ├── Legge: SocialFSM → weighted random: scroll/like/commenti/profilo        │
│  ├── Legge: ResourceLimiter → quanti bot possono girare ora?                 │
│  ├── Legge: ThermalWatchdog → il PC si sta surriscaldando?                   │
│  ├── Legge: ShadowBanMonitor → questo bot è in shadow ban?                   │
│  ├── Legge: IPVerifier → l'IP è cambiato rispetto alla sessione prima?       │
│  └── Emette: comando strutturato all'Adapter                                 │
│                                                                              │
│  Flusso decisionale:                                                         │
│  1. BioSchedule.ok? → NO → aspetta                                          │
│  2. ThermalWatchdog.ok? → NO → pausa forzata                                │
│  3. ResourceLimiter.available? → NO → coda                                   │
│  4. ShadowBanMonitor.is_banned? → SI → skip bot per 7gg                     │
│  5. IPVerifier.ip_changed? → NO → airplane mode cycle                       │
│  6. NetworkAnchoring.ok? → NO → sys.exit() (connessione non via telefono)   │
│  7. WarmupScheduler.can_act? → calcola limites                              │
│  8. SocialFSM.pick_state() → weighted random                                │
│  9. Esegui azione                                                            │
│  10. Persisti stato su DB + disco                                           │
│                                                                              │
└──────────────────────┬──────────────────────────────────────────────────────┘
                       │ comando strutturato
                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     LAYER 2: ADATTATORI (Platform Adapters)                  │
│                      Sanno COME si fa su ogni piattaforma                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  BaseAdapter (abstract)                                                      │
│  ├── login(username, password) → bool                                       │
│  ├── scroll_feed(duration) → None                                           │
│  ├── like_current_post() → bool                                             │
│  ├── view_comments() → None                                                 │
│  ├── search(query) → None                                                   │
│  ├── view_profile(username) → None                                          │
│  ├── is_logged_in() → bool                                                  │
│  ├── logout() → None                                                        │
│  ├── detect_block() → Optional[str]  ← captcha? sospeso?                    │
│  ├── handle_block(block_type) → bool  ← notifica Telegram se captcha       │
│  └── safe_navigate(url) → bool                                              │
│                                                                              │
│  YouTubeAdapter extends BaseAdapter                                          │
│  ├── selectors specifici YouTube (input#search, #avatar-btn, etc.)          │
│  ├── gestione cookie consent (Accetta tutto / I agree / etc.)               │
│  └── skip ads, mute via tastiera                                            │
│                                                                              │
│  TikTokAdapter extends BaseAdapter                                           │
│  ├── selectors specifici TikTok (data-e2e="like-icon", etc.)                │
│  ├── gestione FYP scroll verticale (video full-screen)                      │
│  └── swipe up (non scroll tradizionale)                                     │
│                                                                              │
│  InstagramAdapter extends BaseAdapter                                        │
│  ├── selectors specifici Instagram (svg[aria-label="Like"], etc.)            │
│  ├── gestione popup "Salva credenziali?" / "Attiva notifiche?"              │
│  └── explore page + stories                                                 │
│                                                                              │
└──────────────────────┬──────────────────────────────────────────────────────┘
                       │ azione platform-specifica (es. click #like-button)
                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       LAYER 3: DRIVER (Esecutore)                           │
│                        Esegue materialmente l'azione                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  BotDriver (bot_driver.py)                                                   │
│  ├── create_context(UA, viewport, canvas_seed, ...) → BrowserContext        │
│  │   ├── applica anti-fingerprint scripts (5 init_script)                   │
│  │   ├── carica cookies dal disco (se esistenti)                            │
│  │   └── carica localStorage/sessionStorage                                 │
│  ├── create_page() → Page                                                   │
│  ├── persist_state() → salva cookies + storage su disco                    │
│  ├── close() → persist + chiudi contesto                                    │
│  └── screenshot() → bytes (per Telegram alert)                              │
│                                                                              │
│  MouseBezier (mouse_bezier.py)                                               │
│  ├── human_mouse_move(x, y) → move con curve Bézier + overshoot            │
│  ├── human_click(x, y) → move + down + delay + up                          │
│  ├── human_double_click(x, y) → dblclick con delay                         │
│  └── human_scroll(dx, dy) → scroll a step con jitter                       │
│                                                                              │
└──────────────────────┬──────────────────────────────────────────────────────┘
                       │ Playwright API calls
                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INFRASTRUTTURA (Servizi Trasversali)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Database (database.py) → SQLite (fase 1) → PostgreSQL (fase 2)            │
│  ├── profili_bot (bot_id, username, piattaforma, UA, canvas_seed, stato)    │
│  ├── registri_attivita (azione_id, bot_id, tipo, ip, timestamp, success)    │
│  ├── metriche_giornaliere (bot_id, data, likes, follows, commenti, scroll)  │
│  └── shadowban_log (bot_id, data, rilevato, cooldown_fine)                  │
│                                                                              │
│  Network Stack (src/network/)                                                │
│  ├── IPVerifier → check IP via api.ipify.org, airplane mode cycle           │
│  ├── NetworkAnchoring → check interfaccia (solo RNDIS/tethering)            │
│  ├── TCPFingerprintSpoofer → sysctl TTL/MTU/window Android                  │
│  ├── DNSManager → forzatura DNS operatore (Vodafone/TIM/Wind)               │
│  ├── TunnelEffectRecovery → gestione disconnessione 4G + pull-to-refresh   │
│  └── FirebaseProtocol → nonce 5s + 3-way handshake                         │
│                                                                              │
│  Security Stack (src/security/)                                              │
│  ├── CrossContaminationGuard → blocca interazioni bot-bot                   │
│  ├── ShadowBanMonitor → check visibilità commenti + 7gg cooldown            │
│  └── CookieEncryption → AES-256 PBKDF2 per cookie a riposo                  │
│                                                                              │
│  Hardware Stack (src/hardware/)                                              │
│  └── ThermalWatchdog → pausa forzata se CPU >40°C                          │
│                                                                              │
│  Android Stack (src/android/)                                                │
│  ├── ADBManager → shell ADB, tap, swipe, keyevent                          │
│  ├── SMSInterceptor → polling notifiche, estrazione OTP                    │
│  └── SensorSpoofer → giroscopio/accelerometro con tremolio umano           │
│                                                                              │
│  Behavior Stack (src/behavior/)                                              │
│  ├── SocialFSM → weighted random state machine (scroll/like/commenti/...)   │
│  ├── WarmupScheduler → 6 fasi (incubazione → stabile)                       │
│  ├── BiologicalScheduler → finestra sonno 7-8h + pasti                     │
│  ├── MicroDistraction → pause 5-8s simulate notifica                       │
│  ├── AccidentalClicker → click sbagliato + back + frustrazione              │
│  ├── WPMReader → tempo lettura basato su 200-250 parole/min                │
│  ├── ShadowPrewarmer → Google search + news prima del social               │
│  ├── IdentityGenerator → username, bio, avatar prompt                       │
│  └── TelegramNotifier → captcha, 2FA, report flotta                        │
│                                                                              │
│  Cloud Bridge (agents/main.py)                                               │
│  ├── Firebase stream listener su sistema/comando                            │
│  ├── Nonce validation (5s TTL)                                              │
│  ├── Avvio flotta su comando START_FLOTTA                                   │
│  └── Report stato su Firebase (RUNNING/ERROR/IDLE)                          │
│                                                                              │
│  Frontend (web/ - Next.js + Tailwind)                                        │
│  ├── Dashboard stato flotta (badge colorati)                                │
│  ├── Pulsante AVVIA FLOTTA                                                  │
│  ├── Tabella bot (ID, nome, piattaforma, stato, errori)                     │
│  ├──/api/start-fleet → Firebase (nonce + comando)                          │
│  └── Grafici metriche (daily likes, sopravvivenza, errori)                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

================================================================================
2. CICLO DI VITA DI UN BOT (State Machine Completa)
================================================================================

┌──────────┐     ┌───────────┐     ┌────────┐     ┌────────┐     ┌──────────┐
│ CREATO   │────▶│ WARMING   │────▶│ READY  │────▶│ ACTIVE  │────▶│ STABLE   │
│ DB only  │     │ sett 1-2  │     │ sett 3  │     │ sett 4-6│     │ sett 7+  │
│ Passport │     │ login+s-  │     │ 1-2 lik │     │ fase 3  │     │ regime   │
│ generato │     │ croll     │     │ e/giorno│     │ -5      │     │ normale  │
└──────────┘     └───────────┘     └────────┘     └────────┘     └──────────┘
                                                       │
                                                       ▼
                                                ┌──────────────┐
                                                │   SOSPESO     │
                                                │ shadow-ban    │
                                                │ 7gg cooldown  │
                                                │ poi → WARMING │
                                                └──────────────┘

Ogni stato ACTIVE fa un ciclo decisionale ogni 30-120 secondi:

    ┌──────────────────────────────────────────────────┐
    │                CICLO DECISIONALE                   │
    │  1. BioSchedule.sleeping? → SI → skip 30min       │
    │  2. ThermalWatchdog.paused? → SI → skip 60s       │
    │  3. ResourceLimiter.available? → NO → coda 30s    │
    │  4. WarmupScheduler.login_only? → SI → scroll     │
    │  5. check daily limits → raggiunti? → skip        │
    │  6. SocialFSM.pick() → weighted random             │
    │  7. Esegui stato (scroll/like/commenti/profilo)    │
    │  8. detect_block() → captcha? → Telegram alert    │
    │  9. persist_state() → salva cookies + storage     │
    │  10. delay(30-120s) → next cycle                  │
    └──────────────────────────────────────────────────┘

================================================================================
3. FLUSSO DATI END-TO-END
================================================================================

    UTENTE                    CLOUD                         PC LOCALE
      │                         │                              │
      │ 1. Clicca AVVIA         │                              │
      │─────▶ Dashboard Vercel  │                              │
      │       │                 │                              │
      │       │ 2. POST /api/   │                              │
      │       │    start-fleet  │                              │
      │       │    generate     │                              │
      │       │    nonce +      │                              │
      │       │    timestamp    │                              │
      │       │       │         │                              │
      │       │       │         │                              │
      │       │ 3. Firebase:    │                              │
      │       │ sistema/comando │                              │
      │       │ = {nonce,       │                              │
      │       │   azione:       │                              │
      │       │   START_FLOTTA, │                              │
      │       │   piattaforma,  │                              │
      │       │   stato:PENDING}│                              │
      │       │       │         │                              │
      │       │       │         │ 4. Firebase stream event     │
      │       │       │         │◀──────────────────────────── │
      │       │       │         │                              │
      │       │       │         │ 5. Verifica nonce <5s       │
      │       │       │         │ 6. Controlla ancoraggio rete│
      │       │       │         │ 7. Controlla IP cambiato     │
      │       │       │         │ 8. Avvia SistemaBot         │
      │       │       │         │                              │
      │       │       │         │ 9. Firebase: stato=RUNNING   │
      │       │       │◀────────────────────────────────────── │
      │       │       │         │                              │
      │       │ 10. Dashboard  │                              │
      │       │     vede       │                              │
      │       │     RUNNING    │                              │
      │       │     con badge  │                              │
      │       │     verde      │                              │
      │       │       │         │                              │
      │       │       │         │ 11. Per ogni bot:            │
      │       │       │         │ ├── Passport.get(bot_id)     │
      │       │       │         │ ├── BotDriver.create_context │
      │       │       │         │ ├── Brain.run_session()      │
      │       │       │         │ │   ├── Warmup check         │
      │       │       │         │ │   ├── SocialFSM pick       │
      │       │       │         │ │   ├── Adapter esegue       │
      │       │       │         │ │   ├── detect_block         │
      │       │       │         │ │   └── persist_state        │
      │       │       │         │ ├── database.py: registra    │
      │       │       │         │ └── BotDriver.close          │
      │       │       │         │                              │
      │       │       │         │ 12. Firebase: stato=IDLE     │
      │       │       │◀────────────────────────────────────── │
      │       │       │         │                              │
      │ 13. Dashboard vede      │                              │
      │     IDLE + statistiche  │                              │
      │◀────────────────────────│                              │

================================================================================
4. COSA MANCA (Roadmap Prioritaria)
================================================================================

P0 - CRITICO (senza questo il progetto non è pronto):

  [ ] 01. Database PostgreSQL centralizzato (Neon/Vercel)
       - Sostituisce SQLite per accesso concorrente 1000 bot
       - Schema metriche_giornaliere + shadowban_log
       - Connessione via asyncpg + connection pool

  [ ] 02. Batch profile generator (scripts/generate_profiles.py)
       - Genera 1000 passport in un colpo
       - Username, bio, seed, fingerprint, fuso orario, UA
       - Output: 1000 file passport_{id}.json + DB

  [ ] 03. Cache HTTP persistente per bot
       - Bottone ha la sua cartella cache su disco
       - Playwright context con --disk-cache-dir=<path>
       - Impedisce che 1000 bot sembrino browser nuovi

P1 - ALTO (produzione senza questi è rischiosa):

  [ ] 04. Setup automation (scripts/setup.py)
       - Installa: python-deps, playwright browsers, ADB
       - Crea: .env, data/* directories
       - Testa: ADB connection, Firebase, API IP
       - Output: "✅ Sistema pronto per 1000 bot"

  [ ] 05. Dashboard Vercel completa
       - Login (opzionale)
       - Storico sessioni con grafici (Chart.js)
       - Dettaglio bot singolo (ultime azioni, stato)
       - Paginazione e filtro tabella (1000 bot)
       - Grafico sopravvivenza bot nel tempo

  [ ] 06. Health monitoring + auto-restart
       - agents/main.py con watchdog interno
       - Se crasha → restart automatico entro 5s
       - Telegram notifica su crash + restart
       - systemd/service file per avvio automatico

  [ ] 07. Logging strutturato
       - log/bot_{id}.log (rotazione giornaliera)
       - log/flotta.log (riepilogo centrale)
       - Retention: 30 giorni
       - Formato JSON per parsing automatico

P2 - MEDIO (dopo che il core è stabile):

  [ ] 08. Proxy/device manager
       - Blacklist IP bannati su DB
       - Reset automatico device bloccati
       - Assegnazione bot ↔ device fisico
       - Statistica: IP per device, success rate

  [ ] 09. Email temporanee (src/services/email_manager.py)
       - Integrazione temp-mail.org API (gratis)
       - Pool di email usa-e-getta
       - Verifica OTP email

  [ ] 10. Stable Diffusion avatar runner
       - Script che genera 1000 facce
       - Usa AutoModels o diffusers (locale, gratis)
       - Applica filtri casuali (luminosità, contrasto)

================================================================================
5. STRUTTURA FILE COMPLETA (Target Finale)
================================================================================

sistema-bot/
├── agents/
│   └── main.py                   # Firebase listener + orchestrator entry point
├── config/
│   └── settings.py               # Pydantic settings (non ancora creato)
├── data/
│   ├── passports/                # 1000 cartelle passport_{bot_id}/
│   │   └── passport_{id}/
│   │       ├── identity.json
│   │       ├── cookies.json
│   │       ├── storage.json
│   │       └── cache/            # HTTP cache persistente
│   ├── logs/                     # Logs strutturati
│   │   ├── bot_{id}.log
│   │   └── flotta.log
│   └── screenshots/              # Screenshot cattura blococchi
├── database.py                   # SQLite (fase 1) → PostgreSQL async (fase 2)
├── scripts/
│   ├── generate_profiles.py      # Batch 1000 passport
│   ├── setup.py                   # Setup automation
│   └── generate_avatars.py       # Stable Diffusion avatar runner
├── src/
│   ├── system.py                 # SistemaBot orchestrator (esistente)
│   ├── adapters/
│   │   ├── base.py               # PlatformAdapter astratto
│   │   ├── youtube.py
│   │   ├── tiktok.py
│   │   └── instagram.py
│   ├── android/
│   │   ├── adb_manager.py
│   │   ├── sms_interceptor.py
│   │   └── sensor_spoofer.py
│   ├── behavior/
│   │   ├── accidental_clicks.py
│   │   ├── biological_schedule.py
│   │   ├── identity_generator.py
│   │   ├── micro_distraction.py
│   │   ├── shadow_prewarm.py
│   │   ├── social_fsm.py
│   │   ├── telegram_notifier.py
│   │   ├── warmup_scheduler.py
│   │   └── wpm_reader.py
│   ├── bot/
│   │   └── behaviors/
│   │       └── youtube_warmer.py
│   ├── browser/
│   │   ├── audio_noise.py
│   │   ├── canvas_webgl_noise.py
│   │   ├── font_spoofer.py
│   │   ├── resource_limiter.py
│   │   ├── touch_events.py
│   │   └── viewport_variator.py
│   ├── driver/
│   │   ├── bot_driver.py
│   │   └── mouse_bezier.py
│   ├── hardware/
│   │   └── watchdog.py
│   ├── identity/
│   │   └── passport.py
│   ├── network/
│   │   ├── anchoring.py
│   │   ├── dns_manager.py
│   │   ├── firebase_protocol.py
│   │   ├── ip_verifier.py
│   │   ├── tcp_fingerprint.py
│   │   └── tunnel.py
│   ├── orchestrator/
│   │   └── brain.py
│   ├── security/
│   │   ├── cookie_encryption.py
│   │   ├── isolation.py
│   │   └── shadowban_monitor.py
│   └── services/
│       └── email_manager.py      # DA CREARE
├── web/                          # Next.js dashboard
│   ├── package.json
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── next.config.js
│   ├── .env.local.example
│   └── src/pages/
│       ├── _app.tsx
│       ├── index.tsx
│       └── api/start-fleet.ts
├── pyproject.toml
├── .env.example
└── README.md

================================================================================
6. METRICHE CHIAVE DA TRACCIARE
================================================================================

Per bot (registri_attivita + metriche_giornaliere):
  - likes_dati, follows_fatti, commenti_scritti, scroll_minuti
  - captcha_incontrati, errori_totali, shadow_ban_rilevati
  - tempo_sessione_medio, azioni_per_sessione
  - stato_corrente (WARMING/READY/ACTIVE/SOSPESO/BANNATO)

Per flotta (dashboard + Telegram):
  - sopravvivenza_% (ancora attivi / creati totali)
  - bot_attivi_ora, bot_in_coda, bot_bannati_oggi
  - azioni_totali_oggi, likes_totali_oggi, views_influenzate
  - ip_medi_disponibili, temperatura_cpu, ram_libera_mb
  - errori_totali_ultima_ora, captcha_incontrati_oggi
