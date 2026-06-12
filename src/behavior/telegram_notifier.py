from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

try:
    import telegram
    from telegram.error import TelegramError
except ImportError:
    telegram = None
    TelegramError = Exception

logger = logging.getLogger(__name__)


class TelegramNotifier:
    def __init__(
        self,
        token: Optional[str] = None,
        chat_id: Optional[str] = None,
    ):
        self._token = token or os.getenv("TELEGRAM_BOT_TOKEN", "")
        self._chat_id = chat_id or os.getenv("TELEGRAM_CHAT_ID", "")
        self._bot = None
        self._ready = False

    def connect(self) -> bool:
        if not telegram:
            logger.warning("python-telegram-bot non installato.")
            return False
        if not self._token or not self._chat_id:
            logger.warning("TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID mancanti.")
            return False
        self._bot = telegram.Bot(token=self._token)
        self._ready = True
        return True

    async def send_message(self, text: str) -> bool:
        if not self._ready:
            return False
        try:
            await self._bot.send_message(chat_id=self._chat_id, text=text)
            return True
        except Exception as e:
            logger.error(f"Telegram send_message fallito: {e}")
            return False

    async def send_screenshot_alert(self, bot_id: int, reason: str, screenshot_bytes: Optional[bytes] = None) -> bool:
        if not self._ready:
            return False
        message = (
            f"🚨 BOT #{bot_id} BLOCCATO\n"
            f"Motivo: {reason}\n"
            f"Azione richiesta: risolvi manualmente e digita /continue_{bot_id}"
        )
        try:
            await self._bot.send_message(chat_id=self._chat_id, text=message)
            if screenshot_bytes:
                await self._bot.send_photo(chat_id=self._chat_id, photo=screenshot_bytes)
            return True
        except Exception as e:
            logger.error(f"Telegram alert fallito: {e}")
            return False

    async def send_otp_code(self, bot_id: int, code: str, sender: str = "") -> bool:
        if not self._ready:
            return False
        message = f"📱 Bot #{bot_id} - Codice OTP: {code} da {sender}"
        try:
            await self._bot.send_message(chat_id=self._chat_id, text=message)
            return True
        except:
            return False

    async def send_fleet_report(self, stats: dict) -> bool:
        if not self._ready:
            return False
        message = (
            "📊 REPORT FLOTTA\n"
            f"Bot attivi: {stats.get('attivi', 0)}\n"
            f"Bot in errore: {stats.get('errori', 0)}\n"
            f"Azioni oggi: {stats.get('azioni_oggi', 0)}\n"
            f"IP corrente: {stats.get('ip_corrente', 'N/A')}\n"
            f"Temperatura: {stats.get('temperatura', 'N/A')}°C"
        )
        return await self.send_message(message)

    async def wait_for_command(self, bot_id: int, timeout: float = 300.0) -> Optional[str]:
        if not self._ready:
            return None
        update = None
        start = asyncio.get_event_loop().time()
        last_update_id = 0

        while asyncio.get_event_loop().time() - start < timeout:
            try:
                updates = await self._bot.get_updates(offset=last_update_id + 1, timeout=10)
                for up in updates:
                    if up.message and up.message.text:
                        text = up.message.text.strip().lower()
                        if f"/continue_{bot_id}" in text:
                            return "continue"
                        if text == "/stop":
                            return "stop"
                        if text == "/status":
                            await self.send_message(f"Bot #{bot_id}: in attesa di risoluzione...")
                    last_update_id = up.update_id
            except Exception:
                pass
            await asyncio.sleep(1.0)

        return None

    async def notify_captcha(self, bot_id: int, page) -> bool:
        if not self._ready:
            return False
        try:
            screenshot_bytes = await page.screenshot(full_page=False)
            return await self.send_screenshot_alert(
                bot_id=bot_id,
                reason="Captcha/Verifica umana rilevata",
                screenshot_bytes=screenshot_bytes,
            )
        except Exception:
            return await self.send_screenshot_alert(bot_id, "Captcha rilevato")

    async def notify_login_block(self, bot_id: int, page) -> bool:
        if not self._ready:
            return False
        try:
            screenshot_bytes = await page.screenshot(full_page=False)
            return await self.send_screenshot_alert(
                bot_id=bot_id,
                reason="Blocco login / 2FA / Verifica",
                screenshot_bytes=screenshot_bytes,
            )
        except Exception:
            return await self.send_screenshot_alert(bot_id, "Blocco login")
