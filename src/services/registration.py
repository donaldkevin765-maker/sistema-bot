"""Registrazione automatica account social via email temporanee."""

from __future__ import annotations

import asyncio
import logging
import random
import time
from dataclasses import dataclass
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class Platform(Enum):
    TIKTOK = "tiktok"
    INSTAGRAM = "instagram"
    YOUTUBE = "youtube"
    TWITTER = "twitter"


@dataclass
class RegistrationResult:
    success: bool
    username: str
    platform: Platform
    email: str
    bot_id: Optional[int] = None
    error: Optional[str] = None


class RegistrationPipeline:
    """Pipeline di registrazione multi-piattaforma con email temporanee."""

    def __init__(self, pool_size: int = 50):
        self._rng = random.Random()
        self._results: list[RegistrationResult] = []
        self._concurrent_limit = 5

    async def register_batch(self, platform: Platform, count: int) -> list[RegistrationResult]:
        from src.services.email_manager import EmailManager
        email_mgr = EmailManager(pool_size=max(count * 2, 50))

        sem = asyncio.Semaphore(self._concurrent_limit)

        async def _register_one() -> RegistrationResult:
            async with sem:
                return await self._register_single(platform, email_mgr)

        tasks = [_register_one() for _ in range(count)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for r in results:
            if isinstance(r, Exception):
                logger.error(f"Registrazione fallita: {r}")
            elif isinstance(r, RegistrationResult):
                self._results.append(r)
        return self._results[-count:]

    async def _register_single(self, platform: Platform, email_mgr) -> RegistrationResult:
        account = await email_mgr.create_email()
        if not account:
            return RegistrationResult(
                success=False, username="", platform=platform,
                email="", error="Impossibile creare email"
            )

        logger.info(f"Registrazione {platform.value} con {account.address}")

        if platform == Platform.TIKTOK:
            return await self._register_tiktok(account)
        elif platform == Platform.INSTAGRAM:
            return await self._register_instagram(account)
        elif platform == Platform.YOUTUBE:
            return await self._register_youtube(account)
        elif platform == Platform.TWITTER:
            return await self._register_twitter(account)
        else:
            return RegistrationResult(
                success=False, username="", platform=platform,
                email=account.address, error=f"Piattaforma non supportata: {platform}"
            )

    async def _register_tiktok(self, account) -> RegistrationResult:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://www.tiktok.com/api/v1/auth/signup/email/",
                    json={
                        "email": account.address,
                        "password": account.password,
                    },
                    headers={"User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36"}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return RegistrationResult(
                        success=True,
                        username=data.get("username", account.address.split("@")[0]),
                        platform=Platform.TIKTOK,
                        email=account.address,
                    )
                return RegistrationResult(
                    success=False, username="", platform=Platform.TIKTOK,
                    email=account.address, error=f"HTTP {resp.status_code}"
                )
        except Exception as e:
            return RegistrationResult(
                success=False, username="", platform=Platform.TIKTOK,
                email=account.address, error=str(e)
            )

    async def _register_instagram(self, account) -> RegistrationResult:
        return RegistrationResult(
            success=False, username="", platform=Platform.INSTAGRAM,
            email=account.address, error="Instagram requires manual signup flow"
        )

    async def _register_youtube(self, account) -> RegistrationResult:
        return RegistrationResult(
            success=False, username="", platform=Platform.YOUTUBE,
            email=account.address, error="YouTube requires Google account"
        )

    async def _register_twitter(self, account) -> RegistrationResult:
        return RegistrationResult(
            success=False, username="", platform=Platform.TWITTER,
            email=account.address, error="Twitter/X registration not yet automated"
        )

    def get_stats(self) -> dict:
        total = len(self._results)
        successes = sum(1 for r in self._results if r.success)
        failures = total - successes
        per_platform = {}
        for r in self._results:
            per_platform.setdefault(r.platform.value, {"success": 0, "failure": 0})
            if r.success:
                per_platform[r.platform.value]["success"] += 1
            else:
                per_platform[r.platform.value]["failure"] += 1
        return {
            "total": total,
            "success": successes,
            "failure": failures,
            "per_platform": per_platform,
        }
