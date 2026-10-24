import {
  AGE_COST, AGE_T, AGRO, AGRO_HOME, BT, CARRY, DT, H, HNAMES, MAX_PLAYERS, NT, PLAYER_COLORS, SEA_R, SPEED, START_PARISHES, START_RES,
  TRAIN, TRAIN_COST, W, WIN_N, canAfford, fmtCost, pay,
  type BType, type NodeType, type Res,
} from './defs';
import { buildMap, inB, ix, iy } from './map';
import { findPath, goalTest, passable } from './path';
import { nextRand } from './rng';
import type { Building, GameEvent, Goal, MapData, Mode, Node, Parish, Player, State, Worker } from './types';

// ---------- setup

let MAP: { map: MapData; parishes: Parish[] } | null = null;
function staticMap() { return (MAP ??= buildMap()); }

export interface NewGameOptions { seed?: number; mode?: Mode; players: { name: string }[] }

const rand = (s: State) => nextRand(s);

export function createGame(o: NewGameOptions): State {
  const { map, parishes } = staticMap();
  const seed = (o.seed ?? 1031) | 0;
  const n = Math.max(1, Math.min(MAX_PLAYERS, o.players.length || 1));
  const s: State = {
    seed, rng: seed, tick: 0, time: 0, mode: o.mode ?? 'coop', nextId: 1, map,
    parishes: parishes.map((p) => ({ ...p, owner: null })),
    nodes: [], nodeAt: new Int32Array(W * H).fill(-1), bAt: new Int32Array(W * H).fill(-1),
    buildings: {}, workers: {}, players: [], agro: { bbd: 0 },
    weather: { nextHurr: 300, hurrWarned: false, nextDrought: 210, droughtUntil: -1, nextPest: 130, stormT: 0, hurrIdx: 0 },
    events: [], eventSeq: 0, parishVersion: 1, ended: null,
  };
  for (let k = 0; k < n; k++) {
    const home = START_PARISHES[n - 1][k];
    s.players.push({
      id: `p${k + 1}`, name: o.players[k]?.name || `Player ${k + 1}`, color: PLAYER_COLORS[k], team: s.mode === 'coop' ? 0 : k, home,
      res: { ...START_RES }, age: 1, ageT: -1, stats: { food: 0 },
    });
    s.parishes[home].owner = `p${k + 1}`;
  }
  s.parishes[AGRO_HOME].owner = AGRO;

  const hq = findSpot(s, AGRO_HOME);
  addBuilding(s, 'hq', hq[0], hq[1], AGRO, true);
  const tcs = s.players.map((p) => { const sp = findSpot(s, p.home); addBuilding(s, 'tc', sp[0], sp[1], p.id, true); return sp; });
  const spots = [hq, ...tcs];
  const far = (i: number) => spots.every(([x, y]) => Math.hypot(ix(i) - (x + 0.5), iy(i) - (y + 0.5)) > 3.5);
  const free = (i: number) => map.land[i] && !map.coast[i] && !map.urban[i] && s.nodeAt[i] < 0 && s.bAt[i] < 0 && far(i);
  // coral stone only on the coral cap (not the Scotland District's clay); springs in the wetter uplands
  const ok: Record<NodeType, (i: number) => boolean> = { tree: () => true, fish: () => true, rock: (i) => map.scot[i] < 0.3, spring: (i) => map.elev[i] > 0.38 };
  const cluster = (type: NodeType, count: number, size: number) => {
    for (let c = 0; c < count; c++) {
      let seedTile = -1;
      for (let t = 0; t < 30; t++) {
        const p = s.parishes[Math.floor(rand(s) * s.parishes.length)];
        const j = p.tiles[Math.floor(rand(s) * p.tiles.length)];
        if (ok[type](j)) { seedTile = j; break; }
      }
      if (seedTile < 0) continue;
      for (let k = 0; k < size; k++) {
        const x = ix(seedTile) + Math.floor(rand(s) * 3) - 1, y = iy(seedTile) + Math.floor(rand(s) * 3) - 1;
        if (!inB(x, y)) continue; const i = y * W + x;
        if (free(i) && ok[type](i)) addNode(s, type, i);
      }
    }
  };
  cluster('tree', 44, 4); cluster('rock', 30, 3); cluster('spring', 11, 1);
  for (let i = 0; i < W * H; i++) if (!map.land[i] && map.depth[i] === 1 && rand(s) < 0.09) addNode(s, 'fish', i);

  // guaranteed starting resources around each Town Centre
  s.players.forEach((p, k) => {
    const [tx, ty] = tcs[k];
    const nearFree = (i: number) => map.land[i] && !map.coast[i] && !map.urban[i] && s.nodeAt[i] < 0 && s.bAt[i] < 0 && Math.hypot(ix(i) - (tx + 0.5), iy(i) - (ty + 0.5)) > 3.5 && map.pid[i] === p.home;
    const ring = (type: NodeType, rmin: number, rmax: number, cnt: number) => {
      let tries = 0, placed = 0, anch: [number, number] | null = null;
      const cx = tx + 1, cy = ty + 1;
      while (placed < cnt && tries++ < 400) {
        let x: number, y: number;
        if (anch) { x = anch[0] + Math.floor(rand(s) * 3) - 1; y = anch[1] + Math.floor(rand(s) * 3) - 1; }
        else { const a = rand(s) * Math.PI * 2, r = rmin + rand(s) * (rmax - rmin); x = Math.round(cx + Math.cos(a) * r); y = Math.round(cy + Math.sin(a) * r); }
        if (!inB(x, y)) continue; const i = y * W + x;
        if (nearFree(i)) { addNode(s, type, i); placed++; anch ??= [x, y]; }
      }
    };
    ring('tree', 4, 6, 4); ring('tree', 5, 8, 3); ring('rock', 5, 8, 3); ring('spring', 4, 7, 1);
    for (let i = 0; i < W * H; i++)
      if (!map.land[i] && map.depth[i] === 1 && s.nodeAt[i] < 0 && Math.hypot(ix(i) - tx, iy(i) - ty) < 9 && rand(s) < 0.45) addNode(s, 'fish', i);
    const tc = tcOf(s, p.id)!;
    for (let w = 0; w < 4; w++) { const t = spawnTile(s, tc); if (t >= 0) spawnWorker(s, t, p.id); }
  });
  return s;
}

