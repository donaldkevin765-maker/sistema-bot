from __future__ import annotations

import asyncio
import random
from typing import Optional

from playwright.async_api import Page


COOKIE_SELECTORS = [
    "button:has-text('Accetta')",
    "button:has-text('Accept')",
    "button:has-text('Allow')",
    "button:has-text('Consenti')",
    "button:has-text('Accetta tutto')",
    "button:has-text('Accept all')",
]

NOT_NOW_SELECTORS = [
    "button:has-text('Non ora')",
    "button:has-text('Not Now')",
    "button:has-text('Salta')",
    "button:has-text('Skip')",
    "button:has-text('Annulla')",
    "button:has-text('Cancel')",
    "div[role='button']:has-text('Non ora')",
    "div[role='button']:has-text('Not Now')",
]

SEARCH_ICON_SELECTORS = [
    'svg[aria-label="Search"]',
    'svg[aria-label="Cerca"]',
    'svg[aria-label="Cerca foto"]',
]

SEARCH_INPUT_SELECTORS = [
    'input[placeholder*="Search"]',
    'input[aria-label*="Search"]',
    'input[placeholder*="Cerca"]',
    'input[aria-label*="Cerca"]',
]

POST_LINK_SELECTORS = [
    "article a[href*='/p/']",
    "article a[href*='/reel/']",
    "div[class*='_aagv'] a",
    "a[href*='/p/']",
]


async def handle_cookie_consent(page: Page) -> bool:
    for selector in COOKIE_SELECTORS:
        try:
            btn = page.locator(selector)
            if await btn.count() > 0 and await btn.first.is_visible(timeout=2000):
                await btn.first.click()
                return True
        except Exception:
            continue
    return False


async def dismiss_popups(page: Page) -> None:
    for selector in NOT_NOW_SELECTORS:
        try:
            btn = page.locator(selector)
            if await btn.count() > 0 and await btn.first.is_visible(timeout=1500):
                await btn.first.click()
                await asyncio.sleep(random.uniform(0.5, 1.5))
                return
        except Exception:
            continue


async def search_instagram(page: Page, hashtag: str, seed: int = 0) -> None:
    rng = random.Random(seed) if seed else random
    await page.goto("https://www.instagram.com/", wait_until="domcontentloaded")
    await asyncio.sleep(rng.uniform(2.0, 4.0))
    await handle_cookie_consent(page)
    await asyncio.sleep(rng.uniform(1.0, 2.0))
    await dismiss_popups(page)

    search_icon = None
    for selector in SEARCH_ICON_SELECTORS:
        try:
            el = page.locator(selector).first
            if await el.is_visible(timeout=2000):
                search_icon = el
                break
        except Exception:
            continue
    if search_icon:
        await search_icon.click()
        await asyncio.sleep(rng.uniform(1.0, 2.0))

    search_input = None
    for selector in SEARCH_INPUT_SELECTORS:
        try:
            el = page.locator(selector).first
            if await el.is_visible(timeout=2000):
                search_input = el
                break
        except Exception:
            continue
    if not search_input:
        return
    await search_input.click()
    await asyncio.sleep(rng.uniform(0.3, 0.8))
    for char in hashtag:
        await page.keyboard.press(char)
        await asyncio.sleep(rng.uniform(0.06, 0.18))
    await asyncio.sleep(rng.uniform(1.0, 2.0))
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(rng.uniform(2.0, 4.0))


async def click_post(page: Page, result_index: int = 0) -> bool:
    for selector in POST_LINK_SELECTORS:
        try:
            posts = await page.locator(selector).all()
            if posts:
                idx = min(result_index, len(posts) - 1)
                target = posts[idx]
                await target.click()
                await page.wait_for_load_state("domcontentloaded")
                await asyncio.sleep(random.uniform(1.5, 3.0))
                return True
        except Exception:
            continue
    return False


async def browse_instagram(
    page: Page,
    min_seconds: int = 30,
    max_seconds: int = 90,
    seed: int = 0,
) -> dict:
    rng = random.Random(seed) if seed else random
    total_time = rng.randint(min_seconds, max_seconds)
    elapsed = 0
    while elapsed < total_time:
        await asyncio.sleep(rng.uniform(3.0, 7.0))
        elapsed += 5
        await page.evaluate(f"window.scrollBy(0, {rng.randint(400, 800)})")
        if rng.random() < 0.15:
            try:
                like_btn = page.locator(
                    'svg[aria-label="Like"], svg[aria-label="Mi piace"]'
                ).first
                if await like_btn.is_visible(timeout=1000):
                    await like_btn.click()
            except Exception:
                pass
    return {"browse_seconds": total_time}


async def instagram_warm(
    page: Page,
    hashtag: str,
    seed: int = 0,
    watch_time_range: tuple[int, int] = (30, 90),
) -> dict:
    result = {"hashtag": hashtag, "seed": seed, "steps": [], "status": "ok"}
    try:
        await search_instagram(page, hashtag, seed=seed)
        result["steps"].append("search")

        result_index = random.Random(seed + 1).randint(0, 2)
        clicked = await click_post(page, result_index=result_index)
        if not clicked:
            result["status"] = "no_post_found"
            return result
        result["steps"].append(f"click_post_{result_index}")

        browse = await browse_instagram(
            page,
            min_seconds=watch_time_range[0],
            max_seconds=watch_time_range[1],
            seed=seed + 2,
        )
        result["steps"].append("browse")
        result["browse_stats"] = browse
    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)
    return result
