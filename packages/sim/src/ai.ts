import { BT, TRAIN_COST, W, canAfford, type BType, type NodeType } from './defs';
import { ix, iy } from './map';
import { dist, parishBuilt, placeBlock, player, popCap, tcOf, workersOf, type Command } from './sim';
import type { State } from './types';

/**
 * The caretaker: looks after a co-op while its player is away. It keeps the economy ticking over and protects land,
 * but leaves the big decisions (age-ups, feeding new parishes, trading) to the player. Pure and deterministic: the
 * server calls it and sends the commands to every phone like any other player's.
 */
export function caretaker(s: State, pid: string): Command[] {
  const me = player(s, pid); if (!me || s.ended) return [];
  const out: Command[] = [];
  const ws = workersOf(s, pid), tc = tcOf(s, pid);
  const mine = Object.values(s.buildings).filter((b) => b.owner === pid);

  // 1) staff empty farm plots first, then send other idle workers to what the co-op is short of
  const idle = ws.filter((w) => !w.task);
  const farms = mine.filter((b) => b.type === 'farm' && b.done && b.worker === null);
  for (const f of farms) {
    const w = idle.shift(); if (!w) break;
    out.push({ type: 'work', workers: [w.id], building: f.id });
  }
  const need = (): NodeType => {
    const r = me.res, eat = ws.length * 6; // food a minute
    if (r.food < 120 + eat * 2 || me.hungry) return 'tree';
    if (r.stone < 120) return 'rock';
    if (r.water < 80) return 'spring';
    // otherwise keep the mix: two on food for each on stone
    const onStone = ws.filter((w) => w.task?.k === 'gather' && s.nodes[w.task.n].type === 'rock').length;
    const onFood = ws.filter((w) => (w.task?.k === 'gather' && ['tree', 'fish'].includes(s.nodes[w.task.n].type)) || w.task?.k === 'farm').length;
    return onFood < onStone * 2 ? 'tree' : 'rock';
  };
  const ownLand = (n: { pid: number }) => n.pid >= 0 && s.parishes[n.pid].owner === pid;
  for (const w of idle) {
    const want = need();
    const types: NodeType[] = want === 'tree' ? ['tree', 'fish'] : [want];
    let best = -1, bd = Infinity;
    for (const n of s.nodes) {
      if (n.amt <= 0 || !types.includes(n.type)) continue;
      // prefer resources on our own land: count anything else as twice as far
      const d = dist(n.x + 0.5 - w.x, n.y + 0.5 - w.y) * (ownLand(n) ? 1 : 2);
      if (d < bd) { bd = d; best = n.id; }
    }
    if (best >= 0) out.push({ type: 'gather', workers: [w.id], node: best });
  }

  // 2) grow a little: train when there's room and food to spare, build a house when full
  const cap = popCap(s, pid);
  if (tc && tc.queue === 0 && ws.length < Math.min(cap, 14) && me.res.food >= 150 + (TRAIN_COST.food ?? 0)) out.push({ type: 'train', building: tc.id });
  const housesBuilding = mine.some((b) => b.type === 'house' && !b.done);
  if (ws.length >= cap && cap < 60 && !housesBuilding && canAfford(me.res, BT.house.cost)) {
    const spot = spotNear(s, pid, 'house', tc ? [tc.x + 1, tc.y + 1] : null);
    if (spot) out.push({ type: 'place', building: 'house', x: spot[0], y: spot[1], workers: [] });
  }

  // 3) protect land AgroCorp is about to buy: any building there blocks a buyout
  const t = s.agro.target;
  if (t !== null && s.agro.warned && s.parishes[t].owner === pid && !parishBuilt(s, s.parishes[t], pid)) {
    const already = mine.some((b) => !b.done && s.map.pid[b.y * W + b.x] === t);
    const type: BType = canAfford(me.res, BT.house.cost) ? 'house' : 'depot';
    if (!already && canAfford(me.res, BT[type].cost)) {
      const p = s.parishes[t];
      const spot = spotNear(s, pid, type, [p.lx, p.ly]);
      if (spot) out.push({ type: 'place', building: type, x: spot[0], y: spot[1], workers: [] });
    }
  }
  return out;
}

/** The nearest valid tile for a building, searching outwards from a point (or anywhere in the player's land). */
function spotNear(s: State, pid: string, type: BType, from: [number, number] | null): [number, number] | null {
  let best: [number, number] | null = null, bd = Infinity;
  for (const p of s.parishes) {
    if (p.owner !== pid) continue;
    for (const i of p.tiles) {
      const x = ix(i), y = iy(i);
      if (placeBlock(s, pid, type, x, y)) continue;
      const d = from ? dist(x + 0.5 - from[0], y + 0.5 - from[1]) : 0;
      // keep a gap from the Town Centre so workers can get around it
      if (from && d < 2.5) continue;
      if (d < bd) { bd = d; best = [x, y]; }
      if (!from) return best;
    }
  }
  return best;
}
