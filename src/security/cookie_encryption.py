from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
from typing import Optional

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

logger = logging.getLogger(__name__)


class CookieEncryption:
    def __init__(self, master_key: Optional[str] = None):
        self._master_key = master_key or os.getenv("COOKIE_ENCRYPTION_KEY", "")

    def _derive_key(self, bot_id: int, salt: bytes) -> bytes:
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        raw = self._master_key.encode() + str(bot_id).encode()
        return base64.urlsafe_b64encode(kdf.derive(raw))

    def encrypt_cookies(self, cookies: list[dict], bot_id: int) -> str:
        salt = os.urandom(16)
        key = self._derive_key(bot_id, salt)
        cipher = Fernet(key)
        data = json.dumps(cookies).encode()
        encrypted = cipher.encrypt(data)
        return base64.b64encode(salt + encrypted).decode()

    def decrypt_cookies(self, encrypted_data: str, bot_id: int) -> list[dict]:
        try:
            raw = base64.b64decode(encrypted_data)
            salt = raw[:16]
            encrypted = raw[16:]
            key = self._derive_key(bot_id, salt)
            cipher = Fernet(key)
            decrypted = cipher.decrypt(encrypted)
            return json.loads(decrypted.decode())
        except Exception as e:
            logger.error(f"Decrypt cookies fallito per bot {bot_id}: {e}")
            return []

    def encrypt_value(self, value: str, bot_id: int) -> str:
        key_hash = hashlib.sha256(
            f"{self._master_key}:{bot_id}".encode()
        ).hexdigest()[:32]
        cipher = Fernet(base64.urlsafe_b64encode(key_hash.encode().ljust(32)[:32]))
        return cipher.encrypt(value.encode()).decode()

    def decrypt_value(self, encrypted: str, bot_id: int) -> str:
        try:
            key_hash = hashlib.sha256(
                f"{self._master_key}:{bot_id}".encode()
            ).hexdigest()[:32]
            cipher = Fernet(base64.urlsafe_b64encode(key_hash.encode().ljust(32)[:32]))
            return cipher.decrypt(encrypted.encode()).decode()
        except Exception as e:
            logger.error(f"Decrypt value fallito per bot {bot_id}: {e}")
            return ""
