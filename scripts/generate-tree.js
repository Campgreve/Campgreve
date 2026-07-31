#!/usr/bin/env node
/**
 * generate-tree.js
 *
 * Legge scripts/contributions.json (prodotto da fetch-contributions.js)
 * e genera assets/tree-light.svg + assets/tree-dark.svg in stile pixel art:
 * tronco e rami disegnati come blocchi netti su una griglia, foglie
 * quadrate, vaso a gradoni. Niente curve, niente angoli arrotondati.
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

// ---------------------------------------------------------------------
// Griglia pixel art: tutto viene "agganciato" a multipli di PIXEL, così
// il risultato ha il tipico effetto blocchi netti (stile 8-bit) invece
// di linee morbide. Canvas compatto per stare bene dentro il riquadro
// del README senza lasciare spazio vuoto intorno.
// ---------------------------------------------------------------------
const PIXEL = 6;
const WIDTH = 260;
const HEIGHT = 232;

const TRUNK_BASE = { x: 68, y: 168 };
const TRUNK_ANGLE = -1.22; // radianti: inclinato verso destra
const TRUNK_LENGTH = 34;
const TRUNK_DEPTH = 7;

function snap(v) {
  return Math.round(v / PIXEL) * PIXEL;
}

// ---------------------------------------------------------------------
// 1. Scheletro dell'albero (tronco + rami), seed fisso: la FORMA resta
//    sempre la stessa, cambia solo il fogliame in base ai contributi
//    reali. Ogni ramo principale ha una piega decisa a metà lunghezza
//    (i bonsai non crescono mai dritti), con angoli asimmetrici tra le
//    due diramazioni per evitare l'effetto "ventaglio" regolare.
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
  if (depth === 0 || length < 4) {
    leafSlots.push({ x, y, depth });
    return;
  }
  const thick = depth >= 5; // spessore a due livelli soli: tronco/rami principali vs rametti
  const originalLength = length;
  let curX = x;
  let curY = y;
  let curAngle = angle;

  if (depth >= 4) {
    const kink = (rand() - 0.5) * 1.1;
    const midAngle = angle + kink;
    const kinkFrac = 0.42 + rand() * 0.16;
    const midX = curX + Math.cos(angle) * length * kinkFrac;
    const midY = curY + Math.sin(angle) * length * kinkFrac;
    branches.push({ x1: curX, y1: curY, x2: midX, y2: midY, thick });
    curX = midX;
    curY = midY;
    curAngle = midAngle;
    length = length * (1 - kinkFrac);
  }

  const x2 = curX + Math.cos(curAngle) * length;
  const y2 = curY + Math.sin(curAngle) * length;
  branches.push({ x1: curX, y1: curY, x2, y2, thick });

  if (depth <= 3) leafSlots.push({ x: x2, y: y2, depth });

  const nBranches = depth > 3 ? 2 : rand() > 0.12 ? 2 : 1;
  for (let i = 0; i < nBranches; i++) {
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
leafSlots.sort((a, b) => b.depth - a.depth);

// ---------------------------------------------------------------------
// 2. Carica i contributi reali (o dati di esempio in locale)
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
// 3. Colori in stile GitHub
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
// 4. Foglie: quadratini pixel (spigoli vivi, niente rx) raggruppati in
//    piccoli cluster ravvicinati per slot.
// ---------------------------------------------------------------------
const CELL = PIXEL;
const GAP = 1;
const CLUSTER_COLS = 3;

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
      x: snap(slot.x + offsetX),
      y: snap(slot.y + offsetY),
      size: CELL,
      color: colors[level],
      delay: (rand() * 4).toFixed(2),
      recent: i > activeDays.length - 12,
    });
  });
  return leaves;
}

function svgLeaf(leaf) {
  const swayClass = leaf.recent ? 'leaf-sway-strong' : 'leaf-sway';
  return `<rect class="${swayClass}" x="${leaf.x}" y="${leaf.y}" width="${leaf.size}" height="${leaf.size}" fill="${leaf.color}" style="animation-delay:${leaf.delay}s" />`;
}

// ---------------------------------------------------------------------
// 5. Rami disegnati come sequenze di blocchi quadrati agganciati alla
//    griglia (nessuna linea/curva morbida): il classico effetto pixel
//    art. Due sole taglie di spessore per restare coerenti: tronco/rami
//    principali (thick) e rametti (thin).
// ---------------------------------------------------------------------
function blockTrail(x1, y1, x2, y2, blockSize) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.round(dist / (blockSize * 0.7)));
  const cells = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    cells.push({
      x: snap(x1 + (x2 - x1) * t),
      y: snap(y1 + (y2 - y1) * t),
    });
  }
  return cells;
}

function svgBranches(trunkColor) {
  let out = '';
  for (const b of branches) {
    const blockSize = b.thick ? PIXEL * 2 : PIXEL;
    const cells = blockTrail(b.x1, b.y1, b.x2, b.y2, blockSize);
    for (const c of cells) {
      out += `<rect x="${c.x - blockSize / 2}" y="${c.y - blockSize / 2}" width="${blockSize}" height="${blockSize}" fill="${trunkColor}" />\n    `;
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// 6. Vaso a gradoni (pixel art), niente diagonali morbide
// ---------------------------------------------------------------------
function svgPot(potColor, soilColor) {
  const cx = TRUNK_BASE.x;
  const topY = snap(TRUNK_BASE.y + PIXEL);
  const rows = [
    { w: 15 * PIXEL, y: topY },
    { w: 13 * PIXEL, y: topY + PIXEL * 2 },
    { w: 12 * PIXEL, y: topY + PIXEL * 4 },
    { w: 10 * PIXEL, y: topY + PIXEL * 6 },
  ];
  let out = `<rect x="${cx - 8 * PIXEL}" y="${topY - PIXEL}" width="${16 * PIXEL}" height="${PIXEL}" fill="${potColor}" />\n`;
  for (const r of rows) {
    out += `  <rect x="${cx - r.w / 2}" y="${r.y}" width="${r.w}" height="${PIXEL * 2}" fill="${potColor}" />\n`;
  }
  out += `  <rect x="${cx - 6 * PIXEL}" y="${topY - PIXEL}" width="${12 * PIXEL}" height="${PIXEL}" fill="${soilColor}" />\n`;
  return out;
}

// ---------------------------------------------------------------------
// 7. Foglie cadenti: quadratini pixel che scendono in loop verso il vaso
// ---------------------------------------------------------------------
function svgFallingLeaves(colors) {
  const count = 5;
  const items = [];
  for (let i = 0; i < count; i++) {
    const startX = snap(TRUNK_BASE.x - 20 + rand() * 160);
    const startY = snap(20 + rand() * 60);
    const fallDistance = TRUNK_BASE.y + 10 - startY;
    const driftX = (rand() * 30 - 15).toFixed(1);
    const color = colors[Math.floor(rand() * colors.length)];
    const duration = (6 + rand() * 4).toFixed(2);
    const delay = (rand() * 8).toFixed(2);
    items.push(
      `<rect class="falling-leaf" x="${startX}" y="${startY}" width="${PIXEL - 1}" height="${PIXEL - 1}" fill="${color}" style="--fall-x:${driftX}px; --fall-y:${fallDistance.toFixed(1)}px; animation-duration:${duration}s; animation-delay:${delay}s;" />`
    );
  }
  return items.join('\n    ');
}

function buildSVG({ mode, colors }) {
  const leaves = buildLeaves(colors);
  const trunkColor = mode === 'dark' ? '#8a5a3d' : '#7a4a2f';
  const potColor = mode === 'dark' ? '#8a4632' : '#a15c3e';
  const soilColor = mode === 'dark' ? '#2b1d16' : '#3a2a1f';

  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" style="--trunk-color:${trunkColor}">
  <style>
    text { font-family: -apple-system, Segoe UI, sans-serif; }
    @keyframes sway {
      0%, 100% { transform: rotate(-2deg); }
      50% { transform: rotate(2deg); }
    }
    @keyframes swayStrong {
      0%, 100% { transform: rotate(-4deg); }
      50% { transform: rotate(4deg); }
    }
    @keyframes fall {
      0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
      8% { opacity: 1; }
      90% { opacity: 1; }
      100% { transform: translate(var(--fall-x), var(--fall-y)) rotate(180deg); opacity: 0; }
    }
    .leaf-sway { animation: sway 4s ease-in-out infinite; transform-origin: center; }
    .leaf-sway-strong { animation: swayStrong 2.6s ease-in-out infinite; transform-origin: center; }
    .falling-leaf { animation-name: fall; animation-timing-function: ease-in; animation-iteration-count: infinite; }
  </style>
  ${svgPot(potColor, soilColor)}
  <g>
    ${svgBranches(trunkColor)}
  </g>
  <g>
    ${leaves.map(svgLeaf).join('\n    ')}
  </g>
  <g>
    ${svgFallingLeaves(colors)}
  </g>
  <text x="${WIDTH - 4}" y="${HEIGHT - 4}" text-anchor="end" font-size="7" fill="${trunkColor}" opacity="0.55">${activeDays.length} contributi \u00b7 ${leaves.length} foglie</text>
</svg>`;
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

fs.writeFileSync(path.join(OUT_DIR, 'tree-light.svg'), buildSVG({ mode: 'light', colors: LEVEL_COLORS_LIGHT }));
fs.writeFileSync(path.join(OUT_DIR, 'tree-dark.svg'), buildSVG({ mode: 'dark', colors: LEVEL_COLORS_DARK }));

console.log(`✅ Generati ${activeDays.length} giorni attivi su ${leafSlots.length} slot foglia disponibili.`);
console.log('   -> assets/tree-light.svg');
console.log('   -> assets/tree-dark.svg');
