#!/usr/bin/env node
/**
 * fetch-contributions.js
 *
 * Scarica la contribution calendar reale da GitHub (GraphQL API) e la
 * salva in scripts/contributions.json, pronta per generate-tree.js.
 *
 * Richiede una variabile d'ambiente GH_TOKEN con un Personal Access Token
 * (scope minimo: read:user). Il token automatico GITHUB_TOKEN delle
 * Actions NON è sufficiente per leggere la contributionsCollection.
 */

const fs = require('fs');
const path = require('path');

const USERNAME = process.env.GH_USERNAME || 'Campgreve';
const TOKEN = process.env.GH_TOKEN;

if (!TOKEN) {
  console.error("❌ Manca la variabile d'ambiente GH_TOKEN.");
  console.error('   1. Vai su GitHub → Settings → Developer settings → Personal access tokens');
  console.error('   2. Crea un token (classic) con scope "read:user"');
  console.error('   3. Salvalo come secret del repo: Settings → Secrets and variables → Actions → New repository secret → GH_TOKEN');
  process.exit(1);
}

const query = `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;

async function main() {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { login: USERNAME } }),
  });

  if (!res.ok) {
    console.error('❌ Richiesta a GitHub fallita:', res.status, await res.text());
    process.exit(1);
  }

  const json = await res.json();
  if (json.errors) {
    console.error('❌ Errore GraphQL:', JSON.stringify(json.errors, null, 2));
    process.exit(1);
  }

  const weeks = json.data.user.contributionsCollection.contributionCalendar.weeks;
  const days = weeks.flatMap((w) =>
    w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount }))
  );

  const outFile = path.join(__dirname, 'contributions.json');
  fs.writeFileSync(outFile, JSON.stringify(days, null, 2));
  console.log(`✅ Salvati ${days.length} giorni in ${outFile}`);
}

main().catch((err) => {
  console.error('❌ Errore imprevisto:', err);
  process.exit(1);
});
