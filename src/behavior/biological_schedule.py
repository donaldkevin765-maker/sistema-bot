from __future__ import annotations

import logging
import random
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)

SLEEP_WINDOWS_ITALY = {
    "nord_ovest": {"sleep_start": 1.5, "sleep_end": 7.5},
    "nord_est": {"sleep_start": 1.0, "sleep_end": 7.0},
    "centro": {"sleep_start": 1.0, "sleep_end": 7.5},
    "sud": {"sleep_start": 0.5, "sleep_end": 7.0},
    "isole": {"sleep_start": 0.5, "sleep_end": 7.5},
}

EUROPE_TIMEZONES = [
    "Europe/Rome",
    "Europe/Madrid",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/London",
    "Europe/Lisbon",
    "Europe/Athens",
]


class BiologicalScheduler:
    def __init__(self, bot_id: int, timezone_str: str = "Europe/Rome"):
        self.bot_id = bot_id
        self.timezone_str = timezone_str
        rng = random.Random(bot_id)
        self.sleep_start_hour = rng.uniform(1.0, 3.0)
        self.sleep_end_hour = self.sleep_start_hour + rng.uniform(5.0, 7.0)

        self.wake_variance = rng.uniform(-0.5, 0.5)

        self.activity_levels = {
            "dawn": rng.uniform(0.3, 0.5),
            "morning": rng.uniform(0.7, 1.0),
            "afternoon": rng.uniform(0.5, 0.8),
            "evening": rng.uniform(0.6, 0.9),
            "night": rng.uniform(0.0, 0.2),
        }

    def get_current_period(self, utc_now: Optional[datetime] = None) -> str:
        if utc_now is None:
            utc_now = datetime.now(timezone.utc)
        hour = utc_now.hour + utc_now.minute / 60.0

        if 5 <= hour < 8:
            return "dawn"
        elif 8 <= hour < 12:
            return "morning"
        elif 12 <= hour < 17:
            return "afternoon"
        elif 17 <= hour < 22:
            return "evening"
        else:
            return "night"

    def is_sleeping(self, utc_now: Optional[datetime] = None) -> bool:
        if utc_now is None:
            utc_now = datetime.now(timezone.utc)
        hour = utc_now.hour + utc_now.minute / 60.0

        if self.sleep_start_hour <= self.sleep_end_hour:
            return self.sleep_start_hour <= hour <= self.sleep_end_hour
        else:
            return hour >= self.sleep_start_hour or hour <= self.sleep_end_hour

    def get_activity_multiplier(self, utc_now: Optional[datetime] = None) -> float:
        period = self.get_current_period(utc_now)
        if self.is_sleeping(utc_now):
            return 0.0
        return self.activity_levels[period]

    def get_sleep_window(self) -> dict:
        return {
            "start_hour": round(self.sleep_start_hour, 1),
            "end_hour": round(self.sleep_end_hour, 1),
            "duration_hours": round(self.sleep_end_hour - self.sleep_start_hour, 1),
        }

    def next_activity_delay(self, base_delay: float) -> float:
        multiplier = self.get_activity_multiplier()
        if multiplier == 0:
            return float("inf")
        adjusted = base_delay * (1.0 + (1.0 - multiplier) * 2.0)
        return max(adjusted, base_delay * 0.5)

    def is_active(self, utc_now: Optional[datetime] = None) -> bool:
        return not self.is_sleeping(utc_now) and self.get_activity_multiplier(utc_now) > 0.1
