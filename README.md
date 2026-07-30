# 🌳 GitHub Contribution Tree

Trasforma la tua contribution graph di GitHub in un bonsai: ogni commit
diventa una foglia, i più vecchi vicino al tronco, i più recenti sui rami
esterni. Colore e dimensione della foglia dipendono da quanti commit hai
fatto quel giorno.

## Come funziona

```
GitHub Contributions
        │
        ▼
fetch-contributions.js   (legge i tuoi commit via GraphQL API)
        │
        ▼
generate-tree.js         (genera tronco + rami + foglie)
        │
        ▼
assets/tree-light.svg
assets/tree-dark.svg
        │
        ▼
README.md (li mostra con <picture>)
```

Lo scheletro dell'albero (tronco e rami) è generato una volta con un seed
fisso, quindi la forma resta sempre la stessa: cambia solo il fogliame,
in base ai tuoi contributi reali.

## Setup (5 minuti)

1. **Copia questi file** nella root del tuo repository `Campgreve/Campgreve`
   (o in un repo dedicato):
   ```
   scripts/fetch-contributions.js
   scripts/generate-tree.js
   .github/workflows/tree.yml
   ```

2. **Crea un Personal Access Token**:
   - GitHub → Settings → Developer settings → Personal access tokens →
     Tokens (classic)
   - Scope minimo necessario: `read:user`
   - Copia il token

3. **Salvalo come secret del repo**:
   - Nel tuo repo: Settings → Secrets and variables → Actions →
     New repository secret
   - Nome: `GH_TOKEN`
   - Valore: il token appena creato

4. **Se il repo si chiama diversamente da `Campgreve/Campgreve`**, apri
   `.github/workflows/tree.yml` e cambia `GH_USERNAME: Campgreve` con il
   tuo username.

5. **Testa manualmente**: tab "Actions" del repo → "Aggiorna Contribution
   Tree" → "Run workflow". Al termine troverai `assets/tree-light.svg` e
   `assets/tree-dark.svg` committati automaticamente.

6. **Aggiungi al tuo README.md** (in cima al profilo):

   ```html
   <picture>
     <source
       media="(prefers-color-scheme: dark)"
       srcset="https://raw.githubusercontent.com/Campgreve/Campgreve/main/assets/tree-dark.svg"
     />
     <source
       media="(prefers-color-scheme: light)"
       srcset="https://raw.githubusercontent.com/Campgreve/Campgreve/main/assets/tree-light.svg"
     />
     <img
       alt="Il mio Contribution Tree"
       src="https://raw.githubusercontent.com/Campgreve/Campgreve/main/assets/tree-light.svg"
     />
   </picture>
   ```

   ⚠️ Nota: il codice che avevi tu puntava al branch `output`. Con questo
   setup i file vengono committati direttamente su `main` (dentro
   `assets/`), quindi assicurati che l'URL nel `<picture>` punti al ramo e
   al percorso giusti — modifica `main` e `assets/` se usi una struttura
   diversa.

Da questo momento l'albero si aggiorna da solo ogni notte (cron alle 03:00
UTC) e ad ogni push su `main`.

## Testare in locale senza token

```bash
node scripts/generate-tree.js
```

Se `scripts/contributions.json` non esiste, lo script genera dati
d'esempio casuali e produce comunque `assets/tree-light.svg` /
`tree-dark.svg`, utile per vedere subito com'è fatto l'albero senza dover
prima configurare il token.

## Personalizzazione

Tutto è nei primi parametri di `scripts/generate-tree.js`:

- `WIDTH` / `HEIGHT` — dimensioni del canvas SVG
- `grow(...)` — parametri di partenza dell'albero (angolo, lunghezza,
  profondità dei rami: più `depth` = albero più ramificato)
- `LEVEL_COLORS_LIGHT` / `LEVEL_COLORS_DARK` — i 4 verdi usati per le
  foglie (di default sono gli stessi di GitHub)
- `levelFromCount(c)` — soglie di commit che determinano il "livello" di
  intensità di una foglia

## File generati

| File | Descrizione |
|---|---|
| `scripts/contributions.json` | dati grezzi scaricati da GitHub (rigenerato ad ogni run) |
| `assets/tree-light.svg` | albero per tema chiaro |
| `assets/tree-dark.svg` | albero per tema scuro |
