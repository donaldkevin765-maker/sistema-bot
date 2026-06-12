from __future__ import annotations

import asyncio
import logging
import re
from typing import Callable, Optional

from src.android.adb_manager import ADBManager

logger = logging.getLogger(__name__)


class SMSInterceptor:
    def __init__(self, adb: ADBManager, on_code: Optional[Callable] = None):
        self.adb = adb
        self.on_code = on_code
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._last_sms_ids: set[str] = set()
        self._code_patterns = [
            r"\b(\d{4,8})\b",
            r"codice\s*(?:di\s*)?verifica[:\s]*(\d{4,8})",
            r"code[:\s]*(\d{4,8})",
            r"OTP[:\s]*(\d{4,8})",
            r"verification\s*code[:\s]*(\d{4,8})",
            r"(\d{4,8})\s*(?:è|e')\s*il\s*tuo\s*codice",
            r"il\s*tuo\s*codice\s*(?:è|e')\s*(\d{4,8})",
            r"login\s*code[:\s]*(\d{4,8})",
            r"(\d{4,8})\s+is\s+your\s+code",
            r"your\s+code\s+is\s+(\d{4,8})",
        ]

    def extract_code(self, text: str) -> Optional[str]:
        for pattern in self._code_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1)
        return None

    async def check_sms(self) -> Optional[dict]:
        try:
            notifications = await self.adb.get_notifications()
            for notif in notifications:
                pkg = notif.get("package", "")
                if "com.google.android.apps.messaging" not in pkg and "com.android.mms" not in pkg:
                    continue

                msg_id = notif.get("key", notif.get("ticker", ""))
                if msg_id in self._last_sms_ids:
                    continue

                text = notif.get("text", "") or notif.get("ticker", "")
                if not text:
                    continue

                self._last_sms_ids.add(msg_id)
                code = self.extract_code(text)
                if code:
                    logger.info(f"SMS 2FA rilevato: codice {code} da {notif.get('title', '')}")
                    return {
                        "code": code,
                        "full_text": text,
                        "sender": notif.get("title", ""),
                        "package": pkg,
                    }
        except Exception as e:
            logger.debug(f"Controllo SMS fallito: {e}")
        return None

    async def wait_for_code(self, timeout: float = 120.0) -> Optional[str]:
        start = asyncio.get_event_loop().time()
        while asyncio.get_event_loop().time() - start < timeout:
            result = await self.check_sms()
            if result and result["code"]:
                if self.on_code:
                    await self.on_code(result["code"])
                return result["code"]
            await asyncio.sleep(2.0)
        logger.warning(f"SMS 2FA: timeout {timeout}s senza ricevere codice.")
        return None

    async def _poll_loop(self):
        while self._running:
            result = await self.check_sms()
            if result and self.on_code:
                await self.on_code(result["code"])
            await asyncio.sleep(2.0)

    async def start(self):
        self._running = True
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("SMSInterceptor avviato.")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("SMSInterceptor fermato.")
