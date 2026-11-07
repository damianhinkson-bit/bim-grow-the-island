/**
 * Pixel art for the close-up towns. Everything is drawn in code at 16 art pixels per tile, one canvas pixel per art
 * pixel, and shown with nearest-neighbour scaling so it stays crisp. Original art with a Barbadian look: chattel houses,
 * coral stone, breadfruit, rum shops, flying fish.
 */
import { Texture } from 'pixi.js';
import type { BType, NodeType } from '@bim/sim';

export const PX = 16;
type G = CanvasRenderingContext2D;

// ---------- palette
export const C = {
  out: '#2A1E14', shadow: 'rgba(20,30,10,.28)',
  grass: '#6DB33F', grassD: '#58A033', grassL: '#86C752', tuft: '#3F8A28',
  sand: '#F0D79C', sandD: '#DDBF80', sandL: '#FAE7B9',
  sea: '#3BB4D8', seaL: '#7CD8EE', deep: '#2187BF', deepD: '#1B6FA3', foam: '#F4FCFF',
  hedge: '#2F7A2C', hedgeD: '#1F5420', hedgeL: '#4FA03F',
  dirt: '#C9A26A', dirtD: '#A88452', dirtL: '#DDBA84',
  stone: '#D6C7A8', stoneD: '#AD9C7B', stoneL: '#E8DCC2',
  wood: '#A0673A', woodD: '#74461F', woodL: '#C98B55',
  thatch: '#E3B65A', thatchD: '#B4842F', thatchL: '#F4D589',
  tile: '#C9573A', tileD: '#9A3B24', tileL: '#E57D58',
  tin: '#A9B4BE', tinD: '#7D8893', tinL: '#D2D9DF',
  coral: '#EFE3C6', coralD: '#CFC09C', coralL: '#FFF6E0',
  glass: '#5C8FB8', glassL: '#A8D3EE', door: '#5A3820',
  leaf: '#3E9A3A', leafD: '#2A6E2A', leafL: '#6BC24E',
  red: '#E2553F', redD: '#A93424', gold: '#FFC726',
};
export const PASTELS = ['#F4A6B8', '#9EE0C9', '#FFE08A', '#9CC9F5', '#F7B98A', '#C9B6F2'];

// ---------- helpers
const r = (g: G, x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const p = (g: G, x: number, y: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
/** Deterministic noise in 0..1 for (x, y, salt). */
export const hash = (x: number, y: number, k = 0) => { let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** A filled pixel disc. */
function disc(g: G, cx: number, cy: number, rad: number, c: string) {
  g.fillStyle = c;
  for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++)
    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rad * rad) g.fillRect(x, y, 1, 1);
}
function ellipse(g: G, cx: number, cy: number, rx: number, ry: number, c: string) {
  g.fillStyle = c;
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
    if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) g.fillRect(x, y, 1, 1);
}
/** A box with a dark outline. */
function box(g: G, x: number, y: number, w: number, h: number, fill: string, out = C.out) { r(g, x, y, w, h, out); r(g, x + 1, y + 1, w - 2, h - 2, fill); }
const shadowUnder = (g: G, cx: number, cy: number, rx: number, ry: number) => ellipse(g, cx, cy, rx, ry, C.shadow);

/** Draws with a fresh canvas at 1 art pixel per canvas pixel, cached by key. */
const cache = new Map<string, Texture>();
const canvases = new Map<string, HTMLCanvasElement>();
function art(key: string, w: number, h: number, draw: (g: G) => void): Texture {
  const hit = cache.get(key); if (hit) return hit;
  const c = artCanvas(key, w, h, draw);
  const t = Texture.from(c); t.source.scaleMode = 'nearest';
  cache.set(key, t); return t;
}
export function artCanvas(key: string, w: number, h: number, draw: (g: G) => void): HTMLCanvasElement {
  const hit = canvases.get(key); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; draw(g);
  canvases.set(key, c); return c;
}

