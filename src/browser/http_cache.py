from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

CACHE_BASE = Path("data/cache")


class HttpCacheManager:
    """Gestisce directory di cache HTTP persistente per ogni bot."""

    def __init__(self, base_path: Path = CACHE_BASE):
        self.base_path = base_path
        self.base_path.mkdir(parents=True, exist_ok=True)

    def get_cache_dir(self, bot_id: int) -> str:
        """Restituisce il percorso assoluto della cache per un bot."""
        cache_path = self.base_path / f"bot_{bot_id}"
        cache_path.mkdir(parents=True, exist_ok=True)
        return str(cache_path.resolve())

    def get_browser_args(self, bot_id: int) -> list[str]:
        """Argomenti per Playwright per abilitare la cache persistente."""
        cache_dir = self.get_cache_dir(bot_id)
        return [
            f"--disk-cache-dir={cache_dir}",
            "--disk-cache-size=104857600",
        ]

    def clear_cache(self, bot_id: int):
        """Pulisce la cache di un singolo bot."""
        cache_path = self.base_path / f"bot_{bot_id}"
        if cache_path.exists():
            shutil.rmtree(cache_path)
            logger.info(f"Cache bot {bot_id} eliminata")

    def clear_all(self):
        """Pulisce tutte le cache."""
        for path in self.base_path.iterdir():
            if path.is_dir() and path.name.startswith("bot_"):
                shutil.rmtree(path)
        logger.info("Tutte le cache eliminate")

    def get_size(self, bot_id: int) -> int:
        """Dimensione cache in byte."""
        cache_path = self.base_path / f"bot_{bot_id}"
        if not cache_path.exists():
            return 0
        total = 0
        for f in cache_path.rglob("*"):
            if f.is_file():
                total += f.stat().st_size
        return total

    def get_total_size(self) -> int:
        """Dimensione totale di tutte le cache in byte."""
        total = 0
        for path in self.base_path.iterdir():
            if path.is_dir() and path.name.startswith("bot_"):
                for f in path.rglob("*"):
                    if f.is_file():
                        total += f.stat().st_size
        return total

    def prune_old(self, max_age_days: int = 7):
        """Elimina cache non modificate da più di N giorni."""
        import time
        now = time.time()
        cutoff = now - (max_age_days * 86400)
        pruned = 0
        for path in self.base_path.iterdir():
            if path.is_dir() and path.name.startswith("bot_"):
                # controlla se CACHE_DATA esiste ed è vecchio
                meta_path = path / "CACHE_DATA"
                if meta_path.exists() and meta_path.stat().st_mtime < cutoff:
                    shutil.rmtree(path)
                    pruned += 1
        if pruned:
            logger.info(f"Cache eliminate: {pruned} (età > {max_age_days} giorni)")
