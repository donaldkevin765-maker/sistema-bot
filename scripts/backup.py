#!/usr/bin/env python3
"""Backup automatico cifrato su USB. Uso: python scripts/backup.py --mount /Volumes/USB --key ./chiave.key"""

from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("backup")

SOURCE_DIRS = [
    "data/passports",
    "data/profiles",
    "data/logs",
]

SOURCE_FILES = [
    "database.py",
    ".env.example",
    "requirements.txt",
]

EXCLUDE_PATTERNS = ["*.pyc", "__pycache__", ".git", "*.log.gz"]


def encrypt_file(key_path: Path, src: Path, dst: Path) -> bool:
    """Cifra file con openssl aes-256-cbc."""
    try:
        subprocess.run(
            ["openssl", "enc", "-aes-256-cbc", "-salt",
             "-in", str(src), "-out", str(dst),
             "-pass", f"file:{key_path}"],
            check=True, capture_output=True, timeout=60
        )
        return True
    except Exception as e:
        logger.error(f"Cifratura fallita {src.name}: {e}")
        return False


def decrypt_file(key_path: Path, src: Path, dst: Path) -> bool:
    try:
        subprocess.run(
            ["openssl", "enc", "-d", "-aes-256-cbc",
             "-in", str(src), "-out", str(dst),
             "-pass", f"file:{key_path}"],
            check=True, capture_output=True, timeout=60
        )
        return True
    except Exception as e:
        logger.error(f"Decifratura fallita {src.name}: {e}")
        return False


def generate_key(key_path: Path) -> bool:
    key = os.urandom(32)
    try:
        key_path.write_bytes(key)
        key_path.chmod(0o600)
        logger.info(f"Chiave generata: {key_path}")
        return True
    except Exception as e:
        logger.error(f"Generazione chiave fallita: {e}")
        return False


def backup(args):
    mount = Path(args.mount)
    if not mount.is_dir():
        logger.error(f"Mount point non trovato: {mount}")
        logger.error("Inserisci la chiave USB e montala (es. su /Volutes/USB)")
        return False

    backup_dir = mount / f"sistema-bot-backup-{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    backup_dir.mkdir(parents=True)

    key_path = Path(args.key) if args.key else mount / "backup.key"
    if not key_path.exists():
        logger.warning(f"Chiave non trovata. Genero nuova chiave in {key_path}")
        generate_key(key_path)

    manifest = {
        "timestamp": datetime.now().isoformat(),
        "hostname": os.uname().nodename,
        "source_dirs": SOURCE_DIRS,
        "source_files": SOURCE_FILES,
        "files": [],
    }

    root = Path(args.root or os.getcwd())

    for dirname in SOURCE_DIRS:
        src = root / dirname
        if src.is_dir():
            dst = backup_dir / dirname
            dst.mkdir(parents=True, exist_ok=True)
            for f in src.rglob("*"):
                if f.is_file() and not any(f.match(pat) for pat in EXCLUDE_PATTERNS):
                    rel = f.relative_to(root)
                    enc_path = backup_dir / f"{rel}.enc"
                    enc_path.parent.mkdir(parents=True, exist_ok=True)
                    if encrypt_file(key_path, f, enc_path):
                        manifest["files"].append(str(rel))

    for fname in SOURCE_FILES:
        src = root / fname
        if src.exists():
            enc_path = backup_dir / f"{fname}.enc"
            if encrypt_file(key_path, src, enc_path):
                manifest["files"].append(fname)

    manifest_path = backup_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    with open(backup_dir / "MANIFEST.txt", "w") as f:
        f.write(f"Backup Sistema Bot\n")
        f.write(f"Data: {manifest['timestamp']}\n")
        f.write(f"Host: {manifest['hostname']}\n")
        f.write(f"Files: {len(manifest['files'])}\n")
        f.write(f"Chiave: {key_path}\n")

    total_size = sum(f.stat().st_size for f in backup_dir.rglob("*") if f.is_file())
    logger.info(f"Backup completato: {backup_dir}")
    logger.info(f"Files: {len(manifest['files'])}, Dimensione: {total_size / 1024 / 1024:.1f}MB")
    logger.info(f"Chiave: {key_path} (NON PERDERE QUESTO FILE)")
    return True


def main():
    parser = argparse.ArgumentParser(description="Backup cifrato Sistema Bot")
    parser.add_argument("--mount", default="/Volumes/USB", help="Mount point USB")
    parser.add_argument("--key", help="Percorso chiave cifratura (default: <mount>/backup.key)")
    parser.add_argument("--root", default=os.getcwd(), help="Root del progetto")
    parser.add_argument("--generate-key", action="store_true", help="Genera nuova chiave")
    args = parser.parse_args()

    if args.generate_key:
        key_path = Path(args.key or input("Percorso chiave: "))
        generate_key(key_path)
        return

    backup(args)


if __name__ == "__main__":
    main()