// ---------- terrain (baked per town by the renderer)
/** One tile of ground at town-local (x, y). kinds: 0 grass, 1 sand, 2 shallow, 3 deep, 4 hedge. */
export function drawGround(g: G, kind: number, x: number, y: number, ox: number, oy: number, around: (dx: number, dy: number) => number) {
  const X = ox, Y = oy;
  if (kind === 0) {
    r(g, X, Y, PX, PX, C.grass);
    // large soft patches of darker and lighter grass, so the field isn't flat
    for (let yy = 0; yy < PX; yy += 2) for (let xx = 0; xx < PX; xx += 2) {
      const n = Math.sin((x * PX + xx) * 0.09 + Math.sin((y * PX + yy) * 0.07) * 2) + Math.sin((y * PX + yy) * 0.11 + (x * PX + xx) * 0.03);
      if (n > 1.1) r(g, X + xx, Y + yy, 2, 2, C.grassD); else if (n < -1.25) r(g, X + xx, Y + yy, 2, 2, C.grassL);
    }
    for (let k = 0; k < 10; k++) { const a = hash(x, y, k), b = hash(x, y, k + 20); p(g, X + Math.floor(a * 16), Y + Math.floor(b * 16), a > 0.5 ? C.grassD : C.grassL); }
    // tufts and the odd flower
    if (hash(x, y, 7) > 0.55) { const tx = X + 2 + Math.floor(hash(x, y, 8) * 11), ty = Y + 3 + Math.floor(hash(x, y, 9) * 10); p(g, tx, ty, C.tuft); p(g, tx + 2, ty, C.tuft); p(g, tx + 1, ty - 1, C.tuft); p(g, tx + 1, ty, C.tuft); }
    if (hash(x, y, 11) > 0.9) { const fx = X + 3 + Math.floor(hash(x, y, 12) * 10), fy = Y + 3 + Math.floor(hash(x, y, 13) * 10), col = ['#FFE14D', '#FF7AA8', '#FFFFFF', '#FF9F3A'][Math.floor(hash(x, y, 14) * 4)]; p(g, fx, fy, col); p(g, fx + 1, fy + 1, col); p(g, fx - 1, fy + 1, col); p(g, fx, fy + 2, col); p(g, fx, fy + 1, '#F2C230'); }
    // sand creeping in where the beach meets the grass
    if (around(-1, 0) === 1) for (let yy = 0; yy < PX; yy++) { const d = 1 + Math.floor(hash(x, y * 16 + yy, 3) * 3); r(g, X, Y + yy, d, 1, C.sand); }
  } else if (kind === 1) {
    r(g, X, Y, PX, PX, C.sand);
    for (let k = 0; k < 8; k++) p(g, X + Math.floor(hash(x, y, k) * 16), Y + Math.floor(hash(x, y, k + 30) * 16), hash(x, y, k + 60) > 0.5 ? C.sandD : C.sandL);
    if (hash(x, y, 5) > 0.85) { const sx = X + 4 + Math.floor(hash(x, y, 6) * 8), sy = Y + 4 + Math.floor(hash(x, y, 7) * 8); p(g, sx, sy, '#FFFFFF'); p(g, sx + 1, sy, '#F7C9B8'); }
    if (around(1, 0) === 0) for (let yy = 0; yy < PX; yy++) { const d = 1 + Math.floor(hash(x, y * 16 + yy, 4) * 3); r(g, X + PX - d, Y + yy, d, 1, C.grassD); }
  } else if (kind === 2 || kind === 3) {
    const deep = kind === 3;
    r(g, X, Y, PX, PX, deep ? C.deep : C.sea);
    for (let k = 0; k < 4; k++) { const wx = X + Math.floor(hash(x, y, k) * 12), wy = Y + 2 + Math.floor(hash(x, y, k + 9) * 12); r(g, wx, wy, 3, 1, deep ? C.sea : C.seaL); }
    if (deep && hash(x, y, 21) > 0.6) r(g, X + Math.floor(hash(x, y, 22) * 10), Y + Math.floor(hash(x, y, 23) * 14), 4, 1, C.deepD);
    // foam where the sea meets the beach
    if (around(1, 0) === 1) for (let yy = 0; yy < PX; yy++) { const d = 1 + Math.floor(hash(x, y * 16 + yy, 5) * 2.5); r(g, X + PX - d - 1, Y + yy, d, 1, C.foam); r(g, X + PX - 1, Y + yy, 1, 1, C.sandD); }
    if (!deep && around(-1, 0) === 3) for (let yy = 0; yy < PX; yy += 2) p(g, X, Y + yy, C.deep);
  } else if (kind === 4) {
    // the hedge round the edge of town: round bushes, dark beneath
    r(g, X, Y, PX, PX, C.hedgeD);
    for (const [cx, cy, rad] of [[4, 5, 5], [11, 4, 5], [8, 11, 6], [2, 13, 3], [14, 12, 4]] as [number, number, number][]) disc(g, X + cx, Y + cy, rad, C.hedge);
    for (let k = 0; k < 9; k++) p(g, X + 1 + Math.floor(hash(x, y, k) * 14), Y + 1 + Math.floor(hash(x, y, k + 40) * 12), C.hedgeL);
    if (hash(x, y, 2) > 0.7) { const bx = X + 3 + Math.floor(hash(x, y, 3) * 9), by = Y + 3 + Math.floor(hash(x, y, 4) * 9); p(g, bx, by, '#FF5A7A'); p(g, bx + 1, by, '#FF5A7A'); }
    if (around(0, 1) === 0 || around(0, 1) === 1) { r(g, X, Y + PX - 3, PX, 3, C.hedgeD); for (let xx = 0; xx < PX; xx += 2) p(g, X + xx, Y + PX - 3, C.hedge); }
  } else if (kind === 5) {
    // a hedge bottom edge cast as shadow on the grass is drawn by the renderer
  }
}
/** A dirt road or path tile over the ground. style: 0 dirt, 1 dirt path, 2 coral stone, 3 paved with a kerb. */
export function drawPath(g: G, style: number, x: number, y: number, X: number, Y: number, n: { l: boolean; r: boolean; u: boolean; d: boolean }) {
  const [base, dark, light] = style <= 1 ? [C.dirt, C.dirtD, C.dirtL] : [C.stone, C.stoneD, C.stoneL];
  // the path fills the tile, with a ragged grass edge on sides that don't continue
  const inset = 2;
  r(g, X + (n.l ? 0 : inset), Y + (n.u ? 0 : inset), PX - (n.l ? 0 : inset) - (n.r ? 0 : inset), PX - (n.u ? 0 : inset) - (n.d ? 0 : inset), base);
  for (let k = 0; k < 7; k++) p(g, X + 2 + Math.floor(hash(x, y, k + 70) * 12), Y + 2 + Math.floor(hash(x, y, k + 80) * 12), hash(x, y, k) > 0.5 ? dark : light);
  if (style >= 2) {
    // cobbles
    for (let yy = (n.u ? 0 : inset); yy < PX - (n.d ? 0 : inset); yy += 4) for (let xx = (n.l ? 0 : inset) + ((yy / 4) % 2) * 2; xx < PX - (n.r ? 0 : inset); xx += 4) { p(g, X + xx, Y + yy, dark); }
  }
  const edge = style >= 3 ? C.stoneD : C.grassD;
  if (!n.l) for (let yy = 0; yy < PX; yy++) if (hash(x, y * 16 + yy, 1) > 0.4) p(g, X + inset - 1, Y + yy, edge);
  if (!n.r) for (let yy = 0; yy < PX; yy++) if (hash(x, y * 16 + yy, 2) > 0.4) p(g, X + PX - inset, Y + yy, edge);
  if (!n.u) for (let xx = 0; xx < PX; xx++) if (hash(x * 16 + xx, y, 3) > 0.4) p(g, X + xx, Y + inset - 1, edge);
  if (!n.d) for (let xx = 0; xx < PX; xx++) if (hash(x * 16 + xx, y, 4) > 0.4) p(g, X + xx, Y + PX - inset, edge);
}
/** AgroCorp's cane: tall green rows. */
export function drawCane(g: G, x: number, y: number, X: number, Y: number) {
  r(g, X, Y, PX, PX, '#8A7A45');
  for (let c = 0; c < 4; c++) {
    const cx = X + 2 + c * 4;
    r(g, cx, Y, 2, PX, '#7FAE3A');
    for (let yy = 0; yy < PX; yy += 3) { p(g, cx - 1, Y + yy + (hash(x, y, c + yy) > 0.5 ? 1 : 0), '#A6CF4E'); p(g, cx + 2, Y + yy + 1, '#5E8A28'); }
  }
}

