from __future__ import annotations

import logging
import platform
import subprocess
from typing import Optional

logger = logging.getLogger(__name__)


OPERATOR_DNS: dict[str, list[str]] = {
    "vodafone": ["92.40.142.233", "92.40.142.234", "92.40.142.235"],
    "tim": ["85.37.17.30", "85.38.28.97", "85.38.28.98"],
    "windtre": ["62.211.0.1", "62.211.1.1"],
    "iliad": ["94.177.104.99", "94.177.108.99"],
    "fastweb": ["85.18.200.100", "85.18.200.200"],
    "sky": ["95.110.131.14", "95.110.131.15"],
    "postemobile": ["10.10.10.10", "10.10.10.20"],
    "coopvoce": ["212.45.60.60", "212.45.60.61"],
    "kpn": ["212.54.128.186", "212.54.128.187"],
    "t-mobile": ["193.254.160.1", "193.254.160.2"],
    "orange": ["80.12.127.18", "80.12.127.19"],
    "telefonica": ["81.203.1.2", "81.203.1.3"],
}


class DNSManager:
    def __init__(self):
        self._current_operator: Optional[str] = None
        self._original_resolvers: list[str] = []
        self._active = False

    def set_operator(self, operator: str) -> bool:
        operator = operator.lower().replace(" ", "")
        if operator not in OPERATOR_DNS:
            logger.warning(f"DNS per operatore '{operator}' non trovato. Disponibili: {list(OPERATOR_DNS.keys())}")
            return False
        self._current_operator = operator
        return True

    def get_dns_for_operator(self, operator: str) -> list[str]:
        return OPERATOR_DNS.get(operator.lower().replace(" ", ""), [])

    def _save_original_dns(self) -> None:
        system = platform.system().lower()
        if system == "darwin":
            try:
                result = subprocess.run(
                    ["scutil", "--dns"],
                    capture_output=True, text=True, timeout=5
                )
                for line in result.stdout.split("\n"):
                    if "nameserver" in line and ":" in line:
                        ns = line.split(":")[1].strip()
                        if ns not in ("127.0.0.1", "::1"):
                            self._original_resolvers.append(ns)
            except Exception as e:
                logger.error(f"Errore salvataggio DNS: {e}")

    def apply_operator_dns(self) -> bool:
        if not self._current_operator:
            logger.error("Nessun operatore impostato.")
            return False

        dns_servers = OPERATOR_DNS[self._current_operator]
        self._save_original_dns()

        system = platform.system().lower()
        if system == "darwin":
            try:
                for dns in dns_servers:
                    subprocess.run(
                        ["networksetup", "-setdnsservers", "Wi-Fi"] + dns_servers,
                        capture_output=True, text=True, timeout=10
                    )
                self._active = True
                logger.info(f"DNS forzati a {self._current_operator}: {dns_servers}")
                return True
            except Exception as e:
                logger.error(f"Errore impostazione DNS: {e}")
                return False
        elif system == "linux":
            try:
                with open("/etc/resolv.conf", "w") as f:
                    for dns in dns_servers:
                        f.write(f"nameserver {dns}\n")
                self._active = True
                logger.info(f"DNS forzati a {self._current_operator}: {dns_servers}")
                return True
            except Exception as e:
                logger.error(f"Errore impostazione DNS: {e}")
                return False
        else:
            logger.warning(f"DNS forcing non supportato su {system}")
            return False

    def restore_original_dns(self) -> bool:
        if not self._active:
            return False
        system = platform.system().lower()
        if system == "darwin":
            try:
                subprocess.run(
                    ["networksetup", "-setdnsservers", "Wi-Fi"] + self._original_resolvers,
                    capture_output=True, text=True, timeout=10
                )
                self._active = False
                logger.info("DNS ripristinati ai valori originali.")
                return True
            except Exception:
                return False
        return False

    def validate_dns_match(self, ip_country: str, operator: str) -> bool:
        dns_for_op = OPERATOR_DNS.get(operator.lower().replace(" ", ""), [])
        return len(dns_for_op) > 0
