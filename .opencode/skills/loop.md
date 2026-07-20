---
name: loop
description: "Ragionamento a loop: multi-ciclo per output di qualità superiore. Genera → rivedi → migliora → verifica. Da usare per progetti complessi, architettura, debugging difficile, output che vuoi completi. Attiva quando il compito richiede profondità. Triggers: 'loop', 'ragiona meglio', 'fai un loop', 'più qualità', 'rivedi', 'ciclo di ragionamento', 'itera', 'fai più passaggi', 'output completo', 'approfondisci', 'multi-step', 'spiegami bene', 'analisi approfondita', 'architettura', 'progetta', 'refactoring', 'debugging difficile', 'fallo meglio'."
---
# .loop — Ragionamento a Cicli Multipli

Skill per attivare un flusso di lavoro **a loop** su task complessi. Invece di un singolo colpo secco, Sisyphus ragiona **a cicli con esploratori specializzati**: uno scan approfondito iniziale, poi cicli a focus variabile dove ogni ciclo attiva solo gli strumenti necessari al focus del momento.

---

## Quando si attiva (auto-attivazione)

Il loop si attiva **automaticamente** quando il task riguarda:

- **Architettura e progettazione**: disegnare un sistema, scegliere stack, progettare flussi multi-componente
- **Debugging difficile**: 2+ tentativi già falliti, bug che riappare in forme diverse
- **Refactoring**: modificare struttura esistente senza rompere nulla
- **Multi-step**: 3+ file da toccare, dipendenze tra le modifiche
- **Codice nuovo complesso**: non una funzione singola, ma un modulo/sistema
- **Analisi approfondite**: audit, review di qualità, decisioni con impatto

**NON si attiva** per task lineari: typo, rename, cambio config, aggiunta campo a un DB già noto, fix su file singolo noto.

---

## Struttura completa del loop

```
┌──────────────────────────────────────────────────────────┐
│ PRE-LOOP: SCAN APPROFONDITO (una tantum)                 │
│ Costruisce la mappa base del progetto.                   │
│ Viene usata da TUTTI i cicli successivi.                 │
│ Non va mai rieseguita.                                   │
└──────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────┐
│ LOOP: CICLI A FOCUS VARIABILE                            │
│ Ogni ciclo sceglie un focus diverso in base ai risultati │
│ del ciclo precedente. Attiva solo gli esploratori che    │
│ servono per quel focus. Massimo 100 cicli.               │
│                                                          │
│ Ciclo 1 → FOCUS: SCOPRI                                  │
│ Ciclo 2 → FOCUS: TROVA PROBLEMI                          │
│ Ciclo 3 → FOCUS: PROPONI                                 │
│ Ciclo 4 → FOCUS: VERIFICA                                │
│ ...                                                      │
│                                                          │
│ Dopo ogni ciclo: DECISIONE → completo? esci,             │
│ altrimenti scegli il focus del prossimo ciclo.           │
└──────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────┐
│ OUTPUT FINALE                                             │
│ - Risultato pulito (codice/analisi finale)               │
│ - Miglior ciclo (quale ciclo ha prodotto il risultato    │
│   migliore, e perché)                                    │
│ - Conteggio cicli totali                                 │
│ - Se 100 cicli senza completamento: dichiara fallimento, │
│   riassumi cosa è stato tentato e cosa blocca             │
└──────────────────────────────────────────────────────────┘
```

---

## Pre-Loop: Scan Approfondito

Prima del primo ciclo, una esplorazione **completa e approfondita** del progetto e del task. Non una rapida occhiata — una mappatura sistematica.

### Cosa copre lo scan

1. **Struttura e stack**
   - Directory tree del progetto (livelli pertinenti)
   - Linguaggi, framework, runtime (Node version, Python, etc.)
   - Dipendenze chiave (package.json, requirements.txt, pyproject.toml)
   - Configurazioni: TypeScript, ESLint, Prettier, Tailwind, env

2. **Entry point e flussi**
   - Punto di ingresso (main, server, app router)
   - Routing e API endpoints
   - Flussi dati principali
   - Collegamenti tra moduli

3. **Stato corrente**
   - Errori LSP/warning
   - Build status
   - Test esistenti e loro copertura
   - Script e pipeline (npm scripts, CI/CD)

4. **Pattern e convenzioni**
   - Stile del progetto (classi/funzioni, error handling, naming)
   - Pattern già usati (repository, service layer, middleware, ecc.)
   - Convenzioni implicite dal codice esistente

5. **Risultato dello scan**
   - Un documento "mappa base" del progetto (memoria interna)
   - Disponibile a tutti i cicli successivi — nessun esploratore riesplora queste basi

---

## Gli Esploratori (non partono mai tutti insieme)

Ogni esploratore ha un dominio preciso, senza sovrapposizioni. In ogni ciclo Sisyphus attiva **solo quelli necessari al focus del ciclo**.

| Esploratore | Domini | Non fa |
|-------------|--------|--------|
| **scan-explorer** | Solo pre-loop: mappa base del progetto | Mai usato nei cicli |
| **bug-explorer** | Trova problemi: errori LSP, pattern sospetti, regressioni, edge case | Non esplora struttura, non propone soluzioni |
| **struttura-explorer** | Dove intervenire: dipendenze tra file, impatto delle modifiche, percorsi alternativi | Non analizza bug, non verifica |
| **contesto-explorer** | Come si fa: esempi esistenti, convenzioni, pattern già usati nel progetto | Non analizza bug, non mappa nuove strutture |
| **verificatore** | Test, build, lint, typecheck, LSP diagnostics dopo ogni modifica | Non esplora, non propone — solo controlla |

