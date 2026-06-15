from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

WIKI_DIR = Path(__file__).parent.parent / "AI ASSISTENT"
CLI_PATH = WIKI_DIR / "cli.py"
RAG_DIR = WIKI_DIR / "rag" / "data"


class WikiHook:
    def __init__(self, enabled: bool = True):
        self.enabled = enabled and CLI_PATH.exists()
        self._session_log: list[dict] = []

    def _run_cli(self, *args: str) -> str:
        if not self.enabled:
            return ""
        try:
            result = subprocess.run(
                [sys.executable, str(CLI_PATH), *args],
                capture_output=True, text=True, timeout=30,
                cwd=str(WIKI_DIR),
            )
            return result.stdout + result.stderr
        except Exception as e:
            logger.debug(f"WikiHook CLI error: {e}")
            return ""

    def source_project(self, project_dir: Optional[Path] = None) -> str:
        if not self.enabled:
            return "Wiki disabilitato"
        src_dir = project_dir or Path(__file__).parent
        return self._run_cli("source", str(src_dir))

    def reindex(self) -> str:
        if not self.enabled:
            return "Wiki disabilitato"
        return self._run_cli("index")

    def log_event(self, bot_id: int, event_type: str, description: str, data: Optional[dict] = None) -> None:
        if not self.enabled:
            return
        entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "bot_id": bot_id,
            "type": event_type,
            "description": description,
            "data": data or {},
        }
        self._session_log.append(entry)
        log_path = RAG_DIR / "event_log.jsonl"
        try:
            RAG_DIR.mkdir(parents=True, exist_ok=True)
            with open(log_path, "a") as f:
                f.write(json.dumps(entry) + "\n")
        except Exception as e:
            logger.debug(f"WikiHook log error: {e}")

    def get_session_summary(self) -> str:
        if not self._session_log:
            return "Nessun evento nella sessione."
        lines = [f"# Report Sessione ({len(self._session_log)} eventi)\n"]
        for e in self._session_log[-20:]:
            lines.append(f"- Bot {e['bot_id']}: {e['type']} — {e['description']}")
        return "\n".join(lines)

    def save_session_report(self) -> Optional[Path]:
        if not self._session_log or not self.enabled:
            return None
        summary = self.get_session_summary()
        report_path = WIKI_DIR / "wiki" / "session" / f"report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.md"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(summary)
        return report_path

    def query(self, question: str) -> str:
        if not self.enabled:
            return "Wiki disabilitato"
        return self._run_cli("ask", question)

wiki_hook = WikiHook(enabled=bool(os.getenv("WIKI_ENABLED", "true") == "true"))
