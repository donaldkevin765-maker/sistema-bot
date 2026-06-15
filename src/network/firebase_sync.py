"""Sincronizzazione automatica SQLite → Firebase Realtime Database."""

from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime
from typing import Optional

try:
    import pyrebase
except ImportError:
    pyrebase = None

logger = logging.getLogger(__name__)


_firebase_instance = None
_db_instance = None
_lock = threading.Lock()


def _get_firebase_db():
    global _firebase_instance, _db_instance
    if _db_instance is not None:
        return _db_instance

    with _lock:
        if _db_instance is not None:
            return _db_instance

        config = {
            "apiKey": os.getenv("FIREBASE_API_KEY", ""),
            "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN", ""),
            "databaseURL": os.getenv("FIREBASE_DATABASE_URL", ""),
            "projectId": os.getenv("FIREBASE_PROJECT_ID", ""),
        }

        if not config["databaseURL"] or not config["apiKey"]:
            return None

        if not pyrebase:
            logger.warning("pyrebase non installato, sync Firebase disabilitato")
            return None

        try:
            _firebase_instance = pyrebase.initialize_app(config)
            _db_instance = _firebase_instance.database()
            logger.info("Firebase sync connesso")
            return _db_instance
        except Exception as e:
            logger.warning(f"Firebase sync non disponibile: {e}")
            return None


def sync_bot(bot_data: dict) -> None:
    db = _get_firebase_db()
    if not db:
        return
    try:
        bot_id = bot_data.get("bot_id")
        if bot_id is None:
            return
        db.child("bots").child(str(bot_id)).set(bot_data)
    except Exception as e:
        logger.debug(f"Firebase sync bot fallito: {e}")


def sync_delete_bot(bot_id: int) -> None:
    db = _get_firebase_db()
    if not db:
        return
    try:
        db.child("bots").child(str(bot_id)).remove()
    except Exception as e:
        logger.debug(f"Firebase sync delete fallito: {e}")


def sync_attivita(attivita_data: dict) -> None:
    db = _get_firebase_db()
    if not db:
        return
    try:
        azione_id = attivita_data.get("azione_id")
        if azione_id is None:
            return
        db.child("attivita").child(str(azione_id)).set(attivita_data)
    except Exception as e:
        logger.debug(f"Firebase sync attivita fallito: {e}")


def sync_stats(stats: dict) -> None:
    db = _get_firebase_db()
    if not db:
        return
    try:
        db.child("stats").set(stats)
    except Exception as e:
        logger.debug(f"Firebase sync stats fallito: {e}")


def sync_heartbeat(bot_id: int, stato: str, piattaforma: str) -> None:
    db = _get_firebase_db()
    if not db:
        return
    try:
        db.child("heartbeat").child(str(bot_id)).set({
            "bot_id": bot_id,
            "stato": stato,
            "piattaforma": piattaforma,
            "timestamp": datetime.utcnow().isoformat(),
        })
    except Exception as e:
        logger.debug(f"Firebase sync heartbeat fallito: {e}")


def is_connected() -> bool:
    return _db_instance is not None


def disconnect() -> None:
    global _firebase_instance, _db_instance
    _firebase_instance = None
    _db_instance = None