// ---------- resources
export function nodeTex(type: NodeType, variant: number, amtShare = 1): Texture {
  const stage = type === 'tree' ? (amtShare > 0.6 ? 2 : amtShare > 0.25 ? 1 : 0) : type === 'rock' ? (amtShare > 0.5 ? 1 : 0) : 0;
  return art(`n:${type}:${variant % 3}:${stage}`, 32, 40, (g) => drawNode(g, type, variant % 3, stage));
}
/** Resources are 32x40 sprites anchored at the bottom centre of their tile, so tree canopies spill over. */
function drawNode(g: G, type: NodeType, v: number, stage: number) {
  if (type === 'tree') {
    if (v === 2) { drawPalm(g, 16, 38, 1); return; }
    shadowUnder(g, 16, 36, 10, 3);
    r(g, 14, 26, 4, 11, C.out); r(g, 15, 26, 2, 10, C.wood); p(g, 15, 28, C.woodL); p(g, 16, 32, C.woodD);
    const mango = v === 1;
    const [fill, dark, light] = mango ? ['#2F8A34', '#1F6626', '#4FAE45'] : [C.leaf, C.leafD, C.leafL];
    const lobes: [number, number, number][] = [[16, 15, 9], [9, 18, 6], [23, 18, 6], [12, 11, 6], [21, 11, 6], [16, 21, 7]];
    for (const [x, y, rad] of lobes) disc(g, x, y, rad + 1, C.out);
    for (const [x, y, rad] of lobes) disc(g, x, y, rad, fill);
    for (const [x, y, rad] of lobes) disc(g, x + 2, y + 2, rad - 3, dark);
    for (const [x, y, rad] of lobes) disc(g, x - 1, y - 2, Math.max(1, rad - 4), fill);
    for (let k = 0; k < 14; k++) p(g, 7 + Math.floor(hash(v, k, 1) * 18), 6 + Math.floor(hash(v, k, 2) * 14), light);
    // fruit: big green breadfruit, or red-orange mangoes; fewer as it's picked
    const fruits = stage === 2 ? 4 : stage === 1 ? 2 : 0;
    const spots: [number, number][] = [[11, 17], [20, 14], [15, 22], [23, 20]];
    for (let k = 0; k < fruits; k++) {
      const [fx, fy] = spots[k];
      if (mango) { disc(g, fx, fy, 1.6, '#7A2E12'); p(g, fx, fy, '#F28A2E'); p(g, fx - 1, fy, '#E85A2A'); p(g, fx, fy - 1, '#FFC34D'); }
      else { disc(g, fx, fy, 2.3, '#4A6E1A'); disc(g, fx, fy, 1.6, '#B8D94A'); p(g, fx - 1, fy - 1, '#E2F59A'); }
    }
  } else if (type === 'rock') {
    shadowUnder(g, 16, 36, 9, 3);
    const big = stage === 1;
    const pts: [number, number, number][] = big ? [[13, 31, 6], [20, 32, 5], [17, 27, 5]] : [[15, 32, 4], [19, 33, 3]];
    for (const [x, y, rad] of pts) disc(g, x, y, rad + 1, C.out);
    for (const [x, y, rad] of pts) disc(g, x, y, rad, C.coral);
    for (const [x, y, rad] of pts) disc(g, x + 1, y + 1.5, rad - 1.5, C.coralD);
    for (const [x, y, rad] of pts) disc(g, x - 1, y - 1, Math.max(1, rad - 3), C.coralL);
    // coral pores
    for (let k = 0; k < (big ? 9 : 5); k++) p(g, 11 + Math.floor(hash(v, k, 3) * 12), 26 + Math.floor(hash(v, k, 4) * 9), '#B5A47E');
  } else if (type === 'spring') {
    ellipse(g, 16, 32, 11, 6, C.out); ellipse(g, 16, 32, 10, 5, '#2F9CC6'); ellipse(g, 15, 31, 6, 3, '#5CC3E6');
    for (const [x, y] of [[8, 31], [24, 32], [12, 36], [21, 36], [16, 27]]) { disc(g, x, y, 1.6, '#9C917C'); p(g, x, y - 1, '#D8CDB5'); }
    p(g, 18, 30, '#FFFFFF'); p(g, 19, 30, '#FFFFFF'); p(g, 13, 33, '#DFF6FF');
    r(g, 22, 24, 1, 6, '#3F8A28'); r(g, 23, 25, 1, 5, '#58A033'); p(g, 22, 23, '#7A5A2A');
  } else if (type === 'fish') {
    // a shoal of flying fish under the surface, and a sparkle
    for (const [x, y, f] of [[9, 30, 1], [17, 26, -1], [22, 32, 1], [13, 35, -1], [20, 37, 1]] as [number, number, number][]) {
      const sh = 'rgba(10,45,75,.7)';
      r(g, x - 3, y, 7, 2, sh); r(g, x - 2, y - 1, 5, 1, sh); r(g, x - 2, y + 2, 5, 1, sh);
      // tail and the long wing-like fins of a flying fish
      p(g, x - 4 * f, y - 1, sh); p(g, x - 4 * f, y + 2, sh); r(g, x - 1, y - 3, 3, 1, 'rgba(10,45,75,.45)'); r(g, x - 1, y + 4, 3, 1, 'rgba(10,45,75,.45)');
    }
    for (const [x, y] of [[20, 29], [11, 33]]) { p(g, x, y, '#FFFFFF'); p(g, x - 1, y + 1, '#DFF6FF'); p(g, x + 1, y + 1, '#DFF6FF'); p(g, x, y + 2, '#DFF6FF'); }
  }
}
function drawPalm(g: G, bx: number, by: number, s: number) {
  shadowUnder(g, bx + 2, by - 1, 7 * s, 2);
  // a gently curving trunk
  for (let k = 0; k < 18; k++) { const x = bx + Math.round(Math.sin(k / 7) * 3), y = by - 2 - k; r(g, x - 1, y, 3, 1, C.out); p(g, x, y, k % 3 === 0 ? C.woodD : '#B8834D'); }
  const tx = bx + Math.round(Math.sin(17 / 7) * 3), ty = by - 21;
  const fronds: [number, number][] = [[-9, 2], [9, 3], [-6, -4], [7, -4], [-10, 6], [10, 7], [0, -6]];
  for (const [dx, dy] of fronds) {
    const n = 10;
    for (let k = 0; k <= n; k++) { const t = k / n, x = Math.round(tx + dx * t), y = Math.round(ty + dy * t + 3 * t * t * Math.sign(Math.abs(dx))); p(g, x, y + 1, C.leafD); p(g, x, y, k > 2 ? C.leaf : C.leafD); if (k % 2) p(g, x, y + 2, C.leafD); }
  }
  disc(g, tx, ty + 1, 2, '#6B4A1A'); p(g, tx - 1, ty + 2, '#8A6A2A'); p(g, tx + 1, ty + 2, '#8A6A2A');
}

