import sqlite3
import json
import os
import threading
from datetime import datetime
from typing import Optional, Any

from src.network.firebase_sync import sync_bot, sync_delete_bot, sync_attivita, sync_stats

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "bot_fleet.db")


_local = threading.local()


def get_connection() -> sqlite3.Connection:
    if not hasattr(_local, "conn") or _local.conn is None:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        _local.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA foreign_keys=ON")
    return _local.conn


def init_db():
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS profili_bot (
            bot_id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            piattaforma TEXT,
            user_agent TEXT,
            ip_address TEXT,
            canvas_seed REAL,
            canvas_fingerprint TEXT,
            timezone TEXT DEFAULT 'Europe/Rome',
            locale TEXT DEFAULT 'it-IT',
            screen_resolution TEXT DEFAULT '412x915',
            proxy_host TEXT,
            proxy_port INTEGER,
            proxy_username TEXT,
            proxy_password TEXT,
            cookies_encrypted TEXT,
            data_creazione TEXT,
            ultimo_heartbeat TEXT,
            ultimo_login TEXT,
            login_count INTEGER DEFAULT 0,
            error_count INTEGER DEFAULT 0,
            stato TEXT DEFAULT 'WARMING'
        );

        CREATE TABLE IF NOT EXISTS registri_attivita (
            azione_id INTEGER PRIMARY KEY AUTOINCREMENT,
            bot_id INTEGER,
            tipo_azione TEXT,
            descrizione TEXT,
            dettagli TEXT,
            ip_utilizzato TEXT,
            user_agent TEXT,
            canvas_seed REAL,
            success INTEGER DEFAULT 1,
            error_message TEXT,
            durata_ms INTEGER,
            timestamp TEXT,
            FOREIGN KEY(bot_id) REFERENCES profili_bot(bot_id)
        );

        CREATE INDEX IF NOT EXISTS idx_profili_stato ON profili_bot(stato);
        CREATE INDEX IF NOT EXISTS idx_profili_piattaforma ON profili_bot(piattaforma);
        CREATE INDEX IF NOT EXISTS idx_registri_bot ON registri_attivita(bot_id);
        CREATE INDEX IF NOT EXISTS idx_registri_tipo ON registri_attivita(tipo_azione);
        CREATE INDEX IF NOT EXISTS idx_registri_timestamp ON registri_attivita(timestamp);
    """)
    conn.commit()


def inserisci_bot(
    username: str,
    piattaforma: str,
    user_agent: str,
    ip_address: str,
    canvas_seed: float,
    **kwargs
) -> int:
    conn = get_connection()
    now = datetime.utcnow().isoformat()
    conn.execute(
        """INSERT INTO profili_bot
           (username, piattaforma, user_agent, ip_address, canvas_seed,
            canvas_fingerprint, timezone, locale, screen_resolution,
            proxy_host, proxy_port, proxy_username, proxy_password,
            cookies_encrypted, data_creazione, stato)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            username, piattaforma, user_agent, ip_address, canvas_seed,
            kwargs.get("canvas_fingerprint", ""),
            kwargs.get("timezone", "Europe/Rome"),
            kwargs.get("locale", "it-IT"),
            kwargs.get("screen_resolution", "412x915"),
            kwargs.get("proxy_host"), kwargs.get("proxy_port"),
            kwargs.get("proxy_username"), kwargs.get("proxy_password"),
            kwargs.get("cookies_encrypted"),
            now,
            kwargs.get("stato", "WARMING"),
        )
    )
    conn.commit()
    bid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    bot = get_bot(bid)
    if bot:
        sync_bot(bot)
    return bid


def aggiorna_bot(bot_id: int, **kwargs) -> bool:
    conn = get_connection()
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    vals = list(kwargs.values()) + [bot_id]
    conn.execute(f"UPDATE profili_bot SET {sets} WHERE bot_id = ?", vals)
    conn.commit()
    bot = get_bot(bot_id)
    if bot:
        sync_bot(bot)
    return conn.total_changes > 0


def aggiorna_stato(bot_id: int, stato: str) -> bool:
    return aggiorna_bot(bot_id, stato=stato)


