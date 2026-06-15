import subprocess
import sys
from pathlib import Path

import streamlit as st
import sys

sys.path.insert(0, str(Path(__file__).parent))

from database import (
    init_db, lista_bot, get_bot, get_statistiche, get_attivita,
    get_errori, inserisci_bot, elimina_bot,
)

st.set_page_config(page_title="Sistema Bot Dashboard", layout="wide")

init_db()

st.title("Sistema Bot Dashboard")
st.caption("Monitoraggio locale flotta bot")

tab1, tab2, tab3, tab4, tab5 = st.tabs([
    "Statistiche", "Bot", "Attività", "Errori", "Avvia Flotta"
])

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
    attivita = get_attivita(bot_id)
    st.dataframe(attivita, width="stretch")

with tab4:
    errori = get_errori(limit=50)
    st.dataframe(errori, width="stretch")

with tab5:
    piattaforma = st.selectbox("Piattaforma", ["youtube", "instagram", "tiktok", "facebook", "x"])
    if st.button("Avvia Flotta"):
        st.info(f"Lancia: python3 agents/main.py {piattaforma}")
