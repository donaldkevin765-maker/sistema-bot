from __future__ import annotations

import asyncio
import json
import logging
import os
import random
from pathlib import Path
from typing import Optional

from playwright.async_api import Browser, BrowserContext, Page, async_playwright

from src.browser.stealth_amplified import build_full_stealth_script
from src.browser.http_cache import HttpCacheManager

logger = logging.getLogger(__name__)

PROFILES_DIR = Path(os.getenv("BOT_PROFILES_DIR", "data/profiles"))


class BotDriver:
    def __init__(self, bot_id: int, browser: Browser):
        self.bot_id = bot_id
        self._browser = browser
        self._context: Optional[BrowserContext] = None
        self._page: Optional[Page] = None
        self._profile_dir = PROFILES_DIR / f"bot_{bot_id}"
        self._profile_dir.mkdir(parents=True, exist_ok=True)
        self._cache = HttpCacheManager()

    def _get_profile_path(self, filename: str) -> Path:
        return self._profile_dir / filename

    async def load_cookies(self) -> list[dict]:
        path = self._get_profile_path("cookies.json")
        if path.exists():
            try:
                with open(path) as f:
                    return json.load(f)
            except Exception:
                pass
        return []

    async def save_cookies(self, cookies: list[dict]) -> None:
        path = self._get_profile_path("cookies.json")
        try:
            with open(path, "w") as f:
                json.dump(cookies, f, indent=2)
        except Exception as e:
            logger.error(f"Salvataggio cookies bot {self.bot_id}: {e}")

    async def load_storage(self) -> dict:
        path = self._get_profile_path("storage.json")
        if path.exists():
            try:
                with open(path) as f:
                    return json.load(f)
            except Exception:
                pass
        return {"localStorage": {}, "sessionStorage": {}}

    async def save_storage(self, storage: dict) -> None:
        path = self._get_profile_path("storage.json")
        try:
            with open(path, "w") as f:
                json.dump(storage, f, indent=2)
        except Exception as e:
            logger.error(f"Salvataggio storage bot {self.bot_id}: {e}")

    async def create_context(
        self,
        user_agent: str,
        viewport: dict,
        canvas_seed: str,
        timezone: str = "Europe/Rome",
        locale: str = "it-IT",
    ) -> BrowserContext:
        cache_dir = self._cache.get_cache_dir(self.bot_id)

        self._context = await self._browser.new_context(
            user_agent=user_agent,
            viewport=viewport,
            timezone_id=timezone,
            locale=locale,
            is_mobile=True,
            has_touch=True,
            device_scale_factor=random.choice([2.0, 2.0, 2.0, 2.25, 2.5]),
        )

        script = build_full_stealth_script(str(canvas_seed), self.bot_id)
        await self._context.add_init_script(script)

        cookies = await self.load_cookies()
        if cookies:
            try:
                await self._context.add_cookies(cookies)
            except Exception:
                pass

        return self._context

    async def create_page(self) -> Page:
        if not self._context:
            raise RuntimeError("Context non creato. Chiama create_context prima.")
        self._page = await self._context.new_page()

        storage = await self.load_storage()
        if storage.get("localStorage"):
            try:
                await self._page.goto("about:blank")
                for k, v in storage["localStorage"].items():
                    await self._page.evaluate(
                        f"localStorage.setItem('{k}', '{v}')"
                    )
            except Exception:
                pass
        if storage.get("sessionStorage"):
            try:
                for k, v in storage["sessionStorage"].items():
                    await self._page.evaluate(
                        f"sessionStorage.setItem('{k}', '{v}')"
                    )
            except Exception:
                pass

        return self._page

    async def persist_state(self) -> None:
        if not self._context:
            return
        try:
            cookies = await self._context.cookies()
            await self.save_cookies(cookies)
        except Exception:
            pass
        if self._page:
            try:
                ls = await self._page.evaluate("JSON.stringify(localStorage)")
                ss = await self._page.evaluate("JSON.stringify(sessionStorage)")
                await self.save_storage({
                    "localStorage": json.loads(ls),
                    "sessionStorage": json.loads(ss),
                })
            except Exception:
                pass

    async def close(self) -> None:
        await self.persist_state()
        if self._context:
            await self._context.close()
        self._context = None
        self._page = None

    @property
    def page(self) -> Optional[Page]:
        return self._page

    @property
    def context(self) -> Optional[BrowserContext]:
        return self._context

    async def screenshot(self, path: Optional[str] = None) -> Optional[bytes]:
        if self._page:
            dest = path or str(self._get_profile_path("screenshot.png"))
            return await self._page.screenshot(path=dest, full_page=False)
        return None

    def get_profile_size_mb(self) -> float:
        total = 0
        for f in self._profile_dir.iterdir():
            if f.is_file():
                total += f.stat().st_size
        return total / (1024 * 1024)