def get_bot(bot_id: int) -> Optional[dict]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM profili_bot WHERE bot_id = ?", (bot_id,)).fetchone()
    return dict(row) if row else None


def get_bot_by_username(username: str) -> Optional[dict]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM profili_bot WHERE username = ?", (username,)).fetchone()
    return dict(row) if row else None


def lista_bot(piattaforma: Optional[str] = None, stato: Optional[str] = None) -> list[dict]:
    conn = get_connection()
    query = "SELECT * FROM profili_bot WHERE 1=1"
    params = []
    if piattaforma:
        query += " AND piattaforma = ?"
        params.append(piattaforma)
    if stato:
        query += " AND stato = ?"
        params.append(stato)
    query += " ORDER BY bot_id ASC"
    return [dict(r) for r in conn.execute(query, params).fetchall()]


def elimina_bot(bot_id: int) -> bool:
    conn = get_connection()
    conn.execute("DELETE FROM registri_attivita WHERE bot_id = ?", (bot_id,))
    conn.execute("DELETE FROM profili_bot WHERE bot_id = ?", (bot_id,))
    conn.commit()
    sync_delete_bot(bot_id)
    return True


def registra_attivita(
    bot_id: int,
    tipo_azione: str,
    descrizione: Optional[str] = None,
    dettagli: Optional[dict] = None,
    ip_utilizzato: Optional[str] = None,
    user_agent: Optional[str] = None,
    canvas_seed: Optional[float] = None,
    success: bool = True,
    error_message: Optional[str] = None,
    durata_ms: Optional[int] = None,
) -> int:
    conn = get_connection()
    now = datetime.utcnow().isoformat()
    conn.execute(
        """INSERT INTO registri_attivita
           (bot_id, tipo_azione, descrizione, dettagli, ip_utilizzato,
            user_agent, canvas_seed, success, error_message, durata_ms, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            bot_id, tipo_azione, descrizione,
            json.dumps(dettagli) if dettagli else None,
            ip_utilizzato, user_agent, canvas_seed,
            1 if success else 0, error_message, durata_ms, now,
        )
    )
    conn.commit()
    aid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    sync_attivita({
        "azione_id": aid,
        "bot_id": bot_id,
        "tipo_azione": tipo_azione,
        "descrizione": descrizione,
        "success": 1 if success else 0,
        "error_message": error_message,
        "durata_ms": durata_ms,
        "timestamp": now,
    })
    return aid


def get_attivita(bot_id: int, tipo: Optional[str] = None, limit: int = 50) -> list[dict]:
    conn = get_connection()
    query = "SELECT * FROM registri_attivita WHERE bot_id = ?"
    params = [bot_id]
    if tipo:
        query += " AND tipo_azione = ?"
        params.append(tipo)
    query += " ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)
    return [dict(r) for r in conn.execute(query, params).fetchall()]


def get_errori(limit: int = 50) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        """SELECT r.*, p.username, p.piattaforma
           FROM registri_attivita r
           JOIN profili_bot p ON r.bot_id = p.bot_id
           WHERE r.success = 0
           ORDER BY r.timestamp DESC
           LIMIT ?""",
        (limit,)
    ).fetchall()
    return [dict(r) for r in rows]


def get_statistiche() -> dict:
    conn = get_connection()
    totali = conn.execute("SELECT COUNT(*) FROM profili_bot").fetchone()[0]
    per_stato = dict(conn.execute(
        "SELECT stato, COUNT(*) FROM profili_bot GROUP BY stato"
    ).fetchall())
    per_piattaforma = dict(conn.execute(
        "SELECT piattaforma, COUNT(*) FROM profili_bot WHERE piattaforma IS NOT NULL GROUP BY piattaforma"
    ).fetchall())
    attivita_oggi = conn.execute(
        "SELECT COUNT(*) FROM registri_attivita WHERE date(timestamp) = date('now')"
    ).fetchone()[0]
    stats = {
        "totale_bot": totali,
        "per_stato": per_stato,
        "per_piattaforma": per_piattaforma,
        "attivita_oggi": attivita_oggi,
    }
    sync_stats(stats)
    return stats
