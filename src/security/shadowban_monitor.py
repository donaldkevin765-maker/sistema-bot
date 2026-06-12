from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)


COOLDOWN_DAYS = 7
CHECK_INTERVAL_HOURS = 48


class ShadowBanMonitor:
    def __init__(self, bot_id: int):
        self.bot_id = bot_id
        self._shadow_banned: bool = False
        self._last_check: Optional[datetime] = None
        self._cooldown_until: Optional[datetime] = None

    async def check_comment_visibility(
        self,
        clean_page,
        comment_url: str,
        expected_text: str,
    ) -> bool:
        try:
            await clean_page.goto(comment_url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(3.0)

            page_text = await clean_page.inner_text("body")
            if expected_text[:50] in page_text:
                self._shadow_banned = False
                self._last_check = datetime.now(timezone.utc)
                logger.info(f"Bot {self.bot_id}: commento visibile pubblicamente. OK.")
                return True
            else:
                self._shadow_banned = True
                self._cooldown_until = datetime.now(timezone.utc) + timedelta(days=COOLDOWN_DAYS)
                self._last_check = datetime.now(timezone.utc)
                logger.warning(
                    f"Bot {self.bot_id}: SHADOW-BAN rilevato! "
                    f"Raffreddamento fino al {self._cooldown_until.isoformat()}"
                )
                return False

        except Exception as e:
            logger.error(f"Bot {self.bot_id}: errore controllo shadow-ban: {e}")
            return True

    def is_shadow_banned(self) -> bool:
        if not self._shadow_banned:
            return False
        if self._cooldown_until and datetime.now(timezone.utc) > self._cooldown_until:
            self._shadow_banned = False
            self._cooldown_until = None
            logger.info(f"Bot {self.bot_id}: periodo di raffreddamento terminato.")
            return False
        return True

    def get_cooldown_remaining(self) -> Optional[timedelta]:
        if self._cooldown_until:
            remaining = self._cooldown_until - datetime.now(timezone.utc)
            return remaining if remaining.total_seconds() > 0 else timedelta(0)
        return None

    async def should_check(self) -> bool:
        if self.is_shadow_banned():
            return False
        if not self._last_check:
            return True
        elapsed = datetime.now(timezone.utc) - self._last_check
        return elapsed.total_seconds() >= CHECK_INTERVAL_HOURS * 3600
