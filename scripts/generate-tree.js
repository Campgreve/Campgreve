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

const WIDTH = 480;
const HEIGHT = 340;
// Il tronco parte dal vaso in basso a sinistra e cresce in diagonale
// verso destra (bonsai compatto, non centrato).
const TRUNK_BASE = { x: 78, y: 250 };
const TRUNK_ANGLE = -1.22; // radianti: inclinato verso destra
const TRUNK_LENGTH = 62;
const TRUNK_DEPTH = 8;

// ---------------------------------------------------------------------
// 1. Scheletro dell'albero (tronco + rami), generato con un algoritmo
//    ricorsivo a seed fisso: la FORMA resta sempre la stessa, cambia
//    solo il fogliame in base ai contributi reali.
//
//    I rami vicino al tronco hanno una "piega" decisa a metà lunghezza,
//    tipica dei bonsai stilizzati (il tronco non cresce mai dritto).
//    Ogni ramo è leggermente curvo, non un segmento rettilineo.
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

function pushBranch(branches, x1, y1, x2, y2, w) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  // curvatura leggera perpendicolare al ramo, più marcata sui rami spessi
  const curve = (rand() - 0.5) * Math.min(14, len * 0.35);
  branches.push({ x1, y1, x2, y2, w, curve });
}

function grow(x, y, angle, length, depth, branches, leafSlots) {
  if (depth === 0 || length < 5) {
    leafSlots.push({ x, y, depth });
    return;
  }
  const width = Math.max(1.2, depth * 1.55);
  const originalLength = length; // usata per il decadimento tra un livello e l'altro
  let curX = x;
  let curY = y;
  let curAngle = angle;

  // piega decisa a metà lunghezza per tronco e rami principali: è quello
  // che dà ai bonsai il loro andamento "spezzato" e mai rettilineo.
  // La lunghezza totale (piega + prosecuzione) resta pari a `length`,
  // così i rami non si accorciano più del dovuto ad ogni livello.
  if (depth >= 4) {
    const kink = (rand() - 0.5) * 1.1;
    const midAngle = angle + kink;
    const kinkFrac = 0.42 + rand() * 0.16;
    const midX = curX + Math.cos(angle) * length * kinkFrac;
    const midY = curY + Math.sin(angle) * length * kinkFrac;
    pushBranch(branches, curX, curY, midX, midY, width);
    curX = midX;
    curY = midY;
    curAngle = midAngle;
    length = length * (1 - kinkFrac);
  }

  const x2 = curX + Math.cos(curAngle) * length;
  const y2 = curY + Math.sin(curAngle) * length;
  pushBranch(branches, curX, curY, x2, y2, width * 0.82);

  if (depth <= 3) leafSlots.push({ x: x2, y: y2, depth });

  const nBranches = depth > 3 ? 2 : rand() > 0.12 ? 2 : 1;
  for (let i = 0; i < nBranches; i++) {
    // spread irregolare: ogni ramo si apre con un angolo diverso, non
    // simmetrico, per evitare l'effetto "ventaglio" troppo regolare.
    // Il decadimento della lunghezza parte SEMPRE da originalLength,
    // non dal segmento già ridotto dalla piega.
    const spread = 0.32 + rand() * 0.45;
    const asym = (rand() - 0.5) * 0.3;
    const newAngle = curAngle + (i === 0 ? -spread : spread) * (0.55 + rand() * 0.6) + asym;
    const newLength = originalLength * (0.74 + rand() * 0.16);
    grow(x2, y2, newAngle, newLength, depth - 1, branches, leafSlots);
  }
}

const branches = [];
const leafSlots = [];
grow(TRUNK_BASE.x, TRUNK_BASE.y, TRUNK_ANGLE, TRUNK_LENGTH, TRUNK_DEPTH, branches, leafSlots);

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
// 4. Assegna ogni giorno attivo a uno slot. Ogni slot ospita un piccolo
//    cluster di quadratini ravvicinati (come le celle della contribution
//    graph), così la chioma resta fitta invece di sparpagliarsi.
// ---------------------------------------------------------------------
const CELL = 6;
const GAP = 1;
const CLUSTER_COLS = 4;

function buildLeaves(colors) {
  const leaves = [];
  const n = leafSlots.length;
  activeDays.forEach((day, i) => {
    const slot = leafSlots[i % n];
    const stack = Math.floor(i / n);
    const posInCluster = stack % (CLUSTER_COLS * CLUSTER_COLS);
    const col = posInCluster % CLUSTER_COLS;
    const row = Math.floor(posInCluster / CLUSTER_COLS);
    const offsetX = (col - (CLUSTER_COLS - 1) / 2) * (CELL + GAP);
    const offsetY = (row - (CLUSTER_COLS - 1) / 2) * (CELL + GAP);
    const level = levelFromCount(day.count);
    leaves.push({
      x: slot.x + offsetX,
      y: slot.y + offsetY,
      size: CELL,
      color: colors[level],
      delay: (rand() * 4).toFixed(2),
      recent: i > activeDays.length - 15,
    });
  });
  return leaves;
}

function svgLeaf(leaf) {
  const swayClass = leaf.recent ? 'leaf-sway-strong' : 'leaf-sway';
  const half = leaf.size / 2;
  return `<rect class="${swayClass}" x="${(leaf.x - half).toFixed(1)}" y="${(leaf.y - half).toFixed(1)}" width="${leaf.size}" height="${leaf.size}" rx="1.5" fill="${leaf.color}" style="animation-delay:${leaf.delay}s" />`;
}