// ---------- people
/** Worker sprite 16x16 frames: shirt in the co-op's colour, straw hat early on, hard hat from the Tech Age. */
export function workerTex(color: string, age: number, frame: number, carry: string | null): Texture {
  return art(`w:${color}:${age}:${frame}:${carry ?? ''}`, 16, 18, (g) => {
    shadowUnder(g, 8, 16.5, 4, 1.5);
    const leg = frame % 2;
    // legs
    r(g, 6, 12, 2, 4 - leg, C.out); r(g, 9, 12, 2, 3 + leg, C.out);
    p(g, 6, 12, '#3B4A7A'); p(g, 9, 12, '#3B4A7A');
    // body
    box(g, 5, 7, 7, 6, color);
    r(g, 6, 8, 5, 1, 'rgba(255,255,255,.35)');
    // head
    box(g, 6, 2, 5, 5, '#8A5A3A'); p(g, 7, 4, C.out); p(g, 9, 4, C.out);
    // hat
    if (age >= 4) { r(g, 5, 1, 7, 2, '#FFB000'); r(g, 6, 0, 5, 1, '#FFB000'); }
    else if (age >= 2) { r(g, 4, 2, 9, 1, C.thatchD); r(g, 6, 0, 5, 2, C.thatch); }
    else { r(g, 6, 1, 5, 2, '#3A2414'); }
    // what they're carrying
    if (carry === 'food') { disc(g, 12.5, 9.5, 2.4, C.out); disc(g, 12.5, 9.5, 1.8, '#B8D94A'); }
    else if (carry === 'stone') { box(g, 11, 8, 4, 4, C.coral); }
    else if (carry === 'water') { box(g, 11, 8, 4, 5, '#5CC3E6'); r(g, 12, 7, 2, 1, C.out); }
    // arms
    p(g, 4, 9 + leg, '#8A5A3A'); p(g, 12, 10 - leg, '#8A5A3A');
  });
}

// ---------- buildings
/**
 * Building sprites are (w*16) wide and (h*16 + up) tall, anchored at the bottom-left of the footprint, so roofs and
 * tall buildings rise over the tiles behind them. `look` picks the art: a house's level, the Town Centre's age.
 */
export const UP: Partial<Record<BType, number>> = { tc: 20, house: 14, depot: 10, market: 10, rumshop: 12, hub: 18, hq: 18, ffarm: 6, mill: 22, tower: 40, aqua: 6, cistern: 8, palm: 22, lamp: 12, windbreak: 14, bandstand: 10, fountain: 6 };
export function buildingTex(type: BType, w: number, h: number, look: number, variant: number, site = false): Texture {
  const up = UP[type] ?? 4, W = w * PX, H = h * PX + up;
  const key = `b:${type}:${look}:${variant % 6}:${site ? 1 : 0}`;
  return art(key, W, H, (g) => { if (site) drawSite(g, W, H, up, type); else drawBuilding(g, type, W, H, up, look, variant); });
}
/** A building site: a pegged-out plot, a timber frame going up and a pile of stone. */
function drawSite(g: G, W: number, H: number, up: number, type: BType) {
  const y0 = up;
  r(g, 1, y0 + 1, W - 2, H - y0 - 2, 'rgba(120,90,50,.45)');
  for (let x = 1; x < W - 1; x += 3) { p(g, x, y0 + 1, C.gold); p(g, x, H - 2, C.gold); }
  for (let y = y0 + 1; y < H - 1; y += 3) { p(g, 1, y, C.gold); p(g, W - 2, y, C.gold); }
  const agro = type === 'ffarm' || type === 'mill' || type === 'tower';
  const frame = agro ? '#7D8893' : C.wood;
  const top = Math.max(2, y0 - 6);
  for (let x = 4; x < W - 3; x += Math.max(6, Math.floor((W - 8) / 3))) r(g, x, top, 1, H - top - 4, frame);
  for (let y = H - 6; y > top; y -= 6) r(g, 4, y, W - 8, 1, frame);
  box(g, W - 9, H - 7, 6, 4, C.coral); p(g, W - 7, H - 6, C.coralD);
  if (agro) { r(g, W - 3, 0, 1, H - 3, '#FFB000'); r(g, Math.floor(W / 3), 0, W - 3 - Math.floor(W / 3), 1, '#FFB000'); r(g, Math.floor(W / 2), 1, 1, 6, C.out); box(g, Math.floor(W / 2) - 2, 7, 5, 3, C.wood); }
}
/** A pitched roof seen from the front at a three-quarter angle: rows of tiles or sheets, with an outline. */
function roof(g: G, x: number, y: number, w: number, h: number, base: string, dark: string, light: string, rows = 3) {
  r(g, x, y, w, h, C.out);
  r(g, x + 1, y + 1, w - 2, h - 2, base);
  for (let k = 1; k < h - 1; k += rows) r(g, x + 1, y + k + rows - 1, w - 2, 1, dark);
  r(g, x + 1, y + 1, w - 2, 1, light);
  // the eave casts a shadow on the wall below
  r(g, x + 1, y + h, w - 2, 1, 'rgba(0,0,0,.28)');
}
function wall(g: G, x: number, y: number, w: number, h: number, base: string, dark: string) {
  r(g, x, y, w, h, C.out); r(g, x + 1, y, w - 2, h - 1, base); r(g, x + 1, y + h - 3, w - 2, 2, dark);
}
function windowAt(g: G, x: number, y: number, w = 4, h = 4, shutter?: string) {
  box(g, x, y, w, h, C.glass); p(g, x + 1, y + 1, C.glassL);
  if (shutter) { r(g, x - 1, y, 1, h, shutter); r(g, x + w, y, 1, h, shutter); }
}
function doorAt(g: G, x: number, y: number, w = 4, h = 6, col = C.door) { box(g, x, y, w, h, col); p(g, x + w - 2, y + Math.floor(h / 2), C.gold); }
function flag(g: G, x: number, y: number, col = '#00267F') {
  r(g, x, y, 1, 10, C.out);
  // Barbados colours: ultramarine, gold, ultramarine with a black trident
  r(g, x + 1, y, 2, 5, col); r(g, x + 3, y, 2, 5, '#FFC726'); r(g, x + 5, y, 2, 5, col); p(g, x + 4, y + 2, C.out);
}

