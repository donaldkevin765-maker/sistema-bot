#!/usr/bin/env python3
"""Sistema Bot Dashboard — avvia con: python3 dashboard.py"""
import os
import sys
from pathlib import Path

if __name__ == "__main__":
    os.environ.setdefault("STREAMLIT_CONSOLE_EMAIL", "")
    os.environ.setdefault("STREAMLIT_BROWSER_GATHER_USAGE_STATS", "false")
    os.execvp(sys.executable, [
        sys.executable, "-m", "streamlit", "run", __file__,
        "--server.port", "8501",
        "--server.headless", "true",
    ])

import streamlit as st

sys.path.insert(0, str(Path(__file__).parent))

from database import (
    init_db, lista_bot, get_statistiche, get_attivita, get_errori,
)

st.set_page_config(page_title="Sistema Bot Dashboard", layout="wide")
init_db()

st.title("Sistema Bot Dashboard")
st.caption("Monitoraggio locale flotta bot")

tab1, tab2, tab3, tab4 = st.tabs(["Statistiche", "Bot", "Attività", "Errori"])

with tab1:
    stats = get_statistiche()
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Totale Bot", stats["totale_bot"])
    col2.metric("Attività Oggi", stats["attivita_oggi"])
    col3.metric("Per Stato", str(dict(stats["per_stato"])))
    col4.metric("Piattaforme", str(dict(stats["per_piattaforma"])))

with tab2:
    stato_filtro = st.selectbox("Filtra per stato", ["Tutti", "WARMING", "ATTIVO", "PAUSED", "SPENTO"])
    piattaforma_filtro = st.selectbox("Filtra per piattaforma", ["Tutte", "youtube", "instagram", "tiktok", "facebook", "x"])
    bots = lista_bot(
        stato=None if stato_filtro == "Tutti" else stato_filtro,
        piattaforma=None if piattaforma_filtro == "Tutte" else piattaforma_filtro,
    )
    st.dataframe(bots, width="stretch")

with tab3:
    bot_id = st.number_input("Bot ID", min_value=1, value=1)
    st.dataframe(get_attivita(bot_id), width="stretch")

with tab4:
    st.dataframe(get_errori(limit=50), width="stretch")
