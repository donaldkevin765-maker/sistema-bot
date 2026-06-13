"""Gestione email temporanee per registrazione account."""

from __future__ import annotations

import asyncio
import logging
import random
import re
import time
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class EmailAccount:
    address: str
    password: str
    created_at: float = 0.0
    last_used: float = 0.0
    active: bool = True


class EmailManager:
    """Pool di email temporanee per registrazione account social."""

    PROVIDERS = [
        "mail.tm",
        "guerrillamail.com",
        "temp-mail.org",
    ]

    def __init__(self, pool_size: int = 200):
        self._pool: dict[str, EmailAccount] = {}
        self._pool_size = pool_size
        self._rng = random.Random(42)

    async def create_email(self, provider: Optional[str] = None) -> Optional[EmailAccount]:
        provider = provider or self._rng.choice(self.PROVIDERS)
        try:
            if provider == "mail.tm":
                return await self._create_mailtm()
            elif provider == "guerrillamail.com":
                return await self._create_guerrilla()
            elif provider == "temp-mail.org":
                return await self._create_tempmail()
        except Exception as e:
            logger.error(f"Creazione email su {provider} fallita: {e}")
        return None

    async def _create_mailtm(self) -> Optional[EmailAccount]:
        import httpx
        async with httpx.AsyncClient(timeout=15) as client:
            domains_resp = await client.get("https://api.mail.tm/domains")
            if domains_resp.status_code != 200:
                return None
            domains = domains_resp.json().get("hydra:member", [])
            if not domains:
                return None
            domain = self._rng.choice(domains)["domain"]
            local = f"user{self._rng.randint(10000, 99999)}{int(time.time())}"
            addr = f"{local}@{domain}"
            resp = await client.post("https://api.mail.tm/accounts", json={
                "address": addr,
                "password": "TempPass123!",
            })
            if resp.status_code == 201:
                account = EmailAccount(address=addr, password="TempPass123!", created_at=time.time())
                self._pool[addr] = account
                logger.info(f"Email creata: {addr}")
                return account
        return None

    async def _create_guerrilla(self) -> Optional[EmailAccount]:
        import httpx
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get("https://api.guerrillamail.com/ajax.php?f=get_email_address&ip=127.0.0.1&agent=systema_bot")
            if resp.status_code == 200:
                data = resp.json()
                addr = data.get("email_addr", "")
                if addr:
                    account = EmailAccount(address=addr, password="", created_at=time.time())
                    self._pool[addr] = account
                    return account
        return None

    async def _create_tempmail(self) -> Optional[EmailAccount]:
        return await self._create_mailtm()

    async def wait_for_otp(self, email: str, timeout: float = 120.0, interval: float = 5.0) -> Optional[str]:
        """Polling inbox finché non arriva un OTP."""
        start = time.time()
        while time.time() - start < timeout:
            code = await self._check_otp(email)
            if code:
                return code
            await asyncio.sleep(interval)
        return None

    async def _check_otp(self, email: str) -> Optional[str]:
        try:
            local, domain = email.split("@")
            if "mail.tm" in domain:
                return await self._check_otp_mailtm(email)
            elif "guerrillamail" in domain:
                return await self._check_otp_guerrilla(email)
        except Exception as e:
            logger.debug(f"Check OTP fallito per {email}: {e}")
        return None

    async def _check_otp_mailtm(self, email: str) -> Optional[str]:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            auth = await client.post("https://api.mail.tm/token", json={
                "address": email,
                "password": self._pool.get(email, EmailAccount("", "")).password,
            })
            if auth.status_code != 200:
                return None
            token = auth.json().get("token", "")
            headers = {"Authorization": f"Bearer {token}"}
            msgs = await client.get("https://api.mail.tm/messages", headers=headers)
            if msgs.status_code != 200:
                return None
            for msg in msgs.json().get("hydra:member", []):
                body = msg.get("textBody", "") or msg.get("htmlBody", "")
                codes = re.findall(r'\b(\d{4,8})\b', body)
                if codes:
                    return codes[0]
        return None

    async def _check_otp_guerrilla(self, email: str) -> Optional[str]:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.guerrillamail.com/ajax.php?f=get_email_list&email={email}"
            )
            if resp.status_code == 200:
                for msg in resp.json().get("list", []):
                    body = msg.get("mail_body", "")
                    codes = re.findall(r'\b(\d{4,8})\b', body)
                    if codes:
                        return codes[0]
        return None

    def get_active_count(self) -> int:
        return sum(1 for a in self._pool.values() if a.active)

    def get_pool_stats(self) -> dict:
        return {
            "total": len(self._pool),
            "active": self.get_active_count(),
            "pool_size": self._pool_size,
        }
