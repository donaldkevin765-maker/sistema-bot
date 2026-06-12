from __future__ import annotations

import asyncio
import logging
import random
from typing import Optional

from playwright.async_api import Page

logger = logging.getLogger(__name__)


class MicroDistraction:
    def __init__(self, probability: float = 0.08, min_pause: float = 5.0, max_pause: float = 8.0):
        self.probability = probability
        self.min_pause = min_pause
        self.max_pause = max_pause
        self._original_scroll_y: Optional[int] = None

    async def maybe_distract(self, page: Page, seed: int = 0) -> bool:
        rng = random.Random(seed)
        if rng.random() > self.probability:
            return False

        pause = rng.uniform(self.min_pause, self.max_pause)
        try:
            self._original_scroll_y = await page.evaluate("window.scrollY")
        except Exception:
            self._original_scroll_y = None

        logger.debug(f"Micro-distrazione: pausa di {pause:.1f}s")
        await asyncio.sleep(pause)

        try:
            if self._original_scroll_y is not None:
                current_y = await page.evaluate("window.scrollY")
                if current_y != self._original_scroll_y:
                    await page.evaluate(f"window.scrollTo(0, {self._original_scroll_y})")
        except Exception:
            pass

        return True

    async def check_video_pause(self, page: Page) -> bool:
        try:
            was_playing = await page.evaluate("""
                () => {
                    const video = document.querySelector('video');
                    if (!video) return true;
                    return !video.paused;
                }
            """)
            return was_playing
        except Exception:
            return True
