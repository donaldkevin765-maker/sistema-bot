from __future__ import annotations

import asyncio
import logging
import random
from typing import Optional

from playwright.async_api import Page

logger = logging.getLogger(__name__)


class AccidentalClicker:
    def __init__(self, probability: float = 0.03):
        self.probability = probability

    async def maybe_accidental_click(self, page: Page, seed: int = 0) -> bool:
        rng = random.Random(seed)
        if rng.random() > self.probability:
            return False

        await asyncio.sleep(rng.uniform(0.1, 0.4))

        try:
            accidental_targets = await page.locator(
                "a, button, [role='button'], .ytd-thumbnail, ytd-compact-video-renderer"
            ).all()

            if not accidental_targets:
                return False

            target = rng.choice(accidental_targets)
            await target.click(timeout=2000)
            await asyncio.sleep(rng.uniform(0.3, 0.8))

            await page.keyboard.press("Escape")
            await asyncio.sleep(rng.uniform(0.2, 0.5))

            back_speed_boost = rng.uniform(1.2, 1.8)
            await page.evaluate(f"window.scrollBy(0, {int(-50 * back_speed_boost)})")

            logger.debug("Click accidentale simulato.")
            return True

        except Exception:
            return False

    async def accidental_scroll(self, page: Page, seed: int = 0) -> bool:
        rng = random.Random(seed + 1)
        if rng.random() > self.probability * 0.5:
            return False

        try:
            scroll_by = rng.randint(-200, 200)
            speed = rng.uniform(0.05, 0.15)
            steps = abs(scroll_by) // 10
            for _ in range(min(steps, 20)):
                await page.evaluate(f"window.scrollBy(0, {1 if scroll_by > 0 else -1})")
                await asyncio.sleep(speed)

            await asyncio.sleep(rng.uniform(0.3, 0.8))
            correction = rng.choice([-1, 0, 1]) * rng.randint(10, 40)
            if correction != 0:
                await page.evaluate(f"window.scrollBy(0, {correction})")

            return True
        except Exception:
            return False
