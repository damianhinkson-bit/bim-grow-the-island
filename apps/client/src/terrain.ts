import { AGRO, H, ROADS, ROCK_A, ROCK_B, ROCK_N, RUNWAY, TOWNS, W, heightAt, inPolyF, ix, iy, makeRng, scotAt, toT, type Pt, type State } from '@bim/sim';

/** Pixels per tile in world space. */
export const T = 24;

function polyPath(g: CanvasRenderingContext2D, a: number[], s: number) {
  g.moveTo(a[0] * s, a[1] * s);
  for (let k = 2; k < a.length; k += 2) g.lineTo(a[k] * s, a[k + 1] * s);
  g.closePath();
}
function islandPath(st: State, g: CanvasRenderingContext2D, s: number) { g.beginPath(); st.parishes.forEach((p) => polyPath(g, p.poly, s)); }
function rockQuad(g: CanvasRenderingContext2D, s: number) {
  const [ax, ay] = ROCK_A, [bx, by] = ROCK_B;
  let dx = bx - ax, dy = by - ay; const L = Math.hypot(dx, dy); dx /= L; dy /= L;
  const nx = -dy, ny = dx, e = nx > 0 ? 1 : -1, F = 200;
  g.moveTo((ax - dx * F) * s, (ay - dy * F) * s);
  g.lineTo((ax - dx * F + nx * e * F) * s, (ay - dy * F + ny * e * F) * s);
  g.lineTo((bx + dx * F + nx * e * F) * s, (by + dy * F + ny * e * F) * s);
  g.lineTo((bx + dx * F) * s, (by + dy * F) * s);
  g.closePath();
}
/** Clip to the Atlantic side: rocky coast and surf. */
function rockClip(g: CanvasRenderingContext2D, s: number) { g.beginPath(); rockQuad(g, s); g.rect(-50 * s, -50 * s, (W + 100) * s, (ROCK_N + 50) * s); g.clip(); }
/** Clip to the calm Caribbean side: beaches and reef. */
function calmClip(g: CanvasRenderingContext2D, s: number) {
  g.beginPath(); g.rect(-50 * s, -50 * s, (W + 100) * s, (H + 100) * s); rockQuad(g, s); g.clip('evenodd');
  g.beginPath(); g.rect(-50 * s, -50 * s, (W + 100) * s, (H + 100) * s); g.rect(-50 * s, -50 * s, (W + 100) * s, (ROCK_N + 50) * s); g.clip('evenodd');
}
function smoothLine(g: CanvasRenderingContext2D, pts: Pt[], s: number) {
  g.beginPath(); g.moveTo(pts[0][0] * s, pts[0][1] * s);
  for (let k = 1; k < pts.length - 1; k++) {
    const mx = (pts[k][0] + pts[k + 1][0]) / 2, my = (pts[k][1] + pts[k + 1][1]) / 2;
    g.quadraticCurveTo(pts[k][0] * s, pts[k][1] * s, mx * s, my * s);
  }
  const l = pts[pts.length - 1]; g.lineTo(l[0] * s, l[1] * s);
}

