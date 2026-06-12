from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Optional

from playwright.async_api import Page

logger = logging.getLogger(__name__)


class SocialState(Enum):
    SCROLL_FEED = "scroll_feed"
    LIKE_POST = "like_post"
    VIEW_COMMENTS = "view_comments"
    VIEW_PROFILE = "view_profile"
    SEARCH_HASHTAG = "search_hashtag"
    IDLE = "idle"


@dataclass
class StateTransition:
    target: SocialState
    probability: float


@dataclass
class SocialFSMConfig:
    scroll_weight: float = 0.70
    like_weight: float = 0.15
    view_comments_weight: float = 0.10
    view_profile_weight: float = 0.05
    search_hashtag_weight: float = 0.00

    min_scroll_seconds: int = 15
    max_scroll_seconds: int = 45
    min_look_at_post: float = 2.0
    max_look_at_post: float = 12.0
    min_comment_scroll: int = 5
    max_comment_scroll: int = 15
    min_profile_scroll: int = 8
    max_profile_scroll: int = 20
    min_search_scroll: int = 10
    max_search_scroll: int = 25

    idle_chance: float = 0.05
    idle_min_seconds: float = 3.0
    idle_max_seconds: float = 8.0

    def get_weights(self) -> dict[SocialState, float]:
        return {
            SocialState.SCROLL_FEED: self.scroll_weight,
            SocialState.LIKE_POST: self.like_weight,
            SocialState.VIEW_COMMENTS: self.view_comments_weight,
            SocialState.VIEW_PROFILE: self.view_profile_weight,
            SocialState.SEARCH_HASHTAG: self.search_hashtag_weight,
        }

    def update_weights(self, days_since_creation: int) -> None:
        if days_since_creation < 14:
            self.like_weight = 0.02
            self.view_comments_weight = 0.03
            self.view_profile_weight = 0.00
            self.scroll_weight = 0.95
        elif days_since_creation < 28:
            self.like_weight = 0.08
            self.view_comments_weight = 0.05
            self.view_profile_weight = 0.02
            self.scroll_weight = 0.85
        elif days_since_creation < 42:
            self.like_weight = 0.12
            self.view_comments_weight = 0.08
            self.view_profile_weight = 0.04
            self.scroll_weight = 0.76
        else:
            self.like_weight = 0.15
            self.view_comments_weight = 0.10
            self.view_profile_weight = 0.05
            self.scroll_weight = 0.70

    def normalize_weights(self) -> None:
        total = self.scroll_weight + self.like_weight + self.view_comments_weight + self.view_profile_weight + self.search_hashtag_weight
        self.scroll_weight /= total
        self.like_weight /= total
        self.view_comments_weight /= total
        self.view_profile_weight /= total
        self.search_hashtag_weight /= total


