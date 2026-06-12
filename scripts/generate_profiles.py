#!/usr/bin/env python3
"""Genera 1000 profili bot con passport, username, bio, fingerprint univoci."""

import argparse
import hashlib
import json
import os
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.behavior.identity_generator import IdentityGenerator
from src.behavior.biological_schedule import BiologicalScheduler
from database import init_db, inserisci_bot


USER_AGENTS_MOBILE = [
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; Samsung Galaxy S24) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; Xiaomi 13 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.179 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; OnePlus 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; OPPO Find X6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.179 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; vivo X100 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 12; Huawei P60 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.118 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; Nothing Phone 2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.179 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; Motorola Edge 50) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 12; Sony Xperia 1 V) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.118 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; Google Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; Samsung Galaxy A54) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.179 Mobile Safari/537.36",
]

PLATFORMS = ["youtube", "tiktok", "instagram"]
IP_PREFIXES = [
    "10.", "172.16.", "192.168.", "100.", "93.", "95.", "87.", "79.",
    "151.", "176.", "5.", "31.", "37.", "2.", "62.", "82.",
]

PASSWORDS = [
    "Password123!", "CiaoMondo1!", "Firenze2023!", "Italia2024!",
    "Rome2023!", "Milano2024!", "Napoli123!", "Pizza2024!",
    "Sole12345!", "Luna2024!", "Stella123!", "Fiore2024!",
]


def generate_ip(rng: random.Random) -> str:
    prefix = rng.choice(IP_PREFIXES)
    if prefix.endswith("."):
        return f"{prefix}{rng.randint(1, 254)}.{rng.randint(1, 254)}.{rng.randint(1, 254)}"
    return f"{prefix}{rng.randint(1, 254)}.{rng.randint(1, 254)}.{rng.randint(1, 254)}"


def main():
    parser = argparse.ArgumentParser(description="Genera profili bot in batch")
    parser.add_argument("--count", type=int, default=1000, help="Numero di profili (default: 1000)")
    parser.add_argument("--output", type=str, default="data/passports", help="Cartella output passport")
    parser.add_argument("--platform", type=str, choices=PLATFORMS + ["all"], default="all", help="Piattaforma target")
    parser.add_argument("--db", action="store_true", help="Registra anche su database.sqlite")
    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.db:
        init_db()

    platforms = PLATFORMS if args.platform == "all" else [args.platform]
    rng = random.Random(42)

    print(f"Generazione {args.count} profili...")
    start = datetime.now(timezone.utc)

    for bot_id in range(1, args.count + 1):
        ident = IdentityGenerator(bot_id)
        bio_sched = BiologicalScheduler(bot_id)
        bot_rng = random.Random(bot_id * 1337 + 42)

        ua = bot_rng.choice(USER_AGENTS_MOBILE)
        canvas_seed = bot_rng.uniform(0.000001, 999999.999999)
        ip = generate_ip(bot_rng)

        passport_dir = output_dir / f"passport_{bot_id}"
        passport_dir.mkdir(parents=True, exist_ok=True)

        passport = {
            "bot_id": bot_id,
            "username": ident.generate_username(f"user{bot_id}"),
            "password": bot_rng.choice(PASSWORDS),
            "display_name": ident.generate_display_name(f"user{bot_id}"),
            "platforms": {},
            "canvas_seed": canvas_seed,
            "user_agent": ua,
            "ip_address": ip,
            "timezone": "Europe/Rome",
            "locale": "it-IT",
            "screen_resolution": f"{412 + bot_rng.randint(-3, 3)}x{915 + bot_rng.randint(-3, 3)}",
            "device_memory": bot_rng.choice([2, 4, 4, 6, 8]),
            "hardware_concurrency": bot_rng.choice([4, 4, 4, 6, 8]),
            "sleep_schedule": bio_sched.get_sleep_window(),
            "fingerprint": {
                "canvas_seed": canvas_seed,
                "audio_seed": bot_rng.randint(0, 2**31 - 1),
                "webgl_seed": bot_rng.randint(0, 2**31 - 1),
                "webgl_vendor": bot_rng.choice(["Google Inc. (Intel)", "Google Inc. (Qualcomm)", "Google Inc. (ARM)"]),
                "webgl_renderer": bot_rng.choice(["ANGLE (Intel UHD 620)", "ANGLE (Adreno 618)", "ANGLE (Mali-G76)"]),
            },
            "avatar_seed": ident.generate_avatar_seed(),
            "avatar_prompt": ident.generate_avatar_prompt(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        for plat in platforms:
            plat_ident = IdentityGenerator(bot_id + hash(plat) % 2**31)
            plat_username = plat_ident.generate_username(f"user{bot_id}", plat)
            plat_bio = plat_ident.generate_bio()

            passport["platforms"][plat] = {
                "username": plat_username,
                "bio": plat_bio,
                "display_name": plat_ident.generate_display_name(plat_username),
                "status": "CREATED",
            }

        with open(passport_dir / "identity.json", "w") as f:
            json.dump(passport, f, indent=2, default=str)

        if args.db:
            for plat in platforms:
                try:
                    inserisci_bot(
                        username=passport["platforms"][plat]["username"],
                        piattaforma=plat,
                        user_agent=ua,
                        ip_address=ip,
                        canvas_seed=canvas_seed,
                        canvas_fingerprint=f"fp_{canvas_seed}_{bot_id}_{plat}",
                        timezone="Europe/Rome",
                        locale="it-IT",
                        screen_resolution=passport["screen_resolution"],
                        stato="WARMING",
                    )
                except Exception as e:
                    print(f"DB error bot {bot_id} ({plat}): {e}")

        if bot_id % 100 == 0:
            elapsed = (datetime.now(timezone.utc) - start).total_seconds()
            rate = bot_id / elapsed if elapsed > 0 else 0
            print(f"  [{bot_id}/{args.count}] {rate:.1f} bot/s")

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    print(f"\n✅ Generati {args.count} profili in {elapsed:.1f}s ({args.count/elapsed:.1f} bot/s)")
    print(f"   Passport: {output_dir.resolve()}")
    print(f"   Database: {'sì' if args.db else 'no'}")

    total_size = sum(f.stat().st_size for f in output_dir.rglob("*") if f.is_file()) / (1024 * 1024)
    print(f"   Spazio occupato: {total_size:.1f}MB")


if __name__ == "__main__":
    main()