/** Paints the island once: sea depth, reef and surf, terrain, fields, gullies, roads, airport and towns. */
export function bakeTerrain(st: State, TS: number): HTMLCanvasElement {
  const S = T * TS, m = st.map;
  const c = document.createElement('canvas'); c.width = Math.round(W * S); c.height = Math.round(H * S);
  const g = c.getContext('2d')!; g.lineJoin = 'round'; g.lineCap = 'round';
  const r = makeRng(77);
  // sea: smooth depth gradient
  const sc = document.createElement('canvas'); sc.width = W; sc.height = H;
  const sg = sc.getContext('2d')!, sid = sg.createImageData(W, H);
  const shal = [64, 196, 212], deep = [10, 52, 120];
  for (let i = 0; i < W * H; i++) {
    const bd = Math.min(ix(i), iy(i), W - 1 - ix(i), H - 1 - iy(i));
    const t = m.land[i] ? 0 : Math.max(Math.min(1, (m.depth[i] - 0.5) / 6.5), 1 - bd / 3);
    for (let k = 0; k < 3; k++) sid.data[i * 4 + k] = Math.round(shal[k] + (deep[k] - shal[k]) * Math.pow(t, 0.8));
    sid.data[i * 4 + 3] = 255;
  }
  sg.putImageData(sid, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(sc, 0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 1.2 * TS;
  for (let k = 0; k < 160; k++) {
    const x = r() * W, y = r() * H, i = Math.floor(y) * W + Math.floor(x);
    if (m.land[i] || m.depth[i] < 3) continue;
    g.beginPath(); g.arc(x * S, y * S, 0.35 * S, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  }
  // shallow shelf
  islandPath(st, g, S);
  g.strokeStyle = 'rgba(120,226,228,.28)'; g.lineWidth = 2.8 * S; g.stroke();
  g.strokeStyle = 'rgba(150,236,230,.38)'; g.lineWidth = 1.5 * S; g.stroke();
  // Caribbean side: fringing reef + sand
  g.save(); calmClip(g, S); islandPath(st, g, S);
  g.setLineDash([0.12 * S, 0.22 * S]); g.strokeStyle = 'rgba(210,250,240,.5)'; g.lineWidth = 1.9 * S; g.stroke(); g.setLineDash([]);
  g.strokeStyle = '#F0DDA6'; g.lineWidth = 0.7 * S; g.stroke(); g.restore();
  // Atlantic side: surf + rock
  g.save(); rockClip(g, S); islandPath(st, g, S);
  g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1.3 * S; g.stroke();
  g.setLineDash([0.25 * S, 0.18 * S]); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 0.85 * S; g.stroke(); g.setLineDash([]);
  g.strokeStyle = '#8B806C'; g.lineWidth = 0.55 * S; g.stroke(); g.restore();
  // land colour from elevation + hillshade, painted small then smoothed into the island shape
  const R = 8, cw = W * R, ch = H * R, lc = document.createElement('canvas'); lc.width = cw; lc.height = ch;
  const lg = lc.getContext('2d')!, id = lg.createImageData(cw, ch);
  const low = [160, 198, 96], mid = [100, 160, 74], high = [58, 118, 58], clay = [150, 132, 86];
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const tx = (x + 0.5) / R, ty = (y + 0.5) / R, e = heightAt(tx, ty);
    const sh = (heightAt(tx - 0.5, ty - 0.5) - heightAt(tx + 0.5, ty + 0.5)) * 2.6;
    const t = Math.min(1, e / 0.95);
    let col = t < 0.45 ? low.map((v, k) => v + (mid[k] - v) * (t / 0.45)) : mid.map((v, k) => v + (high[k] - v) * ((t - 0.45) / 0.55));
    const sw = scotAt(tx, ty) * 0.6 * (0.7 + 0.3 * Math.sin(tx * 2.1) * Math.cos(ty * 1.7));
    col = col.map((v, k) => v + (clay[k] - v) * sw);
    const f = Math.max(0.72, Math.min(1.22, 1 + sh)) * (0.97 + r() * 0.06), o = (y * cw + x) * 4;
    id.data[o] = Math.min(255, col[0] * f); id.data[o + 1] = Math.min(255, col[1] * f); id.data[o + 2] = Math.min(255, col[2] * f); id.data[o + 3] = 255;
  }
  lg.putImageData(id, 0, 0);
  g.save(); islandPath(st, g, S); g.clip(); g.drawImage(lc, 0, 0, c.width, c.height);
  // field patchwork in the lowlands
  const fills = ['rgba(52,104,40,.16)', 'rgba(200,214,112,.18)', 'rgba(124,152,60,.15)', 'rgba(90,130,50,.12)'];
  for (let k = 0; k < 340; k++) {
    const x = r() * W, y = r() * H, i = Math.floor(y) * W + Math.floor(x);
    if (!m.land[i] || m.urban[i] || m.elev[i] > 0.55 || m.scot[i] > 0.3) continue;
    g.save(); g.translate(x * S, y * S); g.rotate(-0.35 + r() * 0.7);
    const w = (0.5 + r() * 1.1) * S, h = (0.35 + r() * 0.7) * S;
    g.fillStyle = fills[Math.floor(r() * 4)]; g.fillRect(-w / 2, -h / 2, w, h); g.restore();
  }
  // gullies
  g.strokeStyle = 'rgba(30,70,32,.35)'; g.lineWidth = 0.22 * S;
  for (const [a, b] of [[[13.172, -59.596], [13.15, -59.62]], [[13.14, -59.575], [13.112, -59.6]], [[13.215, -59.6], [13.205, -59.63]]] as [Pt, Pt][]) {
    const p0 = toTile(a), p1 = toTile(b);
    g.beginPath(); g.moveTo(p0[0] * S, p0[1] * S);
    g.bezierCurveTo((p0[0] * 0.6 + p1[0] * 0.4 + 0.6) * S, (p0[1] * 0.6 + p1[1] * 0.4) * S, (p0[0] * 0.3 + p1[0] * 0.7 - 0.6) * S, (p0[1] * 0.3 + p1[1] * 0.7) * S, p1[0] * S, p1[1] * S);
    g.stroke();
  }
  // roads
  for (const rt of ROADS) {
    smoothLine(g, rt, S);
    g.strokeStyle = 'rgba(60,48,28,.28)'; g.lineWidth = 0.34 * S; g.stroke();
    g.strokeStyle = 'rgba(250,240,214,.8)'; g.lineWidth = 0.17 * S; g.stroke();
  }
  // airport runway
  g.strokeStyle = '#5E636B'; g.lineWidth = 0.5 * S; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(RUNWAY[0][0] * S, RUNWAY[0][1] * S); g.lineTo(RUNWAY[1][0] * S, RUNWAY[1][1] * S); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 0.06 * S; g.setLineDash([0.25 * S, 0.2 * S]); g.stroke(); g.setLineDash([]); g.lineCap = 'round';
  // towns: clusters of chattel-house roofs
  const roofs = ['#E58C7A', '#F4F1E8', '#7FB7D9', '#F2C66D', '#D9796B', '#B9D7A8'];
  for (const t of TOWNS) {
    const n = t.s * t.s * 6 + 6, rad = t.s * 0.62 + 0.35;
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad, x = t.x + Math.cos(a) * d, y = t.y + Math.sin(a) * d;
      const p = st.parishes[m.pid[Math.floor(y) * W + Math.floor(x)]];
      if (!p || !inPolyF(x, y, p.poly)) continue;
      const w = (0.16 + r() * 0.1) * S;
      g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x * S - w / 2 + 0.04 * S, y * S - w / 2 + 0.05 * S, w, w * 0.8);
      g.fillStyle = roofs[Math.floor(r() * roofs.length)]; g.fillRect(x * S - w / 2, y * S - w / 2, w, w * 0.8);
    }
  }
  for (let k = 0; k < 9000; k++) { const x = r() * W, y = r() * H; g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.07)'; g.fillRect(x * S, y * S, 1.5 * TS, 1.5 * TS); }
  g.restore();
  // parish borders: only edges with land on both sides
  g.strokeStyle = 'rgba(20,38,22,.5)'; g.lineWidth = 1.4 * TS; g.setLineDash([3.5 * TS, 3 * TS]); g.beginPath();
  const onLand = (x: number, y: number) => st.parishes.some((p) => inPolyF(x, y, p.poly));
  for (const p of st.parishes) {
    const a = p.poly;
    for (let k = 0; k < a.length; k += 2) {
      const x0 = a[k], y0 = a[k + 1], x1 = a[(k + 2) % a.length], y1 = a[(k + 3) % a.length];
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, L = Math.hypot(x1 - x0, y1 - y0) || 1, nx = (-(y1 - y0) / L) * 0.25, ny = ((x1 - x0) / L) * 0.25;
      if (onLand(mx + nx, my + ny) && onLand(mx - nx, my - ny)) { g.moveTo(x0 * S, y0 * S); g.lineTo(x1 * S, y1 * S); }
    }
  }
  g.stroke(); g.setLineDash([]);
  return c;
}

