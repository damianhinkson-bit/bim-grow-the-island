import { AGES, BT, MAX_AGE, POP_MAX, TRAIN_COST, W, canAfford, type BType, type Cost, type NodeType, type Res } from './defs';
import { ix, iy } from './map';
import { buildCost, owned, claimBlock, claimCost, dist, houseUpgrade, parishBuilt, placeBlock, player, popCap, tcOf, workersOf, type Command } from './sim';
import type { State } from './types';

/**
 * The caretaker: looks after a co-op while its player is away. It keeps the economy ticking over and protects land,
 * but leaves the big decisions (age-ups, feeding new parishes, trading) to the player. Pure and deterministic: the
 * server calls it and sends the commands to every phone like any other player's.
 */
export function caretaker(s: State, pid: string, trainUpTo = 14, waterGoal = 80): Command[] {
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
    if (r.water < waterGoal) return 'spring';
    // plenty of food: put the extra hands on whatever is scarcest
    if (r.food > 600 + eat * 3) return r.stone < 300 ? 'rock' : r.water < waterGoal * 2 ? 'spring' : r.stone < r.water ? 'rock' : 'tree';
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
  if (tc && tc.queue === 0 && ws.length < Math.min(cap, trainUpTo) && me.res.food >= 150 + (TRAIN_COST.food ?? 0)) out.push({ type: 'train', building: tc.id });
  const housesBuilding = mine.some((b) => b.type === 'house' && !b.done);
  if (ws.length >= cap && cap < POP_MAX && !housesBuilding && canAfford(me.res, buildCost(s, pid, 'house'))) {
    const spot = spotNear(s, pid, 'house', tc ? [tc.x + 1, tc.y + 1] : null);
    if (spot) out.push({ type: 'place', building: 'house', x: spot[0], y: spot[1], workers: [] });
  }

  // 3) protect land AgroCorp is about to buy: any building there blocks a buyout
  const t = s.agro.target;
  if (t !== null && s.agro.warned && s.parishes[t].owner === pid && !parishBuilt(s, s.parishes[t], pid)) {
    const already = mine.some((b) => !b.done && s.map.pid[b.y * W + b.x] === t);
    const type: BType = canAfford(me.res, buildCost(s, pid, 'house')) ? 'house' : 'depot';
    if (!already && canAfford(me.res, buildCost(s, pid, type))) {
      const p = s.parishes[t];
      const spot = spotNear(s, pid, type, [p.lx, p.ly]);
      if (spot) out.push({ type: 'place', building: type, x: spot[0], y: spot[1], workers: [] });
    }
  }
  return out;
}

/** How much slower than Normal the computer co-ops go: Easy a third slower, Hard a fifth faster. */
export const BOT_PACE: Record<string, number> = { easy: 1.35, normal: 1, hard: 0.8 };
/** On Normal, the earliest minute a computer co-op may start advancing from age k (index k) to the next. */
const AGE_AT_MIN = [0, 4, 10, 17, 23];

/**
 * A computer co-op in a solo game: does everything the caretaker does, and also makes the big decisions a player
 * would: advancing ages, feeding new parishes, farming, and upgrading its houses. It keeps a reserve so it doesn't
 * starve itself, which also keeps it beatable. Pure and deterministic like the caretaker.
 */
