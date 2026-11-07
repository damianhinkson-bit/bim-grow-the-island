import { H, IH, IW, W } from './defs';
import { GEO, ROADS, TOWNS, heightAt, inPolyF, scotAt, type Pt } from './geo';
import type { IslandMap, Parish } from './types';

export const ix = (i: number) => i % W;
export const iy = (i: number) => (i / W) | 0;
export const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
export const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
/** The same helpers for the island grid (island view and parishes). */
export const isx = (i: number) => i % IW;
export const isy = (i: number) => (i / IW) | 0;
export const isIn = (x: number, y: number) => x >= 0 && y >= 0 && x < IW && y < IH;

/** Builds the static island map: land, coast, parishes, sea depth, towns, terrain. Same for every game. */
export function buildIsland(): { island: IslandMap; parishes: Parish[] } {
  const land = new Uint8Array(IW * IH), coast = new Uint8Array(IW * IH), pid = new Int8Array(IW * IH).fill(-1), depth = new Uint8Array(IW * IH);
  const urban = new Uint8Array(IW * IH), elev = new Float32Array(IW * IH), scot = new Float32Array(IW * IH);
  const parishes: Parish[] = GEO.par.map(([name, poly], id) => ({ id, name, poly, owner: null, stand: null, tiles: [], adj: [], lx: 0, ly: 0 }));

  for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) {
    const i = y * IW + x;
    elev[i] = heightAt(x + 0.5, y + 0.5); scot[i] = scotAt(x + 0.5, y + 0.5);
    for (const p of parishes) if (inPolyF(x + 0.5, y + 0.5, p.poly)) { land[i] = 1; pid[i] = p.id; p.tiles.push(i); break; }
  }
  for (let i = 0; i < IW * IH; i++) if (land[i]) {
    const x = isx(i), y = isy(i);
    for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (!isIn(nx, ny) || !land[ny * IW + nx]) { coast[i] = 1; break; } }
  }
  // label position: tile centroid, or the parish tile nearest to it for odd shapes
  for (const p of parishes) {
    let sx = 0, sy = 0; for (const i of p.tiles) { sx += isx(i) + 0.5; sy += isy(i) + 0.5; }
    const mx = sx / p.tiles.length, my = sy / p.tiles.length;
    const d = (i: number) => (isx(i) + 0.5 - mx) ** 2 + (isy(i) + 0.5 - my) ** 2;
    const c = p.tiles.reduce((b, i) => (d(i) < d(b) ? i : b), p.tiles[0]);
    const inside = pid[Math.floor(my) * IW + Math.floor(mx)] === p.id;
    p.lx = inside ? mx : isx(c) + 0.5; p.ly = inside ? my : isy(c) + 0.5;
  }
  const adj = parishes.map(() => new Set<number>());
  for (let i = 0; i < IW * IH; i++) if (land[i]) {
    const x = isx(i), y = isy(i);
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const nx = x + dx, ny = y + dy; if (!isIn(nx, ny)) continue; const j = ny * IW + nx;
      if (land[j] && pid[j] !== pid[i]) { adj[pid[i]].add(pid[j]); adj[pid[j]].add(pid[i]); }
    }
  }
  parishes.forEach((p, k) => (p.adj = [...adj[k]].sort((a, b) => a - b)));
  // sea depth = distance from land
  const dist = new Int16Array(IW * IH).fill(-1), q: number[] = [];
  for (let i = 0; i < IW * IH; i++) if (land[i]) { dist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = isx(c), y = isy(c);
    for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (!isIn(nx, ny)) continue; const n = ny * IW + nx; if (dist[n] < 0) { dist[n] = dist[c] + 1; q.push(n); } }
  }
  for (let i = 0; i < IW * IH; i++) depth[i] = Math.min(9, Math.max(0, dist[i]));
  for (const t of TOWNS) {
    const r = t.s * 0.75 + 0.4;
    for (let y = Math.floor(t.y - r); y <= t.y + r; y++) for (let x = Math.floor(t.x - r); x <= t.x + r; x++)
      if (isIn(x, y) && Math.hypot(x + 0.5 - t.x, y + 0.5 - t.y) <= r) urban[y * IW + x] = 1;
  }
  const highway = new Uint8Array(IW * IH);
  const mark = (x: number, y: number) => { const tx = Math.floor(x), ty = Math.floor(y); if (isIn(tx, ty) && land[ty * IW + tx]) highway[ty * IW + tx] = 1; };
  for (const r of ROADS) for (const [x, y] of roadCurve(r, 0.15)) mark(x, y);
  return { island: { land, coast, pid, depth, urban, elev, scot, highway }, parishes };
}

/** Points along a road drawn as a smooth curve through the midpoints of its control points (same curve the renderer paints). */
export function roadCurve(pts: Pt[], stepTiles: number): Pt[] {
  const out: Pt[] = [];
  const seg = (a: Pt, c: Pt, b: Pt) => {
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]) + Math.hypot(b[0] - c[0], b[1] - c[1]);
    const n = Math.max(2, Math.ceil(len / stepTiles));
    for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); }
  };
  let cur = pts[0];
  for (let k = 1; k < pts.length - 1; k++) { const mid: Pt = [(pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2]; seg(cur, pts[k], mid); cur = mid; }
  const last = pts[pts.length - 1]; seg(cur, [(cur[0] + last[0]) / 2, (cur[1] + last[1]) / 2], last);
  return out;
}
