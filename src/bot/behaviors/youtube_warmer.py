from __future__ import annotations

import asyncio
import random
from typing import Optional

from playwright.async_api import Page


YOUTUBE_COOKIE_SELECTORS = [
    "button:has-text('Accetta tutto')",
    "button:has-text('I agree')",
    "button:has-text('Accept all')",
    "button:has-text('Accept')",
    "button:has-text('Rifiuta tutto')",
    "button:has-text('Reject all')",
    "button:has-text('Decline')",
    "button[aria-label='Accept all']",
    "button[aria-label='Accetta tutto']",
    "ytd-button-renderer:has-text('Accetta tutto')",
]

AD_SKIP_SELECTORS = [
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button",
    "button.ytp-skip-ad-button",
    "button.ytp-ad-skip-button",
]

SEARCH_TRIGGER_SELECTORS = [
    "button[aria-label='Cerca']",
    "button[aria-label='Search']",
    "button[title='Cerca']",
    "button[title='Search']",
    "yt-icon-button[aria-label='Cerca']",
]

SEARCH_BOX_SELECTORS = [
    "input#search",
    "input[name='search_query']",
    "input[aria-label='Search']",
    "input[aria-label='Cerca']",
    "#search-input input",
    "#search yt-searchbox input",
    "yt-searchbox input",
    "div#search-input input",
]

VIDEO_TITLE_SELECTORS = [
    "ytd-video-renderer #video-title",
    "ytd-video-renderer a#video-title",
    "a#video-title",
    "#video-title",
    "ytd-video-renderer",
    "ytd-item-section-renderer a",
    "a.media-item-extra-endpoint",
    "a[class*='media-item']",
]

COMMENT_SCROLL_SELECTORS = [
    "#comments",
    "ytd-comments",
    "#comment-section",
]


async def handle_cookie_consent(page: Page) -> bool:
    for selector in YOUTUBE_COOKIE_SELECTORS:
        try:
            btn = page.locator(selector)
            if await btn.count() > 0 and await btn.first.is_visible(timeout=2000):
                await btn.first.click()
                return True
        except Exception:
            continue
    return False


async def search_youtube(page: Page, keyword: str, seed: int = 0) -> None:
    rng = random.Random(seed) if seed else random

    search_url = f"https://www.youtube.com/results?search_query={keyword.replace(' ', '+')}"
    await page.goto(search_url, wait_until="domcontentloaded")
    await asyncio.sleep(rng.uniform(2.0, 4.5))

    await handle_cookie_consent(page)
    await asyncio.sleep(rng.uniform(1.0, 2.0))


async def click_video(page: Page, result_index: int = 0) -> bool:
    for _ in range(3):
        try:
            await page.wait_for_selector("a[href*='/watch?v=']", timeout=8000)
            break
        except Exception:
            await asyncio.sleep(2)
    await asyncio.sleep(1.0)

    videos = await page.evaluate(f'''() => {{
        const links = Array.from(document.querySelectorAll('a[href*="/watch?v="]'));
        const filtered = links.filter(a => a.offsetParent !== null);
        return filtered.slice({result_index}, {result_index + 1}).map(a => ({{
            href: a.href,
            text: a.textContent.trim().slice(0,40),
        }}));
    }}''')
    if videos:
        try:
            await page.goto(videos[0]['href'], wait_until='domcontentloaded')
            return True
        except Exception:
            pass

    for selector in VIDEO_TITLE_SELECTORS:
        try:
            video_links = await page.locator(selector).all()
            if video_links:
                idx = min(result_index, len(video_links) - 1)
                try:
                    await video_links[idx].scroll_into_view_if_needed()
                    await asyncio.sleep(0.5)
                except Exception:
                    pass
                await video_links[idx].click()
                await page.wait_for_load_state("domcontentloaded")
                return True
        except Exception:
            continue
    return False


async def skip_ad_if_present(page: Page) -> bool:
    for selector in AD_SKIP_SELECTORS:
        try:
            btn = page.locator(selector)
            if await btn.is_visible(timeout=1000):
                delay = random.uniform(1.8, 4.2)
                await asyncio.sleep(delay)
                await btn.click()
                return True
        except Exception:
            continue
    return False


async def watch_video(
    page: Page,
    min_seconds: int = 120,
    max_seconds: int = 240,
    seed: int = 0,
) -> dict:
    rng = random.Random(seed) if seed else random
    total_watch_time = rng.randint(min_seconds, max_seconds)
    elapsed = 0

    await asyncio.sleep(rng.uniform(1.0, 3.0))
    await page.keyboard.press("m")

    while elapsed < total_watch_time:
        await asyncio.sleep(5)
        elapsed += 5

        if await skip_ad_if_present(page):
            pass

        if rng.random() < 0.15:
            scroll_amount = rng.randint(300, 600)
            await page.evaluate(f"window.scrollBy(0, {scroll_amount})")
            await asyncio.sleep(rng.uniform(3.0, 7.0))
            await page.evaluate(f"window.scrollBy(0, -{scroll_amount})")

    await asyncio.sleep(0.1)


async def scroll_to_comments(page: Page) -> None:
    for selector in COMMENT_SCROLL_SELECTORS:
        try:
            section = page.locator(selector)
            if await section.is_visible(timeout=3000):
                await section.scroll_into_view_if_needed()
                return
        except Exception:
            continue

    scroll_amount = random.randint(600, 1200)
    await page.evaluate(f"window.scrollBy(0, {scroll_amount})")


async def youtube_warm(
    page: Page,
    keyword: str,
    seed: int = 0,
    watch_time_range: tuple[int, int] = (120, 240),
) -> dict:
    result = {"keyword": keyword, "seed": seed, "steps": [], "status": "ok"}

    try:
        await search_youtube(page, keyword, seed=seed)
        result["steps"].append("search")

        result_index = random.Random(seed + 1).randint(0, 2)
        clicked = await click_video(page, result_index=result_index)
        if not clicked:
            result["status"] = "no_video_found"
            return result
        result["steps"].append(f"click_result_{result_index}")

        watch_result = await watch_video(
            page,
            min_seconds=watch_time_range[0],
            max_seconds=watch_time_range[1],
            seed=seed + 2,
        )
        result["steps"].append("watch")
        result["watch_stats"] = watch_result

        await scroll_to_comments(page)
        result["steps"].append("scroll_comments")

    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)

    return result
