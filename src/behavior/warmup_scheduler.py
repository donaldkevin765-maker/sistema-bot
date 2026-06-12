from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional


class WarmupPhase(Enum):
    INCUBAZIONE = "incubazione"
    ESPLORAZIONE = "esplorazione"
    ATTIVAZIONE = "attivazione"
    CONSOLIDAMENTO = "consolidamento"
    MATURITA = "maturita"
    STABILE = "stabile"


PHASE_CONFIG = {
    WarmupPhase.INCUBAZIONE: {
        "duration_days": 14,
        "max_likes_per_day": 0,
        "max_follows_per_day": 0,
        "max_comments_per_day": 0,
        "scroll_minutes_per_day": 10,
        "login_only": True,
        "description": "Solo login + scroll passivo. Zero interazioni.",
    },
    WarmupPhase.ESPLORAZIONE: {
        "duration_days": 14,
        "max_likes_per_day": 2,
        "max_follows_per_day": 0,
        "max_comments_per_day": 0,
        "scroll_minutes_per_day": 15,
        "login_only": False,
        "description": "Like rari. Scroll + ricerca hashtag.",
    },
    WarmupPhase.ATTIVAZIONE: {
        "duration_days": 14,
        "max_likes_per_day": 3,
        "max_follows_per_day": 1,
        "max_comments_per_day": 0,
        "scroll_minutes_per_day": 15,
        "login_only": False,
        "description": "Like + 1 follow al giorno. Ancora niente commenti.",
    },
    WarmupPhase.CONSOLIDAMENTO: {
        "duration_days": 7,
        "max_likes_per_day": 5,
        "max_follows_per_day": 2,
        "max_comments_per_day": 1,
        "scroll_minutes_per_day": 20,
        "login_only": False,
        "description": "Prime interazioni leggere. 1 commento al giorno max.",
    },
    WarmupPhase.MATURITA: {
        "duration_days": 7,
        "max_likes_per_day": 10,
        "max_follows_per_day": 3,
        "max_comments_per_day": 2,
        "scroll_minutes_per_day": 25,
        "login_only": False,
        "description": "Regime ridotto. Account considerato reale.",
    },
    WarmupPhase.STABILE: {
        "duration_days": -1,
        "max_likes_per_day": 15,
        "max_follows_per_day": 5,
        "max_comments_per_day": 5,
        "scroll_minutes_per_day": 30,
        "login_only": False,
        "description": "Regime normale. Account stabilizzato.",
    },
}


class WarmupScheduler:
    def __init__(self, bot_id: int, created_at: Optional[str] = None):
        self.bot_id = bot_id
        self._rng = random.Random(bot_id)

        if created_at:
            self.created_at = datetime.fromisoformat(created_at)
        else:
            self.created_at = datetime.now(timezone.utc)

        self.phase_start_times: dict[WarmupPhase, datetime] = {}
        self._precompute_phases()

    def _precompute_phases(self) -> None:
        cursor = self.created_at
        for phase in WarmupPhase:
            self.phase_start_times[phase] = cursor
            days = PHASE_CONFIG[phase]["duration_days"]
            if days > 0:
                cursor += timedelta(days=days)

    def get_current_phase(self, now: Optional[datetime] = None) -> WarmupPhase:
        if now is None:
            now = datetime.now(timezone.utc)
        for phase in WarmupPhase:
            start = self.phase_start_times[phase]
            days = PHASE_CONFIG[phase]["duration_days"]
            if days < 0:
                return phase
            end = start + timedelta(days=days)
            if start <= now < end:
                return phase
        return WarmupPhase.STABILE

    def get_phase_config(self, now: Optional[datetime] = None) -> dict:
        phase = self.get_current_phase(now)
        config = PHASE_CONFIG[phase].copy()
        config["phase"] = phase.value
        config["days_since_creation"] = self.get_days_since_creation(now)
        config["days_in_phase"] = self.get_days_in_phase(now)
        return config

    def get_days_since_creation(self, now: Optional[datetime] = None) -> int:
        if now is None:
            now = datetime.now(timezone.utc)
        return (now - self.created_at).days

    def get_days_in_phase(self, now: Optional[datetime] = None) -> int:
        if now is None:
            now = datetime.now(timezone.utc)
        phase = self.get_current_phase(now)
        start = self.phase_start_times[phase]
        return (now - start).days

    def daily_remaining(self, action_type: str, current_count: int, now: Optional[datetime] = None) -> int:
        config = self.get_phase_config(now)
        key_map = {
            "like": "max_likes_per_day",
            "follow": "max_follows_per_day",
            "comment": "max_comments_per_day",
        }
        key = key_map.get(action_type)
        if not key:
            return 0
        max_val = config.get(key, 0)
        remaining = max_val - current_count
        return max(0, remaining)

    def can_scroll(self, current_minutes: int, now: Optional[datetime] = None) -> bool:
        config = self.get_phase_config(now)
        max_scroll = config.get("scroll_minutes_per_day", 0)
        return current_minutes < max_scroll

    def get_scroll_remaining_seconds(self, current_minutes: float, now: Optional[datetime] = None) -> int:
        config = self.get_phase_config(now)
        max_scroll = config.get("scroll_minutes_per_day", 0)
        remaining_minutes = max(0, max_scroll - current_minutes)
        jitter = self._rng.uniform(-0.5, 0.5)
        adjusted = remaining_minutes + jitter
        return max(0, int(adjusted * 60))

    def is_login_only(self, now: Optional[datetime] = None) -> bool:
        config = self.get_phase_config(now)
        return config.get("login_only", False)

    def get_phase_progress(self, now: Optional[datetime] = None) -> float:
        if now is None:
            now = datetime.now(timezone.utc)
        phase = self.get_current_phase(now)
        start = self.phase_start_times[phase]
        days = PHASE_CONFIG[phase]["duration_days"]
        if days <= 0:
            return 1.0
        end = start + timedelta(days=days)
        total = (end - start).total_seconds()
        elapsed = (now - start).total_seconds()
        return min(1.0, elapsed / total)

    def jitter_limit(self, base: int) -> int:
        if base == 0:
            return 0
        variance = max(1, int(base * 0.3))
        return max(0, base + self._rng.randint(-variance, variance))

    def __repr__(self) -> str:
        phase = self.get_current_phase()
        days = self.get_days_since_creation()
        return f"<WarmupScheduler bot={self.bot_id} phase={phase.value} days={days}>"
