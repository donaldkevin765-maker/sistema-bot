from __future__ import annotations

import logging
import platform
import subprocess
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class OSTarget(Enum):
    ANDROID = "android"
    LINUX = "linux"
    IOS = "ios"
    MACOS = "macos"


ANDROID_TCP_PARAMS = {
    "net.ipv4.tcp_congestion_control": "cubic",
    "net.ipv4.tcp_rmem": "4096 87380 6291456",
    "net.ipv4.tcp_wmem": "4096 65536 6291456",
    "net.ipv4.tcp_mtu_probing": "1",
    "net.ipv4.ip_default_ttl": "64",
    "net.core.rmem_default": "87380",
    "net.core.wmem_default": "65536",
    "net.ipv4.tcp_window_scaling": "1",
    "net.ipv4.tcp_timestamps": "1",
    "net.ipv4.tcp_sack": "1",
}

MACOS_TCP_PARAMS = {
    "net.inet.tcp.recvspace": "65536",
    "net.inet.tcp.sendspace": "65536",
    "net.inet.tcp.win_scale_factor": "3",
    "net.inet.ip.ttl": "64",
    "net.inet.tcp.mssdflt": "1460",
    "net.inet.tcp.sack": "1",
    "net.inet.tcp.window_update": "1",
}

ANDROID_MTU = 1500
ANDROID_TTL = 64
ANDROID_TCP_WINDOW = 65536


class TCPFingerprintSpoofer:
    def __init__(self, target: OSTarget = OSTarget.ANDROID):
        self.target = target
        self._original_params: dict[str, str] = {}
        self._active = False
        self._os = platform.system().lower()

    def _sysctl_get(self, key: str) -> Optional[str]:
        try:
            result = subprocess.run(
                ["sysctl", "-n", key],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception:
            pass
        return None

    def _sysctl_set(self, key: str, value: str) -> bool:
        try:
            result = subprocess.run(
                ["sysctl", "-w", f"{key}={value}"],
                capture_output=True, text=True, timeout=5
            )
            return result.returncode == 0
        except Exception:
            return False

    def apply(self) -> bool:
        if self._os == "linux":
            return self._apply_linux()
        elif self._os == "darwin":
            return self._apply_macos()
        else:
            logger.info(f"TCP fingerprint spoofing non supportato su {self._os}")
            self._active = True
            return True

    def _apply_linux(self) -> bool:
        success = True
        for key, value in ANDROID_TCP_PARAMS.items():
            original = self._sysctl_get(key)
            if original is not None:
                self._original_params[key] = original
            if not self._sysctl_set(key, value):
                logger.warning(f"Impossibile impostare {key}={value}")
                success = False
            else:
                logger.debug(f"TCP: {key} = {value}")
        if success:
            self._active = True
            logger.info(f"TCP fingerprint spoofed (Linux): TTL={ANDROID_TTL}, Window={ANDROID_TCP_WINDOW}")
        return success

    def _apply_macos(self) -> bool:
        success = True
        macos_keys = MACOS_TCP_PARAMS.keys()
        for key in macos_keys:
            original = self._sysctl_get(key)
            if original is not None:
                self._original_params[key] = original
        current = self.get_current_fingerprint()
        logger.info(f"TCP fingerprint macOS attuale: {current}")

        for key, value in MACOS_TCP_PARAMS.items():
            sysctl_key = f"{key}={value}"
            result = subprocess.run(
                ["sysctl", "-w", sysctl_key],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                logger.debug(f"TCP macOS: {key} = {value}")
            else:
                perm_key = f"net.inet.tcp.{key.split('.')[-1]}"
                if perm_key in MACOS_TCP_PARAMS:
                    perm_value = MACOS_TCP_PARAMS[key]
                    result2 = subprocess.run(
                        ["sysctl", "-w", f"{key}={perm_value}"],
                        capture_output=True, text=True, timeout=5
                    )
                    if result2.returncode != 0:
                        logger.warning(f"Impossibile impostare {key} su macOS")
                        success = False
        self._active = True
        logger.info(f"TCP fingerprint macOS configurato: TTL=64, Window scaling=3, MSS=1460")
        return success

    def restore(self) -> bool:
        if not self._active:
            return False
        success = True
        for key, value in self._original_params.items():
            if not self._sysctl_set(key, value):
                logger.warning(f"Impossibile ripristinare {key}={value}")
                success = False
        self._active = False
        logger.info("TCP fingerprint ripristinato ai valori originali.")
        return success

    @staticmethod
    def get_current_fingerprint() -> dict:
        fp = {}
        sys = platform.system().lower()
        keys = (["net.inet.ip.ttl", "net.inet.tcp.win_scale_factor",
                 "net.inet.tcp.mssdflt", "net.inet.tcp.sendspace",
                 "net.inet.tcp.recvspace", "net.inet.tcp.sack"] if sys == "darwin" else
                ["net.ipv4.ip_default_ttl", "net.ipv4.tcp_rmem",
                 "net.ipv4.tcp_wmem", "net.ipv4.tcp_congestion_control"])
        for key in keys:
            try:
                val = subprocess.run(
                    ["sysctl", "-n", key],
                    capture_output=True, text=True, timeout=5
                ).stdout.strip()
                if val:
                    fp[key] = val
            except Exception:
                pass
        return fp
