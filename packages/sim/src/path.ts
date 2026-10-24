import { H, W } from './defs';
import { inB, ix, iy } from './map';
import type { Goal, State } from './types';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
const prevBuf = new Int32Array(W * H), qBuf = new Int32Array(W * H), seen = new Int32Array(W * H);
let stamp = 0;

export function passable(s: State, i: number): boolean { return s.map.land[i] === 1 && s.nodeAt[i] < 0 && s.bAt[i] < 0; }

export function goalTest(g: Goal): (i: number) => boolean {
  if (g.k === 'tile') return (i) => i === g.i;
  const { x: x0, y: y0, w, h } = g;
  return (i) => {
    const x = ix(i), y = iy(i);
    const dx = x < x0 ? x0 - x : x > x0 + w - 1 ? x - (x0 + w - 1) : 0;
    const dy = y < y0 ? y0 - y : y > y0 + h - 1 ? y - (y0 + h - 1) : 0;
    return dx <= 1 && dy <= 1 && (dx > 0 || dy > 0);
  };
}

/** Breadth-first search on the tile grid, 8 directions, no corner cutting. Returns the tiles to walk, or null if unreachable. */
export function findPath(s: State, start: number, goal: Goal): number[] | null {
  const test = goalTest(goal);
  if (test(start)) return [];
  stamp++;
  let h = 0, t = 0;
  qBuf[t++] = start; seen[start] = stamp; prevBuf[start] = -1;
  while (h < t) {
    const c = qBuf[h++], cx = ix(c), cy = iy(c);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!inB(nx, ny)) continue;
      const n = ny * W + nx;
      if (seen[n] === stamp || !passable(s, n)) continue;
      if (dx && dy && (!passable(s, cy * W + nx) || !passable(s, ny * W + cx))) continue;
      seen[n] = stamp; prevBuf[n] = c;
      if (test(n)) { const p: number[] = []; let k = n; while (k !== start) { p.push(k); k = prevBuf[k]; } return p.reverse(); }
      qBuf[t++] = n;
    }
  }
  return null;
}
