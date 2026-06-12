from __future__ import annotations

import asyncio
import random
from typing import Optional

from playwright.async_api import Page

TIKTOK_COOKIE_SELECTORS = [
    "button:has-text('Accetta')",
    "button:has-text('Accept')",
    "button:has-text('Allow')",
    "button:has-text('Consenti')",
    '[data-e2e="cookie-banner-accept"]',
]

SEARCH_ICON_SELECTORS = [
    '[data-e2e="search-icon"]',
    '[class*="searchIcon"]',
    'svg[aria-label="Search"]',
    'svg[aria-label="Cerca"]',
]

SEARCH_INPUT_SELECTORS = [
    'input[data-e2e="search-input"]',
    'input[placeholder*="Search"]',
    'input[aria-label*="Search"]',
    'input[placeholder*="Cerca"]',
    'input[aria-label*="Cerca"]',
]

VIDEO_SELECTORS = [
    '[data-e2e="user-post-item"]',
    '[data-e2e="video-card"]',
    '[class*="video-feed"] a',
    '[class*="VideoItem"] a',
]

LIKE_BUTTON_SELECTORS = [
    '[data-e2e="like-icon"]',
    '[class*="likeButton"]',
    'span[class*="like"]',
    'button[class*="LikeBtn"]',
]

FOLLOW_BUTTON_SELECTORS = [
    '[data-e2e="follow-button"]',
    'button:has-text("Follow")',
    'button:has-text("Segui")',
]


async def handle_cookie_consent(page: Page) -> bool:
    for selector in TIKTOK_COOKIE_SELECTORS:
        try:
            btn = page.locator(selector)
            if await btn.count() > 0 and await btn.first.is_visible(timeout=2000):
                await btn.first.click()
                return True
        except Exception:
            continue
    return False


async def search_tiktok(page: Page, hashtag: str, seed: int = 0) -> None:
    rng = random.Random(seed) if seed else random
    await page.goto("https://www.tiktok.com/foryou", wait_until="domcontentloaded")
    await asyncio.sleep(rng.uniform(2.0, 4.0))
    await handle_cookie_consent(page)
    await asyncio.sleep(rng.uniform(1.0, 2.5))

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
    await asyncio.sleep(rng.uniform(0.5, 1.2))
    await page.keyboard.press("Enter")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(rng.uniform(2.0, 4.0))


async def click_video(page: Page, result_index: int = 0) -> bool:
    for selector in VIDEO_SELECTORS:
        try:
            videos = await page.locator(selector).all()
            if videos:
                idx = min(result_index, len(videos) - 1)
                target = videos[idx]
                await target.click()
                await page.wait_for_load_state("domcontentloaded")
                await asyncio.sleep(random.uniform(1.0, 2.0))
                return True
        except Exception:
            continue
    return False


async def watch_tiktok_video(
    page: Page,
    min_seconds: int = 60,
    max_seconds: int = 180,
    seed: int = 0,
) -> dict:
    rng = random.Random(seed) if seed else random
    total_watch = rng.randint(min_seconds, max_seconds)
    elapsed = 0
    while elapsed < total_watch:
        await asyncio.sleep(rng.uniform(2.0, 5.0))
        elapsed += 3.5
        if rng.random() < 0.1:
            try:
                like_btn = page.locator('[data-e2e="like-icon"]').first
                if await like_btn.is_visible(timeout=1000):
                    await like_btn.click()
            except Exception:
                pass
    return {"watch_seconds": total_watch}


async def tiktok_warm(
    page: Page,
    hashtag: str,
    seed: int = 0,
    watch_time_range: tuple[int, int] = (60, 180),
) -> dict:
    result = {"hashtag": hashtag, "seed": seed, "steps": [], "status": "ok"}
    try:
        await search_tiktok(page, hashtag, seed=seed)
        result["steps"].append("search")

        result_index = random.Random(seed + 1).randint(0, 2)
        clicked = await click_video(page, result_index=result_index)
        if not clicked:
            result["status"] = "no_video_found"
            return result
        result["steps"].append(f"click_result_{result_index}")

        watch = await watch_tiktok_video(
            page,
            min_seconds=watch_time_range[0],
            max_seconds=watch_time_range[1],
            seed=seed + 2,
        )
        result["steps"].append("watch")
        result["watch_stats"] = watch
    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)
    return result
