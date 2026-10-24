import { H, W } from './defs';
import { GEO, ROADS, TOWNS, heightAt, inPolyF, scotAt, type Pt } from './geo';
import type { MapData, Parish } from './types';

export const ix = (i: number) => i % W;
export const iy = (i: number) => (i / W) | 0;
export const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
export const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** Builds the static island map: land, coast, parishes, sea depth, towns, terrain. Same for every game. */
export function buildMap(): { map: MapData; parishes: Parish[] } {
  const land = new Uint8Array(W * H), coast = new Uint8Array(W * H), pid = new Int8Array(W * H).fill(-1), depth = new Uint8Array(W * H);
  const urban = new Uint8Array(W * H), elev = new Float32Array(W * H), scot = new Float32Array(W * H);
  const parishes: Parish[] = GEO.par.map(([name, poly], id) => ({ id, name, poly, owner: null, tiles: [], adj: [], lx: 0, ly: 0 }));

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    elev[i] = heightAt(x + 0.5, y + 0.5); scot[i] = scotAt(x + 0.5, y + 0.5);
    for (const p of parishes) if (inPolyF(x + 0.5, y + 0.5, p.poly)) { land[i] = 1; pid[i] = p.id; p.tiles.push(i); break; }
  }
  for (let i = 0; i < W * H; i++) if (land[i]) {
    const x = ix(i), y = iy(i);
    for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (!inB(nx, ny) || !land[ny * W + nx]) { coast[i] = 1; break; } }
  }
  // label position: tile centroid, or the parish tile nearest to it for odd shapes
  for (const p of parishes) {
    let sx = 0, sy = 0; for (const i of p.tiles) { sx += ix(i) + 0.5; sy += iy(i) + 0.5; }
    const mx = sx / p.tiles.length, my = sy / p.tiles.length;
    const d = (i: number) => (ix(i) + 0.5 - mx) ** 2 + (iy(i) + 0.5 - my) ** 2;
    const c = p.tiles.reduce((b, i) => (d(i) < d(b) ? i : b), p.tiles[0]);
    const inside = pid[Math.floor(my) * W + Math.floor(mx)] === p.id;
    p.lx = inside ? mx : ix(c) + 0.5; p.ly = inside ? my : iy(c) + 0.5;
  }
  const adj = parishes.map(() => new Set<number>());
  for (let i = 0; i < W * H; i++) if (land[i]) {
    const x = ix(i), y = iy(i);
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const nx = x + dx, ny = y + dy; if (!inB(nx, ny)) continue; const j = ny * W + nx;
      if (land[j] && pid[j] !== pid[i]) { adj[pid[i]].add(pid[j]); adj[pid[j]].add(pid[i]); }
    }
  }
  parishes.forEach((p, k) => (p.adj = [...adj[k]].sort((a, b) => a - b)));
  // sea depth = distance from land
  const dist = new Int16Array(W * H).fill(-1), q: number[] = [];
  for (let i = 0; i < W * H; i++) if (land[i]) { dist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = ix(c), y = iy(c);
    for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (!inB(nx, ny)) continue; const n = ny * W + nx; if (dist[n] < 0) { dist[n] = dist[c] + 1; q.push(n); } }
  }
  for (let i = 0; i < W * H; i++) depth[i] = Math.min(9, Math.max(0, dist[i]));
  for (const t of TOWNS) {
    const r = t.s * 0.75 + 0.4;
    for (let y = Math.floor(t.y - r); y <= t.y + r; y++) for (let x = Math.floor(t.x - r); x <= t.x + r; x++)
      if (inB(x, y) && Math.hypot(x + 0.5 - t.x, y + 0.5 - t.y) <= r) urban[y * W + x] = 1;
  }
  const highway = new Uint8Array(W * H);
  const mark = (x: number, y: number) => { const tx = Math.floor(x), ty = Math.floor(y); if (inB(tx, ty) && land[ty * W + tx]) highway[ty * W + tx] = 1; };
  for (const r of ROADS) for (const [x, y] of roadCurve(r, 0.15)) mark(x, y);
  return { map: { land, coast, pid, depth, urban, elev, scot, highway }, parishes };
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
