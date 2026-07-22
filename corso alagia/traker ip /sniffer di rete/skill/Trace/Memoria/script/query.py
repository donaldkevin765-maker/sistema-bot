#!/usr/bin/env python3
"""
query.py — Interfaccia query per Memoria.

Cerca nodi nei grafi IO e AZIENDA per tag, tipo, testo, connessioni.

Due modalità principali:

🧑 UMANO (spiegazioni semplici in italiano):
    python3 script/query.py --cerca "bot" --human     # Spiega cos'è e a cosa serve
    python3 script/query.py --tag "python" --human    # Stessa modalità amichevole
    python3 script/query.py --stats                   # Statistiche rapide

🤖 AGENT (dati tecnici strutturati):
    python3 script/query.py --cerca "playwright"       # Output tecnico per agent
    python3 script/query.py --tag "bot"                # IDs, tipi, tag, percorsi
    python3 script/query.py --json                     # JSON per parsing agent
    python3 script/query.py --leggi "sistema-bot"      # Contenuto completo nodo
    python3 script/query.py --all --json               # Tutti i nodi in JSON

Esempi:
    python3 script/query.py --tag "python" --tipo tool --json  # Composto
    python3 script/query.py --connessioni "sistema-bot"        # Grafo locale
"""

import argparse
import json
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

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


def parse_frontmatter(content: str) -> dict:
    """Parsing minimale frontmatter YAML."""
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
                    value = value.strip().strip('"').strip("'")
                    if value.startswith("[") and value.endswith("]"):
                        value = [v.strip().strip('"').strip("'") for v in value[1:-1].split(",")]
                        value = [v for v in value if v]
                    fm[key] = value
    return fm, body


def carica_archi(path: Path) -> list:
    if path.exists():
        try:
            with open(path) as f:
                return json.load(f)
        except Exception:
            return []
    return []


def carica_nodi(grafo: str, full_body: bool = False) -> list[dict]:
    """Carica tutti i nodi di un grafo."""
    config = GRAFO_PATHS[grafo]
    nodi = []
    if not config["nodi"].exists():
        return nodi

    for f in sorted(config["nodi"].glob("*.md")):
        if f.name.startswith(".") or f.name == "template.md":
            continue
        content = f.read_text(encoding="utf-8")
        fm, body = parse_frontmatter(content)
        nodo = {
            "id": fm.get("id", f.stem),
            "titolo": fm.get("titolo", f.stem),
            "tipo": fm.get("tipo", "note"),
            "tags": fm.get("tags", []),
            "connesso_a": fm.get("connesso_a", []),
            "created": fm.get("created", ""),
            "updated": fm.get("updated", ""),
            "file": str(f.relative_to(BASE_DIR)),
            "grafo": grafo,
        }
        if full_body:
            nodo["body"] = body if body else ""
            nodo["full_body"] = body if body else ""
        else:
            nodo["body"] = body[:800] if body else ""
        nodi.append(nodo)
    return nodi


def query_nodi(
    nodi: list[dict],
    tag: str = None,
    tipo: str = None,
    cerca: str = None,
    id_exact: str = None,
) -> list[dict]:
    """Filtra nodi secondo i criteri."""
    risultati = nodi

    if id_exact:
        risultati = [n for n in risultati if n["id"] == id_exact]
        return risultati

    if tag:
        tag_lower = tag.lower()
        risultati = [
            n for n in risultati
            if any(tag_lower in t.lower() for t in n.get("tags", []))
        ]

    if tipo:
        tipo_lower = tipo.lower()
        risultati = [
            n for n in risultati
            if tipo_lower == n.get("tipo", "").lower()
        ]

    if cerca:
        cerca_lower = cerca.lower()
        filtrati = []
        for n in risultati:
            if cerca_lower in n["titolo"].lower():
                filtrati.append(n)
                continue
            if cerca_lower in n.get("body", "").lower():
                filtrati.append(n)
                continue
            if any(cerca_lower in t.lower() for t in n.get("tags", [])):
                filtrati.append(n)
                continue
        risultati = filtrati

    return risultati


