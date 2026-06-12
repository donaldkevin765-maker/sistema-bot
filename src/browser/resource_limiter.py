from __future__ import annotations

import asyncio
import logging
import os
import platform
from typing import Optional

logger = logging.getLogger(__name__)

DEFAULT_BROWSER_MEMORY_MB = 120
RESERVED_MEMORY_MB = 512
MIN_PARALLEL = 1


class ResourceLimiter:
    def __init__(self):
        self._max_parallel: int = MIN_PARALLEL
        self._current_active: int = 0

    def _get_available_ram_mb(self) -> int:
        try:
            system = platform.system().lower()
            if system == "darwin":
                import subprocess
                result = subprocess.run(
                    ["vm_stat"],
                    capture_output=True, text=True, timeout=5
                )
                page_size = 16384
                free_pages = 0
                for line in result.stdout.split("\n"):
                    if "free" in line and "page" in line.lower():
                        parts = line.split(":")
                        if len(parts) == 2:
                            try:
                                free_pages += int(parts[1].strip().rstrip("."))
                            except ValueError:
                                pass
                return (free_pages * page_size) // (1024 * 1024)
            elif system == "linux":
                import subprocess
                result = subprocess.run(
                    ["free", "-m"],
                    capture_output=True, text=True, timeout=5
                )
                for line in result.stdout.split("\n"):
                    if "Mem:" in line:
                        parts = line.split()
                        return int(parts[6]) if len(parts) > 6 else int(parts[3])
            elif system == "windows":
                import psutil
                return int(psutil.virtual_memory().available / (1024 * 1024))
        except Exception:
            pass
        return 4096

    def calculate_max_parallel(self) -> int:
        available_mb = self._get_available_ram_mb()
        usable = available_mb - RESERVED_MEMORY_MB
        max_bots = max(MIN_PARALLEL, usable // DEFAULT_BROWSER_MEMORY_MB)
        self._max_parallel = max_bots
        logger.debug(f"ResourceLimiter: {available_mb}MB liberi -> {max_bots} bot paralleli")
        return max_bots

    async def acquire(self) -> bool:
        if self._current_active >= self._max_parallel:
            return False
        self._current_active += 1
        return True

    async def wait_and_acquire(self, timeout: Optional[float] = None) -> bool:
        start = asyncio.get_event_loop().time()
        while True:
            if await self.acquire():
                return True
            if timeout and (asyncio.get_event_loop().time() - start) > timeout:
                return False
            await asyncio.sleep(1.0)

    def release(self) -> None:
        self._current_active = max(0, self._current_active - 1)

    @property
    def current_active(self) -> int:
        return self._current_active

    @property
    def max_parallel(self) -> int:
        return self._max_parallel

    def refresh(self) -> None:
        self.calculate_max_parallel()
