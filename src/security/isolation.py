from __future__ import annotations

import hashlib
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class CrossContaminationGuard:
    def __init__(self):
        self._interaction_log: dict[str, set[int]] = {}

    def _make_key(self, bot_a_id: int, bot_b_id: int) -> str:
        ids = sorted([bot_a_id, bot_b_id])
        return hashlib.sha256(f"{ids[0]}:{ids[1]}".encode()).hexdigest()

    def check_interaction(self, bot_a_id: int, bot_b_id: int) -> bool:
        if bot_a_id == bot_b_id:
            return True

        key = self._make_key(bot_a_id, bot_b_id)
        if key in self._interaction_log:
            logger.warning(f"Cross-contamination bloccata: bot {bot_a_id} <-> {bot_b_id}")
            return False

        self._interaction_log[key] = {bot_a_id, bot_b_id}
        return True

    def are_in_same_session(self, page) -> bool:
        return False

    def validate_bot_page(self, bot_id: int, page) -> bool:
        return True

    def get_interaction_count(self, bot_id: int) -> int:
        count = 0
        for key, bots in self._interaction_log.items():
            if bot_id in bots:
                count += 1
        return count

    def generate_isolation_hash(self, bot_id: int, target_platform: str) -> str:
        raw = f"{bot_id}:{target_platform}:isolation"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]
