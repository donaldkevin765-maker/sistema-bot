from __future__ import annotations

import asyncio
import logging
import random
from typing import Optional

from src.adapters.base import PlatformAdapter

logger = logging.getLogger(__name__)


class InstagramAdapter(PlatformAdapter):
    async def login(self, username: str, password: str) -> bool:
        try:
            await self.page.goto("https://www.instagram.com/accounts/login/", wait_until="domcontentloaded")
            await asyncio.sleep(random.uniform(2.0, 4.0))

            try:
                cookie_btn = self.page.locator(
                    "button:has-text('Accetta'), button:has-text('Allow'), button:has-text('Accept')"
                ).first
                if await cookie_btn.is_visible(timeout=3000):
                    await cookie_btn.click()
                    await asyncio.sleep(random.uniform(1.0, 2.0))
            except Exception:
                pass

            username_input = self.page.locator('input[name="username"]')
            await username_input.wait_for(timeout=10000)
            await username_input.click()
            await asyncio.sleep(random.uniform(0.3, 0.8))
            for char in username:
                await self.page.keyboard.press(char)
                await asyncio.sleep(random.uniform(0.05, 0.12))
            await self.page.keyboard.press("Tab")
            await asyncio.sleep(random.uniform(0.3, 0.8))
            for char in password:
                await self.page.keyboard.press(char)
                await asyncio.sleep(random.uniform(0.05, 0.12))
            await self.page.keyboard.press("Enter")
            await asyncio.sleep(random.uniform(4.0, 8.0))

            try:
                not_now = self.page.locator(
                    "button:has-text('Non ora'), button:has-text('Not Now'), button:has-text('Salta')"
                ).first
                if await not_now.is_visible(timeout=5000):
                    await not_now.click()
                    await asyncio.sleep(random.uniform(1.0, 2.0))
            except Exception:
                pass

            return True
        except Exception as e:
            logger.error(f"Instagram login fallito: {e}")
            return False

    async def scroll_feed(self, duration_seconds: int) -> None:
        elapsed = 0
        while elapsed < duration_seconds:
            scroll = random.randint(500, 1000)
            await self.page.evaluate(f"window.scrollBy(0, {scroll})")
            await asyncio.sleep(random.uniform(2.0, 4.0))
            elapsed += 3
            if random.random() < 0.2:
                pause = random.uniform(4.0, 10.0)
                await asyncio.sleep(pause)
                elapsed += pause

    async def like_current_post(self) -> bool:
        try:
            like_btn = self.page.locator(
                'svg[aria-label="Like"], svg[aria-label="Mi piace"], '
                'span[class*="heart"], button[class*="like"]'
            ).first
            if await like_btn.is_visible(timeout=3000):
                await like_btn.click(delay=random.uniform(50, 150))
                await asyncio.sleep(random.uniform(0.5, 1.5))
                return True
        except Exception:
            pass
        return False

    async def view_comments(self) -> None:
        try:
            comment_btn = self.page.locator(
                'svg[aria-label="Comment"], svg[aria-label="Commenti"]'
            ).first
            if await comment_btn.is_visible(timeout=3000):
                await comment_btn.click()
                await asyncio.sleep(random.uniform(2.0, 4.0))
                for _ in range(random.randint(2, 4)):
                    await self.page.evaluate("window.scrollBy(0, 300)")
                    await asyncio.sleep(random.uniform(1.0, 2.5))
                await self.page.keyboard.press("Escape")
                await asyncio.sleep(random.uniform(0.5, 1.0))
        except Exception:
            pass

    async def search(self, query: str) -> None:
        try:
            search_icon = self.page.locator(
                'svg[aria-label="Search"], svg[aria-label="Cerca"]'
            ).first
            if await search_icon.is_visible(timeout=3000):
                await search_icon.click()
                await asyncio.sleep(random.uniform(0.5, 1.5))
            search_input = self.page.locator(
                'input[placeholder*="Search"], input[aria-label*="Search"], '
                'input[placeholder*="Cerca"]'
            ).first
            if await search_input.is_visible(timeout=3000):
                await search_input.click()
                for char in query:
                    await self.page.keyboard.press(char)
                    await asyncio.sleep(random.uniform(0.05, 0.12))
                await asyncio.sleep(random.uniform(2.0, 4.0))
        except Exception as e:
            logger.error(f"Instagram search fallita: {e}")

    async def view_profile(self, username: str) -> None:
        url = f"https://www.instagram.com/{username}/"
        await self.safe_navigate(url)
        await asyncio.sleep(random.uniform(2.0, 4.0))
        scrolls = random.randint(2, 5)
        for _ in range(scrolls):
            await self.page.evaluate("window.scrollBy(0, 600)")
            await asyncio.sleep(random.uniform(1.0, 2.5))

    async def is_logged_in(self) -> bool:
        try:
            profile_icon = self.page.locator(
                'svg[aria-label="Profile"], svg[aria-label="Profilo"]'
            ).first
            return await profile_icon.is_visible(timeout=3000)
        except Exception:
            return False

    async def detect_block(self) -> Optional[str]:
        page_text = await self.page.inner_text("body")
        if "captcha" in page_text.lower() or "Arkose" in page_text:
            return "captcha"
        if "sospesa" in page_text.lower() or "suspended" in page_text.lower():
            return "suspended"
        if "bloccato" in page_text.lower() or "blocked" in page_text.lower():
            return "blocked"
        if "We detected an unusual login attempt" in page_text:
            return "login_attempt"
        return None
