from __future__ import annotations

import asyncio
import logging
import random
from typing import Optional

from src.behavior.social_fsm import SocialFSM
from src.behavior.warmup_scheduler import WarmupScheduler
from src.behavior.biological_schedule import BiologicalScheduler
from src.behavior.micro_distraction import MicroDistraction
from src.behavior.accidental_clicks import AccidentalClicker
from src.behavior.adaptive_speed import AdaptiveSpeed, CrisisMode
from src.behavior.path_dependence import PathDependence
from src.behavior.telegram_notifier import TelegramNotifier
from src.adapters.youtube import YouTubeAdapter
from src.adapters.tiktok import TikTokAdapter
from src.adapters.instagram import InstagramAdapter

logger = logging.getLogger(__name__)

ADAPTER_MAP = {
    "youtube": YouTubeAdapter,
    "tiktok": TikTokAdapter,
    "instagram": InstagramAdapter,
}


class Brain:
    def __init__(
        self,
        bot_id: int,
        page,
        platform: str,
        warmup: WarmupScheduler,
        telegram: Optional[TelegramNotifier] = None,
        adaptive_speed: Optional[AdaptiveSpeed] = None,
        path_dep: Optional[PathDependence] = None,
        crisis: Optional[CrisisMode] = None,
        carrier: Optional[str] = None,
    ):
        self.bot_id = bot_id
        self.page = page
        self.platform = platform
        self.warmup = warmup
        self.telegram = telegram
        self.carrier = carrier

        adapter_class = ADAPTER_MAP.get(platform)
        if not adapter_class:
            raise ValueError(f"Piattaforma sconosciuta: {platform}")
        self.adapter = adapter_class(page, bot_id)

        self.fsm = SocialFSM(page, bot_id)
        self.bio_schedule = BiologicalScheduler(bot_id)
        self.distraction = MicroDistraction()
        self.clicker = AccidentalClicker()
        self.speed = adaptive_speed or AdaptiveSpeed(bot_id)
        self.path = path_dep or PathDependence(bot_id)
        self.crisis = crisis or CrisisMode(telegram)
        self._action_count = 0
        self._daily_likes = 0
        self._daily_follows = 0
        self._daily_comments = 0
        self._daily_scroll_minutes = 0.0

    async def think_and_act(self) -> dict:
        if self.crisis.should_pause_fleet():
            return {"action": "crisis_pause", "reason": "crisis_mode"}
        if not self.bio_schedule.is_active():
            return {"action": "sleeping", "reason": "biological_schedule"}
        if self.speed.should_skip_action():
            return {"action": "skipped", "reason": "adaptive_speed_skip"}

        days = self.warmup.get_days_since_creation()
        config = self.warmup.get_phase_config()

        if self.warmup.is_login_only():
            await self.adapter.scroll_feed(600)
            self.path.record_action("scroll")
            return {"action": "login_only_scroll", "phase": config["phase"]}

        max_likes = config["max_likes_per_day"]
        max_follows = config["max_follows_per_day"]
        max_comments = config["max_comments_per_day"]
        max_scroll = config["scroll_minutes_per_day"]
        phase = config["phase"]

        if self._daily_likes >= max_likes and max_likes > 0:
            return {"action": "skipped", "reason": f"like_limit({self._daily_likes}/{max_likes})"}
        if self._daily_follows >= max_follows and max_follows > 0:
            return {"action": "skipped", "reason": f"follow_limit({self._daily_follows}/{max_follows})"}
        if self._daily_comments >= max_comments and max_comments > 0:
            return {"action": "skipped", "reason": f"comment_limit({self._daily_comments}/{max_comments})"}

        await self.distraction.maybe_distract(self.page, seed=self.bot_id + self._action_count)
        await self.clicker.maybe_accidental_click(self.page, seed=self.bot_id + self._action_count)

        state_name = await self.fsm.run_cycle(days_since_creation=days)
        self._action_count += 1
        self.path.record_action(state_name)

        if state_name == "like_post":
            self._daily_likes += 1
        elif state_name == "view_profile":
            self._daily_follows += 1
        elif state_name == "scroll_feed":
            self._daily_scroll_minutes += 1

        blocked = await self.adapter.detect_block()
        if blocked:
            logger.warning(f"Bot {self.bot_id}: blocco {blocked} rilevato!")
            self.speed.record_error()
            if "captcha" in str(blocked).lower():
                self.speed.record_captcha()
            if self.telegram:
                await self.telegram.notify_captcha(self.bot_id, self.page)
            await self.adapter.handle_block(blocked)

        return {
            "action": state_name,
            "phase": phase,
            "carrier": self.carrier,
            "daily_counts": {
                "likes": self._daily_likes,
                "follows": self._daily_follows,
                "comments": self._daily_comments,
                "scroll_min": self._daily_scroll_minutes,
            },
        }

    async def run_session(self, duration_minutes: int = 10) -> list[dict]:
        results = []
        started = asyncio.get_event_loop().time()
        timeout = duration_minutes * 60

        while (asyncio.get_event_loop().time() - started) < timeout:
            result = await self.think_and_act()
            results.append(result)
            delay = self.speed.get_action_delay()
            await asyncio.sleep(delay)

        return results

    async def run_adaptive_sessions(self) -> list[dict]:
        all_results = []
        for _ in range(random.randint(1, 3)):
            result = await self.think_and_act()
            all_results.append(result)
            delay = self.speed.get_action_delay()
            await asyncio.sleep(delay)
            if self.speed.should_skip_action():
                break
        return all_results

    def reset_daily_counters(self) -> None:
        self._daily_likes = 0
        self._daily_follows = 0
        self._daily_comments = 0
        self._daily_scroll_minutes = 0.0