def trova_connessioni(nodo_id: str, nodi: list[dict]) -> dict:
    """Trova tutte le connessioni locali di un nodo: archi + connesso_a."""
    archi = []
    for nome, config in GRAFO_PATHS.items():
        archi.extend(carica_archi(config["archi"]))

    connessioni = {
        "nodo": None,
        "archi_in_uscita": [],
        "archi_in_entrata": [],
        "connesso_a_dichiarato": [],
    }

    # Trova il nodo
    for n in nodi:
        if n["id"] == nodo_id:
            connessioni["nodo"] = n
            connessioni["connesso_a_dichiarato"] = n.get("connesso_a", [])
            break

    if not connessioni["nodo"]:
        return connessioni

    # Archi dal relazioni.json
    for a in archi:
        if a["source"] == nodo_id:
            # Cerca il titolo del target
            target_info = {"id": a["target"], "relation": a["relation"], "weight": a.get("weight", 1.0)}
            for n in nodi:
                if n["id"] == a["target"]:
                    target_info["titolo"] = n["titolo"]
                    target_info["file"] = n["file"]
                    break
            connessioni["archi_in_uscita"].append(target_info)
        if a["target"] == nodo_id:
            source_info = {"id": a["source"], "relation": a["relation"], "weight": a.get("weight", 1.0)}
            for n in nodi:
                if n["id"] == a["source"]:
                    source_info["titolo"] = n["titolo"]
                    source_info["file"] = n["file"]
                    break
            connessioni["archi_in_entrata"].append(source_info)

    return connessioni


def stampa_risultati(risultati: list[dict]):
    """Stampa risultati in formato tecnico per agent AI."""
    if not risultati:
        print("\n  🔍 Nessun nodo trovato.\n")
        return

    print(f"\n  {'='*50}")
    print(f"  📍 {len(risultati)} nodi trovati")
    print(f"  {'='*50}")

    for n in risultati:
        tags = " ".join(f"#{t}" for t in n["tags"][:5])
        extra = f" +{len(n['tags'])-5}" if len(n["tags"]) > 5 else ""
        conns = n.get("connesso_a", [])
        conn_str = f" → {', '.join(conns[:4])}" if conns else ""

        print(f"\n  [{n['grafo']}]")
        print(f"  📄 {n['titolo']}")
        print(f"     id: {n['id']}  tipo: {n['tipo']}")
        print(f"     {tags}{extra}")
        if conn_str:
            print(f"     connesso a: {conn_str}")
        print(f"     📁 {n['file']}")
        if n.get("body"):
            preview = n["body"][:200].replace("\n", " ").strip()
            print(f"     … {preview}…")
        print()

    print(f"  {'='*50}\n")


# ── Modalità umana: spiegazioni semplici ─────────────────────────────────────

SPIEGAZIONI_TIPO = {
    "progetto": "un progetto su cui stai lavorando",
    "sistema": "un sistema o infrastruttura che gestisci",
    "tool": "uno strumento che usi per fare qualcosa",
    "skill": "una competenza o capacità che hai sviluppato",
    "concetto": "un'idea o concetto che hai esplorato",
    "servizio": "un servizio che usi o offri",
    "decisione": "una decisione che hai preso e vuoi ricordare",
    "stack": "un insieme di tecnologie che usi insieme",
    "risorsa": "una risorsa utile che hai salvato",
    "piattaforma": "una piattaforma su cui lavori",
    "learning": "qualcosa che hai imparato",
    "persona": "una persona che conosci",
    "idea": "un'idea che hai avuto",
    "note": "un appunto generico",
}

GRAFO_NOME = {
    "personale": "🧑 Area Personale",
    "azienda": "🏢 Area Lavoro",
}

def _pulisci_body(body: str, titolo: str, max_chars: int = 400) -> str:
    """Pulisce il body markdown per lettura umana: rimuove heading iniziale se ripetuto, pulisce formattazione."""
    linee = body.strip().split("\n")
    # Salta la prima riga se è un heading # che ripete il titolo
    if linee and linee[0].strip().lstrip("#").strip().lower() == titolo.lower():
        linee = linee[1:]
    # Prende primo paragrafo significativo (salta heading e righe vuote iniziali)
    paragrafi = []
    for linea in linee:
        stripped = linea.strip()
        if stripped.startswith("##") or stripped.startswith("---"):
            continue
        if stripped:
            paragrafi.append(stripped)
        elif paragrafi:  # riga vuota dopo aver già raccolto testo
            break
    if not paragrafi:
        return ""
    testo = " ".join(paragrafi)
    # Pulisce formattazione markdown
    for simbolo in ["**", "__", "*", "_", "`", "```"]:
        testo = testo.replace(simbolo, "")
    testo = " ".join(testo.split())
    if len(testo) > max_chars:
        testo = testo[:max_chars].rsplit(" ", 1)[0] + "…"
    return testo


