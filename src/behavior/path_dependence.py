from __future__ import annotations

import random
import logging
from collections import deque
from typing import Optional

logger = logging.getLogger(__name__)


class PathDependence:
    def __init__(self, bot_id: int, memory_size: int = 5):
        self._rng = random.Random(bot_id)
        self._memory: deque = deque(maxlen=memory_size)
        self._forbidden_sequences: list[list[str]] = [
            ["scroll", "like", "scroll", "like"],
            ["like", "like", "like"],
            ["comment", "comment"],
            ["scroll", "scroll", "scroll", "scroll"],
            ["profile", "profile"],
        ]

    def record_action(self, action: str) -> None:
        self._memory.append(action)

    def is_path_allowed(self, proposed: str) -> bool:
        if len(self._memory) < 2:
            return True

        test_seq = list(self._memory) + [proposed]
        test_seq = test_seq[-(self._memory.maxlen):]

        for forbidden in self._forbidden_sequences:
            if len(test_seq) >= len(forbidden):
                tail = test_seq[-len(forbidden):]
                if tail == forbidden:
                    return False

        return True

    def get_adjusted_probability(self, action: str, base_probability: float) -> float:
        if self.is_path_allowed(action):
            return base_probability

        reduction = 0.3 * min(len(self._memory), 3)
        return base_probability * max(0, 1 - reduction)

    def reset(self) -> None:
        self._memory.clear()
