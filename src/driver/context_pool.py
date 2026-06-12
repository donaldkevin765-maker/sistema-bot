from __future__ import annotations

import asyncio
import logging
import random
from typing import Optional

from playwright.async_api import Browser

logger = logging.getLogger(__name__)


class ContextPool:
    def __init__(self, browser: Browser, pool_size: int = 3):
        self._browser = browser
        self._pool_size = pool_size
        self._pool: list = []
        self._configs: list[dict] = []
        self._lock = asyncio.Lock()
        self._running = False
        self._task: Optional[asyncio.Task] = None

    async def _create_context(self, config: Optional[dict] = None) -> object:
        kwargs = {
            "is_mobile": True,
            "has_touch": True,
            "device_scale_factor": random.choice([2.0, 2.0, 2.0, 2.25, 2.5]),
        }
        if config:
            if "user_agent" in config:
                kwargs["user_agent"] = config["user_agent"]
            if "viewport" in config:
                kwargs["viewport"] = config["viewport"]
            if "timezone_id" in config:
                kwargs["timezone_id"] = config["timezone_id"]
            if "locale" in config:
                kwargs["locale"] = config["locale"]
            if "extra_http_headers" in config:
                kwargs["extra_http_headers"] = config["extra_http_headers"]
        return await self._browser.new_context(**kwargs)

    async def _maintain_pool(self):
        while self._running:
            async with self._lock:
                needed = self._pool_size - len(self._pool)
                if needed > 0:
                    for i in range(needed):
                        try:
                            config = self._configs[i % max(1, len(self._configs))] if self._configs else None
                            ctx = await self._create_context(config)
                            self._pool.append(ctx)
                            logger.debug(f"Context pre-warmed. Pool: {len(self._pool)}/{self._pool_size}")
                        except Exception as e:
                            logger.error(f"Pre-warm fallito: {e}")
                            break
            await asyncio.sleep(2.0)

    def configure(self, configs: list[dict]) -> None:
        self._configs = configs

    async def get_context(self, config: Optional[dict] = None):
        while True:
            async with self._lock:
                if self._pool:
                    ctx = self._pool.pop(0)
                    try:
                        if not ctx.pages:
                            return ctx
                    except Exception:
                        pass
                    try:
                        await ctx.close()
                    except Exception:
                        pass
                elif config:
                    return await self._create_context(config)
            await asyncio.sleep(0.1)

    async def return_context(self, ctx) -> None:
        try:
            pages = ctx.pages
            for p in pages:
                try:
                    await p.close()
                except Exception:
                    pass
            async with self._lock:
                if len(self._pool) < self._pool_size:
                    self._pool.append(ctx)
                    return
        except Exception:
            pass
        try:
            await ctx.close()
        except Exception:
            pass

    async def start(self):
        self._running = True
        self._task = asyncio.create_task(self._maintain_pool())
        logger.info(f"ContextPool avviato ({self._pool_size} pre-warmed)")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        async with self._lock:
            for ctx in self._pool:
                try:
                    await ctx.close()
                except Exception:
                    pass
            self._pool.clear()
