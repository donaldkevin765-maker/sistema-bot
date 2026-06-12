from __future__ import annotations

import asyncio
import logging
import random
from abc import ABC, abstractmethod
from typing import Optional

from playwright.async_api import Page

logger = logging.getLogger(__name__)


class PlatformAdapter(ABC):
    def __init__(self, page: Page, bot_id: int):
        self.page = page
        self.bot_id = bot_id

    @abstractmethod
    async def login(self, username: str, password: str) -> bool:
        ...

    @abstractmethod
    async def scroll_feed(self, duration_seconds: int) -> None:
        ...

    @abstractmethod
    async def like_current_post(self) -> bool:
        ...

    @abstractmethod
    async def view_comments(self) -> None:
        ...

    @abstractmethod
    async def search(self, query: str) -> None:
        ...

    @abstractmethod
    async def view_profile(self, username: str) -> None:
        ...

    async def is_logged_in(self) -> bool:
        return False

    async def logout(self) -> None:
        pass

    async def detect_block(self) -> Optional[str]:
        return None

    async def handle_block(self, block_type: str) -> bool:
        logger.warning(f"Bot {self.bot_id}: blocco {block_type} su {self.__class__.__name__}")
        return False

    async def safe_navigate(self, url: str, timeout: float = 30.0) -> bool:
        try:
            await self.page.goto(url, wait_until="domcontentloaded", timeout=int(timeout * 1000))
            await asyncio.sleep(random.uniform(1.0, 3.0))
            return True
        except Exception as e:
            logger.error(f"Navigazione fallita: {e}")
            return False