function drawBuilding(g: G, type: BType, W: number, H: number, up: number, look: number, variant: number) {
  const base = H - 1;
  shadowUnder(g, W / 2, base - 1, W / 2 - 1, 3);
  const pastel = PASTELS[variant % PASTELS.length];
  switch (type) {
    case 'house': drawHouse(g, W, H, look, pastel); return;
    case 'tc': drawTC(g, W, H, look); return;
    case 'farm': {
      // tilled rows of sweet potato, cassava, pak choi and peppers
      box(g, 0, up, W, H - up, '#7A5230');
      const crops = ['#6CC24A', '#4FA03F', '#8CD45A', '#3E8A35'];
      for (let row = 0; row < 5; row++) {
        const y = up + 4 + row * 9;
        r(g, 2, y + 4, W - 4, 2, '#5C3C22');
        for (let x = 4; x < W - 4; x += 5) {
          const c = crops[(row + Math.floor(x / 5)) % crops.length];
          disc(g, x + 1, y + 2, 2.2, C.leafD); disc(g, x + 1, y + 1.5, 1.8, c);
          if (row === 2 && x % 15 === 4) { p(g, x + 1, y + 1, C.red); p(g, x + 2, y + 2, C.red); }
        }
      }
      if (look >= 4) for (let k = 0; k < 5; k++) r(g, 1, up + 7 + k * 9, W - 2, 1, '#5CC3E6');
      // a little shade hut
      box(g, W - 12, up - 2, 10, 8, C.thatch); r(g, W - 11, up + 6, 1, 4, C.wood); r(g, W - 4, up + 6, 1, 4, C.wood);
      return;
    }
    case 'depot': {
      wall(g, 2, up + 10, W - 4, H - up - 10, C.wood, C.woodD);
      for (let y = up + 13; y < H - 3; y += 3) r(g, 3, y, W - 6, 1, C.woodD);
      roof(g, 0, up - 6, W, 18, C.tin, C.tinD, C.tinL, 4);
      doorAt(g, W / 2 - 4, H - 11, 8, 9, C.woodD); r(g, W / 2, H - 11, 1, 9, C.out);
      for (const [x, c] of [[4, '#B8D94A'], [W - 9, C.coral]] as [number, string][]) box(g, x, H - 8, 5, 5, c);
      return;
    }
    case 'cistern': {
      box(g, 1, up + 2, W - 2, H - up - 3, C.coral); r(g, 2, up + 3, W - 4, 2, C.coralL);
      ellipse(g, W / 2, up + 3, W / 2 - 1, 2.5, C.out); ellipse(g, W / 2, up + 3, W / 2 - 2, 1.5, '#3FA7D6');
      r(g, W - 4, up - 6, 1, 9, C.tinD); r(g, W - 6, up - 6, 3, 1, C.tinD);
      return;
    }
    case 'seawall': {
      r(g, 0, up, W, H - up, C.out); r(g, 1, up + 1, W - 2, H - up - 2, C.coralD);
      for (let y = up + 1, row = 0; y < H - 2; y += 4, row++) for (let x = 1 + (row % 2) * 3; x < W - 1; x += 6) r(g, x, y, 5, 3, C.coral);
      r(g, 1, up + 1, W - 2, 1, C.coralL);
      return;
    }
    case 'market': {
      // a stall with a striped awning and produce out front
      wall(g, 3, up + 12, W - 6, H - up - 12, C.woodL, C.wood);
      const stripes = ['#FFFFFF', '#3FA7D6'];
      r(g, 0, up, W, 12, C.out);
      for (let x = 1; x < W - 1; x += 4) r(g, x, up + 1, 4, 10, stripes[(x / 4) % 2 | 0]);
      for (let x = 1; x < W - 1; x += 4) disc(g, x + 2, up + 11, 2, stripes[(x / 4) % 2 | 0]);
      box(g, 2, H - 8, W - 4, 6, C.wood);
      const fruit = ['#B8D94A', '#F28A2E', '#E2553F', '#FFE14D', '#6CC24A', '#B8D94A', '#F28A2E'];
      for (let k = 0; k < 7; k++) disc(g, 5 + k * 3.6, H - 8, 1.6, fruit[k]);
      return;
    }
    case 'rumshop': {
      // painted in bright bands, with a sign and dominoes table outside
      const bands = ['#E2553F', '#FFC726', '#3FAE5A'];
      wall(g, 2, up + 10, W - 4, H - up - 10, bands[variant % 3], C.out);
      for (let y = up + 13; y < H - 3; y += 3) r(g, 3, y, W - 6, 1, 'rgba(0,0,0,.12)');
      roof(g, 0, up - 6, W, 18, C.tin, C.tinD, C.tinL, 4);
      box(g, 4, up + 1, W - 8, 6, '#1E3A6E'); for (let x = 6; x < W - 6; x += 3) p(g, x, up + 4, '#FFFFFF');
      doorAt(g, W / 2 - 3, H - 10, 6, 8, '#2E5A2E'); windowAt(g, 4, H - 10, 4, 4, '#2E5A2E');
      box(g, W - 9, H - 6, 6, 3, C.woodL); p(g, W - 7, H - 6, '#FFFFFF'); p(g, W - 5, H - 6, '#FFFFFF');
      return;
    }
    case 'composter': {
      for (let k = 0; k < 2; k++) { box(g, 1 + k * 7, up + 3, 7, H - up - 4, C.wood); r(g, 2 + k * 7, up + 4, 5, 3, '#5C3C22'); }
      p(g, 4, up, '#DDDDDD'); p(g, 5, up - 2, '#DDDDDD'); p(g, 11, up + 1, '#DDDDDD');
      return;
    }
    case 'windbreak': {
      // a clump of bamboo
      for (let k = 0; k < 5; k++) { const x = 2 + k * 3; r(g, x, 3 + (k % 2) * 3, 2, H - 4 - (k % 2) * 3, C.out); r(g, x, 4 + (k % 2) * 3, 1, H - 6 - (k % 2) * 3, '#8FB34A'); for (let y = 6; y < H - 3; y += 5) p(g, x, y, '#5E7A28'); }
      for (const [x, y] of [[3, 3], [9, 2], [13, 6], [6, 9], [11, 12]]) { r(g, x - 2, y, 4, 1, C.leaf); p(g, x + 2, y + 1, C.leafD); }
      return;
    }
    case 'aqua': {
      // a greenhouse with tilapia tanks and rows of greens
      box(g, 1, up, W - 2, H - up - 1, '#BFE6F2');
      for (let x = 1; x < W; x += 8) r(g, x, up, 1, H - up - 1, '#7D8893');
      r(g, 1, up + 4, W - 2, 1, '#7D8893');
      for (let k = 0; k < 2; k++) { ellipse(g, 10 + k * 28, H - 9, 6, 4, C.out); ellipse(g, 10 + k * 28, H - 9, 5, 3, '#2F8EC0'); p(g, 9 + k * 28, H - 10, '#FFFFFF'); }
      for (let x = 18; x < 32; x += 3) disc(g, x, up + 10, 1.5, C.leafL);
      for (let x = 18; x < 32; x += 3) disc(g, x, up + 16, 1.5, C.leaf);
      return;
    }
    case 'solar': {
      for (let k = 0; k < 2; k++) {
        const x = 1 + k * 16;
        box(g, x, up + 2, 14, 10, '#24426E');
        for (let gx = x + 1; gx < x + 13; gx += 3) r(g, gx, up + 3, 1, 8, '#3D6AA8');
        r(g, x + 1, up + 6, 12, 1, '#3D6AA8'); p(g, x + 2, up + 3, '#A8D3EE');
        r(g, x + 6, up + 12, 1, H - up - 13, '#7D8893');
      }
      return;
    }
    case 'hub': {
      wall(g, 2, up + 14, W - 4, H - up - 14, C.coral, C.coralD);
      roof(g, 0, up - 6, W, 22, '#2E8C8C', '#1F6A6A', '#4FB0B0', 4);
      box(g, 6, up, W - 12, 6, C.gold); for (let x = 9; x < W - 9; x += 3) p(g, x, up + 3, C.out);
      for (let k = 0; k < 8; k++) r(g, 3 + k * 5.4, H - 14, 5, 4, k % 2 ? '#FFFFFF' : '#2E8C8C');
      doorAt(g, W / 2 - 4, H - 10, 8, 8); windowAt(g, 6, H - 10); windowAt(g, W - 10, H - 10);
      box(g, W - 14, H - 6, 10, 5, '#3FA7D6'); p(g, W - 12, H - 1, C.out); p(g, W - 6, H - 1, C.out);
      flag(g, W - 6, 0);
      return;
    }
    case 'dock': {
      // a jetty over the water, with a little painted fishing boat
      for (let x = 0; x < W; x += 3) { r(g, x, up + 2, 2, H - up - 4, C.woodD); r(g, x, up + 2, 3, 1, C.woodL); }
      r(g, 0, up + 4, W, 1, C.wood); r(g, 1, H - 3, 1, 3, C.out); r(g, W - 2, H - 3, 1, 3, C.out);
      const bx = W - 14, by = up + 6;
      ellipse(g, bx + 6, by + 4, 7, 3, C.out); ellipse(g, bx + 6, by + 3.5, 6, 2, ['#E2553F', '#3FA7D6', '#FFC726'][variant % 3]);
      r(g, bx + 2, by + 3, 8, 1, '#FFFFFF'); r(g, bx + 6, by - 4, 1, 7, C.woodD); r(g, bx + 7, by - 3, 3, 3, '#F4F4F2');
      return;
    }
    case 'flowers': {
      box(g, 1, up + 5, W - 2, H - up - 6, '#7A5230');
      const cols = ['#FF5A7A', '#FFE14D', '#FF9F3A', '#FFFFFF', '#E2553F', '#C77DFF'];
      for (let k = 0; k < 7; k++) { const x = 3 + (k % 4) * 3, y = up + 5 + Math.floor(k / 4) * 4; disc(g, x, y + 1, 1.7, C.leafD); disc(g, x, y, 1.4, cols[(k + variant) % cols.length]); p(g, x, y, '#FFE14D'); }
      return;
    }
    case 'palm': drawPalm(g, 7, H - 1, 1); return;
    case 'bench': {
      r(g, 1, up + 6, W - 2, 3, C.out); r(g, 2, up + 7, W - 4, 1, C.woodL);
      r(g, 1, up + 2, W - 2, 3, C.out); r(g, 2, up + 3, W - 4, 1, C.wood);
      r(g, 2, up + 9, 1, 3, C.out); r(g, W - 3, up + 9, 1, 3, C.out);
      return;
    }
    case 'lamp': {
      r(g, 7, 4, 2, H - 5, C.out); r(g, 7, H - 3, 2, 2, '#4A4A4A');
      box(g, 5, 0, 6, 6, '#3A3A3A'); r(g, 6, 1, 4, 4, '#FFE9A8'); p(g, 7, 2, '#FFFFFF');
      return;
    }
    case 'fountain': {
      ellipse(g, W / 2, H - 9, W / 2 - 1, 7, C.out); ellipse(g, W / 2, H - 9, W / 2 - 2, 6, C.coral); ellipse(g, W / 2, H - 10, W / 2 - 4, 4, '#3FA7D6');
      box(g, W / 2 - 2, up, 4, H - up - 12, C.coral);
      for (const [x, y] of [[-4, 4], [4, 4], [-6, 8], [6, 8]]) p(g, W / 2 + x, up + y, '#DFF6FF');
      r(g, W / 2 - 1, up - 3, 2, 3, '#DFF6FF'); p(g, W / 2 - 3, H - 12, '#FFFFFF');
      return;
    }
    case 'bandstand': {
      ellipse(g, W / 2, H - 6, W / 2 - 1, 5, C.out); ellipse(g, W / 2, H - 6, W / 2 - 2, 4, C.coralL);
      for (const x of [3, W / 2 - 1, W - 5]) r(g, x, up + 6, 2, H - up - 10, '#FFFFFF');
      r(g, 0, up, W, 2, C.out);
      for (let k = 0; k < 8; k++) r(g, 1 + k * 3.8, up - 6 + Math.abs(k - 3.5), 4, 8 - Math.abs(k - 3.5), k % 2 ? '#E2553F' : '#FFFFFF');
      r(g, W / 2 - 1, up - 10, 2, 4, C.gold);
      return;
    }
    case 'hq': {
      wall(g, 2, up + 6, W - 4, H - up - 6, '#2B2F3A', '#1C1F27');
      for (let y = up + 9; y < H - 6; y += 6) for (let x = 6; x < W - 6; x += 6) box(g, x, y, 4, 4, '#9AA3B5');
      r(g, 2, up + 4, W - 4, 3, C.red);
      roof(g, 0, up - 6, W, 11, '#3A4050', '#2B2F3A', '#556075', 4);
      box(g, 10, up - 4, W - 20, 6, C.red); for (let x = 13; x < W - 13; x += 2) p(g, x, up - 1, '#FFFFFF');
      doorAt(g, W / 2 - 4, H - 9, 8, 8, '#1C1F27');
      return;
    }
    case 'ffarm': {
      // long sheds with corrugated roofs, a feed silo and a muddy pen
      box(g, 1, H - 16, W - 12, 15, '#7A6448');
      for (let x = 2; x < W - 12; x += 4) r(g, x, H - 16, 1, 15, '#C9C2B0');
      for (const [x, y] of [[6, H - 8], [13, H - 5], [21, H - 9], [28, H - 6]]) { ellipse(g, x, y, 2.5, 1.5, '#F2E8D8'); p(g, x + 2, y - 1, '#F7C9B8'); }
      for (let k = 0; k < 2; k++) { const y = up + 2 + k * 13; roof(g, 0, y, W - 10, 11, C.tin, C.tinD, C.tinL, 2); r(g, 1, y + 9, W - 12, 2, C.red); }
      box(g, W - 9, up - 4, 8, 34, '#D7DCE2'); r(g, W - 5, up - 3, 3, 32, '#AEB5BF'); r(g, W - 9, up + 8, 8, 2, C.red);
      return;
    }
    case 'mill': {
      ellipse(g, 10, H - 7, 9, 5, '#5E8A22'); ellipse(g, 10, H - 8, 8, 4, '#9BBF3A');
      for (let k = 0; k < 6; k++) r(g, 4 + k * 2, H - 11, 1, 5, '#5E8A22');
      wall(g, 14, up + 10, W - 16, H - up - 12, '#A4553A', '#6E3626');
      for (let y = up + 13; y < H - 4; y += 3) r(g, 15, y, W - 18, 1, 'rgba(60,20,10,.35)');
      roof(g, 12, up + 2, W - 12, 10, '#5A606B', '#3E434B', '#7D848F', 3);
      r(g, W - 9, 0, 6, up + 6, C.out); r(g, W - 8, 1, 4, up + 5, '#6E3626');
      disc(g, W - 5, 2, 3, 'rgba(90,90,100,.55)'); disc(g, W - 1, 0, 2.4, 'rgba(90,90,100,.4)');
      for (const x of [18, 26, 34]) box(g, x, H - 14, 4, 6, '#2E2A28');
      r(g, 14, H - 6, W - 16, 2, C.red);
      return;
    }
    case 'tower': {
      const block = (x: number, top: number, w: number) => {
        wall(g, x, top, w, H - top - 1, '#D9DEE6', '#B8C0CC');
        for (let y = top + 5; y < H - 6; y += 5) for (let gx = x + 2; gx < x + w - 3; gx += 4) box(g, gx, y, 3, 3, C.glass);
        r(g, x, top, w, 3, C.red);
      };
      block(1, 2, 24); block(24, 14, 23);
      r(g, 4, 6, 6, 3, '#FFFFFF'); p(g, 5, 7, C.red);
      doorAt(g, 10, H - 8, 6, 7, '#1C1F27');
      return;
    }
    default: box(g, 1, up, W - 2, H - up - 1, '#999999');
  }
}

