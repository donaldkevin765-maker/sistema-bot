"""Avvia flotta bot locale (senza Firebase)."""
import asyncio
import logging
import os
import signal
import sys

from database import init_db, get_statistiche
from src.network.ip_verifier import IPVerifier
from src.network.anchoring import NetworkAnchoring
from src.system import SistemaBot

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("local-agent")


class LocalAgent:
    def __init__(self, piattaforma: str):
        init_db()
        self.sistema = SistemaBot()
        self.ip_verifier = IPVerifier()
        self.anchoring = NetworkAnchoring()
        self._piattaforma = piattaforma
        self._running = False
        self._agent_id = os.getenv("AGENT_ID", f"agent-{os.uname().nodename}")

    async def start(self) -> None:
        self._running = True

        logger.info("FASE 0: Verifica ancoraggio di rete iniziale...")
        if not self.anchoring.check_anchoring():
            logger.critical("ANCORAGGIO RETE FALLITO. Il PC non è connesso via telefono.")
            logger.critical("Collega il telefono via USB e abilita il tethering/RNDIS.")
            sys.exit(1)

        logger.info("FASE 1: Verifica IP...")
        if not await self.ip_verifier.safe_launch_browser(0, "", None):
            logger.critical("IP non verificato. Arresto.")
            sys.exit(1)

        logger.info("FASE 2: Inizializzazione sistema...")
        try:
            await self.sistema.init_system()
        except Exception as e:
            logger.critical(f"Inizializzazione fallita: {e}")
            sys.exit(1)

        logger.info(f"FASE 3: Avvio flotta su {self._piattaforma}...")
        try:
            await self.sistema.start_fleet(piattaforma=self._piattaforma)
        except Exception as e:
            logger.error(f"Flotta fallita: {e}")
        finally:
            await self.sistema.shutdown()

    async def shutdown(self) -> None:
        await self.sistema.shutdown()
        logger.info("Agente arrestato.")


async def main() -> None:
    piattaforma = sys.argv[1] if len(sys.argv) > 1 else "youtube"
    agent = LocalAgent(piattaforma)
    try:
        await agent.start()
    finally:
        await agent.shutdown()


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