def stampa_semplice(risultati: list[dict]):
    """Stampa risultati in italiano semplice per l'utente umano."""
    if not risultati:
        print("\n  🔍 Niente trovato nella Memoria.\n")
        return

    # Raggruppa per grafo
    per_grafo = {}
    for n in risultati:
        g = n.get("grafo", "altro")
        per_grafo.setdefault(g, []).append(n)

    print(f"\n  📖 Ho trovato {len(risultati)} elementi nella Memoria:\n")

    index = 1
    for grafo, nodi in per_grafo.items():
        grafo_label = GRAFO_NOME.get(grafo, grafo)
        print(f"  ── {grafo_label} ──\n")

        for n in nodi:
            tipo_spiegato = SPIEGAZIONI_TIPO.get(n.get("tipo", ""), n.get("tipo", "elemento"))
            conns = n.get("connesso_a", [])

            # Titolo — grande e chiaro
            print(f"  {index}️⃣  {n['titolo']}")
            print(f"     {tipo_spiegato}")

            # Cosa fa — primo paragrafo significativo dal body
            body = n.get("body", "")
            if body:
                descrizione = _pulisci_body(body, n.get("titolo", ""))
                if descrizione:
                    print(f"     {descrizione}")

            # Connessioni — a cosa è legato
            if conns:
                conn_list = ", ".join(conns[:4])
                extra = f" e altri {len(conns)-4}" if len(conns) > 4 else ""
                print(f"     → {conn_list}{extra}")

            # Tags — in fondo, compatti
            if n.get("tags"):
                tags_str = " · ".join(n["tags"][:8])
                print(f"     [{tags_str}]")

            print()
            index += 1

    print(f"  ──\n  💡 Per approfondire: query.py --leggi <id>\n")


def stampa_contenuto_completo(nodo: dict):
    """Stampa il contenuto completo di un nodo (per agent che vogliono leggerlo)."""
    print(f"\n  ── {nodo['titolo']} ──")
    print(f"  ID: {nodo['id']}  |  Tipo: {nodo['tipo']}  |  Grafo: {nodo['grafo']}")
    print(f"  File: {nodo['file']}")
    if nodo.get("tags"):
        print(f"  Tags: {', '.join(nodo['tags'])}")
    if nodo.get("connesso_a"):
        print(f"  Connesso a: {', '.join(nodo['connesso_a'])}")

    if nodo.get("full_body"):
        print(f"\n{nodo['full_body']}")
    elif nodo.get("body"):
        print(f"\n{nodo['body']}")
    print()


def stampa_connessioni(conn: dict):
    """Stampa connessioni in formato leggibile."""
    if not conn["nodo"]:
        print(f"\n  ❌ Nodo non trovato.\n")
        return

    n = conn["nodo"]
    print(f"\n  🌐 GRAFO LOCALE: {n['titolo']} ({n['id']})")
    print(f"  {'='*50}")

    if conn["connesso_a_dichiarato"]:
        print(f"\n  📝 Connessioni dichiarate (frontmatter):")
        for c in conn["connesso_a_dichiarato"]:
            print(f"     ├─ {c}")

    if conn["archi_in_uscita"]:
        print(f"\n  🡆 Escono da {n['id']}:")
        for a in conn["archi_in_uscita"]:
            titolo = a.get("titolo", a["id"])
            print(f"     ├─ [{a['relation']}] → {titolo} (`{a['id']}`)  weight: {a['weight']}")

    if conn["archi_in_entrata"]:
        print(f"\n  🡆 Entrano in {n['id']}:")
        for a in conn["archi_in_entrata"]:
            titolo = a.get("titolo", a["id"])
            print(f"     ├─ [{a['relation']}] ← {titolo} (`{a['id']}`)  weight: {a['weight']}")

    if not conn["archi_in_uscita"] and not conn["archi_in_entrata"] and not conn["connesso_a_dichiarato"]:
        print("\n     (nessuna connessione)")
    print(f"\n  {'='*50}\n")


