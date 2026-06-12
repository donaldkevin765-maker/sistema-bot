from __future__ import annotations

import asyncio
import logging
import platform
import subprocess
from dataclasses import dataclass
from enum import Enum
from typing import Callable, Optional

logger = logging.getLogger(__name__)


class WatchdogState(Enum):
    NORMAL = "normal"
    WARNING = "warning"
    PAUSED = "paused"
    CRITICAL = "critical"


@dataclass
class ThermalReading:
    temperature: float
    source: str
    unit: str


class ThermalWatchdog:
    def __init__(
        self,
        pause_threshold: float = 40.0,
        resume_threshold: float = 37.0,
        check_interval: float = 15.0,
        on_pause: Optional[Callable] = None,
        on_resume: Optional[Callable] = None,
    ):
        self.pause_threshold = pause_threshold
        self.resume_threshold = resume_threshold
        self.check_interval = check_interval
        self.on_pause = on_pause
        self.on_resume = on_resume
        self.state = WatchdogState.NORMAL
        self._task: Optional[asyncio.Task] = None
        self._running = False

    def _read_temperature_osx(self) -> Optional[ThermalReading]:
        try:
            result = subprocess.run(
                ["pmset", "-g", "therm"],
                capture_output=True, text=True, timeout=5
            )
            for line in result.stdout.split("\n"):
                if "CPU" in line and "therm" in line.lower():
                    parts = line.strip().split()
                    for p in parts:
                        if p.isdigit():
                            return ThermalReading(
                                temperature=float(p),
                                source="osx_pmset",
                                unit="celsius"
                            )
        except Exception:
            pass
        try:
            result = subprocess.run(
                ["sysctl", "machdep.xcpm.cpu_thermal_level"],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0 and result.stdout.strip():
                parts = result.stdout.strip().split(":")
                if len(parts) == 2:
                    return ThermalReading(
                        temperature=float(parts[1].strip()),
                        source="sysctl",
                        unit="level"
                    )
        except Exception:
            pass
        return None

    def _read_temperature_linux(self) -> Optional[ThermalReading]:
        try:
            result = subprocess.run(
                ["cat", "/sys/class/thermal/thermal_zone0/temp"],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0 and result.stdout.strip():
                temp = float(result.stdout.strip()) / 1000.0
                return ThermalReading(
                    temperature=temp,
                    source="thermal_zone0",
                    unit="celsius"
                )
        except Exception:
            pass
        try:
            result = subprocess.run(
                ["sensors", "-u"],
                capture_output=True, text=True, timeout=10
            )
            for line in result.stdout.split("\n"):
                if "temp1_input" in line:
                    temp = float(line.split(":")[1].strip())
                    return ThermalReading(
                        temperature=temp,
                        source="sensors",
                        unit="celsius"
                    )
        except Exception:
            pass
        return None

    def _read_temperature_windows(self) -> Optional[ThermalReading]:
        try:
            result = subprocess.run(
                ["wmic", "/namespace:\\\\root\\wmi", "PATH", "MSAcpi_ThermalZoneTemperature"],
                capture_output=True, text=True, timeout=10
            )
            for line in result.stdout.split("\n"):
                if "CurrentTemperature" in line:
                    temp_k = float(line.split("=")[1].strip().rstrip(";"))
                    temp_c = (temp_k - 2732) / 10.0
                    return ThermalReading(
                        temperature=temp_c,
                        source="wmi",
                        unit="celsius"
                    )
        except Exception:
            pass
        return None

    def get_temperature(self) -> Optional[ThermalReading]:
        system = platform.system().lower()
        if system == "darwin":
            return self._read_temperature_osx()
        elif system == "linux":
            return self._read_temperature_linux()
        elif system == "windows":
            return self._read_temperature_windows()
        return None

    async def _check_loop(self):
        while self._running:
            reading = await asyncio.to_thread(self.get_temperature)
            if reading is not None:
                if reading.temperature >= self.pause_threshold and self.state != WatchdogState.PAUSED:
                    old_state = self.state
                    self.state = WatchdogState.PAUSED if reading.temperature >= self.pause_threshold else WatchdogState.WARNING
                    if self.state == WatchdogState.PAUSED and old_state != WatchdogState.PAUSED:
                        logger.warning(f"Watchdog: temperatura {reading.temperature}°C >= {self.pause_threshold}°C. Pausa bot.")
                        if self.on_pause:
                            await self.on_pause(reading)
                elif reading.temperature <= self.resume_threshold and self.state in (WatchdogState.WARNING, WatchdogState.PAUSED):
                    old_state = self.state
                    self.state = WatchdogState.NORMAL
                    if old_state == WatchdogState.PAUSED:
                        logger.info(f"Watchdog: temperatura {reading.temperature}°C <= {self.resume_threshold}°C. Ripresa bot.")
                        if self.on_resume:
                            await self.on_resume(reading)
            await asyncio.sleep(self.check_interval)

    async def start(self):
        self._running = True
        self._task = asyncio.create_task(self._check_loop())
        logger.info("ThermalWatchdog avviato.")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("ThermalWatchdog fermato.")
