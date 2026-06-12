# sistema-bot - Modulo principale

from src.hardware.watchdog import ThermalWatchdog
from src.network.tcp_fingerprint import TCPFingerprintSpoofer, OSTarget
from src.network.dns_manager import DNSManager
from src.network.tunnel import TunnelEffectRecovery
from src.network.ip_verifier import IPVerifier
from src.network.anchoring import NetworkAnchoring
from src.network.firebase_protocol import FirebaseCommandProtocol
from src.android.adb_manager import ADBManager
from src.android.sms_interceptor import SMSInterceptor
from src.android.sensor_spoofer import SensorSpoofer
from src.behavior.micro_distraction import MicroDistraction
from src.behavior.accidental_clicks import AccidentalClicker
from src.behavior.biological_schedule import BiologicalScheduler
from src.behavior.wpm_reader import WPMReader
from src.behavior.shadow_prewarm import ShadowPrewarmer
from src.behavior.warmup_scheduler import WarmupScheduler, WarmupPhase, PHASE_CONFIG
from src.behavior.identity_generator import IdentityGenerator
from src.behavior.social_fsm import SocialFSM, SocialFSMConfig, SocialState
from src.behavior.telegram_notifier import TelegramNotifier
from src.browser.font_spoofer import FontSpoofer
from src.browser.viewport_variator import ViewportVariator
from src.browser.touch_events import TouchEventForcer
from src.browser.audio_noise import AudioContextNoiseInjector
from src.browser.resource_limiter import ResourceLimiter
from src.browser.canvas_webgl_noise import build_canvas_webgl_script
from src.security.isolation import CrossContaminationGuard
from src.security.shadowban_monitor import ShadowBanMonitor
from src.security.cookie_encryption import CookieEncryption
from src.bot.behaviors.youtube_warmer import youtube_warm

__all__ = [
    "ThermalWatchdog",
    "TCPFingerprintSpoofer", "OSTarget",
    "DNSManager",
    "TunnelEffectRecovery",
    "IPVerifier",
    "NetworkAnchoring",
    "FirebaseCommandProtocol",
    "ADBManager",
    "SMSInterceptor",
    "SensorSpoofer",
    "MicroDistraction",
    "AccidentalClicker",
    "BiologicalScheduler",
    "WPMReader",
    "ShadowPrewarmer",
    "WarmupScheduler", "WarmupPhase",
    "IdentityGenerator",
    "FontSpoofer",
    "ViewportVariator",
    "TouchEventForcer",
    "AudioContextNoiseInjector",
    "ResourceLimiter",
    "build_canvas_webgl_script",
    "CrossContaminationGuard",
    "ShadowBanMonitor",
    "CookieEncryption",
    "youtube_warm",
]
