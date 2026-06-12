from __future__ import annotations

from src.adapters.base import PlatformAdapter

import asyncio
import logging
import random
from typing import Optional

logger = logging.getLogger(__name__)


class TikTokAdapter(PlatformAdapter):
    async def login(self, username: str, password: str) -> bool:
        try:
            await self.page.goto("https://www.tiktok.com/login", wait_until="domcontentloaded")
            await asyncio.sleep(random.uniform(2.0, 4.0))
            login_options = self.page.locator(
                '[class*="login-option"], [class*="login-button"], button:has-text("Use phone / email")'
            )
            if await login_options.count() > 0:
                await login_options.first.click()
                await asyncio.sleep(random.uniform(1.0, 2.5))
            email_input = self.page.locator('input[name="username"], input[type="text"][placeholder*="email"]')
            if await email_input.is_visible(timeout=5000):
                await email_input.click()
                for char in username:
                    await self.page.keyboard.press(char)
                    await asyncio.sleep(random.uniform(0.05, 0.12))
                await self.page.keyboard.press("Tab")
                await asyncio.sleep(random.uniform(0.3, 0.8))
                for char in password:
                    await self.page.keyboard.press(char)
                    await asyncio.sleep(random.uniform(0.05, 0.12))
                await self.page.keyboard.press("Enter")
                await asyncio.sleep(random.uniform(3.0, 6.0))
            return True
        except Exception as e:
            logger.error(f"TikTok login fallito: {e}")
            return False

    async def scroll_feed(self, duration_seconds: int) -> None:
        elapsed = 0
        while elapsed < duration_seconds:
            await self.page.evaluate("window.scrollBy(0, 800)")
            await asyncio.sleep(random.uniform(2.0, 5.0))
            elapsed += 3.5
            if random.random() < 0.2:
                await asyncio.sleep(random.uniform(5.0, 10.0))

    async def like_current_post(self) -> bool:
        try:
            like_btn = self.page.locator(
                '[data-e2e="like-icon"], [class*="likeButton"], '
                'span[class*="like"], button[class*="LikeBtn"]'
            ).first
            if await like_btn.is_visible(timeout=3000):
                await like_btn.click(delay=random.uniform(50, 200))
                return True
        except Exception:
            pass
        return False

    async def view_comments(self) -> None:
        try:
            comment_btn = self.page.locator(
                '[data-e2e="comment-icon"], [class*="commentButton"], '
                'span[class*="comment"]'
            ).first
            if await comment_btn.is_visible(timeout=3000):
                await comment_btn.click()
                await asyncio.sleep(random.uniform(2.0, 4.0))
                for _ in range(random.randint(2, 5)):
                    await self.page.evaluate("window.scrollBy(0, 400)")
                    await asyncio.sleep(random.uniform(1.0, 2.5))
                await self.page.keyboard.press("Escape")
                await asyncio.sleep(random.uniform(0.5, 1.0))
        except Exception:
            pass

    async def search(self, query: str) -> None:
        try:
            search_btn = self.page.locator('[data-e2e="search-icon"], [class*="searchIcon"]').first
            if await search_btn.is_visible(timeout=3000):
                await search_btn.click()
                await asyncio.sleep(random.uniform(0.5, 1.5))
            search_input = self.page.locator(
                'input[data-e2e="search-input"], input[placeholder*="Search"], '
                'input[aria-label*="Search"]'
            ).first
            if await search_input.is_visible(timeout=3000):
                await search_input.click()
                await asyncio.sleep(random.uniform(0.3, 0.6))
                for char in query:
                    await self.page.keyboard.press(char)
                    await asyncio.sleep(random.uniform(0.05, 0.12))
                await self.page.keyboard.press("Enter")
                await asyncio.sleep(random.uniform(3.0, 5.0))
        except Exception as e:
            logger.error(f"TikTok search fallita: {e}")

    async def view_profile(self, username: str) -> None:
        url = f"https://www.tiktok.com/@{username}"
        await self.safe_navigate(url)
        if random.random() < 0.3:
            try:
                videos = await self.page.locator('[data-e2e="user-post-item"]').all()
                if videos:
                    target = random.choice(videos[:min(len(videos), 6)])
                    await target.click()
                    await asyncio.sleep(random.uniform(5.0, 12.0))
            except Exception:
                pass

    async def detect_block(self) -> Optional[str]:
        page_text = await self.page.inner_text("body")
        if "captcha" in page_text.lower() or "arkose" in page_text.lower():
            return "captcha"
        if "unusual" in page_text.lower() and "activity" in page_text.lower():
            return "rate_limited"
        return None

    async def is_logged_in(self) -> bool:
        try:
            avatar = self.page.locator('[data-e2e="user-avatar"], [class*="avatar"]').first
            return await avatar.is_visible(timeout=3000)
        except Exception:
            return False
