from __future__ import annotations

import asyncio
import logging
import os
import subprocess
from typing import Optional

logger = logging.getLogger(__name__)


class ADBManager:
    def __init__(self, device_serial: Optional[str] = None):
        self.device_serial = device_serial or os.getenv("ADB_DEVICE_SERIAL")
        self._connected = False

    async def _adb(self, *args: str) -> str:
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
            if process.returncode != 0:
                raise RuntimeError(stderr.decode().strip())
            return stdout.decode().strip()
        except FileNotFoundError:
            raise RuntimeError("ADB non trovato. Installa Android Platform Tools.")

    async def connect(self) -> bool:
        try:
            output = await self._adb("devices")
            if self.device_serial and self.device_serial in output:
                self._connected = True
                logger.info(f"ADB connesso a {self.device_serial}")
                return True
            elif not self.device_serial:
                lines = output.strip().split("\n")[1:]
                for line in lines:
                    if line.strip() and "device" in line:
                        self.device_serial = line.split()[0]
                        self._connected = True
                        logger.info(f"ADB auto-connesso a {self.device_serial}")
                        return True
        except Exception as e:
            logger.error(f"ADB connection failed: {e}")
        return False

    async def tap(self, x: int, y: int) -> None:
        await self._adb("shell", "input", "tap", str(x), str(y))

    async def swipe(self, x1: int, y1: int, x2: int, y2: int, duration_ms: int = 300) -> None:
        await self._adb("shell", "input", "swipe", str(x1), str(y1), str(x2), str(y2), str(duration_ms))

    async def type_text(self, text: str) -> None:
        escaped = text.replace("%", "%s").replace(" ", "%s")
        await self._adb("shell", "input", "text", escaped)

    async def press_key(self, keycode: int) -> None:
        await self._adb("shell", "input", "keyevent", str(keycode))

    async def press_back(self) -> None:
        await self.press_key(4)

    async def press_home(self) -> None:
        await self.press_key(3)

    async def open_url(self, url: str) -> None:
        await self._adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url)

    async def screenshot(self, path: str = "/sdcard/screen.png") -> bytes:
        await self._adb("shell", "screencap", path)
        result = await self._adb("exec-out", "cat", path)
        return result.encode()

    async def get_notifications(self) -> list[dict]:
        output = await self._adb("shell", "dumpsys", "notification", "--noredact")
        notifications = []
        current = {}
        for line in output.split("\n"):
            if "NotificationRecord" in line:
                if current:
                    notifications.append(current)
                current = {}
            if "key=" in line:
                current["key"] = line.split("key=")[1].strip()
            if "tickerText=" in line:
                current["ticker"] = line.split("tickerText=")[1].strip()
            if "android.title" in line:
                current["title"] = line.split("=")[1].strip()
            if "android.text" in line:
                current["text"] = line.split("=")[1].strip()
            if "package=" in line:
                current["package"] = line.split("package=")[1].strip()
        if current:
            notifications.append(current)
        return notifications

    async def is_online(self) -> bool:
        try:
            output = await self._adb("shell", "ping", "-c", "1", "-W", "2", "8.8.8.8")
            return "1 received" in output
        except Exception:
            return False

    async def disconnect(self) -> None:
        self._connected = False

    async def get_sensor_data(self, sensor_type: str = "gyroscope") -> dict:
        """Legge i dati del sensore dal dispositivo Android."""
        try:
            output = await self._adb(
                "shell",
                "dumpsys",
                "sensorservice",
                "|",
                "grep",
                "-A",
                "5",
                sensor_type
            )
            return {"raw": output, "type": sensor_type}
        except Exception as e:
            return {"error": str(e), "type": sensor_type}