/** Houses by level: thatch hut, chattel house, coral stone house, townhouse, apartment block. 32 wide. */
function drawHouse(g: G, W: number, H: number, lvl: number, pastel: string) {
  const up = UP.house ?? 14, foot = H - up;
  if (lvl <= 1) {
    // wattle walls and a steep thatch roof
    wall(g, 5, up + 12, W - 10, foot - 12, '#B88A55', '#8A5A30');
    for (let x = 6; x < W - 6; x += 3) r(g, x, up + 12, 1, foot - 14, '#8A5A30');
    r(g, 2, up - 8, W - 4, 22, C.out);
    for (let y = 0; y < 20; y++) { const inset = Math.max(0, 6 - y); r(g, 3 + inset, up - 7 + y, W - 6 - inset * 2, 1, y % 3 === 0 ? C.thatchD : C.thatch); }
    for (let k = 0; k < 10; k++) p(g, 5 + Math.floor(hash(k, 1) * (W - 10)), up - 4 + Math.floor(hash(k, 2) * 14), C.thatchL);
    r(g, 3, up + 12, W - 6, 1, C.thatchD);
    doorAt(g, W / 2 - 2, H - 9, 5, 8, '#3A2414');
    return;
  }
  if (lvl === 2) {
    // a chattel house: painted clapboard on coral blocks, steep galvanised roof, gingerbread trim, kitchen garden
    for (const x of [5, W - 8]) box(g, x, H - 4, 4, 3, C.coralD);
    wall(g, 4, up + 8, W - 8, foot - 11, pastel, 'rgba(0,0,0,.18)');
    for (let y = up + 11; y < H - 6; y += 3) r(g, 5, y, W - 10, 1, 'rgba(0,0,0,.12)');
    roof(g, 1, up - 8, W - 2, 18, C.tin, C.tinD, C.tinL, 3);
    for (let x = 3; x < W - 3; x += 3) { p(g, x, up + 10, '#FFFFFF'); p(g, x + 1, up + 11, '#FFFFFF'); }
    doorAt(g, W / 2 - 2, H - 12, 5, 8, '#2E5A8E');
    windowAt(g, 7, H - 12, 4, 4, '#2E5A8E'); windowAt(g, W - 11, H - 12, 4, 4, '#2E5A8E');
    // steps up to the door
    r(g, W / 2 - 3, H - 4, 7, 1, C.coralD); r(g, W / 2 - 2, H - 3, 5, 1, C.coral);
    for (const x of [1, 3]) { disc(g, x + 0.5, H - 4, 1.4, C.leafD); p(g, x, H - 5, '#B8D94A'); }
    return;
  }
  if (lvl === 3) {
    // coral stone: cut blocks, hipped red tile roof
    wall(g, 3, up + 8, W - 6, foot - 9, C.coral, C.coralD);
    for (let y = up + 10, row = 0; y < H - 3; y += 3, row++) { r(g, 4, y, W - 8, 1, C.coralD); for (let x = 5 + (row % 2) * 3; x < W - 4; x += 6) p(g, x, y - 1, C.coralD); }
    r(g, 1, up - 8, W - 2, 18, C.out);
    for (let y = 0; y < 16; y++) { const inset = Math.max(0, 4 - y); r(g, 2 + inset, up - 7 + y, W - 4 - inset * 2, 1, y % 3 === 2 ? C.tileD : C.tile); }
    r(g, 4, up - 6, W - 8, 1, C.tileL);
    doorAt(g, W / 2 - 2, H - 11, 5, 9); windowAt(g, 6, H - 12, 4, 5, '#3E7A4A'); windowAt(g, W - 10, H - 12, 4, 5, '#3E7A4A');
    return;
  }
  if (lvl === 4) {
    // townhouse: two storeys, balcony, solar and greens on the flat roof
    wall(g, 2, up - 6, W - 4, foot + 5, pastel, 'rgba(0,0,0,.15)');
    r(g, 1, up - 8, W - 2, 4, C.out); r(g, 2, up - 7, W - 4, 2, '#E9E4D6');
    box(g, 4, up - 13, 12, 6, '#24426E'); r(g, 5, up - 11, 10, 1, '#3D6AA8');
    for (const x of [20, 24, 28]) { disc(g, x, up - 10, 2, C.leafD); disc(g, x, up - 11, 1.5, C.leafL); }
    for (const x of [5, 13, 21]) windowAt(g, x, up - 2, 5, 5);
    r(g, 2, up + 6, W - 4, 2, C.out); for (let x = 3; x < W - 3; x += 3) r(g, x, up + 4, 1, 2, '#FFFFFF'); r(g, 3, up + 4, W - 6, 1, '#FFFFFF');
    windowAt(g, 5, H - 11, 5, 5); doorAt(g, W - 12, H - 11, 5, 9);
    return;
  }
  // apartment block: four storeys, a window grid, rooftop garden and solar
  wall(g, 1, up - 12, W - 2, foot + 11, '#E4DCCB', '#C9C0AE');
  r(g, 1, up - 12, 4, foot + 11, pastel); r(g, W - 5, up - 12, 4, foot + 11, pastel);
  r(g, 0, up - 14, W, 3, C.out); r(g, 1, up - 13, 12, 1, C.leafL); box(g, 16, up - 18, 14, 5, '#24426E');
  for (let row = 0; row < 4; row++) for (let c = 0; c < 4; c++) windowAt(g, 7 + c * 5, up - 9 + row * 6, 3, 4);
  doorAt(g, W / 2 - 2, H - 7, 5, 6);
}

