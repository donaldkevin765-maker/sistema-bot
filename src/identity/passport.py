from __future__ import annotations

import hashlib
import json
import logging
import os
import random
from pathlib import Path
from typing import Optional

from src.behavior.identity_generator import IdentityGenerator
from src.behavior.biological_schedule import BiologicalScheduler
from src.behavior.warmup_scheduler import WarmupScheduler

logger = logging.getLogger(__name__)

PROFILES_DIR = Path(os.getenv("BOT_PROFILES_DIR", "data/passports"))


class Passport:
    def __init__(self, bot_id: int):
        self.bot_id = bot_id
        self._dir = PROFILES_DIR / f"passport_{bot_id}"
        self._dir.mkdir(parents=True, exist_ok=True)
        self._data = self._load()

    def _load(self) -> dict:
        path = self._dir / "identity.json"
        if path.exists():
            try:
                with open(path) as f:
                    return json.load(f)
            except Exception:
                pass
        return self._generate_defaults()

    def _generate_defaults(self) -> dict:
        rng = random.Random(self.bot_id)
        ident = IdentityGenerator(self.bot_id)
        bio_sched = BiologicalScheduler(self.bot_id)
        warmup = WarmupScheduler(self.bot_id)

        display_name = ident.generate_display_name(f"user{self.bot_id}")
        username = ident.generate_username(f"user{self.bot_id}")

        data = {
            "bot_id": self.bot_id,
            "username": username,
            "display_name": display_name,
            "profiles": {},
            "canvas_seed": rng.uniform(0, 999999.999),
            "timezone": "Europe/Rome",
            "locale": "it-IT",
            "screen_resolution": f"{412 + rng.randint(-3, 3)}x{915 + rng.randint(-3, 3)}",
            "wpm": rng.randint(180, 260),
            "sleep_schedule": bio_sched.get_sleep_window(),
            "identities": {},
            "fingerprint": {
                "canvas_seed": rng.uniform(0, 999999.999),
                "audio_seed": rng.randint(0, 2**31 - 1),
                "webgl_seed": rng.randint(0, 2**31 - 1),
            },
        }

        self._data = data
        self._save()
        return data

    def _save(self) -> None:
        path = self._dir / "identity.json"
        try:
            with open(path, "w") as f:
                json.dump(self._data, f, indent=2)
        except Exception as e:
            logger.error(f"Salvataggio passport bot {self.bot_id}: {e}")

    def register_platform(self, platform: str, username: str, user_agent: str, ip_address: str) -> None:
        ident = IdentityGenerator(self.bot_id + hash(platform) % 2**31)
        bio = ident.generate_bio()

        self._data["identities"][platform] = {
            "username": username,
            "user_agent": user_agent,
            "bio": bio,
            "display_name": ident.generate_display_name(username),
            "ip_address": ip_address,
            "registered_at": None,
            "status": "WARMING",
        }
        self._save()

    def get_platform_identity(self, platform: str) -> Optional[dict]:
        return self._data.get("identities", {}).get(platform)

    @property
    def canvas_seed(self) -> float:
        return self._data["fingerprint"]["canvas_seed"]

    @property
    def audio_seed(self) -> int:
        return self._data["fingerprint"]["audio_seed"]

    @property
    def webgl_seed(self) -> int:
        return self._data["fingerprint"]["webgl_seed"]

    @property
    def timezone(self) -> str:
        return self._data.get("timezone", "Europe/Rome")

    @property
    def locale(self) -> str:
        return self._data.get("locale", "it-IT")

    @property
    def screen_resolution(self) -> str:
        return self._data.get("screen_resolution", "412x915")

    @property
    def wpm(self) -> int:
        return self._data.get("wpm", 220)

    def get_passport_size_kb(self) -> float:
        path = self._dir / "identity.json"
        if path.exists():
            return path.stat().st_size / 1024
        return 0

    def set_status(self, platform: str, status: str) -> None:
        if platform in self._data.get("identities", {}):
            self._data["identities"][platform]["status"] = status
            self._save()

    def get_profile_size_mb(self) -> float:
        total = 0
        for f in self._dir.iterdir():
            if f.is_file():
                total += f.stat().st_size
        return total / (1024 * 1024)

    def sync_fingerprint(self, driver_fingerprint: dict) -> None:
        self._data["fingerprint"].update(driver_fingerprint)
        self._save()
