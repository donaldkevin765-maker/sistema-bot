from __future__ import annotations

import asyncio
import logging
import os
import signal
import sys
import time
from typing import Optional

from database import init_db, lista_bot, get_statistiche, registra_attivita
from src.network.firebase_protocol import FirebaseCommandProtocol
from src.network.ip_verifier import IPVerifier
from src.network.anchoring import NetworkAnchoring
from src.system import SistemaBot
from src.wiki_hook import wiki_hook

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("local-agent")

FIREBASE_CONFIG = {
    "apiKey": os.getenv("FIREBASE_API_KEY", ""),
    "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN", ""),
    "databaseURL": os.getenv("FIREBASE_DATABASE_URL", ""),
    "projectId": os.getenv("FIREBASE_PROJECT_ID", ""),
    "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET", ""),
}


class LocalAgent:
    def __init__(self):
        init_db()
        self.sistema = SistemaBot()
        self.protocol = FirebaseCommandProtocol(FIREBASE_CONFIG)
        self.ip_verifier = IPVerifier()
        self.anchoring = NetworkAnchoring()
        self._running = False
        self._agent_id = os.getenv("AGENT_ID", f"agent-{os.uname().nodename}")

    def _on_command(self, command_data: dict) -> None:
        asyncio.create_task(self._handle_command(command_data))

    async def _handle_command(self, command_data: dict) -> None:
        parsed = await self.protocol.process_incoming_command(command_data)
        if not parsed:
            return

        azione = parsed["azione"]
        piattaforma = parsed["piattaforma"]
        params = parsed["params"]

        logger.info(f"Comando VALIDO: {azione} su {piattaforma}")

        if azione == "START_FLOTTA":
            await self._execute_fleet(piattaforma, params)
        elif azione == "STOP_FLOTTA":
            await self.sistema.stop_fleet()
            await self.protocol.complete_command(success=True)
        elif azione == "STATUS":
            stats = get_statistiche()
            await self.protocol.complete_command(success=True, result=stats)

    async def _execute_fleet(self, piattaforma: str, params: dict) -> None:
        logger.info("FASE 1: Verifica ancoraggio rete...")
        if not self.anchoring.check_anchoring():
            logger.critical("ANCORAGGIO RETE FALLITO. Arresto immediato.")
            await self.protocol.complete_command(
                success=False,
                result={"errore": "Rete non ancorata al telefono. Connessione WiFi/Fibra rilevata."}
            )
            return

        logger.info(f"FASE 2: Verifica IP per primo bot...")
        if not await self.ip_verifier.safe_launch_browser(0, "", None):
            logger.critical("IP non verificato. Arresto.")
            await self.protocol.complete_command(
                success=False,
                result={"errore": "IP non cambiato dopo ciclo modalità aereo."}
            )
            return

        logger.info("FASE 3: Inizializzazione sistema...")
        try:
            await self.sistema.init_system()
        except Exception as e:
            logger.critical(f"Inizializzazione fallita: {e}")
            await self.protocol.complete_command(success=False, result={"errore": str(e)})
            return

        logger.info(f"FASE 4: Avvio flotta su {piattaforma}...")
        try:
            await self.sistema.start_fleet(piattaforma=piattaforma)
            await self.protocol.complete_command(success=True, result={"stato": "completato"})
        except Exception as e:
            logger.error(f"Flotta fallita: {e}")
            await self.protocol.complete_command(success=False, result={"errore": str(e)})
        finally:
            await self.sistema.shutdown()

    async def start(self) -> None:
        self._running = True

        logger.info("FASE 0: Verifica ancoraggio di rete iniziale...")
        if not self.anchoring.check_anchoring():
            logger.critical("ANCORAGGIO RETE FALLITO. Il PC non è connesso via telefono.")
            logger.critical("Collega il telefono via USB e abilita il tethering/RNDIS.")
            sys.exit(1)

        if not self.protocol.connect():
            logger.error("Firebase non connesso. Check credenziali.")
            sys.exit(1)

        logger.info(f"Agente locale {self._agent_id} in ascolto su Firebase...")

        wiki_hook.log_event(0, "agent_start", f"Agente {self._agent_id} avviato")
        self.protocol.stream_listen(on_command=self._on_command)

        loop = asyncio.get_running_loop()
        stop_signal = loop.create_future()

        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, lambda: stop_signal.set_result(True))
            except NotImplementedError:
                pass

        await stop_signal

    async def shutdown(self) -> None:
        logger.info("Arresto agente locale...")
        await self.sistema.shutdown()
        self.protocol.disconnect()
        logger.info("Agente arrestato.")


async def main() -> None:
    agent = LocalAgent()
    try:
        await agent.start()
    finally:
        await agent.shutdown()


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
