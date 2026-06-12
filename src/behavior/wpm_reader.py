from __future__ import annotations

import asyncio
import logging
import random
import re
from typing import Optional

from playwright.async_page import Page

logger = logging.getLogger(__name__)

DEFAULT_WPM = 225
WPM_VARIANCE = 25
BASE_LOOKUP_TIME = 0.5
LOOKUP_TIME_PER_CHAR = 0.02


class WPMReader:
    def __init__(self, wpm: int = DEFAULT_WPM, variance: int = WPM_VARIANCE, seed: int = 0):
        self.wpm = wpm
        self.variance = variance
        self._rng = random.Random(seed)

    def calculate_reading_time(self, text: str) -> float:
        word_count = len(re.findall(r"\b\w+\b", text))
        if word_count == 0:
            return 0.5

        current_wpm = self.wpm + self._rng.randint(-self.variance, self.variance)
        current_wpm = max(100, min(400, current_wpm))

        reading_time = (word_count / current_wpm) * 60.0

        reading_time += self._rng.uniform(-0.5, 1.0)
        reading_time = max(1.0, reading_time)

        return reading_time

    def calculate_reading_time_for_element(self, element_text: str) -> float:
        return self.calculate_reading_time(element_text)

    def get_scroll_speed(self, text_length: int) -> float:
        base_speed = self.wpm / 60.0
        variance = self._rng.uniform(0.8, 1.2)
        return base_speed * variance

    async def read_element(self, page: Page, selector: str) -> float:
        try:
            element = page.locator(selector)
            text = await element.inner_text()
            reading_time = self.calculate_reading_time(text)

            word_count = len(re.findall(r'\b\w+\b', text))
            logger.debug(f"WPM: lettura di {word_count} parole in {reading_time:.1f}s")

            await asyncio.sleep(reading_time * self._rng.uniform(0.8, 1.2))

            return reading_time
        except Exception as e:
            logger.debug(f"WPM: errore lettura: {e}")
            await asyncio.sleep(self._rng.uniform(1.0, 3.0))
            return 0.0

    async def scroll_and_read(self, page: Page, selector: str, scroll_selector: str = "body") -> None:
        try:
            elements = await page.locator(selector).all()
            for elem in elements:
                try:
                    text = await elem.inner_text()
                    if not text.strip():
                        continue

                    read_time = self.calculate_reading_time(text)
                    await asyncio.sleep(read_time)

                    elem_box = await elem.bounding_box()
                    if elem_box:
                        scroll_target = elem_box["y"] + elem_box["height"] / 2
                        await page.evaluate(f"window.scrollTo(0, {scroll_target})")
                        await asyncio.sleep(self._rng.uniform(0.3, 0.8))

                except Exception:
                    continue
        except Exception as e:
            logger.debug(f"WPM scroll_and_read: {e}")
