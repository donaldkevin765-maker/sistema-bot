#!/usr/bin/env python3
"""Setup automation — installa dipendenze, configura ambiente, testa ADB e Firebase."""

import os
import shutil
import subprocess
import sys
from pathlib import Path


PASS = "✅"
FAIL = "❌"
WARN = "⚠️"


def run(cmd, check=True, timeout=120):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
    if check and result.returncode != 0:
        raise RuntimeError(f"Comando fallito: {cmd}\n{result.stderr[:500]}")
    return result


def check_python():
    print(f"[1/8] Versione Python...", end=" ")
    v = sys.version_info
    if v.major >= 3 and v.minor >= 10:
        print(f"{PASS} {v.major}.{v.minor}.{v.micro}")
        return True
    print(f"{FAIL} Serve Python >=3.10 (hai {v.major}.{v.minor})")
    return False


def check_node():
    print(f"[2/8] Node.js...", end=" ")
    try:
        result = run("node --version", check=False, timeout=10)
        if result.returncode == 0:
            print(f"{PASS} {result.stdout.strip()}")
            return True
    except:
        pass
    print(f"{WARN} Non trovato (opzionale per dashboard Vercel)")
    return False


def install_python_deps():
    print(f"[3/8] Dipendenze Python...", end=" ")
    try:
        run(f"{sys.executable} -m pip install --upgrade pip", timeout=60)
        if Path("pyproject.toml").exists():
            run(f"{sys.executable} -m pip install -e .", timeout=120)
        elif Path("requirements.txt").exists():
            run(f"{sys.executable} -m pip install -r requirements.txt", timeout=120)
        else:
            run(f"{sys.executable} -m pip install playwright httpx pyrebase4 cryptography pydantic pydantic-settings", timeout=120)
        run(f"{sys.executable} -m playwright install chromium", timeout=180)
        print(f"{PASS}")
    except Exception as e:
        print(f"{FAIL} {e}")
        return False
    return True


def setup_env():
    print(f"[4/8] File .env...", end=" ")
    env_path = Path(".env")
    example_path = Path(".env.example")
    if env_path.exists():
        print(f"{PASS} già esistente")
        return True
    if example_path.exists():
        shutil.copy(example_path, env_path)
        print(f"{WARN} creato da .env.example (modificalo con le tue chiavi)")
    else:
        env_path.write_text(
            "FIREBASE_API_KEY=\nFIREBASE_DATABASE_URL=\n"
            "FIREBASE_PROJECT_ID=\nTELEGRAM_BOT_TOKEN=\nTELEGRAM_CHAT_ID=\n"
            "ADB_DEVICE_SERIAL=\nCOOKIE_ENCRYPTION_KEY=dev-key-change-me\n"
        )
        print(f"{WARN} creato vuoto (configuralo manualmente)")
    return True


def setup_dirs():
    print(f"[5/8] Directory dati...", end=" ")
    for d in ["data/passports", "data/logs", "data/profiles", "data/screenshots"]:
        Path(d).mkdir(parents=True, exist_ok=True)
    print(f"{PASS}")


def check_adb():
    print(f"[6/8] ADB (Android Debug Bridge)...", end=" ")
    try:
        result = run("adb devices", check=False, timeout=10)
        if result.returncode == 0:
            lines = result.stdout.strip().split("\n")[1:]
            devices = [l for l in lines if l.strip() and "device" in l]
            if devices:
                print(f"{PASS} {len(devices)} dispositivo/i trovato/i")
                for d in devices:
                    print(f"       {d.split()[0]}")
            else:
                print(f"{WARN} ADB funziona ma nessun device collegato")
            return True
    except FileNotFoundError:
        print(f"{FAIL} ADB non installato. Installa Android Platform Tools:")
        print(f"       brew install android-platform-tools")
    except Exception as e:
        print(f"{FAIL} {e}")
    return False


def check_firebase():
    print(f"[7/8] Firebase config...", end=" ")
    from dotenv import dotenv_values
    env = dotenv_values(".env")
    url = env.get("FIREBASE_DATABASE_URL", "")
    key = env.get("FIREBASE_API_KEY", "")
    if url and key and "your-project" not in url:
        print(f"{PASS}")
    else:
        print(f"{WARN} configura .env con le tue credenziali Firebase")


def test_imports():
    print(f"[8/8] Test import moduli...", end=" ")
    failed = []
    modules = [
        "database", "src.hardware.watchdog", "src.network.ip_verifier",
        "src.network.anchoring",
        "src.android.adb_manager", "src.behavior.social_fsm",
        "src.behavior.warmup_scheduler", "src.driver.bot_driver",
        "src.driver.mouse_bezier", "src.browser.stealth_amplified",
        "src.security.cookie_encryption", "src.security.shadowban_monitor",
        "src.identity.passport", "src.orchestrator.brain",
        "src.adapters.youtube", "src.behavior.telegram_notifier",
    ]
    for mod in modules:
        try:
            __import__(mod)
        except Exception as e:
            failed.append(f"{mod}: {e}")
    if not failed:
        print(f"{PASS} tutti i {len(modules)} moduli OK")
    else:
        print(f"{WARN} {len(failed)} errori:")
        for f in failed:
            print(f"       {FAIL} {f}")
    return len(failed) == 0


def main():
    print("=" * 60)
    print("  SISTEMA BOT — Setup Automation")
    print("=" * 60)
    print()

    checks = [
        ("Python version", check_python),
        ("Dashboard Vercel", check_node),
        ("Install dipendenze", install_python_deps),
        ("Configurazione .env", setup_env),
        ("Directory dati", setup_dirs),
        ("ADB devices", check_adb),
        ("Firebase", check_firebase),
        ("Test moduli", test_imports),
    ]

    ok = 0
    fail = 0
    for name, fn in checks:
        try:
            if fn():
                ok += 1
            else:
                fail += 1
        except Exception as e:
            print(f"       {FAIL} {e}")
            fail += 1
        print()

    print("=" * 60)
    if fail == 0:
        print(f"  {PASS} Setup completato. {ok}/{len(checks)} check superati.")
        print(f"\n  Comandi utili:")
        print(f"    python generate_profiles.py --count 1000")
        print(f"    python agents/main.py")
    else:
        print(f"  {WARN} {ok}/{len(checks)} OK, {fail} falliti. Risolvi gli errori sopra.")
    print("=" * 60)


if __name__ == "__main__":
    main()
