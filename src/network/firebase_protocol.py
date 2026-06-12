from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Callable, Optional

try:
    import pyrebase
except ImportError:
    pyrebase = None

logger = logging.getLogger(__name__)

NONCE_TTL_SECONDS = 5
COMMAND_TIMEOUT_SECONDS = 30


class FirebaseCommandProtocol:
    def __init__(self, firebase_config: Optional[dict] = None):
        self._firebase = None
        self._db = None
        self._firebase_config = firebase_config or {
            "apiKey": os.getenv("FIREBASE_API_KEY", ""),
            "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN", ""),
            "databaseURL": os.getenv("FIREBASE_DATABASE_URL", ""),
            "projectId": os.getenv("FIREBASE_PROJECT_ID", ""),
        }
        self._current_nonce: Optional[str] = None
        self._command_in_progress = False
        self._stream = None
        self._on_command: Optional[Callable] = None

    def generate_nonce(self) -> str:
        return f"{uuid.uuid4().hex[:16]}_{int(time.time() * 1000)}"

    def is_nonce_valid(self, nonce: str, timestamp: int) -> bool:
        try:
            parts = nonce.split("_")
            if len(parts) != 2:
                return False
            nonce_time = int(parts[1])
            now_ms = int(time.time() * 1000)
            age_sec = (now_ms - nonce_time) / 1000.0
            if age_sec > NONCE_TTL_SECONDS:
                logger.warning(f"Nonce scaduto: {age_sec:.1f}s > {NONCE_TTL_SECONDS}s")
                return False
            return True
        except (ValueError, IndexError):
            return False

    def create_command(
        self,
        azione: str,
        piattaforma: str = "youtube",
        params: Optional[dict] = None,
    ) -> dict:
        nonce = self.generate_nonce()
        timestamp = int(time.time() * 1000)
        return {
            "nonce": nonce,
            "timestamp": timestamp,
            "azione": azione,
            "piattaforma": piattaforma,
            "params": params or {},
            "stato": "PENDING",
        }

    async def send_command(self, azione: str, piattaforma: str = "youtube", params: Optional[dict] = None) -> Optional[str]:
        if not self._db:
            logger.error("Firebase non inizializzato.")
            return None

        command = self.create_command(azione, piattaforma, params)
        nonce = command["nonce"]

        try:
            await asyncio.to_thread(
                self._db.child("sistema").child("comando").set,
                command
            )
            logger.info(f"Comando inviato: {azione} su {piattaforma} [nonce={nonce[:8]}...]")

            await self._wait_for_ack(nonce)
            return nonce
        except Exception as e:
            logger.error(f"Invio comando fallito: {e}")
            return None

    async def _wait_for_ack(self, nonce: str, timeout: float = COMMAND_TIMEOUT_SECONDS) -> bool:
        start = time.time()
        while time.time() - start < timeout:
            try:
                stato = await asyncio.to_thread(
                    lambda: self._db.child("sistema").child("comando").child("stato").get().val()
                )
                if stato == "RUNNING":
                    logger.info(f"Comando {nonce[:8]}... ACK ricevuto, stato=RUNNING")
                    return True
            except Exception:
                pass
            await asyncio.sleep(0.5)
        logger.warning(f"Timeout attesa ACK per nonce {nonce[:8]}...")
        return False

    async def process_incoming_command(self, command_data: dict) -> Optional[dict]:
        if not command_data or not isinstance(command_data, dict):
            return None

        azione = command_data.get("azione")
        nonce = command_data.get("nonce")
        timestamp = command_data.get("timestamp", 0)
        piattaforma = command_data.get("piattaforma", "youtube")
        params = command_data.get("params", {})
        stato = command_data.get("stato")

        if not nonce or not azione:
            logger.warning("Comando senza nonce o azione. Ignorato.")
            return None

        if not self.is_nonce_valid(nonce, timestamp):
            logger.warning(f"Nonce {nonce[:8]}... non valido o scaduto. Ignorato.")
            return None

        if self._command_in_progress:
            logger.warning(f"Comando {nonce[:8]}... ignorato: già in esecuzione.")
            return None

        if stato == "RUNNING":
            logger.info(f"Comando già in esecuzione. Ignorato.")
            return None

        self._command_in_progress = True
        self._current_nonce = nonce

        try:
            await asyncio.to_thread(
                lambda: self._db.child("sistema").child("comando").update(
                    {"stato": "RUNNING", "accettato": True, "accettato_timestamp": int(time.time() * 1000)}
                )
            )

            return {
                "nonce": nonce,
                "azione": azione,
                "piattaforma": piattaforma,
                "params": params,
            }
        except Exception as e:
            logger.error(f"Errore processamento comando: {e}")
            self._command_in_progress = False
            return None

    async def complete_command(self, success: bool = True, result: Optional[dict] = None) -> None:
        if not self._db or not self._current_nonce:
            return

        try:
            await asyncio.to_thread(
                lambda: self._db.child("sistema").child("comando").update({
                    "stato": "IDLE",
                    "completato": True,
                    "success": success,
                    "completato_timestamp": int(time.time() * 1000),
                    "ultimo_risultato": result or {},
                })
            )
            logger.info(f"Comando {self._current_nonce[:8]}... completato.")
        except Exception as e:
            logger.error(f"Errore completamento comando: {e}")
        finally:
            self._command_in_progress = False
            self._current_nonce = None

    def _handle_stream(self, message: dict) -> None:
        if message.get("event") == "put":
            data = message.get("data")
            if isinstance(data, dict):
                nonce = data.get("nonce")
                timestamp = data.get("timestamp")
                stato = data.get("stato")

                if nonce and stato and stato != "RUNNING":
                    if self.is_nonce_valid(nonce, timestamp):
                        logger.info(f"Comando rilevato: {data.get('azione')} [nonce={nonce[:8]}...]")
                        if self._on_command:
                            self._on_command(data)

    def stream_listen(self, on_command: Callable) -> None:
        if not self._db:
            logger.error("Firebase non inizializzato.")
            return
        self._on_command = on_command
        self._stream = self._db.child("sistema").child("comando").stream(self._handle_stream)
        logger.info("In ascolto comandi Firebase (nonce + stampo 5s)...")

    def connect(self) -> bool:
        if not pyrebase:
            logger.error("pyrebase non installato.")
            return False
        try:
            self._firebase = pyrebase.initialize_app(self._firebase_config)
            self._db = self._firebase.database()
            return True
        except Exception as e:
            logger.error(f"Firebase connection failed: {e}")
            return False

    def disconnect(self) -> None:
        if self._stream:
            self._stream.close()
        self._db = None
        self._firebase = None
        logger.info("Firebase disconnesso.")
