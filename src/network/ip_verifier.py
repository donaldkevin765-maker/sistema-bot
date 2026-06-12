from __future__ import annotations

import asyncio
import httpx
import logging
import platform
import re
import subprocess
from typing import Optional

from src.network.geo_ip import GeoIPService

logger = logging.getLogger(__name__)

IP_CHECK_SERVICES = [
    "https://api.ipify.org",
    "https://api.myip.com",
    "https://ipinfo.io/ip",
    "https://checkip.amazonaws.com",
]

PHONE_INTERFACE_PATTERNS = [
    "rndis",
    "usb",
    "enp0s20f0u1",
    "enx",
    "eth1",
    "wwan",
    "rmnet",
    "ccmni",
    "pdp",
]


class IPVerifier:
    def __init__(self):
        self._last_ip: Optional[str] = None
        self._last_check: Optional[float] = None
        self._geo = GeoIPService()

    async def get_current_ip(self, timeout: float = 10.0) -> Optional[str]:
        last_error = None
        for service in IP_CHECK_SERVICES:
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    resp = await client.get(service, follow_redirects=True)
                    if resp.status_code == 200:
                        ip = resp.text.strip()
                        if re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", ip):
                            return ip
            except Exception as e:
                last_error = e
                continue
        logger.error(f"Impossibile ottenere IP pubblico: {last_error}")
        return None

    async def verify_ip_changed(self, previous_ip: str, max_retries: int = 5, delay: float = 3.0) -> Optional[str]:
        for attempt in range(max_retries):
            await asyncio.sleep(delay * (attempt + 1))
            new_ip = await self.get_current_ip()
            if new_ip and new_ip != previous_ip:
                logger.info(f"IP cambiato: {previous_ip} -> {new_ip} (tentativo {attempt + 1})")
                geo = await self._geo.lookup(new_ip)
                if geo:
                    logger.info(f"Geolocalizzazione IP: {geo.get('city', '?')}, {geo.get('country', '?')} — ISP: {geo.get('isp', '?')}")
                    if geo.get("timezone"):
                        logger.info(f"Fuso orario: {geo['timezone']}")
                if self._geo.is_vpn(new_ip):
                    logger.critical(f"L'IP {new_ip} è nella lista VPN/DC. Blocco navigazione.")
                    return None
                self._last_ip = new_ip
                return new_ip
            logger.warning(f"IP invariato: {new_ip} (ancora uguale a {previous_ip}), ritento...")
        logger.error(f"IP NON cambiato dopo {max_retries} tentativi. Ultimo IP: {previous_ip}")
        return None

    async def ensure_new_ip(self, previous_ip: str, adb_manager=None, max_retries: int = 5) -> Optional[str]:
        for cycle in range(max_retries):
            if adb_manager:
                logger.info(f"Airplane mode cycle {cycle + 1}/{max_retries}")
                await adb_manager.press_key(26)
                await asyncio.sleep(2)
                await adb_manager.press_key(26)
                await asyncio.sleep(5)

            new_ip = await self.verify_ip_changed(previous_ip, max_retries=1, delay=5.0)
            if new_ip:
                return new_ip

            if adb_manager:
                logger.info("Airplane mode toggle via ADB...")
                await adb_manager._adb("shell", "svc", "data", "disable")
                await asyncio.sleep(10)
                await adb_manager._adb("shell", "svc", "data", "enable")
                await asyncio.sleep(15)

                new_ip = await self.verify_ip_changed(previous_ip, max_retries=1, delay=5.0)
                if new_ip:
                    return new_ip

        return None

    async def safe_launch_browser(self, bot_id: int, previous_ip: str, adb_manager=None) -> bool:
        ip = await self.ensure_new_ip(previous_ip, adb_manager)
        if not ip:
            logger.critical(f"Bot {bot_id}: IP bloccato su {previous_ip}. NAVIGAZIONE BLOCCATA.")
            return False

        logger.info(f"Bot {bot_id}: IP verificato {ip}. Lancio browser consentito.")
        return True

    async def get_ip_geo(self, ip: str) -> dict:
        return await self._geo.lookup(ip)

    def check_ip_is_vpn(self, ip: str) -> bool:
        return self._geo.is_vpn(ip)