function findSpot(s: State, pidx: number): [number, number] {
  const p = s.parishes[pidx], m = s.map;
  const d = (i: number) => (ix(i) - p.lx) ** 2 + (iy(i) - p.ly) ** 2;
  const c = p.tiles.slice().sort((a, b) => d(a) - d(b));
  for (const i of c) {
    const x = ix(i), y = iy(i); let good = true;
    for (let dy = 0; dy < 2 && good; dy++) for (let dx = 0; dx < 2; dx++) {
      if (!inB(x + dx, y + dy)) { good = false; break; }
      const j = (y + dy) * W + x + dx;
      if (!m.land[j] || m.coast[j] || m.urban[j] || m.pid[j] !== p.id || s.bAt[j] >= 0) { good = false; break; }
    }
    if (good) return [x, y];
  }
  return [ix(c[0]), iy(c[0])];
}

// ---------- entities

export function addNode(s: State, type: NodeType, i: number): Node {
  const n: Node = { id: s.nodes.length, type, i, x: ix(i), y: iy(i), amt: NT[type].max, max: NT[type].max };
  s.nodes.push(n); s.nodeAt[i] = n.id; return n;
}
function removeNode(s: State, n: Node) { n.amt = 0; if (s.nodeAt[n.i] === n.id) s.nodeAt[n.i] = -1; }

export function addBuilding(s: State, type: BType, x: number, y: number, owner: string, done: boolean): Building {
  const d = BT[type], id = s.nextId++;
  const b: Building = { id, type, x, y, w: d.w, h: d.h, owner, done, progress: done ? 1 : 0, hp: d.hp, maxHp: d.hp, queue: 0, trainT: 0, pest: 0, worker: null, variant: id % 6 };
  for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) s.bAt[(y + dy) * W + x + dx] = id;
  s.buildings[id] = b; return b;
}
function removeBuilding(s: State, b: Building) {
  if (!s.buildings[b.id]) return;
  for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) { const i = (b.y + dy) * W + b.x + dx; if (s.bAt[i] === b.id) s.bAt[i] = -1; }
  delete s.buildings[b.id];
  for (const w of Object.values(s.workers)) {
    if (w.task && (w.task.k === 'build' || w.task.k === 'farm') && w.task.b === b.id) setIdle(s, w);
    if (w.dropB === b.id) { w.path = null; w.dropB = null; }
  }
}
function spawnTile(s: State, b: Building): number {
  const g = goalTest({ k: 'rect', x: b.x, y: b.y, w: b.w, h: b.h }), cand: number[] = [];
  for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) {
    if (!inB(x, y)) continue; const i = y * W + x; if (passable(s, i) && g(i)) cand.push(i);
  }
  return cand.length ? cand[Math.floor(rand(s) * cand.length)] : -1;
}
function spawnWorker(s: State, i: number, owner: string): Worker {
  const w: Worker = { id: s.nextId++, owner, x: ix(i) + 0.5, y: iy(i) + 0.5, path: null, goal: null, task: null, phase: null, carry: null, amt: 0, dropB: null, working: false, face: 1 };
  s.workers[w.id] = w; return w;
}

