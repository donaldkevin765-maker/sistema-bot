from __future__ import annotations

import asyncio
import logging
import os
import platform
import shutil
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from typing import Callable, Optional

from src.behavior.telegram_notifier import TelegramNotifier

logger = logging.getLogger(__name__)


class DiskWatchdog:
    def __init__(
        self,
        data_dir: str = "data",
        warning_threshold: float = 80.0,
        critical_threshold: float = 90.0,
        log_retention_days: int = 14,
        screenshot_retention_days: int = 30,
        check_interval: float = 300.0,
        telegram: Optional[TelegramNotifier] = None,
        on_critical: Optional[Callable] = None,
    ):
        self.data_dir = Path(data_dir)
        self.warning_threshold = warning_threshold
        self.critical_threshold = critical_threshold
        self.log_retention_days = log_retention_days
        self.screenshot_retention_days = screenshot_retention_days
        self.check_interval = check_interval
        self.telegram = telegram
        self.on_critical = on_critical
        self._task: Optional[asyncio.Task] = None
        self._running = False

    def get_disk_usage_percent(self, path: Optional[str] = None) -> float:
        target = path or self.data_dir.absolute().anchor or "/"
        try:
            usage = shutil.disk_usage(target)
            return (usage.used / usage.total) * 100
        except Exception:
            return 0.0

    def get_free_space_gb(self, path: Optional[str] = None) -> float:
        target = path or self.data_dir.absolute().anchor or "/"
        try:
            usage = shutil.disk_usage(target)
            return usage.free / (1024 ** 3)
        except Exception:
            return 0.0

    def clean_old_logs(self) -> int:
        log_dir = self.data_dir / "logs"
        if not log_dir.exists():
            return 0
        cutoff = datetime.now() - timedelta(days=self.log_retention_days)
        removed = 0
        for f in log_dir.iterdir():
            if f.is_file() and f.suffix in (".log", ".json"):
                mtime = datetime.fromtimestamp(f.stat().st_mtime)
                if mtime < cutoff:
                    f.unlink(missing_ok=True)
                    removed += 1
        if removed > 0:
            logger.info(f"Puliti {removed} file di log vecchi.")
        return removed

    def clean_old_screenshots(self) -> int:
        ss_dir = self.data_dir / "screenshots"
        if not ss_dir.exists():
            return 0
        cutoff = datetime.now() - timedelta(days=self.screenshot_retention_days)
        removed = 0
        for f in ss_dir.iterdir():
            if f.is_file() and f.suffix in (".png", ".jpg", ".jpeg"):
                mtime = datetime.fromtimestamp(f.stat().st_mtime)
                if mtime < cutoff:
                    f.unlink(missing_ok=True)
                    removed += 1
        if removed > 0:
            logger.info(f"Puliti {removed} screenshot vecchi.")
        return removed

    def compress_old_logs(self) -> int:
        log_dir = self.data_dir / "logs"
        if not log_dir.exists():
            return 0
        cutoff = datetime.now() - timedelta(days=3)
        compressed = 0
        for f in log_dir.iterdir():
            if f.is_file() and f.suffix == ".log":
                mtime = datetime.fromtimestamp(f.stat().st_mtime)
                if mtime < cutoff:
                    gz_path = f.with_suffix(f.suffix + ".gz")
                    if not gz_path.exists():
                        try:
                            with open(f, "rb") as f_in:
                                import gzip
                                with gzip.open(gz_path, "wb") as f_out:
                                    shutil.copyfileobj(f_in, f_out)
                            original_size = f.stat().st_size
                            f.unlink()
                            compressed += 1
                            saved = original_size - gz_path.stat().st_size
                            if saved > 1024 * 1024:
                                logger.info(f"Compresso {f.name}: risparmiati {saved // 1024}KB")
                        except Exception:
                            pass
        return compressed

    def get_data_dir_size_mb(self) -> float:
        total = 0
        for f in self.data_dir.rglob("*"):
            if f.is_file():
                total += f.stat().st_size
        return total / (1024 * 1024)

    def estimate_days_remaining(self) -> float:
        free_bytes = shutil.disk_usage(self.data_dir.absolute().anchor).free
        daily_growth = self.get_data_dir_size_mb() / max(1, (datetime.now().timestamp() - self._start_time))
        daily_growth_mb = daily_growth * 86400
        if daily_growth_mb < 1:
            return 999
        return (free_bytes / (1024 * 1024)) / daily_growth_mb

    async def _watch_loop(self):
        self._start_time = datetime.now().timestamp()
        warned = False
        while self._running:
            usage = self.get_disk_usage_percent()
            free_gb = self.get_free_space_gb()

            if usage >= self.critical_threshold:
                logger.critical(f"DISCO CRITICO: {usage:.1f}% ({free_gb:.1f}GB liberi)")
                self.clean_old_logs()
                self.clean_old_screenshots()
                self.compress_old_logs()
                if self.telegram:
                    await self.telegram.send_message(
                        f"🔥 DISCO CRITICO: {usage:.1f}% occupato. Pulizia automatica eseguita."
                    )
                if self.on_critical:
                    await self.on_critical()
                warned = True

            elif usage >= self.warning_threshold and not warned:
                logger.warning(f"DISCO IN ESAURIMENTO: {usage:.1f}% ({free_gb:.1f}GB liberi)")
                self.clean_old_logs()
                self.compress_old_logs()
                warned = True

            elif usage < self.warning_threshold:
                warned = False

            await asyncio.sleep(self.check_interval)

    async def start(self):
        self._running = True
        self._task = asyncio.create_task(self._watch_loop())
        logger.info(f"DiskWatchdog avviato (warning>{self.warning_threshold}%, critico>{self.critical_threshold}%)")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
