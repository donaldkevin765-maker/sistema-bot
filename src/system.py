from __future__ import annotations

import asyncio
import logging
import os
import random
from datetime import datetime
from pathlib import Path
from typing import Optional

from playwright.async_api import async_playwright

from database import (
    init_db, inserisci_bot, aggiorna_bot, get_bot,
    registra_attivita, get_attivita, lista_bot,
)
from src.hardware.watchdog import ThermalWatchdog
from src.network.tcp_fingerprint import TCPFingerprintSpoofer, OSTarget
from src.network.dns_manager import DNSManager
from src.network.tunnel import TunnelEffectRecovery
from src.network.geo_ip import GeoIPService
from src.android.adb_manager import ADBManager
from src.android.sms_interceptor import SMSInterceptor
from src.android.sensor_spoofer import SensorSpoofer
from src.android.carrot_multi_carrier import CarrotMultiCarrier
from src.android.adb_reconnector import ADBReconnector
from src.behavior.micro_distraction import MicroDistraction
from src.behavior.accidental_clicks import AccidentalClicker
from src.behavior.biological_schedule import BiologicalScheduler
from src.behavior.shadow_prewarm import ShadowPrewarmer
from src.behavior.adaptive_speed import AdaptiveSpeed, CrisisMode
from src.behavior.path_dependence import PathDependence
from src.behavior.warmup_scheduler import WarmupScheduler
from src.behavior.telegram_notifier import TelegramNotifier
from src.browser.font_spoofer import FontSpoofer
from src.browser.viewport_variator import ViewportVariator
from src.browser.touch_events import TouchEventForcer
from src.browser.audio_noise import AudioContextNoiseInjector
from src.browser.resource_limiter import ResourceLimiter
from src.browser.http_cache import HttpCacheManager
from src.browser.stealth_amplified import build_full_stealth_script
from src.driver.bot_driver import BotDriver
from src.security.isolation import CrossContaminationGuard
from src.security.shadowban_monitor import ShadowBanMonitor
from src.security.cookie_encryption import CookieEncryption
from src.orchestrator.brain import Brain
from src.adapters.youtube import YouTubeAdapter
from src.adapters.tiktok import TikTokAdapter
from src.adapters.instagram import InstagramAdapter
from src.bot.behaviors.youtube_warmer import youtube_warm
from src.bot.behaviors.tiktok_warmer import tiktok_warm
from src.bot.behaviors.instagram_warmer import instagram_warm
from src.hardware.disk_watchdog import DiskWatchdog
from src.wiki_hook import wiki_hook

logger = logging.getLogger(__name__)