// ---------- queries (also used by the client)

export const player = (s: State, id: string): Player | undefined => s.players.find((p) => p.id === id);
export const owned = (s: State, owner: string) => s.parishes.filter((p) => p.owner === owner).length;
export const teamOwned = (s: State, team: number) => s.parishes.filter((p) => s.players.some((q) => q.id === p.owner && q.team === team)).length;
export const drought = (s: State) => s.weather.droughtUntil > s.time;
export const tcOf = (s: State, owner: string) => Object.values(s.buildings).find((b) => b.type === 'tc' && b.owner === owner);
export const workersOf = (s: State, owner: string) => Object.values(s.workers).filter((w) => w.owner === owner);
export function popCap(s: State, owner: string): number {
  let c = 0;
  for (const b of Object.values(s.buildings)) if (b.owner === owner && b.done) c += BT[b.type].pop ?? 0;
  return Math.min(60, c);
}
export function protectedB(s: State, b: Building): boolean {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  return Object.values(s.buildings).some((w) => w.type === 'seawall' && w.done && Math.hypot(w.x + 0.5 - cx, w.y + 0.5 - cy) <= SEA_R);
}
export function aquaPowered(s: State, b: Building): boolean {
  return Object.values(s.buildings).some((o) => o.type === 'solar' && o.done && o.owner === b.owner && Math.hypot(o.x - b.x, o.y - b.y) <= SEA_R);
}
export function parishBuilt(s: State, p: Parish, owner: string): boolean {
  return Object.values(s.buildings).some((b) => b.owner === owner && b.done && s.map.pid[b.y * W + b.x] === p.id);
}
export function rivalCost(s: State) { return 80 + 70 * owned(s, AGRO); }
export function claimCost(s: State, pid: string, p: Parish) {
  const n = owned(s, pid) - 1, m = p.owner ? 1.6 : 1;
  return { food: Math.round((120 + 50 * n) * m), water: Math.round((40 + 20 * n) * m), bbd: Math.round((40 + 25 * n) * m) };
}
/** Why `pid` can't feed parish `p` right now, or null if they can. */
export function claimBlock(s: State, pid: string, p: Parish): string | null {
  const me = player(s, pid); if (!me) return 'Unknown player.';
  if (p.owner === pid) return 'Already yours.';
  if (p.id === AGRO_HOME) return "AgroCorp's headquarters can't be won over.";
  const other = p.owner && p.owner !== AGRO ? player(s, p.owner) : undefined;
  if (other && other.team === me.team) return `${other.name} already feeds this parish.`;
  if (other && parishBuilt(s, p, other.id)) return `${other.name} has buildings here, so it can't be won over yet.`;
  if (!p.adj.some((a) => s.parishes[a].owner === pid)) return 'Not next to your parishes yet. Feed the parishes in between first.';
  return null;
}
export function placeBlock(s: State, pid: string, type: BType, x: number, y: number): string | null {
  const d = BT[type], me = player(s, pid);
  if (!me) return 'Unknown player.';
  if ((d.age ?? 1) > me.age) return `${d.name} unlocks in the Co-op Age.`;
  for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) {
    const tx = x + dx, ty = y + dy;
    if (!inB(tx, ty)) return 'That is out at sea.';
    const i = ty * W + tx;
    if (!s.map.land[i]) return 'You can only build on land.';
    const p = s.parishes[s.map.pid[i]];
    if (p.owner !== pid) return `${p.name} isn't yours yet. Build inside your own parishes.`;
    if (s.nodeAt[i] >= 0 || s.bAt[i] >= 0) return 'That tile is taken.';
    if (d.coast && !s.map.coast[i]) return 'Seawalls go on coast tiles.';
  }
  return null;
}

