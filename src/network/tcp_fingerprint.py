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

ANDROID_MTU = 1500
ANDROID_TTL = 64
ANDROID_TCP_WINDOW = 65536


class TCPFingerprintSpoofer:
    def __init__(self, target: OSTarget = OSTarget.ANDROID):
        self.target = target
        self._original_params: dict[str, str] = {}
        self._active = False

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
        if platform.system().lower() != "darwin":
            logger.warning("TCP fingerprint spoofing supporta solo macOS via sysctl.")
            return False

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
            logger.info(f"TCP fingerprint spoofed: TTL={ANDROID_TTL}, Window={ANDROID_TCP_WINDOW}, MTU={ANDROID_MTU}")
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
        if platform.system().lower() == "darwin":
            for key in [
                "net.inet.ip.ttl",
                "net.inet.tcp.win_scale_factor",
                "net.inet.tcp.mssdflt",
                "net.inet.tcp.sendspace",
                "net.inet.tcp.recvspace",
            ]:
                val = subprocess.run(
                    ["sysctl", "-n", key],
                    capture_output=True, text=True, timeout=5
                ).stdout.strip()
                fp[key] = val
        return fp