### Regole di collaborazione (nessun intralcio)

1. **Nessun esploratore lavora su un dominio che non è il suo** — prompt espliciti che escludono gli altri domini
2. **In parallelo**: se un ciclo attiva più esploratori, partono in background e Sisyphus sintetizza dopo
3. **In serie**: se un esploratore ha bisogno dei risultati di un altro, aspettano
4. **Memoria**: i risultati di ogni esploratore sono disponibili a tutti i cicli successivi

---

## Il Protocollo Loop (ogni ciclo)

```
CICLO N (focus: [SCOPRI | TROVA PROBLEMI | PROPONI | VERIFICA | ALTRO]):

├── DECIDI FOCUS (Sisyphus)
│   In base ai risultati del ciclo precedente e alla mappa base:
│   qual è la priorità ora? Serve trovare problemi, proporre, o verificare?
│
├── ATTIVA ESPLORATORI
│   Solo quelli necessari al focus scelto:
│   - TROVA PROBLEMI  → bug-explorer (+ contesto se necessario)
│   - PROPONI         → struttura-explorer + contesto-explorer
│   - VERIFICA        → verificatore (nessun esploratore)
│   - SCOPRI          → struttura-explorer (solo se mappa base insufficiente)
│
├── ESECUZIONE
│   Ogni esploratore esegue i suoi tool (esplorazione, analisi, testing).
│   Se in parallelo: tutti i risultati vengono raccolti prima di proseguire.
│
├── SINTESI
│   Sisyphus fonde i report: risolve contraddizioni, chiude buchi,
│   produce un output coerente.
│
├── APPLICA
│   Se il ciclo ha prodotto modifiche (codice, configurazione):
│   applicale ora.
│
├── VERIFICA APPLICAZIONE
│   - lsp_diagnostics su tutti i file toccati
│   - Test (se esistono e pertinenti)
│   - Build/typecheck
│   - Controllo §1.7: il problema riappare in altre forme? Edge case?
│
└── DECIDI (Sisyphus)
    - L'output è completo? → VAI A OUTPUT FINALE
    - Serve un altro ciclo? → scegli focus e CICLO N+1
    - 100 cicli raggiunti? → DICHIARA FALLIMENTO
```

---

## Criteri di uscita (tutti obbligatori)

Il ciclo termina SOLO quando:

- [ ] L'output soddisfa completamente la richiesta dell'utente
- [ ] Non ci sono edge case noti non gestiti
- [ ] La verifica è stata fatta (tool output, test passati, build ok, LSP pulito)
- [ ] Non ci sono residui o problemi che riappaiono in altre forme (§1.7 MENTE)
- [ ] L'utente ha ricevuto un riepilogo chiaro di cosa è stato fatto

## Limite massimo: 100 cicli

Dopo 100 cicli senza completamento:
1. **Fermati immediatamente**
2. Scrivi un report di fallimento che includa:
   - Cosa è stato tentato (riepilogo dei focus di ogni ciclo)
   - Cosa blocca il completamento
   - Cosa manca per finire (informazioni, decisioni, risorse)
3. Chiedi all'utente come procedere

---

## Output Finale

Quando il loop termina (completato o fallito):

1. **Risultato pulito**: il codice, l'analisi o la soluzione finale — come se fosse stato fatto in un colpo solo
2. **Miglior ciclo**: specifica quale ciclo ha prodotto il risultato migliore e perché (es. "ciclo 3: dopo aver esplorato i pattern esistenti, la soluzione proposta era più coerente col codice esistente")
3. **Conteggio**: quanti cicli sono stati necessari
4. **Se fallito**: il report di fallimento invece del risultato

---

## Esempio pratico

Task: "Aggiungi autenticazione con refresh token rotation al backend"

### Pre-loop: Scan approfondito
- Scopre: Next.js 14, Supabase Auth già configurato, no refresh rotation, pattern JWT esistente
- Mappa base: file coinvolti, middleware attuale, test esistenti

### Ciclo 1 — FOCUS: TROVA PROBLEMI
- bug-explorer: trova che i token non hanno blacklist, il refresh non ha rotation, manca CSRF
- Sintesi: 3 problemi identificati

### Ciclo 2 — FOCUS: PROPONI
- struttura-explorer: dove inserire la rotation (lib/auth.ts), dove mettere blacklist (middleware + KV)
- contesto-explorer: come sono fatti gli altri middleware nel progetto
- Applica modifiche

### Ciclo 3 — FOCUS: VERIFICA
- verificatore: LSP pulito, test passano, typecheck ok
- Controllo §1.7: la vecchia route di refresh senza rotation è ancora attiva? Sì — va rimossa
- Applica fix: rimuove vecchia route

### Output finale
- Codice: auth con refresh rotation completo
- Miglior ciclo: ciclo 2 (ha identificato dove e come intervenire in coerenza col progetto)
- Cicli totali: 3

---

## Regole finali

- **Non loopare per inerzia**: se dopo un ciclo non c'è niente da migliorare, esci subito
- **Ogni ciclo deve aggiungere valore** rispetto al precedente — altrimenti fermati
- **Documenta i cicli** brevemente: focus, esploratori usati, cosa è cambiato
- **Il loop non sostituisce il pensiero iniziale**: dai sempre il massimo al primo colpo, il loop affina
- **La verifica (§1.7 MENTE) è parte di ogni ciclo**: dopo ogni modifica, controlla che non riaffiori altrove