// ---------- events

function emit(s: State, kind: GameEvent['kind'], msg: string, to?: string) {
  s.events.push({ seq: ++s.eventSeq, t: s.time, kind, msg, to });
  if (s.events.length > 60) s.events.splice(0, s.events.length - 60);
}

// ---------- workers

const tileOf = (w: Worker) => Math.floor(w.y) * W + Math.floor(w.x);
function release(s: State, w: Worker) {
  if (w.task?.k === 'farm') { const b = s.buildings[w.task.b]; if (b && b.worker === w.id) b.worker = null; }
}
function setIdle(s: State, w: Worker) { release(s, w); w.task = null; w.path = null; w.goal = null; w.phase = null; }
function goTo(s: State, w: Worker, goal: Goal) { w.goal = goal; w.path = findPath(s, tileOf(w), goal); return !!w.path; }
function follow(s: State, w: Worker, dt: number): 'arrived' | 'moving' | 'blocked' {
  if (!w.path || !w.goal) return 'blocked';
  if (!w.path.length) return 'arrived';
  const n = w.path[0];
  if (!passable(s, n)) { w.path = findPath(s, tileOf(w), w.goal); return w.path ? 'moving' : 'blocked'; }
  const tx = ix(n) + 0.5, ty = iy(n) + 0.5, dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy), st = SPEED * dt;
  if (Math.abs(dx) > 0.01) w.face = Math.sign(dx);
  if (d <= st) { w.x = tx; w.y = ty; w.path.shift(); } else { w.x += (dx / d) * st; w.y += (dy / d) * st; }
  return w.path.length ? 'moving' : 'arrived';
}
const rectOf = (b: { x: number; y: number; w?: number; h?: number }): Goal => ({ k: 'rect', x: b.x, y: b.y, w: b.w ?? 1, h: b.h ?? 1 });

