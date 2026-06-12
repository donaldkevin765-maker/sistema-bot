from __future__ import annotations

import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class ADBReconnector:
    def __init__(self, device_serial: Optional[str] = None, max_attempts: int = 30, interval: float = 5.0):
        self.device_serial = device_serial
        self.max_attempts = max_attempts
        self.interval = interval
        self._connected = False

    async def _adb_cmd(self, *args: str) -> tuple[bool, str]:
        import subprocess
        cmd = ["adb"]
        if self.device_serial:
            cmd.extend(["-s", self.device_serial])
        cmd.extend(args)
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()
            return process.returncode == 0, stdout.decode().strip()
        except FileNotFoundError:
            return False, "ADB not found"
        except Exception as e:
            return False, str(e)

    async def is_device_connected(self) -> bool:
        ok, output = await self._adb_cmd("devices")
        if ok and self.device_serial:
            return self.device_serial in output and "device" in output
        if ok and not self.device_serial:
            lines = output.strip().split("\n")[1:]
            for line in lines:
                if line.strip() and "device" in line:
                    self.device_serial = line.split()[0]
                    return True
        return False

    async def reconnect(self) -> bool:
        logger.info("ADB: tentativo riconnessione...")
        ok, _ = await self._adb_cmd("reconnect")
        if ok:
            await asyncio.sleep(2)
        return await self.is_device_connected()

    async def wait_for_device(self, max_attempts: Optional[int] = None) -> bool:
        attempts = max_attempts or self.max_attempts
        for i in range(attempts):
            if await self.is_device_connected():
                if not self._connected:
                    logger.info(f"ADB: dispositivo riconnesso dopo {i * self.interval:.0f}s")
                self._connected = True
                return True
            await self.reconnect()
            await asyncio.sleep(self.interval)
        logger.error(f"ADB: dispositivo NON riconnesso dopo {attempts} tentativi")
        self._connected = False
        return False

    async def ensure_connected(self) -> bool:
        if await self.is_device_connected():
            self._connected = True
            return True
        return await self.wait_for_device()

    async def reconnect_usb(self) -> bool:
        ok, _ = await self._adb_cmd("usb")
        if ok:
            await asyncio.sleep(3)
        return await self.is_device_connected()

    @property
    def connected(self) -> bool:
        return self._connected
