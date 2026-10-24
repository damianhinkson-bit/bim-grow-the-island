import { H, W } from './defs';
import { inB, ix, iy } from './map';
import type { Goal, State } from './types';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
const prevBuf = new Int32Array(W * H), seen = new Int32Array(W * H);
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

const distBuf = new Int32Array(W * H);
const heapN = new Int32Array(W * H * 8), heapD = new Int32Array(W * H * 8);

/**
 * Shortest-time path on the tile grid (8 directions, no corner cutting). Road tiles cost half, so workers use roads
 * when they're faster. Returns the tiles to walk, or null if unreachable.
 */
export function findPath(s: State, start: number, goal: Goal): number[] | null {
  const test = goalTest(goal);
  if (test(start)) return [];
  stamp++;
  let size = 0;
  const push = (n: number, d: number) => {
    let i = size++;
    while (i > 0) { const pi = (i - 1) >> 1; if (heapD[pi] <= d) break; heapN[i] = heapN[pi]; heapD[i] = heapD[pi]; i = pi; }
    heapN[i] = n; heapD[i] = d;
  };
  const pop = () => {
    const n = heapN[0], last = --size, ln = heapN[last], ld = heapD[last];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1; if (c >= size) break;
      if (c + 1 < size && heapD[c + 1] < heapD[c]) c++;
      if (heapD[c] >= ld) break;
      heapN[i] = heapN[c]; heapD[i] = heapD[c]; i = c;
    }
    heapN[i] = ln; heapD[i] = ld; return n;
  };
  seen[start] = stamp; distBuf[start] = 0; prevBuf[start] = -1; push(start, 0);
  while (size > 0) {
    const d0 = heapD[0], c = pop();
    if (d0 > distBuf[c]) continue;
    if (c !== start && test(c)) { const p: number[] = []; let k = c; while (k !== start) { p.push(k); k = prevBuf[k]; } return p.reverse(); }
    const cx = ix(c), cy = iy(c);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!inB(nx, ny)) continue;
      const n = ny * W + nx;
      if (!passable(s, n)) continue;
      if (dx && dy && (!passable(s, cy * W + nx) || !passable(s, ny * W + cx))) continue;
      const cost = s.roads[n] ? (dx && dy ? 3 : 2) : dx && dy ? 6 : 4;
      const nd = d0 + cost;
      if (seen[n] !== stamp || nd < distBuf[n]) { seen[n] = stamp; distBuf[n] = nd; prevBuf[n] = c; if (size < heapN.length) push(n, nd); }
    }
  }
  return null;
}
