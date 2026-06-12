from __future__ import annotations

import asyncio
import hashlib
import logging
import math
import random
from typing import Optional

from src.android.adb_manager import ADBManager

logger = logging.getLogger(__name__)


class SensorSpoofer:
    def __init__(self, adb: ADBManager, seed: int = 0):
        self.adb = adb
        self.seed = seed
        self._rng = random.Random(seed)
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._baseline: dict[str, float] = {
            "gyro_x": 0.0,
            "gyro_y": 0.0,
            "gyro_z": 0.0,
            "accel_x": 0.0,
            "accel_y": 9.81,
            "accel_z": 0.0,
        }
        self._drift: dict[str, float] = {
            "gyro_x": 0.0,
            "gyro_y": 0.0,
            "gyro_z": 0.0,
        }

    def _simulate_tremor(self, base: float, intensity: float = 0.02) -> float:
        tremor = sum(
            math.sin(2 * math.pi * freq * self._rng.random()) * amp
            for freq, amp in [
                (8.0, 0.015),
                (10.0, 0.01),
                (12.0, 0.008),
                (6.0, 0.012),
            ]
        )
        return base + tremor * intensity

    def _simulate_drift(self, axis: str, dt: float = 0.1) -> float:
        self._drift[axis] += self._rng.gauss(0, 0.001) * dt
        self._drift[axis] = max(-0.05, min(0.05, self._drift[axis]))
        return self._drift[axis]

    def generate_gyroscope_sample(self) -> dict[str, float]:
        return {
            "x": self._simulate_tremor(self._baseline["gyro_x"] + self._simulate_drift("gyro_x")),
            "y": self._simulate_tremor(self._baseline["gyro_y"] + self._simulate_drift("gyro_y")),
            "z": self._simulate_tremor(self._baseline["gyro_z"] + self._simulate_drift("gyro_z")),
            "timestamp": asyncio.get_event_loop().time(),
        }

    def generate_accelerometer_sample(self) -> dict[str, float]:
        tilt_x = math.sin(asyncio.get_event_loop().time() * 0.05) * 0.02
        tilt_z = math.cos(asyncio.get_event_loop().time() * 0.07) * 0.015
        return {
            "x": self._simulate_tremor(self._baseline["accel_x"] + tilt_x, 0.01),
            "y": self._simulate_tremor(self._baseline["accel_y"], 0.005),
            "z": self._simulate_tremor(self._baseline["accel_z"] + tilt_z, 0.01),
            "timestamp": asyncio.get_event_loop().time(),
        }

    def generate_magnetometer_sample(self) -> dict[str, float]:
        heading = (asyncio.get_event_loop().time() * 0.01) % (2 * math.pi)
        return {
            "x": math.cos(heading) * 30 + self._rng.gauss(0, 0.5),
            "y": math.sin(heading) * 30 + self._rng.gauss(0, 0.5),
            "z": 45 + self._rng.gauss(0, 0.5),
            "timestamp": asyncio.get_event_loop().time(),
        }

    def get_all_sensors(self) -> dict:
        return {
            "gyroscope": self.generate_gyroscope_sample(),
            "accelerometer": self.generate_accelerometer_sample(),
            "magnetometer": self.generate_magnetometer_sample(),
        }

    async def inject_sensor_to_page(self, page, sensor_data: dict) -> None:
        try:
            gyro = sensor_data["gyroscope"]
            accel = sensor_data["accelerometer"]

            await page.evaluate(f"""
                (() => {{
                    if (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === 'function') {{
                        return;
                    }}
                    const event = new DeviceOrientationEvent('deviceorientation', {{
                        alpha: {gyro['z']},
                        beta: {gyro['x']},
                        gamma: {gyro['y']},
                        absolute: false,
                    }});
                    window.dispatchEvent(event);
                }})();
            """)
        except Exception as e:
            logger.debug(f"Sensor injection fallita: {e}")

    async def _sensor_loop(self, page, interval: float = 0.1):
        while self._running:
            data = self.get_all_sensors()
            await self.inject_sensor_to_page(page, data)
            await asyncio.sleep(interval)

    async def start(self, page, interval: float = 0.1):
        self._running = True
        self._task = asyncio.create_task(self._sensor_loop(page, interval))
        logger.info("SensorSpoofer avviato (giroscopio + accelerometro + magnetometro).")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("SensorSpoofer fermato.")
