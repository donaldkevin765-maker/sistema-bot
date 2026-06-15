#!/usr/bin/env python3
"""
Sorgente automatica di tutto il codice progetto nella LLM Wiki RAG.

Usage:
  python scripts/wiki_source.py            # Source tutto il progetto
  python scripts/wiki_source.py --reindex  # Re-indicizza wiki + source
  python scripts/wiki_source.py --watch    # Watch modelli e source
  python scripts/wiki_source.py --ask "query"  # Interroga la knowledge base
"""

import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "AI ASSISTENT"))

from rag.engine import rag_engine
from agents.rag_agent import RAGAgent

PROJECT_DIRS = [
    "src",
    "agents",
    "scripts",
    "AI ASSISTENT/wiki",
]


def source_all(reindex: bool = False):
    agent = RAGAgent()
    base = Path(__file__).parent.parent

    if reindex:
        print("📚 Re-indicizzazione completa...")
        result = agent.reindex_all()
        print(f"✅ {result['total_chunks']} chunk totali")
        print(f"   Modello: {result['stats']['model']}")
        print(f"   Dimensione: {result['stats']['dimension']}")
        return result

    print(f"📂 Sourcing progetto in RAG...")
    total = 0
    for rel_dir in PROJECT_DIRS:
        dir_path = base / rel_dir
        if dir_path.exists():
            result = agent.source_directory(dir_path)
            if result["status"] == "ok":
                print(f"  {rel_dir}: +{result['source_chunks']} chunk")
                total += result["source_chunks"]
    print(f"\n✅ Totale: {total} chunk aggiunti")
    return {"total_chunks": total}


def ask_query(query: str):
    agent = RAGAgent()
    print(f"\n🔍 {query}\n")
    print(agent.ask(query))


def main():
    if len(sys.argv) < 2:
        source_all()
        return

    cmd = sys.argv[1]

    if cmd == "--reindex":
        source_all(reindex=True)
    elif cmd == "--watch":
        print("👀 Watch mode non ancora implementato. Usa 'python cli.py watch' nella wiki.")
    elif cmd == "--ask":
        query = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else input("Query: ")
        ask_query(query)
    else:
        print(f"Comando sconosciuto: {cmd}")
        print("Usage: python scripts/wiki_source.py [--reindex|--ask <query>|--watch]")


if __name__ == "__main__":
    main()