class SocialFSM:
    def __init__(
        self,
        page: Page,
        bot_id: int,
        config: Optional[SocialFSMConfig] = None,
        on_like: Optional[Callable] = None,
        on_comment_view: Optional[Callable] = None,
        on_profile_view: Optional[Callable] = None,
        on_search: Optional[Callable] = None,
    ):
        self.page = page
        self.bot_id = bot_id
        self.config = config or SocialFSMConfig()
        self.on_like = on_like
        self.on_comment_view = on_comment_view
        self.on_profile_view = on_profile_view
        self.on_search = on_search
        self._rng = random.Random(bot_id)
        self._current_state: Optional[SocialState] = None
        self._action_count = 0

    def _pick_next_state(self) -> SocialState:
        self.config.normalize_weights()
        weights = self.config.get_weights()
        states = list(weights.keys())
        probs = list(weights.values())
        choice = self._rng.choices(states, weights=probs, k=1)[0]

        if self._rng.random() < self.config.idle_chance:
            return SocialState.IDLE
        return choice

    async def execute_state(self, state: SocialState) -> str:
        self._current_state = state
        self._action_count += 1

        state_map = {
            SocialState.SCROLL_FEED: self._scroll_feed,
            SocialState.LIKE_POST: self._like_post,
            SocialState.VIEW_COMMENTS: self._view_comments,
            SocialState.VIEW_PROFILE: self._view_profile,
            SocialState.SEARCH_HASHTAG: self._search_hashtag,
            SocialState.IDLE: self._idle,
        }

        handler = state_map.get(state)
        if handler:
            await handler()
            return state.value
        return "unknown"

    async def _scroll_feed(self) -> None:
        duration = self._rng.randint(self.config.min_scroll_seconds, self.config.max_scroll_seconds)
        logger.debug(f"Bot {self.bot_id}: scroll feed per {duration}s")
        elapsed = 0
        post_stops = 0

        while elapsed < duration:
            scroll_amount = self._rng.randint(300, 800)
            await self.page.evaluate(f"window.scrollBy(0, {scroll_amount})")
            await asyncio.sleep(self._rng.uniform(1.0, 3.0))
            elapsed += 2

            if self._rng.random() < 0.25 and post_stops < 3:
                pause = self._rng.uniform(self.config.min_look_at_post, self.config.max_look_at_post)
                await asyncio.sleep(pause)
                elapsed += pause
                post_stops += 1

            if self._rng.random() < 0.1:
                back_scroll = self._rng.randint(50, 150)
                await self.page.evaluate(f"window.scrollBy(0, -{back_scroll})")
                await asyncio.sleep(self._rng.uniform(0.3, 0.8))
                elapsed += 0.5

    async def _like_post(self) -> None:
        logger.debug(f"Bot {self.bot_id}: like a un post")
        try:
            like_buttons = await self.page.locator(
                '[aria-label="Like"], [aria-label="Mi piace"], [data-testid="like"], '
                '[aria-label*="like"], button[title*="Like"], .like-button, '
                '[aria-label="like this"], svg[aria-label="like"]'
            ).all()

            if like_buttons:
                target = self._rng.choice(like_buttons)
                await target.click()
                await asyncio.sleep(self._rng.uniform(0.5, 1.5))
                if self.on_like:
                    await self.on_like(self.bot_id)
        except Exception as e:
            logger.debug(f"Like fallito: {e}")

    async def _view_comments(self) -> None:
        logger.debug(f"Bot {self.bot_id}: visualizzazione commenti")
        try:
            comment_buttons = await self.page.locator(
                '[aria-label="Comment"], [aria-label="Commenti"], '
                '[data-testid="comment"], a[href*="/comments/"], '
                'svg[aria-label="comment"], button[aria-label*="comment"]'
            ).all()

            if comment_buttons:
                target = self._rng.choice(comment_buttons)
                await target.click()
                await asyncio.sleep(self._rng.uniform(1.0, 2.5))

                scroll_time = self._rng.randint(
                    self.config.min_comment_scroll,
                    self.config.max_comment_scroll,
                )
                scroll_elapsed = 0
                while scroll_elapsed < scroll_time:
                    await self.page.evaluate("window.scrollBy(0, 400)")
                    await asyncio.sleep(self._rng.uniform(1.5, 3.5))
                    scroll_elapsed += 2

                await self.page.keyboard.press("Escape")
                await asyncio.sleep(self._rng.uniform(0.5, 1.0))
                if self.on_comment_view:
                    await self.on_comment_view(self.bot_id)
        except Exception as e:
            logger.debug(f"View comments fallito: {e}")

    async def _view_profile(self) -> None:
        logger.debug(f"Bot {self.bot_id}: visualizzazione profilo")
        try:
            profile_links = await self.page.locator(
                'a[href*="/user/"], a[href*="/profile/"], '
                'a[href*="/@"], [data-testid="user-avatar"], '
                'a[class*="avatar"], a[class*="profile"]'
            ).all()

            if profile_links:
                target = self._rng.choice(profile_links)
                href = await target.get_attribute("href")
                if href:
                    await self.page.goto(href, wait_until="domcontentloaded")
                    await asyncio.sleep(self._rng.uniform(2.0, 4.0))

                    scroll_time = self._rng.randint(
                        self.config.min_profile_scroll,
                        self.config.max_profile_scroll,
                    )
                    scroll_elapsed = 0
                    while scroll_elapsed < scroll_time:
                        await self.page.evaluate("window.scrollBy(0, 500)")
                        await asyncio.sleep(self._rng.uniform(1.0, 2.5))
                        scroll_elapsed += 1.5

                    await self.page.keyboard.press("Escape")
                    await asyncio.sleep(self._rng.uniform(0.5, 1.0))
                    if self.on_profile_view:
                        await self.on_profile_view(self.bot_id)
        except Exception as e:
            logger.debug(f"View profile fallito: {e}")

    async def _search_hashtag(self) -> None:
        logger.debug(f"Bot {self.bot_id}: ricerca hashtag")
        hashtags = [
            "#foryou", "#fyp", "#trending", "#viral", "#explore",
            "#music", "#art", "#travel", "#food", "#fashion",
            "#nature", "#photography", "#fitness", "#funny", "#love",
        ]
        hashtag = self._rng.choice(hashtags)
        try:
            search_box = await self.page.locator(
                'input[placeholder*="Search"], input[aria-label*="Search"], '
                'input[placeholder*="Cerca"], [data-testid="search-input"]'
            ).first()

            if search_box:
                await search_box.click()
                await asyncio.sleep(self._rng.uniform(0.3, 0.8))
                for char in hashtag:
                    await self.page.keyboard.press(char)
                    await asyncio.sleep(self._rng.uniform(0.05, 0.12))
                await self.page.keyboard.press("Enter")
                await asyncio.sleep(self._rng.uniform(2.0, 4.0))

                scroll_time = self._rng.randint(
                    self.config.min_search_scroll,
                    self.config.max_search_scroll,
                )
                scroll_elapsed = 0
                while scroll_elapsed < scroll_time:
                    await self.page.evaluate("window.scrollBy(0, 400)")
                    await asyncio.sleep(self._rng.uniform(1.0, 2.0))
                    scroll_elapsed += 1.5

                if self.on_search:
                    await self.on_search(self.bot_id, hashtag)
        except Exception as e:
            logger.debug(f"Search hashtag fallito: {e}")

    async def _idle(self) -> None:
        duration = self._rng.uniform(self.config.idle_min_seconds, self.config.idle_max_seconds)
        await asyncio.sleep(duration)

    async def run_cycle(self, days_since_creation: int = 0) -> str:
        self.config.update_weights(days_since_creation)
        state = self._pick_next_state()
        return await self.execute_state(state)

    async def run_session(self, duration_seconds: int = 600, days_since_creation: int = 0) -> dict:
        states_executed = []
        started = asyncio.get_event_loop().time()
        elapsed = 0

        while elapsed < duration_seconds:
            state_name = await self.run_cycle(days_since_creation)
            states_executed.append(state_name)
            elapsed = asyncio.get_event_loop().time() - started

        return {
            "states": states_executed,
            "count": len(states_executed),
            "duration": elapsed,
            "bot_id": self.bot_id,
        }
