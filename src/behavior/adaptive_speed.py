from __future__ import annotations

import logging
import time
from collections import deque
from typing import Optional

logger = logging.getLogger(__name__)


class AdaptiveSpeed:
    def __init__(self, bot_id: int, window_minutes: int = 60):
        self.bot_id = bot_id
        self.window_seconds = window_minutes * 60
        self._errors: deque[float] = deque(maxlen=100)
        self._captchas: deque[float] = deque(maxlen=50)
        self._speed_multiplier: float = 1.0
        self._base_delay_range = (30.0, 120.0)
        self._slow_threshold = 3
        self._crit_slow_threshold = 10

    def record_error(self) -> None:
        self._errors.append(time.time())
        self._recalculate()

    def record_captcha(self) -> None:
        self._captchas.append(time.time())
        self._recalculate()

    def record_success(self) -> None:
        pass

    def _recalculate(self) -> None:
        now = time.time()
        window_start = now - self.window_seconds

        recent_errors = sum(1 for t in self._errors if t > window_start)
        recent_captchas = sum(1 for t in self._captchas if t > window_start)

        if recent_captchas >= 2:
            self._speed_multiplier = 4.0
            logger.warning(f"Bot {self.bot_id}: 2+ captcha/ora. Rallentamento 4x")
        elif recent_errors >= self._crit_slow_threshold:
            self._speed_multiplier = 3.0
            logger.warning(f"Bot {self.bot_id}: {recent_errors} errori/ora. Rallentamento 3x")
        elif recent_errors >= self._slow_threshold:
            self._speed_multiplier = 1.5
            logger.debug(f"Bot {self.bot_id}: {recent_errors} errori/ora. Rallentamento 1.5x")
        elif recent_errors == 0 and recent_captchas == 0 and self._speed_multiplier > 1.0:
            self._speed_multiplier = max(1.0, self._speed_multiplier - 0.1)

    def get_action_delay(self) -> float:
        base_min, base_max = self._base_delay_range
        base = base_min + (base_max - base_min) * (1.0 / self._speed_multiplier)
        jitter = base * 0.2
        return max(10.0, base + (__import__("random").uniform(-jitter, jitter)))

    def get_scroll_speed_multiplier(self) -> float:
        return 1.0 / self._speed_multiplier

    def should_skip_action(self) -> bool:
        return self._speed_multiplier >= 4.0

    def __repr__(self) -> str:
        return f"<AdaptiveSpeed bot={self.bot_id} multiplier={self._speed_multiplier:.2f}x>"


class CrisisMode:
    def __init__(self, telegram=None):
        self._ban_count = 0
        self._last_ban_date: Optional[int] = None
        self._active = False
        self._cooldown_until: Optional[int] = None
        self.telegram = telegram

    def report_ban(self) -> None:
        self._ban_count += 1
        self._last_ban_date = int(time.time())

        if self._ban_count >= 3:
            self._active = True
            self._cooldown_until = int(time.time()) + 86400
            logger.critical(f"CRISI: {self._ban_count} ban rilevati. Flotta in pausa 24h.")
            if self.telegram:
                import asyncio
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        loop.create_task(
                            self.telegram.send_message(
                                f"🚨 CRISI: {self._ban_count} ban in un giorno. "
                                "Flotta bloccata 24h."
                            )
                        )
                except Exception:
                    pass

    def is_crisis(self) -> bool:
        if not self._active:
            return False
        if self._cooldown_until and time.time() > self._cooldown_until:
            self._active = False
            self._ban_count = 0
            logger.info("Crisis mode: periodo di raffreddamento terminato.")
            return False
        return True

    def should_pause_fleet(self) -> bool:
        return self.is_crisis()

    def reset(self) -> None:
        self._ban_count = 0
        self._active = False
        self._cooldown_until = None
