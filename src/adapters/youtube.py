from __future__ import annotations

import asyncio
import logging
import random
from typing import Optional

from src.adapters.base import PlatformAdapter

logger = logging.getLogger(__name__)


class YouTubeAdapter(PlatformAdapter):
    async def login(self, username: str, password: str) -> bool:
        try:
            await self.page.goto("https://accounts.google.com/signin", wait_until="domcontentloaded")
            await asyncio.sleep(random.uniform(2.0, 4.0))

            email_input = self.page.locator("input[type='email']")
            await email_input.wait_for(timeout=10000)
            await email_input.click()
            await asyncio.sleep(random.uniform(0.3, 0.8))
            for char in username:
                await self.page.keyboard.press(char)
                await asyncio.sleep(random.uniform(0.05, 0.15))
            await self.page.keyboard.press("Enter")
            await asyncio.sleep(random.uniform(2.0, 5.0))

            password_input = self.page.locator("input[type='password']")
            try:
                await password_input.wait_for(timeout=15000)
                await password_input.click()
                await asyncio.sleep(random.uniform(0.3, 0.8))
                for char in password:
                    await self.page.keyboard.press(char)
                    await asyncio.sleep(random.uniform(0.05, 0.15))
                await self.page.keyboard.press("Enter")
                await asyncio.sleep(random.uniform(3.0, 6.0))
            except Exception:
                logger.info(f"YouTube login: campo password non trovato (possibile 2FA o già loggato)")

            challenge = self.page.locator("input[type='tel'], #captcha, [aria-label*='Verify']")
            if await challenge.is_visible(timeout=3000):
                logger.warning(f"YouTube login: challenge di verifica rilevata per bot {self.bot_id}")
                return False

            return True
        except Exception as e:
            logger.error(f"YouTube login fallito: {e}")
            return False

    async def scroll_feed(self, duration_seconds: int) -> None:
        elapsed = 0
        while elapsed < duration_seconds:
            scroll = random.randint(400, 900)
            await self.page.evaluate(f"window.scrollBy(0, {scroll})")
            await asyncio.sleep(random.uniform(1.5, 3.5))
            elapsed += 2.5
            if random.random() < 0.15:
                await asyncio.sleep(random.uniform(3.0, 8.0))

    async def like_current_post(self) -> bool:
        try:
            like_btn = self.page.locator(
                'button[aria-label*="Like"], button[aria-label*="like"], '
                '#top-level-buttons-computed button[aria-label*="Like"]'
            ).first
            if await like_btn.is_visible(timeout=3000):
                await like_btn.click(delay=random.uniform(50, 150))
                return True
        except Exception:
            pass
        return False

    async def view_comments(self) -> None:
        try:
            await self.page.evaluate("window.scrollTo(0, document.querySelector('#comments').offsetTop)")
            await asyncio.sleep(random.uniform(2.0, 4.0))
            for _ in range(random.randint(2, 4)):
                await self.page.evaluate("window.scrollBy(0, 400)")
                await asyncio.sleep(random.uniform(1.0, 2.5))
        except Exception:
            pass

    async def search(self, query: str) -> None:
        try:
            search_box = self.page.locator("input#search")
            await search_box.click()
            await asyncio.sleep(random.uniform(0.3, 0.8))
            await search_box.fill("")
            for char in query:
                await self.page.keyboard.press(char)
                await asyncio.sleep(random.uniform(0.05, 0.12))
            await self.page.keyboard.press("Enter")
            await self.page.wait_for_load_state("networkidle")
            await asyncio.sleep(random.uniform(2.0, 4.0))
        except Exception as e:
            logger.error(f"YouTube search fallita: {e}")

    async def view_profile(self, username: str) -> None:
        url = f"https://www.youtube.com/@{username}"
        await self.safe_navigate(url)
        if random.random() < 0.4:
            try:
                videos = await self.page.locator("#video-title").all()
                if videos:
                    target = random.choice(videos[:min(len(videos), 5)])
                    await target.click()
                    await asyncio.sleep(random.uniform(3.0, 8.0))
            except Exception:
                pass

    async def is_logged_in(self) -> bool:
        try:
            avatar = self.page.locator("#avatar-btn, button[aria-label*='Account']")
            return await avatar.is_visible(timeout=3000)
        except Exception:
            return False

    async def detect_block(self) -> Optional[str]:
        page_text = await self.page.inner_text("body")
        if "captcha" in page_text.lower() or "unusual traffic" in page_text.lower():
            return "captcha"
        if "sign in" in page_text.lower() and "verify" in page_text.lower():
            return "login_required"
        if "phone" in page_text.lower() and "verify" in page_text.lower():
            return "phone_verify"
        return None