const toTile = ([lat, lon]: Pt): Pt => toT(lat, lon);

export function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export function ownerColor(st: State, owner: string | null): string | null {
  if (!owner) return null;
  if (owner === AGRO) return '#E2553F';
  return st.players.find((p) => p.id === owner)?.color ?? '#FFFFFF';
}

/** Paints parish ownership: a tint and a border in each owner's colour. */
export function bakeOwnership(st: State, TS: number, c?: HTMLCanvasElement): HTMLCanvasElement {
  const S = T * TS;
  c ??= document.createElement('canvas');
  c.width = Math.round(W * S); c.height = Math.round(H * S);
  const g = c.getContext('2d')!; g.clearRect(0, 0, c.width, c.height); g.lineJoin = 'round';
  for (const p of st.parishes) {
    const col = ownerColor(st, p.owner); if (!col) continue;
    g.beginPath(); polyPath(g, p.poly, S);
    g.fillStyle = hexA(col, p.owner === AGRO ? 0.26 : 0.22); g.fill();
    if (p.owner === AGRO) caneFields(st, g, p.id, p.poly, S);
    g.strokeStyle = hexA(col, 0.95); g.lineWidth = 2.4 * TS; g.stroke();
  }
  return c;
}

/**
 * AgroCorp's land is planted in one crop: blocks of cane in rows, leaving the roads clear. The pattern comes from the
 * tile position, so it's the same on every phone and every redraw.
 */
function caneFields(st: State, g: CanvasRenderingContext2D, pid: number, poly: number[], S: number) {
  const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  g.save(); g.beginPath(); polyPath(g, poly, S); g.clip();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (st.map.pid[i] !== pid || !st.map.land[i] || st.roads[i]) continue;
    if (hash(x >> 1, y >> 1) > 0.72) continue; // fields in 2x2 blocks with a few gaps between them
    const px = x * S, py = y * S;
    g.fillStyle = 'rgba(176,196,70,.42)'; g.fillRect(px, py, S, S);
    g.fillStyle = 'rgba(78,118,30,.6)';
    for (let k = 0; k < 4; k++) g.fillRect(px, py + (k + 0.35) * S / 4, S, Math.max(1, S * 0.07));
  }
  g.restore();
}