/** The Town Centre, 48 wide, by age: Gathering Hall, Village Hall, Coral Stone Town Hall, Green Tech Centre, Co-op Hall. */
function drawTC(g: G, W: number, H: number, age: number) {
  const up = UP.tc ?? 20, foot = H - up;
  if (age <= 1) {
    wall(g, 6, up + 14, W - 12, foot - 15, C.wood, C.woodD);
    for (let y = up + 17; y < H - 3; y += 3) r(g, 7, y, W - 14, 1, C.woodD);
    r(g, 2, up - 10, W - 4, 26, C.out);
    for (let y = 0; y < 24; y++) { const inset = Math.max(0, 10 - y); r(g, 3 + inset, up - 9 + y, W - 6 - inset * 2, 1, y % 3 === 0 ? C.thatchD : C.thatch); }
    for (let k = 0; k < 18; k++) p(g, 6 + Math.floor(hash(k, 7) * (W - 12)), up - 4 + Math.floor(hash(k, 8) * 18), C.thatchL);
    doorAt(g, W / 2 - 3, H - 12, 7, 11, '#3A2414');
    // fire pit
    disc(g, 4, H - 4, 3, C.stoneD); disc(g, 4, H - 5, 1.6, '#FF8A2E'); p(g, 4, H - 7, '#FFE14D');
    flag(g, W - 7, 0);
    return;
  }
  const walls = age === 2 ? C.woodL : C.coral, wallsD = age === 2 ? C.wood : C.coralD;
  wall(g, 3, up + 6, W - 6, foot - 7, walls, wallsD);
  if (age === 2) for (let y = up + 9; y < H - 3; y += 3) r(g, 4, y, W - 8, 1, C.wood);
  else for (let y = up + 9, row = 0; y < H - 3; y += 3, row++) for (let x = 5 + (row % 2) * 3; x < W - 4; x += 6) p(g, x, y, C.coralD);
  const [rb, rd, rl] = age >= 5 ? ['#2E8C8C', '#1F6A6A', '#4FB0B0'] : age === 2 ? [C.tin, C.tinD, C.tinL] : [C.tile, C.tileD, C.tileL];
  r(g, 0, up - 12, W, 20, C.out);
  for (let y = 0; y < 18; y++) { const inset = Math.max(0, 6 - y); r(g, 1 + inset, up - 11 + y, W - 2 - inset * 2, 1, y % 3 === 2 ? rd : rb); }
  r(g, 7, up - 10, W - 14, 1, rl);
  // a clock gable from the Recovery Age
  if (age >= 3) { box(g, W / 2 - 5, up - 16, 10, 10, walls); disc(g, W / 2, up - 11, 3, '#FFFFFF'); p(g, W / 2, up - 12, C.out); p(g, W / 2 + 1, up - 11, C.out); }
  for (const x of [7, W - 12]) windowAt(g, x, H - 14, 5, 6, age === 2 ? '#2E5A8E' : '#3E7A4A');
  doorAt(g, W / 2 - 4, H - 13, 9, 12);
  r(g, W / 2 - 5, H - 2, 11, 1, C.stoneD);
  if (age >= 4) { box(g, 3, up - 16, 12, 6, '#24426E'); r(g, 4, up - 14, 10, 1, '#3D6AA8'); box(g, W - 6, up + 8, 5, 14, '#5BC0EB'); r(g, W - 6, up + 8, 5, 2, C.out); }
  if (age >= 5) { for (let k = 0; k < 8; k++) r(g, 3 + k * 2, H - 12, 2, 3, k % 2 ? '#FFFFFF' : '#2E8C8C'); for (let k = 0; k < 4; k++) disc(g, 5 + k * 3, H - 7, 1.2, ['#6CC24A', '#E2553F', '#FFE14D', '#F28A2E'][k]); }
  flag(g, W - 8, 0);
}