// ---------------------------------------------------------------------
// 5. Rami: disegnati come curve (non linee rette) con cap "butt" per
//    evitare le giunture rotonde tipo pallino. Il cap arrotondato resta
//    solo sui rami più spessi (tronco), dove serve a nascondere le
//    giunture senza creare l'effetto "cerchiato" sui rametti sottili.
// ---------------------------------------------------------------------
function svgBranches() {
  return branches
    .map((b) => {
      const midX = (b.x1 + b.x2) / 2;
      const midY = (b.y1 + b.y2) / 2;
      const dx = b.x2 - b.x1;
      const dy = b.y2 - b.y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const cx = midX + nx * b.curve;
      const cy = midY + ny * b.curve;
      const cap = b.w > 5 ? 'round' : 'butt';
      return `<path d="M ${b.x1.toFixed(1)} ${b.y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x2.toFixed(1)} ${b.y2.toFixed(1)}" stroke="var(--trunk-color)" stroke-width="${b.w.toFixed(1)}" fill="none" stroke-linecap="${cap}" />`;
    })
    .join('\n    ');
}

// ---------------------------------------------------------------------
// 6. Vaso da bonsai
// ---------------------------------------------------------------------
function svgPot(potColor, soilColor) {
  const cx = TRUNK_BASE.x;
  const topY = TRUNK_BASE.y + 4;
  const botY = TRUNK_BASE.y + 40;
  const topHalf = 48;
  const botHalf = 36;
  const rimH = 7;
  return `
  <g>
    <path d="M ${cx - topHalf} ${topY} L ${cx + topHalf} ${topY} L ${cx + botHalf} ${botY} L ${cx - botHalf} ${botY} Z" fill="${potColor}" />
    <rect x="${cx - topHalf - 5}" y="${topY - rimH}" width="${topHalf * 2 + 10}" height="${rimH + 2}" rx="2.5" fill="${potColor}" />
    <ellipse cx="${cx}" cy="${topY - rimH + 1}" rx="${topHalf - 3}" ry="4" fill="${soilColor}" />
    <ellipse cx="${cx}" cy="${botY}" rx="${botHalf * 0.9}" ry="3" fill="#000000" opacity="0.15" />
  </g>`;
}

// ---------------------------------------------------------------------
// 7. Foglie cadenti: un piccolo gruppo di quadratini anima una caduta
//    continua dalla chioma verso il vaso, in loop con tempi sfalsati.
// ---------------------------------------------------------------------
function svgFallingLeaves(colors) {
  const count = 7;
  const items = [];
  for (let i = 0; i < count; i++) {
    const startX = TRUNK_BASE.x + 10 + rand() * 190;
    const startY = 40 + rand() * 90;
    const fallDistance = TRUNK_BASE.y + 20 - startY;
    const driftX = (rand() * 50 - 25).toFixed(1);
    const size = 4.5 + rand() * 2;
    const color = colors[Math.floor(rand() * colors.length)];
    const duration = (6 + rand() * 4).toFixed(2);
    const delay = (rand() * 8).toFixed(2);
    items.push(
      `<rect class="falling-leaf" x="${startX.toFixed(1)}" y="${startY.toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" rx="1.2" fill="${color}" style="--fall-x:${driftX}px; --fall-y:${fallDistance.toFixed(1)}px; animation-duration:${duration}s; animation-delay:${delay}s;" />`
    );
  }
  return items.join('\n    ');
}

function buildSVG({ mode, colors }) {
  const leaves = buildLeaves(colors);
  const trunkColor = mode === 'dark' ? '#8a5a3d' : '#7a4a2f';
  const potColor = mode === 'dark' ? '#8a4632' : '#a15c3e';
  const soilColor = mode === 'dark' ? '#2b1d16' : '#3a2a1f';

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
    @keyframes fall {
      0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
      8% { opacity: 1; }
      90% { opacity: 1; }
      100% { transform: translate(var(--fall-x), var(--fall-y)) rotate(220deg); opacity: 0; }
    }
    .leaf-sway { animation: sway 4s ease-in-out infinite; transform-origin: center; }
    .leaf-sway-strong { animation: swayStrong 2.6s ease-in-out infinite; transform-origin: center; }
    .falling-leaf { animation-name: fall; animation-timing-function: ease-in; animation-iteration-count: infinite; }
  </style>
  ${svgPot(potColor, soilColor)}
  <g>
    ${svgBranches()}
  </g>
  <g>
    ${leaves.map(svgLeaf).join('\n    ')}
  </g>
  <g>
    ${svgFallingLeaves(colors)}
  </g>
  <text x="${WIDTH - 10}" y="${HEIGHT - 10}" text-anchor="end" font-size="10" fill="${trunkColor}" opacity="0.55">${activeDays.length} contributi \u00b7 ${leaves.length} foglie</text>
</svg>`;
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

fs.writeFileSync(path.join(OUT_DIR, 'tree-light.svg'), buildSVG({ mode: 'light', colors: LEVEL_COLORS_LIGHT }));
fs.writeFileSync(path.join(OUT_DIR, 'tree-dark.svg'), buildSVG({ mode: 'dark', colors: LEVEL_COLORS_DARK }));

console.log(`✅ Generati ${activeDays.length} giorni attivi su ${leafSlots.length} slot foglia disponibili.`);
console.log('   -> assets/tree-light.svg');
console.log('   -> assets/tree-dark.svg');
