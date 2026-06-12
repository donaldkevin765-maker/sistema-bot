from __future__ import annotations

import asyncio
import logging
import random
from typing import Optional

from playwright.async_api import Page

logger = logging.getLogger(__name__)


NEWS_SITES = [
    "https://www.ansa.it",
    "https://www.corriere.it",
    "https://www.repubblica.it",
    "https://www.ilsole24ore.com",
    "https://www.lastampa.it",
    "https://www.huffingtonpost.it",
    "https://www.fanpage.it",
    "https://tg24.sky.it",
    "https://www.bbc.com/news",
    "https://www.theguardian.com/international",
]

SEARCH_QUERIES = [
    "meteo domani",
    "notizie italia oggi",
    "partite serie a oggi",
    "previsioni meteo weekend",
    "offerte lavoro milano",
    "oroscopo oggi",
    "ricette facili cena",
    "film stasera tv",
    "saldi primavera 2026",
    "come si fa la carbonara",
    "tasse scadenze 2026",
    "concorsi pubblici 2026",
    "mutuo tassi oggi",
    "bollette luce gas",
    "smart working news",
    "europa league risultati",
    "sconti amazon oggi",
    "vacanze mare 2026",
    "canzone più ascoltata 2026",
]


class ShadowPrewarmer:
    def __init__(self, seed: int = 0):
        self._rng = random.Random(seed)
        self._visited: set[str] = set()

    async def random_search(self, page: Page, query: Optional[str] = None) -> str:
        query = query or self._rng.choice(SEARCH_QUERIES)

        try:
            await page.goto("https://www.google.com", wait_until="domcontentloaded")

            # Handle cookie consent
            try:
                accept_btn = page.locator("button:has-text('Accetta tutto'), button:has-text('I agree'), button:has-text('Accept all')")
                if await accept_btn.count() > 0:
                    await accept_btn.first.click()
                    await asyncio.sleep(self._rng.uniform(1.0, 2.5))
            except Exception:
                pass

            search_box = page.locator("textarea[name='q']")
            await search_box.click()
            await asyncio.sleep(self._rng.uniform(0.3, 0.8))

            for char in query:
                await page.keyboard.press(char)
                await asyncio.sleep(self._rng.uniform(0.05, 0.15))

            await asyncio.sleep(self._rng.uniform(0.3, 0.8))
            await page.keyboard.press("Enter")
            await page.wait_for_load_state("domcontentloaded")
            await asyncio.sleep(self._rng.uniform(1.0, 3.0))

            results = await page.locator("a[href^='https://']").all()
            if results:
                click_idx = self._rng.randint(0, min(len(results) - 1, 3))
                try:
                    link = results[click_idx]
                    href = await link.get_attribute("href")
                    if href:
                        await asyncio.sleep(self._rng.uniform(1.0, 3.0))
                        await link.click()
                        await page.wait_for_load_state("domcontentloaded")
                        await asyncio.sleep(self._rng.uniform(8.0, 20.0))
                        self._visited.add(href)
                except Exception:
                    pass

            return query
        except Exception as e:
            logger.debug(f"ShadowPrewarm ricerca fallita: {e}")
            return query

    async def visit_news_site(self, page: Page, url: Optional[str] = None) -> str:
        url = url or self._rng.choice(NEWS_SITES)
        if url in self._visited:
            return url

        try:
            await page.goto(url, wait_until="domcontentloaded")
            await asyncio.sleep(self._rng.uniform(5.0, 12.0))

            if self._rng.random() < 0.4:
                articles = await page.locator("a[href*='/notizie/'], a[href*='/news/'], a[href*='/articolo/']").all()
                if articles:
                    target = self._rng.choice(articles)
                    try:
                        await target.click()
                        await page.wait_for_load_state("domcontentloaded")
                        await asyncio.sleep(self._rng.uniform(10.0, 30.0))
                    except Exception:
                        pass

            self._visited.add(url)
        except Exception as e:
            logger.debug(f"ShadowPrewarm news fallito: {e}")

        return url

    async def prewarm_session(self, page: Page) -> dict:
        result = {"searches": [], "news_visits": [], "total_time": 0}
        start = asyncio.get_event_loop().time()

        num_searches = self._rng.randint(1, 3)
        for i in range(num_searches):
            query = self._rng.choice(SEARCH_QUERIES)
            await self.random_search(page, query)
            result["searches"].append(query)
            await asyncio.sleep(self._rng.uniform(2.0, 5.0))

        num_news = self._rng.randint(0, 2)
        if num_news > 0:
            for i in range(num_news):
                site = self._rng.choice(NEWS_SITES)
                await self.visit_news_site(page, site)
                result["news_visits"].append(site)
                await asyncio.sleep(self._rng.uniform(3.0, 8.0))

        result["total_time"] = asyncio.get_event_loop().time() - start
        logger.info(f"ShadowPrewarm: {num_searches} ricerche, {num_news} news in {result['total_time']:.0f}s")
        return result