class SistemaBot:
    def __init__(self):
        self._running = False
        self._playwright = None
        self._browser = None
        self._bots: dict[int, dict] = {}

        self.watchdog = ThermalWatchdog(
            pause_threshold=40.0,
            resume_threshold=37.0,
            on_pause=self._on_thermal_pause,
            on_resume=self._on_thermal_resume,
        )
        self.tcp_spoofer = TCPFingerprintSpoofer(OSTarget.ANDROID)
        self.dns_manager = DNSManager()
        self.resource_limiter = ResourceLimiter()
        self.isolation = CrossContaminationGuard()
        self.tunnel = TunnelEffectRecovery()

        self.font_spoofer = FontSpoofer()
        self.viewport = ViewportVariator(base_width=412, base_height=915)
        self.touch = TouchEventForcer()
        self.audio_noise = AudioContextNoiseInjector()
        self.cache_manager = HttpCacheManager()

        self.geo = GeoIPService()
        self.carrier = CarrotMultiCarrier()

        self.shadowban_monitors: dict[int, ShadowBanMonitor] = {}
        self.biological_schedules: dict[int, BiologicalScheduler] = {}
        self.adaptive_speeds: dict[int, AdaptiveSpeed] = {}
        self.path_deps: dict[int, PathDependence] = {}
        self.cookie_encryption = CookieEncryption(
            master_key=os.getenv("COOKIE_ENCRYPTION_KEY", "default-dev-key-change-in-production")
        )

        self.adb_manager = ADBManager(
            device_serial=os.getenv("ADB_DEVICE_SERIAL")
        )
        self.adb_reconnector = ADBReconnector(self.adb_manager, max_retries=30)
        self.sms_interceptor = SMSInterceptor(self.adb_manager)
        self.sensor_spoofer = SensorSpoofer(self.adb_manager)
        self.telegram = TelegramNotifier() if os.getenv("TELEGRAM_BOT_TOKEN") else None
        self.warmup_schedulers: dict[int, WarmupScheduler] = {}
        self.crisis_modes: dict[int, CrisisMode] = {}
        self.brains: dict[int, Brain] = {}
        self.drivers: dict[int, BotDriver] = {}

        self.disk_watchdog = DiskWatchdog(
            data_dir=Path(os.getenv("DATA_DIR", "data")),
            telegram=self.telegram,
        )

        self._paused = False
        self._warmers: dict[int, ShadowPrewarmer] = {}
        self._adb_phones_registered = False

    async def _on_thermal_pause(self, reading):
        self._paused = True
        logger.warning(f"[SISTEMA] PAUSA TERMICA a {reading.temperature}°C")
        for bot_id in self._bots:
            registra_attivita(bot_id, "pausa_termica",
                              descrizione=f"Pausa a {reading.temperature}°C",
                              success=True)

    async def _on_thermal_resume(self, reading):
        self._paused = False
        logger.info(f"[SISTEMA] RIPRESA TERMICA a {reading.temperature}°C")

    async def _register_adb_phones(self) -> None:
        if self._adb_phones_registered:
            return
        try:
            connected = await self.adb_manager.connect()
            if connected:
                self.carrier.register_phone(
                    serial=self.adb_manager.device_serial or "default",
                    carrier="Vodafone",
                )
                self._adb_phones_registered = True
                logger.info(f"[ADB] Telefono registrato: {self.adb_manager.device_serial}")
            else:
                logger.warning("[ADB] Nessun telefono connesso")
        except Exception as e:
            logger.warning(f"[ADB] Registrazione telefono fallita: {e}")

    async def init_system(self):
        init_db()
        logger.info("[SISTEMA] Database inizializzato.")

        self.tcp_spoofer.apply()
        logger.info("[SISTEMA] TCP fingerprint spoofed.")

        self.resource_limiter.calculate_max_parallel()
        logger.info(f"[SISTEMA] Max bot paralleli: {self.resource_limiter.max_parallel}")

        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-infobars",
                "--disable-dev-shm-usage",
            ],
        )
        logger.info("[SISTEMA] Browser avviato.")

        await self._register_adb_phones()

        carrier_stats = self.carrier.stats()
        if carrier_stats["carriers"]:
            logger.info(f"[SISTEMA] Multi-carrier attivo: {carrier_stats['carriers']}")
        else:
            logger.info("[SISTEMA] Nessun carrier registrato (single-phone mode)")

        wiki_hook.source_project()
        wiki_hook.log_event(0, "system_init", "Sistema inizializzato", {
            "max_parallel": self.resource_limiter.max_parallel,
            "carriers": carrier_stats["carriers"],
        })

    async def run_bot(self, bot_id: int) -> dict:
        bot_data = get_bot(bot_id)
        if not bot_data:
            return {"error": "Bot non trovato"}

        schedule = self.biological_schedules.get(bot_id)
        if schedule and not schedule.is_active():
            logger.info(f"Bot {bot_id}: in finestra di sonno. Salto.")
            return {"skipped": "sleep_window"}

        if self._paused:
            logger.info(f"Bot {bot_id}: sistema in pausa termica. Salto.")
            return {"skipped": "thermal_pause"}

            if not await self.resource_limiter.wait_and_acquire(timeout=60.0):
                wiki_hook.log_event(bot_id, "resource_limit", "Limite risorse raggiunto")
                return {"skipped": "resource_limit"}

        speed = self.adaptive_speeds.setdefault(bot_id, AdaptiveSpeed(bot_id))

        if speed.should_skip_action():
            logger.warning(f"Bot {bot_id}: troppi errori recenti, skip azione.")
            self.resource_limiter.release()
            return {"skipped": "adaptive_speed_skip"}

        pd = self.path_deps.setdefault(bot_id, PathDependence(bot_id))

        result = {}
        start_time = datetime.utcnow()
        driver = None

        try:
            driver = BotDriver(bot_id, self._browser)
            self.drivers[bot_id] = driver

            viewport = {
                "width": int(bot_data.get("screen_resolution", "412x915").split("x")[0]),
                "height": int(bot_data.get("screen_resolution", "412x915").split("x")[1]),
            }

            context = await driver.create_context(
                user_agent=bot_data["user_agent"],
                viewport=viewport,
                canvas_seed=str(bot_data.get("canvas_seed", bot_id)),
                timezone=bot_data.get("timezone", "Europe/Rome"),
                locale=bot_data.get("locale", "it-IT"),
            )

            page = await driver.create_page()
            self._bots[bot_id] = {"context": context, "page": page, "started": start_time}

            piattaforma = bot_data.get("piattaforma", "youtube")

            if bot_data.get("stato") == "WARMING":
                warmer = self._warmers.setdefault(bot_id, ShadowPrewarmer(seed=bot_id))
                await warmer.prewarm_session(page)
                aggiorna_bot(bot_id, stato="READY")
                logger.info(f"Bot {bot_id}: pre-riscaldamento completato, stato -> READY")

            if piattaforma == "youtube":
                adapter = YouTubeAdapter(page, bot_id)
            elif piattaforma == "tiktok":
                adapter = TikTokAdapter(page, bot_id)
            elif piattaforma == "instagram":
                adapter = InstagramAdapter(page, bot_id)
            else:
                result["error"] = f"Piattaforma sconosciuta: {piattaforma}"
                result["status"] = "error"
                return result

            logged_in = await adapter.is_logged_in()
            if not logged_in and bot_data.get("password"):
                logger.info(f"Bot {bot_id}: tentativo login {piattaforma}")
                login_ok = await adapter.login(
                    bot_data.get("username", ""),
                    bot_data.get("password", ""),
                )
                if login_ok:
                    await driver.persist_state()
                    logged_in = True
                    aggiorna_bot(bot_id, login_count=get_bot(bot_id).get("login_count", 0) + 1)
                    logger.info(f"Bot {bot_id}: login riuscito")
                    wiki_hook.log_event(bot_id, "login_ok", f"Login {piattaforma} riuscito")
                else:
                    logger.warning(f"Bot {bot_id}: login fallito, procedo con warm anonimo")
                    wiki_hook.log_event(bot_id, "login_fail", f"Login {piattaforma} fallito")

            if logged_in and bot_id in self.brains:
                brain = self.brains[bot_id]
                brain_res = await brain.think_and_act()
                result.update(brain_res)
            else:
                distraction = MicroDistraction()
                clicker = AccidentalClicker()
                warm_result = None

                if piattaforma == "youtube":
                    watch_time_min = max(45, int(os.getenv("WATCH_TIME_MIN", "120")))
                    watch_time_max = max(90, int(os.getenv("WATCH_TIME_MAX", "240")))
                    keyword = os.getenv("DEFAULT_KEYWORD", "music")
                    warm_result = await youtube_warm(
                        page=page, keyword=keyword, seed=bot_id,
                        watch_time_range=(watch_time_min, watch_time_max),
                    )
                    result["youtube"] = warm_result

                elif piattaforma == "tiktok":
                    watch_time_min = max(30, int(os.getenv("TIKTOK_WATCH_TIME_MIN", "60")))
                    watch_time_max = max(60, int(os.getenv("TIKTOK_WATCH_TIME_MAX", "180")))
                    hashtag = os.getenv("TIKTOK_DEFAULT_HASHTAG", "music")
                    warm_result = await tiktok_warm(
                        page=page, hashtag=hashtag, seed=bot_id,
                        watch_time_range=(watch_time_min, watch_time_max),
                    )
                    result["tiktok"] = warm_result

                elif piattaforma == "instagram":
                    watch_time_min = max(20, int(os.getenv("INSTAGRAM_WATCH_TIME_MIN", "30")))
                    watch_time_max = max(40, int(os.getenv("INSTAGRAM_WATCH_TIME_MAX", "90")))
                    hashtag = os.getenv("INSTAGRAM_DEFAULT_HASHTAG", "music")
                    warm_result = await instagram_warm(
                        page=page, hashtag=hashtag, seed=bot_id,
                        watch_time_range=(watch_time_min, watch_time_max),
                    )
                    result["instagram"] = warm_result

                if warm_result:
                    registra_attivita(
                        bot_id=bot_id,
                        tipo_azione=f"{piattaforma}_warm",
                        descrizione=f"Warm: {warm_result.get('hashtag') or warm_result.get('keyword') or 'music'}",
                        ip_utilizzato=bot_data.get("ip_address"),
                        user_agent=bot_data.get("user_agent"),
                        canvas_seed=bot_data.get("canvas_seed"),
                        success=warm_result.get("status") == "ok",
                        durata_ms=int((datetime.utcnow() - start_time).total_seconds() * 1000),
                    )

                blocked = await adapter.detect_block()
                if blocked:
                    logger.warning(f"Bot {bot_id}: blocco {blocked}")
                    speed.record_error()
                    if "captcha" in str(blocked).lower():
                        speed.record_captcha()
                    if self.telegram:
                        await self.telegram.notify_captcha(bot_id, page)
                    wiki_hook.log_event(bot_id, "block", f"Blocco rilevato: {blocked}")

                await distraction.maybe_distract(page, seed=bot_id + 100)
                await clicker.maybe_accidental_click(page, seed=bot_id + 200)
                await clicker.accidental_scroll(page, seed=bot_id + 300)

            await driver.persist_state()
            result["bot_id"] = bot_id
            result["status"] = "ok"
            result["duration"] = (datetime.utcnow() - start_time).total_seconds()
            result["paused_for_thermal"] = self._paused
            result["logged_in"] = logged_in

            speed.record_success()

        except Exception as e:
            logger.error(f"Bot {bot_id} error: {e}")
            speed.record_error()
            registra_attivita(
                bot_id=bot_id,
                tipo_azione="errore",
                descrizione=str(e),
                success=False,
                error_message=str(e),
            )
            aggiorna_bot(bot_id, error_count=get_bot(bot_id).get("error_count", 0) + 1)
            result["error"] = str(e)
            result["status"] = "error"

        finally:
            self.resource_limiter.release()
            if driver:
                await driver.close()
            self._bots.pop(bot_id, None)
            self.drivers.pop(bot_id, None)

        return result

    async def start_fleet(self, piattaforma: Optional[str] = None):
        self._running = True
        await self.watchdog.start()
        await self.disk_watchdog.start()
        wiki_hook.log_event(0, "fleet_start", f"Flotta avviata su {piattaforma or 'tutte'}")

        bots = lista_bot(piattaforma=piattaforma, stato="READY")
        if not bots:
            bots = lista_bot(piattaforma=piattaforma)
            logger.info(f"Nessun bot READY trovato, uso tutti i {len(bots)} bot.")

        logger.info(f"[FLOTTA] Avvio {len(bots)} bot su {piattaforma or 'tutte le piattaforme'}")

        for bot in bots:
            bid = bot["bot_id"]
            if bid not in self.biological_schedules:
                self.biological_schedules[bid] = BiologicalScheduler(
                    bot_id=bid, timezone_str="Europe/Rome"
                )
            if bid not in self.shadowban_monitors:
                self.shadowban_monitors[bid] = ShadowBanMonitor(bot_id=bid)
            if bid not in self.adaptive_speeds:
                self.adaptive_speeds[bid] = AdaptiveSpeed(bot_id=bid)
            if bid not in self.path_deps:
                self.path_deps[bid] = PathDependence(bot_id=bid)
            if bid not in self.warmup_schedulers:
                self.warmup_schedulers[bid] = WarmupScheduler(bot_id=bid)
            if bid not in self.crisis_modes:
                self.crisis_modes[bid] = CrisisMode(self.telegram)
            carrier_assign = self.carrier.assign_bot(bid)
            carrier_name = getattr(carrier_assign, "carrier", None) if carrier_assign else None

            if bid not in self.brains and bot.get("password"):
                warmup = self.warmup_schedulers[bid]
                plat = bot.get("piattaforma", "youtube")
                self.brains[bid] = Brain(
                    bot_id=bid, page=None, platform=plat,
                    warmup=warmup, telegram=self.telegram,
                    adaptive_speed=self.adaptive_speeds[bid],
                    path_dep=self.path_deps[bid],
                    crisis=self.crisis_modes[bid],
                    carrier=carrier_name,
                )

        semaphore = asyncio.Semaphore(self.resource_limiter.max_parallel)
        tasks = []

        async def run_with_semaphore(bot_id):
            async with semaphore:
                return await self.run_bot(bot_id)

        for bot in bots:
            if not self._running:
                break
            task = asyncio.create_task(run_with_semaphore(bot["bot_id"]))
            tasks.append(task)
            await asyncio.sleep(random.uniform(0.5, 2.0))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        logger.info(f"[FLOTTA] Completati {len([r for r in results if not isinstance(r, Exception)])}/{len(tasks)} bot")

    async def stop_fleet(self):
        self._running = False
        await self.watchdog.stop()
        await self.disk_watchdog.stop()
        wiki_hook.log_event(0, "fleet_stop", "Flotta arrestata")
        wiki_hook.save_session_report()
        for bot_id in list(self._bots.keys()):
            try:
                await self._bots[bot_id]["context"].close()
            except Exception:
                pass
        self._bots.clear()

    async def shutdown(self):
        await self.stop_fleet()
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()
        self.tcp_spoofer.restore()
        logger.info("[SISTEMA] Arrestato.")

    async def setup_bot(
        self,
        username: str,
        piattaforma: str,
        user_agent: str,
        ip_address: str,
        canvas_seed: float,
    ) -> int:
        bot_id = inserisci_bot(
            username=username,
            piattaforma=piattaforma,
            user_agent=user_agent,
            ip_address=ip_address,
            canvas_seed=canvas_seed,
            canvas_fingerprint=f"fp_{canvas_seed}_{username}",
        )
        self.biological_schedules[bot_id] = BiologicalScheduler(
            bot_id=bot_id,
            timezone_str="Europe/Rome",
        )
        self.shadowban_monitors[bot_id] = ShadowBanMonitor(bot_id=bot_id)
        self.adaptive_speeds[bot_id] = AdaptiveSpeed(bot_id=bot_id)
        self.path_deps[bot_id] = PathDependence(bot_id=bot_id)
        self.carrier.assign_bot(bot_id)
        logger.info(f"[SISTEMA] Bot {bot_id} ({username}) registrato su {piattaforma}")
        return bot_id
