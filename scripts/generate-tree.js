#!/usr/bin/env node
/**
 * generate-tree.js
 *
 * Legge scripts/contributions.json (prodotto da fetch-contributions.js)
 * e genera assets/tree-light.svg + assets/tree-dark.svg.
 *
 * Ogni giorno con almeno un commit diventa una foglia. La posizione della
 * foglia dipende dall'ordine cronologico: i commit più vecchi nascono vicino
 * al tronco, i più recenti sui rami esterni. Il colore dipende dal numero
 * di commit di quel giorno (stessa scala di verdi di GitHub).
 */

const fs = require('fs');
const path = require('path');

const CONTRIB_FILE = path.join(__dirname, 'contributions.json');
const OUT_DIR = path.join(__dirname, '..', 'assets');

const WIDTH = 500;
const HEIGHT = 500;
const TRUNK_BASE = { x: 250, y: 480 };

// ---------------------------------------------------------------------
// 1. Scheletro dell'albero (tronco + rami) generato con un piccolo
//    algoritmo ricorsivo "a L-system". Il seed è fisso: la FORMA
//    dell'albero è sempre la stessa, cambia solo il fogliame in base
//    ai contributi reali.
// ---------------------------------------------------------------------
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);

function grow(x, y, angle, length, depth, branches, leafSlots) {
  if (depth === 0 || length < 8) {
    leafSlots.push({ x, y, depth });
    return;
  }
  const x2 = x + Math.cos(angle) * length;
  const y2 = y + Math.sin(angle) * length;
  branches.push({ x1: x, y1: y, x2, y2, w: Math.max(1, depth * 1.6) });

  // i rami intermedi più sottili possono ospitare foglie anche loro
  if (depth <= 3) leafSlots.push({ x: x2, y: y2, depth });

  const nBranches = depth > 5 ? 2 : rand() > 0.35 ? 2 : 1;
  for (let i = 0; i < nBranches; i++) {
    const spread = 0.35 + rand() * 0.4;
    const newAngle = angle + (i === 0 ? -spread : spread) * (0.6 + rand() * 0.5);
    const newLength = length * (0.68 + rand() * 0.15);
    grow(x2, y2, newAngle, newLength, depth - 1, branches, leafSlots);
  }
}

const branches = [];
const leafSlots = [];
grow(TRUNK_BASE.x, TRUNK_BASE.y, -Math.PI / 2, 90, 8, branches, leafSlots);

// depth 0 = punte esterne dei rami. Vogliamo che i commit più recenti
// finiscano lì, quindi ordiniamo dal tronco (depth alto) verso le punte.
leafSlots.sort((a, b) => b.depth - a.depth);

// ---------------------------------------------------------------------
// 2. Carica i contributi reali (o genera dati d'esempio se il file manca,
//    utile per testare il rendering in locale senza token GitHub).
// ---------------------------------------------------------------------
function generateSampleData() {
  const days = [];
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const count = rand() > 0.55 ? Math.floor(rand() * 12) : 0;
    days.push({ date: d.toISOString().slice(0, 10), count });
  }
  return days;
}

let contributions;
try {
  contributions = JSON.parse(fs.readFileSync(CONTRIB_FILE, 'utf8'));
} catch (e) {
  console.warn('⚠️  contributions.json non trovato, uso dati di esempio per il test.');
  contributions = generateSampleData();
}

const activeDays = contributions
  .filter((d) => d.count > 0)
  .sort((a, b) => new Date(a.date) - new Date(b.date));

// ---------------------------------------------------------------------
// 3. Colori in stile GitHub (4 livelli di intensità)
// ---------------------------------------------------------------------
const LEVEL_COLORS_LIGHT = ['#9be9a8', '#40c463', '#30a14e', '#216e39'];
const LEVEL_COLORS_DARK = ['#0e4429', '#006d32', '#26a641', '#39d353'];

function levelFromCount(c) {
  if (c >= 10) return 3;
  if (c >= 6) return 2;
  if (c >= 3) return 1;
  return 0;
}

// ---------------------------------------------------------------------
// 4. Assegna ogni giorno attivo a uno slot foglia. Se i giorni attivi
//    superano gli slot disponibili, si "impilano" con un leggero offset
//    così l'albero diventa via via più folto invece di rompersi.
// ---------------------------------------------------------------------
function buildLeaves(colors) {
  const leaves = [];
  const n = leafSlots.length;
  activeDays.forEach((day, i) => {
    const slot = leafSlots[i % n];
    const stack = Math.floor(i / n);
    const jitterX = (rand() - 0.5) * 6 + stack * 2.2;
    const jitterY = (rand() - 0.5) * 6 - stack * 2.2;
    const level = levelFromCount(day.count);
    const size = 4.5 + level * 1.3;
    leaves.push({
      x: slot.x + jitterX,
      y: slot.y + jitterY,
      r: size,
      color: colors[level],
      delay: (rand() * 4).toFixed(2),
      recent: i > activeDays.length - 15,
    });
  });
  return leaves;
}

function svgLeaf(leaf) {
  const swayClass = leaf.recent ? 'leaf-sway-strong' : 'leaf-sway';
  return `<circle class="${swayClass}" cx="${leaf.x.toFixed(1)}" cy="${leaf.y.toFixed(1)}" r="${leaf.r.toFixed(1)}" fill="${leaf.color}" style="animation-delay:${leaf.delay}s" />`;
}

function svgBranches() {
  return branches
    .map(
      (b) =>
        `<line x1="${b.x1.toFixed(1)}" y1="${b.y1.toFixed(1)}" x2="${b.x2.toFixed(1)}" y2="${b.y2.toFixed(1)}" stroke="var(--trunk-color)" stroke-width="${b.w.toFixed(1)}" stroke-linecap="round" />`
    )
    .join('\n    ');
}

function buildSVG({ mode, colors }) {
  const leaves = buildLeaves(colors);
  const trunkColor = mode === 'dark' ? '#8a5a3d' : '#7a4a2f';

  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" style="--trunk-color:${trunkColor}">
  <style>
    text { font-family: -apple-system, Segoe UI, sans-serif; }
    @keyframes sway {
      0%, 100% { transform: rotate(-1.2deg); }
      50% { transform: rotate(1.2deg); }
    }
    @keyframes swayStrong {
      0%, 100% { transform: rotate(-3deg) scale(1); }
      50% { transform: rotate(3deg) scale(1.05); }
    }
    .leaf-sway { animation: sway 4s ease-in-out infinite; transform-origin: center; }
    .leaf-sway-strong { animation: swayStrong 2.6s ease-in-out infinite; transform-origin: center; }
  </style>
  <ellipse cx="250" cy="482" rx="70" ry="10" fill="${trunkColor}" opacity="0.15" />
  <g>
    ${svgBranches()}
  </g>
  <g>
    ${leaves.map(svgLeaf).join('\n    ')}
  </g>
  <text x="250" y="498" text-anchor="middle" font-size="11" fill="${trunkColor}" opacity="0.6">${activeDays.length} contributi \u00b7 ${leaves.length} foglie</text>
</svg>`;
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

fs.writeFileSync(path.join(OUT_DIR, 'tree-light.svg'), buildSVG({ mode: 'light', colors: LEVEL_COLORS_LIGHT }));
fs.writeFileSync(path.join(OUT_DIR, 'tree-dark.svg'), buildSVG({ mode: 'dark', colors: LEVEL_COLORS_DARK }));

console.log(`✅ Generati ${activeDays.length} giorni attivi su ${leafSlots.length} slot foglia disponibili.`);
console.log('   -> assets/tree-light.svg');
console.log('   -> assets/tree-dark.svg');
