#!/usr/bin/env python3
"""
generate_data.py — Esporta tutta la MEMORIA in _portal/data.json
per il portale web.

Uso:
    python3 _portal/generate_data.py          # Genera data.json
    python3 _portal/generate_data.py --watch   # (futuro) rigenera automaticamente
"""

import json
import sys
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PORTA_DIR = BASE_DIR / "_portal"
DATA_FILE = PORTA_DIR / "data.json"

GRAFO_PATHS = {
    "personale": {
        "nodi": BASE_DIR / "personale" / "nodi",
        "archi": BASE_DIR / "personale" / "archi" / "relazioni.json",
    },
    "azienda": {
        "nodi": BASE_DIR / "azienda" / "nodi",
        "archi": BASE_DIR / "azienda" / "archi" / "relazioni.json",
    },
}

# ── Parsing ─────────────────────────────────────────────────────────────────

def parse_frontmatter(content: str) -> tuple[dict, str]:
    fm = {}
    body = content
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            raw = parts[1].strip()
            body = parts[2].strip()
            for line in raw.split("\n"):
                line = line.strip()
                if ":" in line:
                    key, _, value = line.partition(":")
                    key = key.strip()
                    value = value.strip()
                    if value.startswith("[") and value.endswith("]"):
                        value = [v.strip().strip('"').strip("'") for v in value[1:-1].split(",")]
                        value = [v for v in value if v]
                    elif value.lower() == "true": value = True
                    elif value.lower() == "false": value = False
                    elif value.startswith('"') and value.endswith('"'): value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"): value = value[1:-1]
                    fm[key] = value
    return fm, body


def carica_nodi(grafo: str) -> list[dict]:
    config = GRAFO_PATHS[grafo]
    nodi = []
    if not config["nodi"].exists():
        return nodi
    for f in sorted(config["nodi"].glob("*.md")):
        if f.name.startswith(".") or f.name == "template.md":
            continue
        content = f.read_text(encoding="utf-8")
        fm, body = parse_frontmatter(content)
        nodi.append({
            "id": fm.get("id", f.stem),
            "titolo": fm.get("titolo", f.stem),
            "tipo": fm.get("tipo", "note"),
            "tags": fm.get("tags", []),
            "connesso_a": fm.get("connesso_a", []),
            "created": fm.get("created", ""),
            "updated": fm.get("updated", ""),
            "file": str(f.relative_to(BASE_DIR)),
            "grafo": grafo,
            "body": body if body else "",
        })
    return nodi


def carica_archi(path: Path) -> list[dict]:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def carica_inbox() -> list[dict]:
    inbox = BASE_DIR / "_inbox"
    items = []
    if inbox.exists():
        for f in sorted(inbox.glob("*.md"), reverse=True):
            content = f.read_text(encoding="utf-8")
            fm, body = parse_frontmatter(content)
            items.append({
                "file": f.name,
                "agent": fm.get("agent", "unknown"),
                "timestamp": fm.get("timestamp", ""),
                "status": fm.get("status", "unknown"),
                "body": body[:500] if body else "",
            })
    return items


def carica_insights() -> list[dict]:
    path = BASE_DIR / "_auto" / "insights"
    items = []
    if path.exists():
        for f in sorted(path.glob("*.md"), reverse=True):
            content = f.read_text(encoding="utf-8")
            items.append({
                "file": f.name,
                "date": f.stem.replace("synth-", ""),
                "body": content[:1000] if content else "",
            })
    return items


def carica_reports() -> list[dict]:
    path = BASE_DIR / "_auto" / "reports"
    items = []
    if path.exists():
        for f in sorted(path.glob("*.md"), reverse=True):
            content = f.read_text(encoding="utf-8")
            items.append({
                "file": f.name,
                "date": f.stem.replace("observer-", ""),
                "body": content[:1000] if content else "",
            })
    return items


def carica_fleet() -> dict:
    path = BASE_DIR / "_fleet" / "fleet.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return {"agents": []}
    return {"agents": []}


def carica_suggerimenti() -> list[dict]:
    path = BASE_DIR / "suggerimenti"
    items = []
    if path.exists():
        for f in sorted(path.glob("*.json"), reverse=True):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                items.append({
                    "file": f.name,
                    "data": data[:5] if isinstance(data, list) else data,
                })
            except Exception:
                pass
    return items


def carica_evoluzione() -> list[dict]:
    path = BASE_DIR / "evoluzione.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


# ── Build ───────────────────────────────────────────────────────────────────

def build_data() -> dict:
    nodi_personale = carica_nodi("personale")
    nodi_azienda = carica_nodi("azienda")
    archi_personale = carica_archi(GRAFO_PATHS["personale"]["archi"])
    archi_azienda = carica_archi(GRAFO_PATHS["azienda"]["archi"])

    tutti_nodi = nodi_personale + nodi_azienda
    tutti_archi = archi_personale + archi_azienda

    # Edge source → target mapping for each node
    nodi_map = {n["id"]: n for n in tutti_nodi}

    for edge in tutti_archi:
        s = nodi_map.get(edge["source"])
        t = nodi_map.get(edge["target"])
        edge["source_titolo"] = s["titolo"] if s else edge["source"]
        edge["target_titolo"] = t["titolo"] if t else edge["target"]

    inbox = carica_inbox()
    insights = carica_insights()
    reports = carica_reports()
    fleet = carica_fleet()
    suggerimenti = carica_suggerimenti()
    evoluzione = carica_evoluzione()

    return {
        "generato": datetime.now().isoformat(),
        "statistiche": {
            "nodi": {
                "totale": len(tutti_nodi),
                "personale": len(nodi_personale),
                "azienda": len(nodi_azienda),
            },
            "archi": {
                "totale": len(tutti_archi),
                "personale": len(archi_personale),
                "azienda": len(archi_azienda),
            },
            "inbox": len(inbox),
            "agenti": len(fleet.get("agents", [])),
            "tipi": sorted(set(n["tipo"] for n in tutti_nodi)),
        },
        "nodi": tutti_nodi,
        "archi": tutti_archi,
        "inbox": inbox,
        "insights": insights,
        "reports": reports,
        "fleet": fleet,
        "suggerimenti": suggerimenti,
        "evoluzione": evoluzione,
    }


def main():
    PORTA_DIR.mkdir(parents=True, exist_ok=True)
    data = build_data()
    DATA_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    stats = data["statistiche"]
    print(f"\n  📊 MEMORIA → Portale")
    print(f"  {'='*35}")
    print(f"  Nodi:     {stats['nodi']['totale']} ({stats['nodi']['personale']}P + {stats['nodi']['azienda']}A)")
    print(f"  Archi:    {stats['archi']['totale']} ({stats['archi']['personale']}P + {stats['archi']['azienda']}A)")
    print(f"  Inbox:    {stats['inbox']} messaggi")
    print(f"  Agenti:   {stats['agenti']} nella flotta")
    print(f"  Tipi:     {', '.join(stats['tipi'])}")
    print(f"\n  ✅ data.json generato ({DATA_FILE.stat().st_size} bytes)")
    print(f"  📍 {DATA_FILE}\n")


if __name__ == "__main__":
    main()
