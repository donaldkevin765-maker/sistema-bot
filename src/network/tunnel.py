from __future__ import annotations

import asyncio
import logging
import random
import time
from typing import Optional, Callable

from playwright.async_api import Page

logger = logging.getLogger(__name__)


class NetworkState(Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    RECOVERING = "recovering"
    TIMEOUT = "timeout"


class TunnelEffectRecovery:
    def __init__(
        self,
        max_retry_attempts: int = 5,
        base_delay: float = 5.0,
        max_delay: float = 60.0,
        on_disconnect: Optional[Callable] = None,
        on_reconnect: Optional[Callable] = None,
    ):
        self.max_retry_attempts = max_retry_attempts
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.on_disconnect = on_disconnect
        self.on_reconnect = on_reconnect
        self.state = NetworkState.CONNECTED
        self._disconnect_time: Optional[float] = None

    async def check_connectivity(self, page: Page, timeout: float = 5.0) -> bool:
        try:
            result = await page.evaluate(
                "navigator.onLine"
            )
            if not result:
                return False

            connectivity = await page.evaluate("""
                async () => {
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 3000);
                        const resp = await fetch('https://www.google.com/generate_204', {
                            method: 'HEAD',
                            signal: controller.signal
                        });
                        clearTimeout(timeoutId);
                        return resp.ok;
                    } catch {
                        return false;
                    }
                }
            """)
            return connectivity
        except Exception:
            return False

    async def wait_for_reconnection(self, page: Page) -> bool:
        self.state = NetworkState.DISCONNECTED
        self._disconnect_time = time.time()

        if self.on_disconnect:
            await self.on_disconnect()

        attempt = 0
        while attempt < self.max_retry_attempts:
            delay = min(
                self.base_delay * (2 ** attempt) + random.uniform(-1, 1),
                self.max_delay
            )
            delay = max(delay, 2.0)
            logger.info(f"Tunnel: tentativo {attempt + 1}/{self.max_retry_attempts} tra {delay:.1f}s")
            await asyncio.sleep(delay)

            if await self.check_connectivity(page):
                self.state = NetworkState.RECOVERING
                logger.info("Tunnel: connessione recuperata.")

                await asyncio.sleep(random.uniform(2.0, 4.0))

                await self.simulate_pull_to_refresh(page)
                await asyncio.sleep(random.uniform(1.0, 2.5))

                self.state = NetworkState.CONNECTED
                if self.on_reconnect:
                    await self.on_reconnect()

                return True
            attempt += 1

        self.state = NetworkState.TIMEOUT
        logger.error("Tunnel: timeout, connessione non recuperata.")
        return False

    async def simulate_pull_to_refresh(self, page: Page) -> None:
        try:
            await page.evaluate("window.scrollTo(0, -200)")
            await asyncio.sleep(random.uniform(0.3, 0.8))
            await page.evaluate("window.scrollTo(0, 0)")
            await asyncio.sleep(random.uniform(0.5, 1.5))
            await page.evaluate("location.reload()")
            await page.wait_for_load_state("domcontentloaded", timeout=30000)
            await asyncio.sleep(random.uniform(1.0, 3.0))
        except Exception as e:
            logger.error(f"Tunnel: pull-to-refresh fallito: {e}")

    async def safe_operation(self, page: Page, action, *args, **kwargs):
        max_retries = 3
        for attempt in range(max_retries):
            try:
                return await action(*args, **kwargs)
            except Exception as e:
                if not await self.check_connectivity(page):
                    logger.warning(f"Tunnel: disconnessione durante operazione. Tentativo {attempt + 1}")
                    recovered = await self.wait_for_reconnection(page)
                    if not recovered:
                        raise
                else:
                    raise
        return None

    def get_disconnect_duration(self) -> Optional[float]:
        if self._disconnect_time:
            return time.time() - self._disconnect_time
        return None
