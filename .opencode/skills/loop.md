---
name: loop
description: "Ragionamento a loop: multi-ciclo per output di qualità superiore. Genera → rivedi → migliora → verifica. Da usare per progetti complessi, architettura, debugging difficile, output che vuoi completi. Attiva quando il compito richiede profondità. Triggers: 'loop', 'ragiona meglio', 'fai un loop', 'più qualità', 'rivedi', 'ciclo di ragionamento', 'itera', 'fai più passaggi', 'output completo', 'approfondisci', 'multi-step', 'spiegami bene', 'analisi approfondita', 'architettura', 'progetta', 'refactoring', 'debugging difficile', 'fallo meglio'."
---
# .loop — Ragionamento a Cicli Multipli

Skill per attivare un flusso di lavoro **a loop** su task complessi. Invece di un singolo colpo secco, Sisyphus ragiona **a cicli**: produce, rivede, migliora, verifica. Ogni ciclo scopre falle e le chiude.

## Quando usarlo

**USA il loop quando:**
- Il progetto è multi-step e ogni step può cambiare la direzione successiva
- Serve un output raffinato progressivamente (architettura, design, documentazione)
- Ci sono edge case da scovare — un giro singolo può perderli
- Il debugging è ostico (2+ tentativi falliti)
- L'utente chiede esplicitamente "analisi approfondita", "fammi un ragionamento completo"
- È la prima volta che si affronta un modulo sconosciuto

**NON serve il loop quando:**
- Task lineare: modifica singola, file noto, cambiamento locale
- Correzione rapida: typo, rename, cambio config
- L'utente chiede qualcosa di veloce e diretto
- Esplorazione iniziale (usa explore/librarian invece)

## Il Protocollo Loop

Ogni ciclo segue questa sequenza:

```
CICLO N:
  1. GENERA   → Produci output/analisi/codice
  2. RIVEDI   → Cerca falle, edge case, buchi logici
  3. MIGLIORA → Applica correzioni dal passo 2
  4. VERIFICA → Controlla che ogni fix sia reale (prova concreta)
  5. DECIDI   → L'output è completo? → esci. Altrimenti → ciclo N+1
```

### Regole per ogni ciclo

1. **GENERA**: dai il massimo al primo colpo. Il loop affina, non parte da zero.
2. **RIVEDI**: guarda l'output con occhio critico. Cosa manca? Cosa è ambiguo? Dove potrebbe rompersi? Edge case? Alternative non considerate?
3. **MIGLIORA**: correggi TUTTO quello che hai trovato al passo 2. Niente "tanto lo faccio dopo".
4. **VERIFICA**: prova concreta che ogni modifica funziona. Se è codice: `lsp_diagnostics`, test, compilazione. Se è analisi: controlla i fatti. **Non supporre.**
5. **DECIDI**: hai raggiunto l'obiettivo? Se sì, esci e consegna. Se no, un altro ciclo.

### Criteri di uscita (tutti obbligatori)

Esci dal loop SOLO quando:
- [ ] L'output soddisfa completamente la richiesta dell'utente
- [ ] Non ci sono edge case noti non gestiti
- [ ] La verifica è stata fatta (tool output, test passati, build ok)
- [ ] Non ci sono residui o problemi che riappaiono in altre forme (§1.7 MENTE)
- [ ] L'utente ha ricevuto un riepilogo chiaro di cosa è stato fatto

## Meta-regole

- **Non loopare all'infinito**: se dopo 3 cicli non esci, fermati, riassumi cosa manca, e chiedi all'utente.
- **Ogni ciclo deve aggiungere valore**: se la revisione non trova niente da migliorare, esci — non fare cicli "per sicurezza".
- **Documenta i cicli**: in output, menziona brevemente quanti cicli hai fatto e cosa è cambiato da ciclo a ciclo ("al secondo giro ho trovato che...").
- **Integra §1.7 MENTE**: dopo ogni ciclo, verifica che i fix non riaffiorino in altre forme.

## Esempio pratico

Task: "Progettami un'architettura per fleet management di 1000 Android"

- **Ciclo 1**: Produco architettura base (server, client, queue, monitoring)
- **Ciclo 1 — Revisione**: Mi accorgo che manca failover, che il queue non è esattamente-once, che il monitoring non copre il battery drain
- **Ciclo 2**: Aggiungo failover, exactly-once con dedup, battery-aware scheduling
- **Ciclo 2 — Revisione**: Ora il monitoring è completo, ma la security (device attestation) è superficiale
- **Ciclo 3**: Aggiungo attestation, remote wipe, VPN obligatoria
- **Verifica**: Controllo che tutti i pezzi combacino, nessuna contraddizione → esco

Risultato: architettura molto più solida che al primo giro.

## Attenzione

Il loop NON è una scusa per procrastinare. Se una cosa la sai fare bene al primo colpo, falla — il loop è per quando il primo colpo non basta.