function assignMove(s: State, w: Worker, i: number) {
  setIdle(s, w); w.task = { k: 'move' };
  if (!goTo(s, w, passable(s, i) ? { k: 'tile', i } : { k: 'rect', x: ix(i), y: iy(i), w: 1, h: 1 })) setIdle(s, w);
}
function assignGather(s: State, w: Worker, n: Node) { setIdle(s, w); w.task = { k: 'gather', n: n.id }; w.phase = 'to'; }
function assignBuild(s: State, w: Worker, b: Building) { setIdle(s, w); w.task = { k: 'build', b: b.id }; w.phase = 'to'; }
function assignFarm(s: State, w: Worker, b: Building) {
  if (b.worker !== null && b.worker !== w.id) { const o = s.workers[b.worker]; if (o) setIdle(s, o); }
  setIdle(s, w); b.worker = w.id; w.task = { k: 'farm', b: b.id }; w.phase = 'to';
}
function nearestNode(s: State, type: NodeType, x: number, y: number, r: number): Node | null {
  let best: Node | null = null, bd = r * r;
  for (const n of s.nodes) { if (n.type !== type || n.amt <= 0) continue; const d = (n.x + 0.5 - x) ** 2 + (n.y + 0.5 - y) ** 2; if (d < bd) { bd = d; best = n; } }
  return best;
}
function nearestDrop(s: State, owner: string, x: number, y: number): Building | null {
  let best: Building | null = null, bd = 1e9;
  for (const b of Object.values(s.buildings)) {
    if (b.owner !== owner || !b.done || !BT[b.type].drop) continue;
    const d = (b.x + b.w / 2 - x) ** 2 + (b.y + b.h / 2 - y) ** 2; if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function updWorker(s: State, w: Worker, dt: number) {
  const t = w.task; if (!t) return;
  const me = player(s, w.owner)!;
  if (t.k === 'move') { if (follow(s, w, dt) !== 'moving') setIdle(s, w); return; }
  if (t.k === 'build') {
    const b = s.buildings[t.b]; if (!b) { setIdle(s, w); return; }
    if (b.done) { if (b.type === 'farm' && b.worker === null) assignFarm(s, w, b); else setIdle(s, w); return; }
    if (w.phase === 'to') {
      if (!w.path && !goTo(s, w, rectOf(b))) { setIdle(s, w); return; }
      const r = follow(s, w, dt); if (r === 'arrived') w.phase = 'work'; else if (r === 'blocked') setIdle(s, w); return;
    }
    w.working = true; b.progress += dt / BT[b.type].build;
    if (b.progress >= 1) { b.done = true; b.progress = 1; b.hp = b.maxHp; emit(s, 'info', `${BT[b.type].name} built.`, b.owner); }
    return;
  }
  let type: Res, rate: number, goal: Goal;
  if (t.k === 'gather') {
    let n = s.nodes[t.n];
    if (n.amt <= 0 && w.phase !== 'drop') {
      const alt = nearestNode(s, n.type, w.x, w.y, 15);
      if (alt) { t.n = alt.id; n = alt; if (w.phase === 'work') { w.phase = 'to'; w.path = null; } }
      else if (w.amt > 0) { w.phase = 'drop'; w.path = null; }
      else { setIdle(s, w); return; }
    }
    type = NT[n.type].res; rate = NT[n.type].rate * (n.type === 'spring' && drought(s) ? 0.5 : 1); goal = rectOf(n);
  } else {
    const b = s.buildings[t.b]; if (!b || !b.done) { setIdle(s, w); return; }
    type = 'food'; rate = 0.85 * (b.pest > 0 ? 0.35 : 1); goal = rectOf(b);
  }
  if (w.phase === 'to') {
    if (!w.path && !goTo(s, w, goal)) { setIdle(s, w); return; }
    const r = follow(s, w, dt); if (r === 'arrived') w.phase = 'work'; else if (r === 'blocked') setIdle(s, w); return;
  }
  if (w.phase === 'work') {
    if (w.carry !== type) { w.carry = type; w.amt = 0; }
    let g = rate * dt;
    if (t.k === 'gather') { const n = s.nodes[t.n]; g = Math.min(g, n.amt); n.amt -= g; if (n.amt <= 0) removeNode(s, n); }
    else { const use = g * 0.25 * (drought(s) ? 1.5 : 1); if (me.res.water < use) g *= 0.4; else me.res.water -= use; }
    w.amt += g; w.working = true;
    if (w.amt >= CARRY || (t.k === 'gather' && s.nodes[t.n].amt <= 0)) { w.phase = 'drop'; w.path = null; }
    return;
  }
  if (w.phase === 'drop') {
    if (!w.path) {
      const d = nearestDrop(s, w.owner, w.x, w.y); if (!d) { setIdle(s, w); return; }
      w.dropB = d.id; if (!goTo(s, w, rectOf(d))) { setIdle(s, w); return; }
    }
    const r = follow(s, w, dt);
    if (r === 'arrived') { if (w.carry) { me.res[w.carry] += w.amt; if (w.carry === 'food') me.stats.food += w.amt; } w.amt = 0; w.phase = 'to'; w.path = null; }
    else if (r === 'blocked') w.path = null;
  }
}

// ---------- step

export function step(s: State): void {
  if (s.ended) return;
  const dt = DT;
  s.tick++; s.time = Math.round(s.tick * DT * 1000) / 1000;
  for (const w of Object.values(s.workers)) { w.working = false; updWorker(s, w, dt); }

  for (const p of s.players) {
    const tc = tcOf(s, p.id);
    if (tc && tc.queue > 0 && workersOf(s, p.id).length < popCap(s, p.id)) {
      tc.trainT += dt;
      if (tc.trainT >= TRAIN) { const t = spawnTile(s, tc); if (t >= 0) { spawnWorker(s, t, p.id); tc.queue--; tc.trainT = 0; } }
    }
    if (p.ageT >= 0) {
      p.ageT += dt;
      if (p.ageT >= AGE_T) { p.ageT = -1; p.age = 2; emit(s, 'good', 'Co-op Age reached. Aquaponics and solar unlocked.', p.id); }
    }
    p.res.bbd += 0.4 * owned(s, p.id) * dt;
  }
  for (const b of Object.values(s.buildings)) {
    if (b.pest > 0) b.pest -= dt;
    if (!b.done) continue;
    const me = player(s, b.owner); if (!me) continue;
    if (b.type === 'cistern' && !drought(s)) me.res.water += 0.5 * dt;
    if (b.type === 'aqua') {
      const f = aquaPowered(s, b) ? 1 : 0.5, use = 0.5 * f * dt;
      const food = me.res.water >= use ? ((me.res.water -= use), 2 * f * dt) : 0.6 * f * dt;
      me.res.food += food; me.stats.food += food;
    }
  }
  weather(s);
  rival(s, dt);
  checkEnd(s);
}

function weather(s: State) {
  const wx = s.weather;
  if (!wx.hurrWarned && s.time >= wx.nextHurr - 60) { wx.hurrWarned = true; emit(s, 'warn', 'Hurricane warning: landfall in 60s. Seawalls shield buildings within 5 tiles.'); }
  if (s.time >= wx.nextHurr) { landfall(s); wx.nextHurr += 240; wx.hurrWarned = false; }
  if (wx.stormT > 0) wx.stormT = Math.max(0, wx.stormT - DT);
  if (s.time >= wx.nextDrought) {
    wx.droughtUntil = s.time + 60; wx.nextDrought = s.time + 200 + rand(s) * 60;
    emit(s, 'warn', 'Drought: cisterns are dry and springs run slow for 60s. Farms drink more.');
  }
  if (s.time >= wx.nextPest) {
    wx.nextPest = s.time + 80 + rand(s) * 60;
    const fs = Object.values(s.buildings).filter((b) => b.type === 'farm' && b.done && b.pest <= 0);
    if (fs.length) { const f = fs[Math.floor(rand(s) * fs.length)]; f.pest = 45; emit(s, 'warn', 'Pests hit a farm plot. It grows at a third of its speed for 45s.', f.owner); }
  }
}

function landfall(s: State) {
  const wx = s.weather, name = HNAMES[wx.hurrIdx++ % HNAMES.length];
  wx.stormT = 5;
  const lost: Record<string, number> = {}, dmg: Record<string, number> = {};
  for (const b of Object.values(s.buildings)) {
    if (b.owner === AGRO) continue;
    const prot = protectedB(s, b);
    const L = () => (lost[b.owner] = (lost[b.owner] ?? 0) + 1), D = () => (dmg[b.owner] = (dmg[b.owner] ?? 0) + 1);
    if (!b.done) { if (!prot && rand(s) < 0.5) { removeBuilding(s, b); L(); } continue; }
    if (b.type === 'tc') { if (!prot) { b.hp = Math.max(1, b.hp - b.maxHp * 0.3); D(); } continue; }
    let hit = false;
    if (b.type === 'seawall') b.hp -= b.maxHp * 0.15;
    else if (prot) { if (rand(s) < 0.15) { b.hp -= b.maxHp * 0.2; hit = true; } }
    else if (rand(s) < 0.7) { b.hp -= b.maxHp * (0.5 + rand(s) * 0.4); hit = true; }
    if (b.hp <= 0) { removeBuilding(s, b); L(); } else if (hit) D();
  }
  for (const n of s.nodes) if (n.type === 'tree' && n.amt > 0 && rand(s) < 0.3) n.amt *= 0.5;
  s.agro.bbd *= 0.7;
  emit(s, 'bad', `Hurricane ${name} made landfall. AgroCorp lost 30% of its cash too.`);
  for (const p of s.players) emit(s, 'bad', `Your losses: ${lost[p.id] ?? 0} buildings lost, ${dmg[p.id] ?? 0} damaged.`, p.id);
}

function setOwner(s: State, p: Parish, o: string | null) {
  const prev = p.owner;
  if (prev && prev !== o)
    for (const b of Object.values(s.buildings)) if (b.owner === prev && !b.done && s.map.pid[b.y * W + b.x] === p.id) removeBuilding(s, b);
  p.owner = o; s.parishVersion++;
}

function rival(s: State, dt: number) {
  const n = s.players.length;
  const scale = s.mode === 'coop' ? 1 + 0.35 * (n - 1) : 1 + 0.15 * (n - 1);
  s.agro.bbd += (1 + 0.25 * owned(s, AGRO)) * scale * dt;
  const cost = rivalCost(s); if (s.agro.bbd < cost) return;
  const nearR = (p: Parish) => p.adj.some((a) => s.parishes[a].owner === AGRO);
  let t = s.parishes.filter((p) => p.owner === null && nearR(p)), price = cost;
  if (!t.length) {
    t = s.parishes.filter((p) => { const o = p.owner && p.owner !== AGRO ? player(s, p.owner) : undefined; return o && p.id !== o.home && nearR(p) && !parishBuilt(s, p, o.id); });
    price = cost * 1.5;
  }
  if (!t.length) { t = s.parishes.filter((p) => p.owner === null); price = cost; }
  if (!t.length || s.agro.bbd < price) return;
  const p = t[Math.floor(rand(s) * t.length)], was = p.owner;
  s.agro.bbd -= price; setOwner(s, p, AGRO);
  if (was) emit(s, 'bad', `AgroCorp bought out ${p.name}. It had no buildings to hold it.`, was);
  emit(s, 'bad', `AgroCorp bought up ${p.name}.`);
}

export function winTarget(s: State) { return s.mode === 'versus' && s.players.length > 2 ? 4 : WIN_N; }

function checkEnd(s: State) {
  if (s.ended) return;
  if (s.mode === 'coop') {
    if (teamOwned(s, 0) >= WIN_N && s.players.some((p) => p.age >= 2)) { s.ended = { winners: s.players.map((p) => p.id), reason: 'food-secure' }; return; }
  } else {
    const t = winTarget(s);
    const w = s.players.find((p) => owned(s, p.id) >= t && p.age >= 2);
    if (w) { s.ended = { winners: [w.id], reason: 'food-secure' }; return; }
  }
  if (owned(s, AGRO) >= WIN_N) s.ended = { winners: [AGRO], reason: 'bought-out' };
}

// ---------- commands

export type MarketTrade = 'sell-food' | 'sell-stone' | 'buy-water';
export type Command =
  | { type: 'move'; workers: number[]; tile: number }
  | { type: 'gather'; workers: number[]; node: number }
  | { type: 'work'; workers: number[]; building: number }
  | { type: 'place'; building: BType; x: number; y: number; workers: number[] }
  | { type: 'train'; building: number }
  | { type: 'age' }
  | { type: 'market'; trade: MarketTrade }
  | { type: 'repair'; building: number }
  | { type: 'claim'; parish: number };
export interface CmdResult { ok: boolean; msg?: string; building?: number }

const fail = (msg: string): CmdResult => ({ ok: false, msg });
const near = (a: { x: number; y: number }, x: number, y: number) => Math.hypot(a.x - x, a.y - y);

/** Applies one player's command. Every rule check lives here, so the server can trust nothing from clients. */
export function applyCommand(s: State, pid: string, c: Command): CmdResult {
  if (s.ended) return fail('The game is over.');
  const me = player(s, pid); if (!me) return fail('Unknown player.');
  const mine = (ids: number[]) => ids.map((id) => s.workers[id]).filter((w): w is Worker => !!w && w.owner === pid);
  switch (c.type) {
    case 'move': {
      if (c.tile < 0 || c.tile >= W * H || !s.map.land[c.tile]) return fail('Workers can only walk on land.');
      mine(c.workers).forEach((w) => assignMove(s, w, c.tile)); return { ok: true };
    }
    case 'gather': {
      const n = s.nodes[c.node]; if (!n || n.amt <= 0) return fail('Nothing left to gather there.');
      mine(c.workers).forEach((w) => assignGather(s, w, n)); return { ok: true };
    }
    case 'work': {
      const b = s.buildings[c.building]; if (!b || b.owner !== pid) return fail("That isn't your building.");
      const ws = mine(c.workers);
      if (!b.done) { ws.forEach((w) => assignBuild(s, w, b)); return { ok: true }; }
      if (b.type === 'farm') {
        const farms = [b, ...Object.values(s.buildings).filter((f) => f !== b && f.owner === pid && f.type === 'farm' && f.done && f.worker === null).sort((a, z) => near(a, b.x, b.y) - near(z, b.x, b.y))];
        ws.forEach((w, k) => { if (farms[k]) assignFarm(s, w, farms[k]); }); return { ok: true };
      }
      return fail('Nothing to do there.');
    }
    case 'place': {
      const d = BT[c.building]; if (!d || c.building === 'tc' || c.building === 'hq') return fail('Unknown building.');
      const r = placeBlock(s, pid, c.building, c.x, c.y); if (r) return fail(r);
      if (!canAfford(me.res, d.cost)) return fail(`Not enough for a ${d.name}: needs ${fmtCost(d.cost)}.`);
      pay(me.res, d.cost);
      const b = addBuilding(s, c.building, c.x, c.y, pid, false);
      let ws = mine(c.workers);
      if (!ws.length) {
        const all = workersOf(s, pid).sort((a, z) => near(a, c.x, c.y) - near(z, c.x, c.y));
        ws = all.filter((w) => !w.task).slice(0, 2);
        if (!ws.length) ws = all.filter((w) => w.task?.k !== 'build').slice(0, 1);
      }
      ws.forEach((w) => assignBuild(s, w, b));
      return { ok: true, building: b.id, msg: ws.length ? undefined : 'No workers free. Select one and tap the foundation.' };
    }
    case 'train': {
      const b = s.buildings[c.building]; if (!b || b.owner !== pid || b.type !== 'tc') return fail('Train workers at your Town Centre.');
      if (b.queue >= 5) return fail('The training queue is full.');
      if (!canAfford(me.res, TRAIN_COST)) return fail('Training a worker needs 50 food.');
      pay(me.res, TRAIN_COST); b.queue++; return { ok: true };
    }
    case 'age': {
      if (me.age >= 2 || me.ageT >= 0) return fail('Already advancing.');
      if (!canAfford(me.res, AGE_COST)) return fail(`The Co-op Age needs ${fmtCost(AGE_COST)}.`);
      pay(me.res, AGE_COST); me.ageT = 0; emit(s, 'info', 'Your co-op is organising. Co-op Age in 40s.', pid); return { ok: true };
    }
    case 'market': {
      if (!Object.values(s.buildings).some((b) => b.owner === pid && b.type === 'market' && b.done)) return fail('You need a Market first.');
      if (c.trade === 'sell-food') { if (me.res.food < 100) return fail('Not enough food.'); me.res.food -= 100; me.res.bbd += 50; }
      else if (c.trade === 'sell-stone') { if (me.res.stone < 100) return fail('Not enough stone.'); me.res.stone -= 100; me.res.bbd += 40; }
      else { if (me.res.bbd < 50) return fail('Not enough BBD.'); me.res.bbd -= 50; me.res.water += 100; }
      return { ok: true };
    }
    case 'repair': {
      const b = s.buildings[c.building]; if (!b || b.owner !== pid || !b.done) return fail("That isn't your building.");
      const cost = Math.ceil((b.maxHp - b.hp) * 0.25); if (cost <= 0) return fail('Nothing to repair.');
      if (me.res.stone < cost) return fail(`Repairing needs ${cost} stone.`);
      me.res.stone -= cost; b.hp = b.maxHp; return { ok: true };
    }
    case 'claim': {
      const p = s.parishes[c.parish]; if (!p) return fail('Unknown parish.');
      const r = claimBlock(s, pid, p); if (r) return fail(r);
      const cost = claimCost(s, pid, p); if (!canAfford(me.res, cost)) return fail(`Feeding ${p.name} needs ${fmtCost(cost)}.`);
      const was = p.owner; pay(me.res, cost); setOwner(s, p, pid);
      emit(s, 'good', `${p.name} is fed by your co-op now. Put a building there so it can't be bought out.`, pid);
      if (was && was !== AGRO) emit(s, 'bad', `${me.name} won ${p.name} from you.`, was);
      checkEnd(s); return { ok: true };
    }
  }
}

/** Short fingerprint of the game, used to check two machines computed the same game. */
export function stateHash(s: State): string {
  let h = 2166136261;
  const mix = (v: number) => { h ^= Math.round(v * 1000) | 0; h = Math.imul(h, 16777619); };
  mix(s.tick); mix(s.rng); mix(s.agro.bbd);
  for (const p of s.players) { mix(p.res.food); mix(p.res.water); mix(p.res.stone); mix(p.res.bbd); mix(p.age); }
  for (const w of Object.values(s.workers)) { mix(w.id); mix(w.x); mix(w.y); mix(w.amt); }
  for (const b of Object.values(s.buildings)) { mix(b.id); mix(b.hp); mix(b.progress); }
  for (const p of s.parishes) mix(p.owner ? p.owner.charCodeAt(p.owner.length - 1) : 0);
  return (h >>> 0).toString(16);
}
