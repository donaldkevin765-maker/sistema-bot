from __future__ import annotations

import asyncio
import logging
import os
import platform
import subprocess
from typing import Optional

logger = logging.getLogger(__name__)


class NetworkAnchoring:
    def __init__(self):
        self._phone_interfaces: list[str] = []
        self._disconnect_count = 0
        self._anchor_interface: Optional[str] = None

    def _get_active_interfaces_darwin(self) -> list[str]:
        try:
            result = subprocess.run(
                ["ifconfig"],
                capture_output=True, text=True, timeout=5
            )
            interfaces = []
            current_iface = None
            for line in result.stdout.split("\n"):
                if line and not line.startswith(" "):
                    current_iface = line.split(":")[0]
                if "status: active" in line and current_iface:
                    if current_iface != "lo0":
                        interfaces.append(current_iface)
            return interfaces
        except Exception:
            return []

    def _get_active_interfaces_linux(self) -> list[str]:
        try:
            result = subprocess.run(
                ["ip", "link", "show", "up"],
                capture_output=True, text=True, timeout=5
            )
            interfaces = []
            for line in result.stdout.split("\n"):
                if "state UP" in line and ":" in line:
                    iface = line.split(":")[1].strip().split("@")[0]
                    if iface != "lo":
                        interfaces.append(iface)
            return interfaces
        except Exception:
            return []

    def _get_active_interfaces_windows(self) -> list[str]:
        try:
            result = subprocess.run(
                ["wmic", "nic", "get", "NetConnectionID", "NetEnabled"],
                capture_output=True, text=True, timeout=10
            )
            interfaces = []
            for line in result.stdout.split("\n")[1:]:
                if "TRUE" in line or "true" in line:
                    name = line.split("TRUE")[0].strip() or line.split("true")[0].strip()
                    if name:
                        interfaces.append(name)
            return interfaces
        except Exception:
            return []

    def detect_phone_interfaces(self) -> list[str]:
        system = platform.system().lower()
        if system == "darwin":
            interfaces = self._get_active_interfaces_darwin()
        elif system == "linux":
            interfaces = self._get_active_interfaces_linux()
        elif system == "windows":
            interfaces = self._get_active_interfaces_windows()
        else:
            return []

        phone_ifaces = []
        for iface in interfaces:
            iface_lower = iface.lower()
            for pat in [
                "rndis", "usb", "enx", "enp0s20u", "eth1", "wwan",
                "rmnet", "ccmni", "pdp", "ue0", "android",
                "ncm", "ecm", "eem", "iphone", "ipheth",
            ]:
                if pat in iface_lower:
                    phone_ifaces.append(iface)
                    break

        self._phone_interfaces = phone_ifaces
        if phone_ifaces:
            self._anchor_interface = phone_ifaces[0]
            logger.info(f"Interfacce telefono rilevate: {phone_ifaces}")
        return phone_ifaces

    def is_anchored_to_phone(self) -> bool:
        interfaces = self.detect_phone_interfaces()
        return len(interfaces) > 0

    def get_default_interface(self) -> Optional[str]:
        system = platform.system().lower()
        try:
            if system == "darwin":
                result = subprocess.run(
                    ["route", "-n", "get", "default"],
                    capture_output=True, text=True, timeout=5
                )
                for line in result.stdout.split("\n"):
                    if "interface:" in line:
                        return line.split("interface:")[1].strip()
            elif system == "linux":
                result = subprocess.run(
                    ["ip", "route", "show", "default"],
                    capture_output=True, text=True, timeout=5
                )
                parts = result.stdout.strip().split()
                if "dev" in parts:
                    idx = parts.index("dev")
                    if idx + 1 < len(parts):
                        return parts[idx + 1]
        except Exception:
            pass
        return None

    def check_anchoring(self) -> bool:
        default_iface = self.get_default_interface()
        if not default_iface:
            logger.warning("Nessuna interfaccia di default rilevata.")
            return False

        default_lower = default_iface.lower()
        for pat in [
            "rndis", "usb", "enx", "wwan", "rmnet", "ccmni",
            "pdp", "ue0", "ncm", "ecm", "iphone", "ipheth",
            "enp0s20u",
        ]:
            if pat in default_lower:
                logger.info(f"Ancoraggio OK: interfaccia {default_iface} è telefono")
                return True

        logger.critical(
            f"ANCORAGGIO RETE FALLITO! Interfaccia {default_iface} non è il telefono. "
            "Connessione via WiFi/Fibra rilevata. PLAYWRIGHT BLOCCATO."
        )
        self._disconnect_count += 1
        return False

    async def enforce_anchoring(self) -> bool:
        if not self.check_anchoring():
            logger.critical("SICUREZZA: Connessione non via telefono. Uscita immediata.")
            os._exit(1)
            return False
        return True

    def reset(self):
        self._disconnect_count = 0

    @property
    def disconnect_count(self) -> int:
        return self._disconnect_count