def stampa_stats(nodi_per_grafo: dict):
    """Statistiche rapide."""
    total_nodi = 0
    print(f"\n  📊 MEMORIA — Statistiche Rapide\n")
    for nome, nodi in nodi_per_grafo.items():
        by_type = {}
        for n in nodi:
            t = n.get("tipo", "note")
            by_type[t] = by_type.get(t, 0) + 1
        total_nodi += len(nodi)
        print(f"  {nome.upper()}: {len(nodi)} nodi")
        for t, c in sorted(by_type.items()):
            print(f"    ├─ {t}: {c}")
        print()

    print(f"  TOTALE: {total_nodi} nodi\n")


def main():
    parser = argparse.ArgumentParser(description="MEMORIA — Query per agent AI e umani")
    parser.add_argument("--tag", help="Filtra per tag")
    parser.add_argument("--tipo", help="Filtra per tipo nodo (es. progetto, skill, tool)")
    parser.add_argument("--cerca", help="Cerca parola nel titolo/corpo/tag")
    parser.add_argument("--id", dest="id_exact", help="Cerca nodo per ID esatto")
    parser.add_argument("--connessioni", help="Mostra grafo locale di un nodo per ID")
    parser.add_argument("--grafo", choices=["personale", "azienda"], help="Filtra per grafo")
    parser.add_argument("--all", action="store_true", help="Mostra tutti i nodi")
    parser.add_argument("--stats", action="store_true", help="Statistiche rapide")
    parser.add_argument("--json", action="store_true", help="Output JSON per agent")
    parser.add_argument("--human", action="store_true", help="Spiegazione in italiano semplice (per umani)")
    parser.add_argument("--leggi", metavar="ID", help="Legge il contenuto completo di un nodo (per agent)")
    args = parser.parse_args()

    # ── Leggi contenuto completo di un nodo ──
    if args.leggi:
        nodi_per_grafo = {nome: carica_nodi(nome, full_body=True) for nome in GRAFO_PATHS}
        tutti_nodi = []
        for v in nodi_per_grafo.values():
            tutti_nodi.extend(v)
        risultati = query_nodi(tutti_nodi, id_exact=args.leggi)
        if risultati:
            if args.json:
                print(json.dumps(risultati[0], indent=2, ensure_ascii=False))
            else:
                stampa_contenuto_completo(risultati[0])
        else:
            print(f"\n  ❌ Nodo '{args.leggi}' non trovato.\n")
        return

    # Carica nodi (con body completo per --human, troncato per agent)
    full = args.human or args.json
    if args.grafo:
        nodi_per_grafo = {args.grafo: carica_nodi(args.grafo, full_body=full)}
    else:
        nodi_per_grafo = {nome: carica_nodi(nome, full_body=full) for nome in GRAFO_PATHS}

    tutti_nodi = []
    for v in nodi_per_grafo.values():
        tutti_nodi.extend(v)

    # Stats
    if args.stats:
        if args.json:
            print(json.dumps({nome: len(v) for nome, v in nodi_per_grafo.items()}, indent=2))
        else:
            stampa_stats(nodi_per_grafo)
        return

    # Connessioni
    if args.connessioni:
        conn = trova_connessioni(args.connessioni, tutti_nodi)
        if args.json:
            print(json.dumps(conn, indent=2, ensure_ascii=False))
        else:
            stampa_connessioni(conn)
        return

    # Query
    if args.all or not any([args.tag, args.tipo, args.cerca, args.id_exact]):
        risultati = tutti_nodi
    else:
        risultati = query_nodi(
            tutti_nodi,
            tag=args.tag,
            tipo=args.tipo,
            cerca=args.cerca,
            id_exact=args.id_exact,
        )

    if args.json:
        print(json.dumps(risultati, indent=2, ensure_ascii=False))
    elif args.human:
        stampa_semplice(risultati)
    else:
        stampa_risultati(risultati)


if __name__ == "__main__":
    main()