export function rivalCoop(s: State, pid: string): Command[] {
  const me = player(s, pid); if (!me || s.ended) return [];
  const out = caretaker(s, pid, 24, 220);
  const mine = Object.values(s.buildings).filter((b) => b.owner === pid);
  const ws = workersOf(s, pid), tc = tcOf(s, pid);
  const spare = (cost: Cost, keep: Partial<Record<Res, number>> = { food: 120, stone: 40 }) =>
    canAfford(me.res, Object.fromEntries((Object.keys(me.res) as Res[]).map((r) => [r, (cost[r] ?? 0) + (keep[r] ?? 0)])) as Cost);
  const placing = mine.some((b) => !b.done);
  const place = (type: BType, near: [number, number] | null) => {
    const spot = spotNear(s, pid, type, near);
    if (spot) { out.push({ type: 'place', building: type, x: spot[0], y: spot[1], workers: [] }); return true; }
    return false;
  };
  const home: [number, number] | null = tc ? [tc.x + 1, tc.y + 1] : null;

  // 0) move workers off whatever it has plenty of onto what it's short of (a gatherer otherwise keeps its job forever)
  const next0 = AGES[me.age]?.cost ?? {};
  const goal = { food: 400 + (next0.food ?? 0), stone: 250 + (next0.stone ?? 0), water: 200 + (next0.water ?? 0) };
  const kinds: [Res, NodeType[]][] = [['food', ['tree', 'fish']], ['stone', ['rock']], ['water', ['spring']]];
  const ratio = (r: Res) => me.res[r] / goal[r as keyof typeof goal];
  const sorted = [...kinds].sort((a, b) => ratio(a[0]) - ratio(b[0]));
  const [short, plenty] = [sorted[0], sorted[sorted.length - 1]];
  if (ratio(short[0]) < 1 && ratio(plenty[0]) > 1.6) {
    const movers = ws.filter((w) => w.task?.k === 'gather' && plenty[1].includes(s.nodes[w.task.n].type)).slice(0, 2);
    for (const w of movers) {
      let best = -1, bd = Infinity;
      for (const n of s.nodes) {
        if (n.amt <= 0 || !short[1].includes(n.type)) continue;
        const d = dist(n.x + 0.5 - w.x, n.y + 0.5 - w.y); if (d < bd) { bd = d; best = n.id; }
      }
      if (best >= 0) out.push({ type: 'gather', workers: [w.id], node: best });
    }
  }

  // Pacing, so a game lasts about 25 minutes on Normal: the computer can't reach an age, or spread past a number of
  // parishes, before a set time. Easy is slower, Hard faster.
  const pace = BOT_PACE[s.difficulty] ?? 1, mins = s.time / 60 / pace;
  // 1) advance an age once it can afford it with food to spare
  const next = AGES[me.age];
  if (me.age < MAX_AGE && me.ageT < 0 && next && mins >= AGE_AT_MIN[me.age] && spare(next.cost, { food: 150 })) { out.push({ type: 'age' }); return out; }

  // 2) feed the cheapest parish next door
  let best: { id: number; cost: Cost } | null = null;
  for (const p of s.parishes) {
    if (claimBlock(s, pid, p)) continue;
    const cost = claimCost(s, pid, p);
    if (!best || (cost.food ?? 0) < (best.cost.food ?? 0)) best = { id: p.id, cost };
  }
  const maxLand = 2 + Math.floor(mins / 5);
  if (best && owned(s, pid) < maxLand && spare(best.cost, { food: 100 })) { out.push({ type: 'claim', parish: best.id }); return out; }

  if (placing) return out;
  // 3) keep each parish it feeds safe from AgroCorp with at least one building
  for (const p of s.parishes) {
    if (p.owner !== pid || parishBuilt(s, p, pid)) continue;
    const type: BType = spare(buildCost(s, pid, 'house'), {}) ? 'house' : 'depot';
    if (spare(buildCost(s, pid, type), {}) && place(type, [p.lx, p.ly])) return out;
  }
  // 4) farms once it can, about one for every three workers, and a cistern to water them
  const farms = mine.filter((b) => b.type === 'farm').length;
  const cisterns = mine.filter((b) => b.type === 'cistern').length;
  if (me.age >= 2 && cisterns < 1 + Math.floor(farms / 3) && spare(BT.cistern.cost) && place('cistern', home)) return out;
  if (me.age >= 2 && farms < Math.floor(ws.length / 3) && spare(BT.farm.cost) && place('farm', home)) return out;
  if (me.age >= 4 && farms >= 3 && mine.filter((b) => b.type === 'aqua').length < 2 && spare(BT.aqua.cost) && place('aqua', home)) return out;
  // 5) upgrade one old house at a time when there's plenty of stone
  const old = mine.find((b) => houseUpgrade(s, b));
  if (old) { const up = houseUpgrade(s, old)!; if (spare(up.cost, { food: 150, stone: 80 })) out.push({ type: 'upgrade', building: old.id }); }
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
