import {
  AGES, AGRO, AGRO_BUILDS, AGRO_BUILD_BOOST, AGRO_BUILD_EVERY, AGRO_SLOT, COMPOST_BONUS, COMPOST_R, HUB_DUES, MAX_AGE, WINDBREAK_R, AGRO_HOME, BOAT_RATE, BT, CARRY, DEALS, DIFFICULTY, DT, DUES, EAT, FEE, RELIEF, RES, TOURISM, H, HNAMES, STALL, MAX_PLAYERS, NT, PLAYER_COLORS, SEA_R, SPEED, START_PARISHES, START_RES,
  TRAIN, TRAIN_COST, W, WIN_N, HOUSES, POP_MAX, canAfford, fmtCost, pay, type Cost, TOWN, PATH_COST, MAX_DOCKS, RUNOFF_FISH, FISH_FLOOR, STAND_COST, DEFAULT_MINUTES, SCORE, SCORE_FOOD_PER, SCORE_BBD_PER, AGRO_START, P,
  type BType, type DealId, type Difficulty, type Landmark, type NodeType, type Res,
} from './defs';
import { buildIsland, inB, ix, iy } from './map';
import { TC_LOCAL, buildWorld, townOrigin } from './world';
import { findPath, goalTest, passable } from './path';
import { nextRand } from './rng';
import type { Building, Flow, GameEvent, Goal, IslandMap, MapData, Mode, Node, Offer, Parish, Player, State, Worker } from './types';

// ---------- setup

let MAP: { map: MapData; island: IslandMap; parishes: Parish[] } | null = null;
function staticMap() { if (!MAP) { const { island, parishes } = buildIsland(); MAP = { map: buildWorld(), island, parishes }; } return MAP; }

/** minutes: how long the match lasts; the best town score wins when it ends. */
export interface NewGameOptions { seed?: number; mode?: Mode; difficulty?: Difficulty; minutes?: number; players: { name: string }[] }

const rand = (s: State) => nextRand(s);
/** Distance via sqrt, which every JavaScript engine computes identically (Math.hypot isn't guaranteed to), keeping phones in sync. */
export const dist = (dx: number, dy: number) => Math.sqrt(dx * dx + dy * dy);

export function createGame(o: NewGameOptions): State {
  const { map, island, parishes } = staticMap();
  const seed = (o.seed ?? 1031) | 0;
  const n = Math.max(1, Math.min(MAX_PLAYERS, o.players.length || 1));
  const minutes = Math.max(5, Math.min(90, Math.round(o.minutes ?? DEFAULT_MINUTES)));
  const s: State = {
    seed, rng: seed, tick: 0, time: 0, mode: o.mode ?? 'versus', nextId: 1, map, island,
    parishes: parishes.map((p) => ({ ...p, owner: null, stand: null })),
    nodes: [], nodeAt: new Int32Array(W * H).fill(-1), bAt: new Int32Array(W * H).fill(-1), roads: map.road.slice(), roadVersion: 1,
    buildings: {}, workers: {}, players: [], difficulty: o.difficulty ?? 'normal', agro: { bbd: 0, target: null, warned: false, nextBuild: 0 },
    weather: { nextHurr: 300, hurrWarned: false, nextDrought: 210, droughtUntil: -1, nextPest: 130, stormT: 0, hurrIdx: 0 },
    events: [], eventSeq: 0, offers: [], parishVersion: 1, ended: null, endsAt: minutes * 60,
  };
  for (let k = 0; k < n; k++) {
    const home = START_PARISHES[n - 1][k];
    s.players.push({
      id: `p${k + 1}`, name: o.players[k]?.name || `Player ${k + 1}`, color: PLAYER_COLORS[k], team: s.mode === 'coop' ? 0 : k, home, slot: k,
      res: { ...START_RES }, age: 1, ageT: -1, stats: { food: 0 }, hungry: false, flow: newFlow(),
    });
    s.parishes[home].owner = `p${k + 1}`; s.parishes[home].stand = `p${k + 1}`;
  }
  for (const id of AGRO_START) if (!s.parishes[id].owner) s.parishes[id].owner = AGRO;
  s.parishes[AGRO_HOME].stand = AGRO;
  const tcAt = (slot: number) => { const o = townOrigin(slot); return [o.x + TC_LOCAL.x, o.y + TC_LOCAL.y] as const; };
  const [hx, hy] = tcAt(AGRO_SLOT); addBuilding(s, 'hq', hx, hy, AGRO, true);
  townNodes(s, AGRO_SLOT, 0.5);
  s.players.forEach((p) => {
    const [x, y] = tcAt(p.slot); addBuilding(s, 'tc', x, y, p.id, true);
    townNodes(s, p.slot, 1);
    const tc = tcOf(s, p.id)!;
    for (let w = 0; w < 4; w++) { const t = spawnTile(s, tc); if (t >= 0) spawnWorker(s, t, p.id); }
  });
  return s;
}

/**
 * A town's resources: breadfruit groves, coral rock outcrops, a spring or two, and flying fish in the shallows. Kept
 * clear of the Town Centre, the road and the shore, with a few of each close by so the start is quick.
 */
function townNodes(s: State, slot: number, amount: number) {
  const o = townOrigin(slot), m = s.map;
  const cx = o.x + TC_LOCAL.x + 1, cy = o.y + TC_LOCAL.y + 1;
  const free = (x: number, y: number) => {
    if (x <= o.x || y <= o.y || x >= o.x + TOWN - 1 || y >= o.y + TOWN - 1) return false;
    const i = y * W + x;
    return m.land[i] === 1 && m.kind[i] === 0 && !m.road[i] && !m.road[i - W] && !m.road[i + W] && s.nodeAt[i] < 0 && s.bAt[i] < 0 && dist(x + 0.5 - cx, y + 0.5 - cy) > 3.2;
  };
  const cluster = (type: NodeType, count: number, size: number, rmin: number, rmax: number) => {
    for (let c = 0; c < count; c++) {
      let ax = -1, ay = -1;
      for (let t = 0; t < 40 && ax < 0; t++) {
        const a = rand(s) * Math.PI * 2, r = rmin + rand(s) * (rmax - rmin);
        const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
        if (free(x, y)) { ax = x; ay = y; }
      }
      if (ax < 0) continue;
      addNode(s, type, ay * W + ax);
      for (let k = 1, tries = 0; k < size && tries < 30; tries++) {
        const x = ax + Math.floor(rand(s) * 5) - 2, y = ay + Math.floor(rand(s) * 5) - 2;
        if (free(x, y)) { addNode(s, type, y * W + x); k++; }
      }
    }
  };
  // a grove and a rock outcrop near the start, then more further out
  cluster('tree', 1, 4, 4, 6); cluster('rock', 1, 3, 5, 7); cluster('spring', 1, 1, 4, 7);
  cluster('tree', Math.round(4 * amount), 4, 6, 13); cluster('rock', Math.round(3 * amount), 3, 7, 13); cluster('spring', 1, 1, 8, 13);
  for (let y = o.y + 1; y < o.y + TOWN - 1; y++) for (let x = o.x; x < o.x + TOWN; x++) {
    const i = y * W + x; if (m.depth[i] === 1 && rand(s) < 0.22 * amount) addNode(s, 'fish', i);
  }
}

// ---------- stockpile bookkeeping

function newFlow(): Flow {
  const z = () => ({ food: 0, water: 0, stone: 0, bbd: 0 });
  return { gain: z(), upkeep: z(), spent: z(), eaten: 0 };
}
function spend(p: Player, c: Partial<Record<Res, number>>) { for (const k of RES) { const v = c[k] ?? 0; p.res[k] -= v; p.flow.spent[k] += v; } }
function earn(p: Player, r: Res, v: number) { p.res[r] += v; p.flow.gain[r] += v; }

// ---------- entities

export function addNode(s: State, type: NodeType, i: number): Node {
  const n: Node = { id: s.nodes.length, type, i, x: ix(i), y: iy(i), amt: NT[type].max, max: NT[type].max, town: s.map.town[i] };
  s.nodes.push(n); s.nodeAt[i] = n.id; return n;
}
function removeNode(s: State, n: Node) { n.amt = 0; if (s.nodeAt[n.i] === n.id) s.nodeAt[n.i] = -1; }

export function addBuilding(s: State, type: BType, x: number, y: number, owner: string, done: boolean): Building {
  const d = BT[type], id = s.nextId++;
  const lvl = type === 'house' ? houseLevelFor(s, owner) : 1, hp = type === 'house' ? HOUSES[lvl - 1].hp : d.hp;
  const b: Building = { id, type, x, y, w: d.w, h: d.h, owner, done, progress: done ? 1 : 0, hp, maxHp: hp, queue: 0, trainT: 0, pest: 0, worker: null, variant: id % 6, lvl };
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
  for (const b of Object.values(s.buildings)) if (b.owner === owner && b.done) c += popOf(b);
  return Math.min(POP_MAX, c);
}
/** People a building houses. */
export function popOf(b: { type: BType; lvl?: number }): number { return b.type === 'house' ? HOUSES[(b.lvl ?? 1) - 1].pop : BT[b.type].pop ?? 0; }
/** The kind of house a player builds now: the one for their age. */
export function houseLevelFor(s: State, owner: string): number { return Math.max(1, Math.min(HOUSES.length, player(s, owner)?.age ?? 1)); }
/** What it costs this player to build something: houses cost what their age's house costs. */
export function buildCost(s: State, owner: string, type: BType): Cost { return type === 'house' ? HOUSES[houseLevelFor(s, owner) - 1].cost : BT[type].cost; }
/** A building's name, e.g. 'Coral Stone House'. */
export function bName(b: { type: BType; lvl?: number }): string { return b.type === 'house' ? HOUSES[(b.lvl ?? 1) - 1].name : BT[b.type].name; }
/** The upgrade open to a house: the next kind, if the owner's age allows it. */
export function houseUpgrade(s: State, b: Building): { to: number; cost: Cost } | null {
  if (b.type !== 'house' || !b.done || b.lvl >= HOUSES.length) return null;
  const age = player(s, b.owner)?.age ?? 1;
  return b.lvl < age ? { to: b.lvl + 1, cost: HOUSES[b.lvl].cost } : null;
}
export function protectedB(s: State, b: Building): boolean {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  return Object.values(s.buildings).some((w) => w.done && w !== b && (
    (w.type === 'seawall' && dist(w.x + 0.5 - cx, w.y + 0.5 - cy) <= SEA_R) ||
    (w.type === 'windbreak' && dist(w.x + 0.5 - cx, w.y + 0.5 - cy) <= WINDBREAK_R)));
}
/** Whether a farm plot has a composter of its owner within reach. */
export function composted(s: State, b: Building): boolean {
  return Object.values(s.buildings).some((o) => o.type === 'composter' && o.done && o.owner === b.owner && dist(o.x - b.x, o.y - b.y) <= COMPOST_R);
}
/** Which player laid a path tile (null for a town's dirt road and empty tiles). */
export function roadOwner(s: State, i: number): Player | null { const v = s.roads[i]; return v >= 2 ? s.players[v - 2] ?? null : null; }
export function aquaPowered(s: State, b: Building): boolean {
  return Object.values(s.buildings).some((o) => o.type === 'solar' && o.done && o.owner === b.owner && dist(o.x - b.x, o.y - b.y) <= SEA_R);
}
/** Whether a co-op has a stand guarding a parish (its home parish always counts). */
export function parishBuilt(s: State, p: Parish, owner: string): boolean { return p.stand === owner; }
/** The parish each landmark is in: whoever feeds it collects the fees. */
export const LANDMARK_PARISH: Record<Landmark, number> = { port: P.MICHAEL, airport: P.CHRIST };
/** Who collects fees at a landmark: whoever feeds its parish (a player id, AgroCorp, or nobody). */
export function landmarkHolder(s: State, type: Landmark): string | null { return s.parishes[LANDMARK_PARISH[type]].owner; }
export const airportOpen = (s: State) => s.weather.stormT <= 0 && s.time < s.weather.nextHurr - 60;
/** The BBD you'd actually get or pay for a deal once the fee is taken, and the fee itself (0 if you hold the parish). */
export function dealTerms(s: State, pid: string, at: Landmark, id: DealId) {
  const d = DEALS[at][id]!, holder = landmarkHolder(s, at);
  const bbd = d.get.bbd ?? d.give.bbd ?? 0, fee = holder && holder !== pid ? Math.round(bbd * FEE) : 0;
  return { deal: d, fee, holder, net: d.get.bbd ? bbd - fee : bbd + fee };
}
/** Which town slot a world tile is in, and whether it's this player's. */
export const townOf = (s: State, i: number) => s.map.town[i];
export const inTownOf = (s: State, pid: string, i: number) => { const p = player(s, pid); return !!p && s.map.town[i] === p.slot; };
/** How much slower flying fish are to catch, from AgroCorp's factory farm runoff. */
export function fishFactor(s: State): number {
  const n = Object.values(s.buildings).filter((b) => b.type === 'ffarm' && b.done).length;
  return Math.max(FISH_FLOOR, 1 - RUNOFF_FISH * n);
}

/** What's left to gather on a player's land: count and amount per resource type. */
export function resourcesOnLand(s: State, owner: string): Record<NodeType, { count: number; left: number }> {
  const out = { tree: { count: 0, left: 0 }, fish: { count: 0, left: 0 }, rock: { count: 0, left: 0 }, spring: { count: 0, left: 0 } };
  for (const n of s.nodes) {
    if (n.amt <= 0 || n.town !== player(s, owner)?.slot) continue;
    out[n.type].count++; if (n.max !== Infinity) out[n.type].left += n.amt;
  }
  return out;
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
  if (other && parishBuilt(s, p, other.id)) return `${other.name} has a co-op stand here, so it can't be won over.`;
  if (!p.adj.some((a) => s.parishes[a].owner === pid)) return 'Not next to your parishes yet. Feed the parishes in between first.';
  return null;
}
export function placeBlock(s: State, pid: string, type: BType, x: number, y: number): string | null {
  const d = BT[type], me = player(s, pid);
  if (!me) return 'Unknown player.';
  if ((d.age ?? 1) > me.age) return `${d.name} unlocks in the ${AGES[(d.age ?? 1) - 1].name}.`;
  let shore = false;
  for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) {
    const tx = x + dx, ty = y + dy;
    if (!inB(tx, ty)) return 'That is off the map.';
    const i = ty * W + tx;
    if (s.map.town[i] !== me.slot) return 'Build inside your own town.';
    if (!s.map.land[i]) return s.map.kind[i] === 4 ? "That's the hedge at the edge of town." : 'You can only build on land.';
    if (s.nodeAt[i] >= 0 || s.bAt[i] >= 0) return 'That spot is taken.';
    if (s.roads[i]) return "That's a road or path. Build beside it.";
    if (s.map.coast[i]) shore = true;
  }
  if (d.coast && !shore) return `${d.name}s go on the shore, where the sand meets the sea.`;
  return null;
}

// ---------- events

function emit(s: State, kind: GameEvent['kind'], msg: string, to?: string) {
  s.events.push({ seq: ++s.eventSeq, t: s.time, kind, msg, to });
  if (s.events.length > 60) s.events.splice(0, s.events.length - 60);
}
/** A public headline: what a co-op or AgroCorp just did, and where. */
function news(s: State, who: string, msg: string, at: { x: number; y: number }, kind: GameEvent['kind'] = 'info') {
  s.events.push({ seq: ++s.eventSeq, t: s.time, kind, msg, news: true, who, at });
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
  const tx = ix(n) + 0.5, ty = iy(n) + 0.5, dx = tx - w.x, dy = ty - w.y, d = dist(dx, dy), st = SPEED * dt * (s.roads[tileOf(w)] && s.roads[n] ? 1.7 : 1);
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
  const town = s.map.town[Math.floor(y) * W + Math.floor(x)];
  for (const n of s.nodes) { if (n.type !== type || n.amt <= 0 || n.town !== town) continue; const d = (n.x + 0.5 - x) ** 2 + (n.y + 0.5 - y) ** 2; if (d < bd) { bd = d; best = n; } }
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
  if (me.hungry) dt *= 0.5;
  if (t.k === 'move') { if (follow(s, w, dt) !== 'moving') setIdle(s, w); return; }
  if (t.k === 'build') {
    const b = s.buildings[t.b]; if (!b) { setIdle(s, w); return; }
    if (b.done) { if (b.type === 'farm' && b.worker === null) assignFarm(s, w, b); else setIdle(s, w); return; }
    if (w.phase === 'to') {
      if (!w.path && !goTo(s, w, rectOf(b))) { setIdle(s, w); return; }
      const r = follow(s, w, dt); if (r === 'arrived') w.phase = 'work'; else if (r === 'blocked') setIdle(s, w); return;
    }
    w.working = true; b.progress += dt / BT[b.type].build;
    if (b.progress >= 1) { b.done = true; b.progress = 1; b.hp = b.maxHp; emit(s, 'info', `${bName(b)} built.`, b.owner); }
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
    type = NT[n.type].res; rate = NT[n.type].rate * (n.type === 'spring' && drought(s) ? 0.5 : 1) * (n.type === 'fish' ? fishFactor(s) : 1); goal = rectOf(n);
  } else {
    const b = s.buildings[t.b]; if (!b || !b.done) { setIdle(s, w); return; }
    type = 'food'; rate = 0.85 * (b.pest > 0 ? 0.35 : 1) * (composted(s, b) ? COMPOST_BONUS : 1); goal = rectOf(b);
  }
  if (w.phase === 'to') {
    if (!w.path && !goTo(s, w, goal)) {
      // boxed in by other trees or rocks: try the nearest reachable resource of the same kind
      if (t.k === 'gather') {
        const type0 = s.nodes[t.n].type;
        const alts = s.nodes.filter((n) => n.type === type0 && n.amt > 0 && n.id !== t.n && n.town === s.nodes[t.n].town)
          .sort((a, z) => dist(a.x - w.x, a.y - w.y) - dist(z.x - w.x, z.y - w.y)).slice(0, 6);
        const alt = alts.find((n) => goTo(s, w, rectOf(n)));
        if (alt) { t.n = alt.id; return; }
      }
      setIdle(s, w); return;
    }
    const r = follow(s, w, dt); if (r === 'arrived') w.phase = 'work'; else if (r === 'blocked') setIdle(s, w); return;
  }
  if (w.phase === 'work') {
    if (w.carry !== type) { w.carry = type; w.amt = 0; }
    let g = rate * dt;
    if (t.k === 'gather') { const n = s.nodes[t.n]; g = Math.min(g, n.amt); n.amt -= g; if (n.amt <= 0) removeNode(s, n); }
    else { const use = g * 0.25 * (drought(s) ? 1.5 : 1); if (me.res.water < use) g *= 0.4; else { me.res.water -= use; me.flow.upkeep.water += use; } }
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
    if (r === 'arrived') { if (w.carry) { me.res[w.carry] += w.amt; me.flow.gain[w.carry] += w.amt; if (w.carry === 'food') me.stats.food += w.amt; } w.amt = 0; w.phase = 'to'; w.path = null; }
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
      const next = AGES[p.age];
      if (next && p.ageT >= next.time) {
        p.ageT = -1; p.age++; emit(s, 'good', `${next.name} reached. ${next.unlocks}`, p.id);
        const tc = tcOf(s, p.id);
        if (s.players.length > 1 && tc) news(s, p.id, `${p.name} reached the ${next.name}.`, { x: tc.x + 1, y: tc.y + 1 });
      }
    }
    const hub = Object.values(s.buildings).some((b) => b.owner === p.id && b.type === 'hub' && b.done);
    const dues = DUES * owned(s, p.id) * (hub ? HUB_DUES : 1) * dt; p.res.bbd += dues; p.flow.gain.bbd += dues;

    if (landmarkHolder(s, 'airport') === p.id && airportOpen(s)) { const t = TOURISM * dt; p.res.bbd += t; p.flow.gain.bbd += t; }
    // everyone eats; an empty stockpile means hungry workers at half speed
    const need = EAT * workersOf(s, p.id).length * dt, ate = Math.min(need, Math.max(0, p.res.food));
    p.res.food -= ate; p.flow.eaten += ate;
    const hungry = ate < need - 1e-9;
    if (hungry && !p.hungry) emit(s, 'bad', 'Your people are out of food and work at half speed. Gather breadfruit or fish, or farm.', p.id);
    p.hungry = hungry;
  }
  for (const b of Object.values(s.buildings)) {
    if (b.pest > 0) b.pest -= dt;
    if (!b.done) continue;
    const me = player(s, b.owner); if (!me) continue;
    if (b.type === 'cistern' && !drought(s)) { me.res.water += 0.5 * dt; me.flow.gain.water += 0.5 * dt; }
    if (b.type === 'dock' && s.weather.stormT <= 0) { const f = BOAT_RATE * fishFactor(s) * dt; me.res.food += f; me.flow.gain.food += f; me.stats.food += f; }
    const inc = BT[b.type].income; if (inc) { me.res.bbd += inc * dt; me.flow.gain.bbd += inc * dt; }
    if (b.type === 'house') { const g = HOUSES[b.lvl - 1].garden * dt; if (g) { me.res.food += g; me.stats.food += g; me.flow.gain.food += g; } }
    if (b.type === 'aqua') {
      const f = aquaPowered(s, b) ? 1 : 0.5, use = 0.5 * f * dt;
      const food = me.res.water >= use ? ((me.res.water -= use), (me.flow.upkeep.water += use), 2 * f * dt) : 0.6 * f * dt;
      me.res.food += food; me.stats.food += food; me.flow.gain.food += food;
    }
  }
  if (s.offers.length) s.offers = s.offers.filter((o) => s.time - o.t < OFFER_TTL);
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
  let agroLost = 0;
  for (const b of Object.values(s.buildings)) {
    if (b.owner === 'public' || b.type === 'hq') continue;
    if (b.owner === AGRO) {
      // AgroCorp's sheds and sites take a beating too
      if (!b.done) { if (rand(s) < 0.5) { removeBuilding(s, b); agroLost++; } }
      else if (rand(s) < 0.6) { b.hp -= b.maxHp * (0.4 + rand(s) * 0.4); if (b.hp <= 0) { removeBuilding(s, b); agroLost++; } }
      continue;
    }
    if (BT[b.type].deco && b.type !== 'fountain' && b.type !== 'bandstand' && !protectedB(s, b) && rand(s) < 0.25) { removeBuilding(s, b); continue; }
    // coral stone and newer houses stand up to a hurricane; a chattel house takes half the damage
    const wind = b.type === 'house' ? HOUSES[b.lvl - 1].wind : 0;
    const prot = protectedB(s, b) || wind === 2;
    const L = () => (lost[b.owner] = (lost[b.owner] ?? 0) + 1), D = () => (dmg[b.owner] = (dmg[b.owner] ?? 0) + 1);
    if (!b.done) { if (!prot && rand(s) < 0.5) { removeBuilding(s, b); L(); } continue; }
    if (b.type === 'tc') { if (!prot) { b.hp = Math.max(1, b.hp - b.maxHp * 0.3); D(); } continue; }
    let hit = false;
    if (b.type === 'seawall' || b.type === 'windbreak') b.hp -= b.maxHp * 0.15;
    else if (prot) { if (rand(s) < 0.15) { b.hp -= b.maxHp * 0.2; hit = true; } }
    else if (rand(s) < 0.7) { b.hp -= b.maxHp * (0.5 + rand(s) * 0.4) * (wind === 1 ? 0.5 : 1); hit = true; }
    if (b.hp <= 0) { removeBuilding(s, b); L(); } else if (hit) D();
  }
  for (const n of s.nodes) if (n.type === 'tree' && n.amt > 0 && rand(s) < 0.3) n.amt *= 0.5;
  s.agro.bbd *= 0.7;
  if (agroLost) { const hq = Object.values(s.buildings).find((b) => b.type === 'hq'); news(s, AGRO, `${name} flattened ${agroLost === 1 ? 'one of AgroCorp\'s buildings' : `${agroLost} of AgroCorp's buildings`}.`, hq ? { x: hq.x + 1, y: hq.y + 1 } : { x: 0, y: 0 }, 'good'); }
  for (const p of s.players)
    if (Object.values(s.buildings).some((b) => b.owner === p.id && b.type === 'dock' && b.done)) { earn(p, 'food', RELIEF); emit(s, 'good', `A relief boat tied up at your dock: +${RELIEF} food.`, p.id); }
  emit(s, 'bad', `Hurricane ${name} made landfall. AgroCorp lost 30% of its cash too.`);
  for (const p of s.players) emit(s, 'bad', `Your losses: ${lost[p.id] ?? 0} buildings lost, ${dmg[p.id] ?? 0} damaged.`, p.id);
}

function setOwner(s: State, p: Parish, o: string | null) {
  if (p.owner !== o) p.stand = null;
  p.owner = o; s.parishVersion++;
}

/** Parishes AgroCorp could buy next: unclaimed ones next to its land, else players' parishes next to it that have no buildings. */
export function rivalOptions(s: State): { list: Parish[]; mult: number } {
  const nearR = (p: Parish) => p.adj.some((a) => s.parishes[a].owner === AGRO);
  const free = s.parishes.filter((p) => p.owner === null && nearR(p));
  if (free.length) return { list: free, mult: 1 };
  const weak = s.parishes.filter((p) => { const o = p.owner && p.owner !== AGRO ? player(s, p.owner) : undefined; return !!o && p.id !== o.home && nearR(p) && p.stand !== o.id; });
  return { list: weak, mult: 1.5 };
}
export function rivalPrice(s: State): number {
  const { mult } = rivalOptions(s); return rivalCost(s) * mult;
}

function rival(s: State, dt: number) {
  const d = DIFFICULTY[s.difficulty], n = s.players.length;
  if (s.time < d.grace) return;
  const scale = s.mode === 'coop' ? 1 + 0.35 * (n - 1) : 1 + 0.15 * (n - 1);
  const built = Object.values(s.buildings).filter((b) => b.owner === AGRO && b.done && b.type !== 'hq').length;
  s.agro.bbd += (1 + d.growth * owned(s, AGRO)) * d.rate * scale * (1 + AGRO_BUILD_BOOST * built) * dt;
  agroBuild(s, dt);
  const { list, mult } = rivalOptions(s);
  const ag = s.agro;
  // keep a target, and drop it if the parish is no longer available
  if (ag.target !== null && !list.some((p) => p.id === ag.target)) { ag.target = null; ag.warned = false; }
  if (!list.length) return;
  if (ag.target === null) {
    // prefer the parish next to the most AgroCorp land, ties broken at random
    const score = (p: Parish) => p.adj.filter((a) => s.parishes[a].owner === AGRO).length;
    const best = Math.max(...list.map(score)), top = list.filter((p) => score(p) === best);
    ag.target = top[Math.floor(rand(s) * top.length)].id; ag.warned = false;
  }
  const p = s.parishes[ag.target], price = rivalCost(s) * mult;
  if (!ag.warned && ag.bbd >= price * d.warnAt) {
    ag.warned = true;
    emit(s, 'warn', p.owner ? `AgroCorp is about to buy out ${p.name}. Put a co-op stand there to keep it.` : `AgroCorp is about to buy up ${p.name}. Feed it first to keep it out of their hands.`);
  }
  if (ag.bbd < price) return;
  const was = p.owner;
  ag.bbd -= price; ag.target = null; ag.warned = false; setOwner(s, p, AGRO);
  if (was) emit(s, 'bad', `AgroCorp bought out ${p.name}. It had no co-op stand to hold it.`, was);
  emit(s, 'bad', `AgroCorp bought up ${p.name}.`);
}

/** AgroCorp puts up factory farms, cane mills and company towers on its estate, one at a time, one per parish it owns. */
function agroBuild(s: State, dt: number) {
  const mine = Object.values(s.buildings).filter((b) => b.owner === AGRO && b.type !== 'hq');
  // construction: no workers to pay, it just goes up
  for (const b of mine) {
    if (b.done) continue;
    b.progress = Math.min(1, b.progress + dt / BT[b.type].build);
    if (b.progress >= 1) {
      b.done = true; b.hp = b.maxHp;
      news(s, AGRO, b.type === 'ffarm' ? "AgroCorp's new Factory Farm is running. Its runoff makes flying fish scarcer in every town." : `AgroCorp opened ${b.type === 'tower' ? 'Agro Towers' : 'a Cane Mill'} on its estate. Its income is growing.`, { x: b.x + 1.5, y: b.y + 1.5 }, 'bad');
    }
  }
  if (s.time < s.agro.nextBuild || mine.some((b) => !b.done) || mine.length >= owned(s, AGRO) + 1) return;
  s.agro.nextBuild = s.time + AGRO_BUILD_EVERY;
  const at = agroSpot(s); if (!at) return;
  // whichever kind it has fewest of, in order: factory farm, cane mill, towers
  const type = AGRO_BUILDS.reduce((best, t) => (mine.filter((b) => b.type === t).length < mine.filter((b) => b.type === best).length ? t : best));
  const b = addBuilding(s, type, at[0], at[1], AGRO, false);
  news(s, AGRO, `AgroCorp is building ${type === 'tower' ? '' : 'a '}${BT[type].name} on its estate.`, { x: b.x + 1.5, y: b.y + 1.5 }, 'warn');
}
/** A free 3x3 spot on AgroCorp's estate with a clear ring round it, nearest its HQ; null if there's none. */
function agroSpot(s: State): [number, number] | null {
  const o = townOrigin(AGRO_SLOT), hq = Object.values(s.buildings).find((b) => b.type === 'hq');
  const cx = hq ? hq.x + 1 : o.x + 16, cy = hq ? hq.y + 1 : o.y + 16;
  const cands: [number, number, number][] = [];
  for (let y = o.y + 1; y < o.y + TOWN - 4; y++) for (let x = o.x + 1; x < o.x + TOWN - 4; x++) cands.push([x, y, dist(x + 1 - cx, y + 1 - cy)]);
  cands.sort((a, b) => a[2] - b[2]);
  for (const [x, y] of cands) {
    let good = true;
    for (let dy = -1; dy < 4 && good; dy++) for (let dx = -1; dx < 4; dx++) {
      const j = (y + dy) * W + x + dx, inner = dx >= 0 && dx < 3 && dy >= 0 && dy < 3;
      if (s.bAt[j] >= 0 || (inner && (!s.map.land[j] || s.map.coast[j] || s.roads[j] || s.nodeAt[j] >= 0))) { good = false; break; }
    }
    if (good) return [x, y];
  }
  return null;
}

/** AgroCorp wins if it buys this many parishes. */
export function winTarget(_s: State) { return WIN_N; }

/**
 * A town's score, and what it's made of. people: room in its homes. food: food grown and caught. bbd: money earned.
 * beauty: decorations, nice buildings, better houses, paths and trees left standing. safe: buildings that stand up to
 * a hurricane. age: ages reached. parish: parishes fed.
 */
export function townScore(s: State, pid: string) {
  const p = player(s, pid)!;
  const bs = Object.values(s.buildings).filter((b) => b.owner === pid && b.done);
  let beauty = 0, safe = 0;
  for (const b of bs) {
    beauty += BT[b.type].beauty ?? 0;
    if (b.type === 'house') beauty += b.lvl - 1;
    if (BT[b.type].deco || b.type === 'tc') continue;
    if (protectedB(s, b) || (b.type === 'house' && HOUSES[b.lvl - 1].wind === 2)) safe++;
  }
  let paths = 0; const mark = 2 + s.players.indexOf(p);
  for (let i = 0; i < s.roads.length; i++) if (s.roads[i] === mark) paths++;
  const trees = s.nodes.filter((n) => n.type === 'tree' && n.amt > 0 && n.town === p.slot).length;
  beauty += Math.floor(paths / 4) + Math.floor(trees / 2);
  const parts = {
    people: popCap(s, pid) * SCORE.people,
    food: Math.floor(p.stats.food / SCORE_FOOD_PER) * SCORE.food,
    bbd: Math.floor(p.flow.gain.bbd / SCORE_BBD_PER) * SCORE.bbd,
    beauty: beauty * SCORE.beauty,
    safe: safe * SCORE.safe,
    age: (p.age - 1) * SCORE.age,
    parish: owned(s, pid) * SCORE.parish,
  };
  return { ...parts, total: Object.values(parts).reduce((a, v) => a + v, 0) };
}

function checkEnd(s: State) {
  if (s.ended) return;
  if (owned(s, AGRO) >= WIN_N) { s.ended = { winners: [AGRO], reason: 'bought-out' }; return; }
  if (s.time < s.endsAt) return;
  // time: the best town wins; in co-op everyone who held AgroCorp off wins together
  if (s.mode === 'coop') { s.ended = { winners: s.players.map((p) => p.id), reason: 'time' }; return; }
  const scores = s.players.map((p) => ({ id: p.id, t: townScore(s, p.id).total }));
  const best = Math.max(...scores.map((x) => x.t));
  s.ended = { winners: scores.filter((x) => x.t === best).map((x) => x.id), reason: 'time' };
}

// ---------- commands

export type MarketTrade = 'sell-food' | 'sell-stone' | 'buy-water' | 'stall-food';
export type Command =
  | { type: 'move'; workers: number[]; tile: number }
  | { type: 'gather'; workers: number[]; node: number }
  | { type: 'work'; workers: number[]; building: number }
  | { type: 'place'; building: BType; x: number; y: number; workers: number[] }
  | { type: 'train'; building: number }
  | { type: 'age' }
  | { type: 'market'; trade: MarketTrade }
  | { type: 'repair'; building: number }
  | { type: 'upgrade'; building: number }
  | { type: 'claim'; parish: number }
  | { type: 'road'; tiles: number[] }
  | { type: 'trade'; at: Landmark; deal: DealId }
  | { type: 'stand'; parish: number }
  | { type: 'offer'; to: string; give: Partial<Record<Res, number>>; get: Partial<Record<Res, number>> }
  | { type: 'answer'; offer: number; accept: boolean }
  | { type: 'gift'; to: string; give: Partial<Record<Res, number>> };
export interface CmdResult { ok: boolean; msg?: string; building?: number }

const fail = (msg: string): CmdResult => ({ ok: false, msg });
export const OFFER_TTL = 60;
/** Whole, positive amounts of known resources only; null if anything is off. */
function cleanAmounts(c: unknown): Partial<Record<Res, number>> | null {
  if (!c || typeof c !== 'object') return null;
  const out: Partial<Record<Res, number>> = {};
  for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
    if (!(RES as string[]).includes(k)) return null;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100000) return null;
    const n = Math.floor(v); if (n > 0) out[k as Res] = n;
  }
  return out;
}
const near = (a: { x: number; y: number }, x: number, y: number) => dist(a.x - x, a.y - y);

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
      const d = BT[c.building]; if (!d || ['tc', 'hq', 'port', 'airport', 'ffarm', 'mill', 'tower'].includes(c.building)) return fail('Unknown building.');
      const r = placeBlock(s, pid, c.building, c.x, c.y); if (r) return fail(r);
      if (c.building === 'dock' && Object.values(s.buildings).filter((b) => b.owner === pid && b.type === 'dock').length >= MAX_DOCKS) return fail(`Your bay has room for ${MAX_DOCKS} docks.`);
      const cost = buildCost(s, pid, c.building), nm = bName({ type: c.building, lvl: houseLevelFor(s, pid) });
      if (!canAfford(me.res, cost)) return fail(`Not enough for a ${nm}: needs ${fmtCost(cost)}.`);
      spend(me, cost);
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
      spend(me, TRAIN_COST); b.queue++; return { ok: true };
    }
    case 'age': {
      if (me.age >= MAX_AGE) return fail('You are already in the final age.');
      if (me.ageT >= 0) return fail('Already advancing.');
      const next = AGES[me.age];
      if (!canAfford(me.res, next.cost)) return fail(`The ${next.name} needs ${fmtCost(next.cost)}.`);
      spend(me, next.cost); me.ageT = 0; emit(s, 'info', `Your co-op is moving into the ${next.name}. Ready in ${next.time}s.`, pid); return { ok: true };
    }
    case 'market': {
      if (c.trade === 'stall-food') {
        if (!tcOf(s, pid)) return fail('You need a Town Centre.');
        if (me.res.food < STALL.food) return fail(`Selling at the stall needs ${STALL.food} food.`);
        spend(me, { food: STALL.food }); earn(me, 'bbd', STALL.bbd); return { ok: true };
      }
      if (!Object.values(s.buildings).some((b) => b.owner === pid && b.type === 'market' && b.done)) return fail('You need a Market first.');
      if (c.trade === 'sell-food') { if (me.res.food < 100) return fail('Not enough food.'); spend(me, { food: 100 }); earn(me, 'bbd', 50); }
      else if (c.trade === 'sell-stone') { if (me.res.stone < 100) return fail('Not enough stone.'); spend(me, { stone: 100 }); earn(me, 'bbd', 40); }
      else { if (me.res.bbd < 50) return fail('Not enough BBD.'); spend(me, { bbd: 50 }); earn(me, 'water', 100); }
      return { ok: true };
    }
    case 'upgrade': {
      const b = s.buildings[c.building]; if (!b || b.owner !== pid) return fail("That isn't your building.");
      if (b.type !== 'house') return fail('Only houses can be upgraded.');
      if (!b.done) return fail('Finish building it first.');
      const up = houseUpgrade(s, b);
      if (!up) return fail(b.lvl >= HOUSES.length ? 'This is already the best kind of house.' : `Reach the ${AGES[b.lvl].name} to upgrade to a ${HOUSES[b.lvl].name}.`);
      if (!canAfford(me.res, up.cost)) return fail(`Upgrading to a ${HOUSES[up.to - 1].name} needs ${fmtCost(up.cost)}.`);
      spend(me, up.cost);
      const was = HOUSES[b.lvl - 1], next = HOUSES[up.to - 1];
      b.lvl = up.to; b.maxHp = next.hp; b.hp = next.hp;
      if (up.to >= 4 && s.players.length > 1) news(s, pid, `${me.name} built ${up.to === 5 ? 'an' : 'a'} ${next.name}.`, { x: b.x + 0.5, y: b.y + 0.5 });
      return { ok: true, msg: `Upgraded to a ${next.name}: now houses ${next.pop} people (was ${was.pop}).` };
    }
    case 'repair': {
      const b = s.buildings[c.building]; if (!b || b.owner !== pid || !b.done) return fail("That isn't your building.");
      const cost = Math.ceil((b.maxHp - b.hp) * 0.25); if (cost <= 0) return fail('Nothing to repair.');
      if (me.res.stone < cost) return fail(`Repairing needs ${cost} stone.`);
      spend(me, { stone: cost }); b.hp = b.maxHp; return { ok: true };
    }
    case 'road': {
      let laid = 0, why = '';
      for (const i of [...new Set(c.tiles)].slice(0, 80)) {
        if (!Number.isInteger(i) || i < 0 || i >= W * H) continue;
        if (s.map.town[i] !== me.slot) { why ||= 'Lay paths in your own town.'; continue; }
        if (!s.map.land[i]) { why ||= 'Paths go on land.'; continue; }
        if (s.roads[i]) continue;
        if (s.nodeAt[i] >= 0 || s.bAt[i] >= 0) { why ||= 'Something is in the way.'; continue; }
        if (me.res.stone < PATH_COST) { why = `Out of stone: each path tile costs ${PATH_COST}.`; break; }
        spend(me, { stone: PATH_COST }); s.roads[i] = 2 + s.players.indexOf(me); laid++;
      }
      if (laid) s.roadVersion++;
      return laid ? { ok: true, msg: why || undefined } : fail(why || 'Nothing to build there.');
    }
    case 'trade': {
      const d = DEALS[c.at]?.[c.deal]; if (!d) return fail('Unknown deal.');
      if (c.at === 'airport' && !airportOpen(s)) return fail('The airport is closed for the hurricane.');
      const t = dealTerms(s, pid, c.at, c.deal);
      const give = { ...d.give }, get = { ...d.get };
      if (get.bbd) get.bbd = t.net; else if (give.bbd) give.bbd = t.net;
      if (!canAfford(me.res, give)) return fail(`You need ${fmtCost(give)}.`);
      spend(me, give); for (const k of RES) if (get[k]) earn(me, k, get[k]!);
      if (t.fee && t.holder) {
        if (t.holder === AGRO) s.agro.bbd += t.fee;
        else { const h = player(s, t.holder); if (h) earn(h, 'bbd', t.fee); }
      }
      return { ok: true };
    }
    case 'stand': {
      const p = s.parishes[c.parish]; if (!p) return fail('Unknown parish.');
      if (p.owner !== pid) return fail(`Feed ${p.name} first, then put a stand there.`);
      if (p.stand === pid) return fail(`You already have a stand in ${p.name}.`);
      if (!canAfford(me.res, STAND_COST)) return fail(`A co-op stand needs ${fmtCost(STAND_COST)}.`);
      spend(me, STAND_COST); p.stand = pid; s.parishVersion++;
      emit(s, 'good', `Your co-op stand opened in ${p.name}. AgroCorp can't buy it now.`, pid);
      return { ok: true };
    }
    case 'offer': {
      const other = player(s, c.to); if (!other || other.id === pid) return fail('Pick another player to trade with.');
      const give = cleanAmounts(c.give), get = cleanAmounts(c.get);
      if (!give || !get || (!Object.keys(give).length && !Object.keys(get).length)) return fail('Set what you give and what you want.');
      if (!canAfford(me.res, give)) return fail(`You don't have ${fmtCost(give)} to offer.`);
      if (s.offers.filter((o) => o.from === pid).length >= 3) return fail('You already have 3 open offers. Wait for answers first.');
      const o: Offer = { id: s.nextId++, from: pid, to: other.id, give, get, t: s.time };
      s.offers.push(o);
      emit(s, 'info', `${me.name} offers ${fmtCost(give) || 'nothing'} for your ${fmtCost(get) || 'nothing'}. Open the dashboard to answer.`, other.id);
      return { ok: true, msg: `Offer sent to ${other.name}.` };
    }
    case 'answer': {
      const o = s.offers.find((x) => x.id === c.offer && x.to === pid); if (!o) return fail('That offer has expired.');
      s.offers = s.offers.filter((x) => x !== o);
      const from = player(s, o.from);
      if (!from) return fail('That player has left.');
      if (!c.accept) { emit(s, 'info', `${me.name} declined your offer.`, from.id); return { ok: true }; }
      if (!canAfford(from.res, o.give)) { emit(s, 'warn', `${from.name} no longer has ${fmtCost(o.give)}.`, pid); return fail(`${from.name} can't cover the trade any more.`); }
      if (!canAfford(me.res, o.get)) return fail(`You need ${fmtCost(o.get)} to accept.`);
      spend(from, o.give); spend(me, o.get);
      for (const k of RES) { if (o.give[k]) earn(me, k, o.give[k]!); if (o.get[k]) earn(from, k, o.get[k]!); }
      emit(s, 'good', `${me.name} accepted your trade.`, from.id);
      return { ok: true, msg: 'Trade done.' };
    }
    case 'gift': {
      const other = player(s, c.to); if (!other || other.id === pid) return fail('Pick a teammate.');
      if (other.team !== me.team) return fail('Gifts are only for teammates in a co-op game. Offer a trade instead.');
      const give = cleanAmounts(c.give); if (!give || !Object.keys(give).length) return fail('Choose what to send.');
      if (!canAfford(me.res, give)) return fail(`You don't have ${fmtCost(give)}.`);
      spend(me, give); for (const k of RES) if (give[k]) earn(other, k, give[k]!);
      emit(s, 'good', `${me.name} sent you ${fmtCost(give)}.`, other.id);
      return { ok: true, msg: `Sent ${fmtCost(give)} to ${other.name}.` };
    }
    case 'claim': {
      const p = s.parishes[c.parish]; if (!p) return fail('Unknown parish.');
      const r = claimBlock(s, pid, p); if (r) return fail(r);
      const cost = claimCost(s, pid, p); if (!canAfford(me.res, cost)) return fail(`Feeding ${p.name} needs ${fmtCost(cost)}.`);
      const was = p.owner; spend(me, cost); setOwner(s, p, pid);
      emit(s, 'good', `${p.name} is fed by your co-op now. Put a co-op stand there so it can't be bought out.`, pid);
      if (s.players.length > 1) { const tc = tcOf(s, pid); news(s, pid, `${me.name} now feeds ${p.name}.`, tc ? { x: tc.x + 1.5, y: tc.y + 1.5 } : { x: 0, y: 0 }, 'info'); }
      if (was && was !== AGRO) emit(s, 'bad', `${me.name} won ${p.name} from you.`, was);
      checkEnd(s); return { ok: true };
    }
  }
}

/** Short fingerprint of the game, used to check two machines computed the same game. */
export function stateHash(s: State): string {
  let h = 2166136261;
  const mix = (v: number) => { h ^= Math.round(v * 1000) | 0; h = Math.imul(h, 16777619); };
  mix(s.tick); mix(s.rng); mix(s.agro.bbd); mix(s.agro.target ?? -1); mix(s.roadVersion);
  for (const p of s.players) { mix(p.res.food); mix(p.res.water); mix(p.res.stone); mix(p.res.bbd); mix(p.age); }
  for (const w of Object.values(s.workers)) { mix(w.id); mix(w.x); mix(w.y); mix(w.amt); }
  for (const b of Object.values(s.buildings)) { mix(b.id); mix(b.hp); mix(b.progress); mix(b.lvl); }
  for (const p of s.parishes) { mix(p.owner ? p.owner.charCodeAt(p.owner.length - 1) : 0); mix(p.stand ? p.stand.charCodeAt(p.stand.length - 1) : 0); }
  for (const n of s.nodes) mix(n.amt === Infinity ? -1 : n.amt);
  mix(s.offers.length);
  return (h >>> 0).toString(16);
}

// ---------- snapshots (for joining, rejoining and resyncing online games)

export interface Snapshot { v: 2; state: Omit<State, 'map' | 'island' | 'parishes' | 'nodeAt' | 'bAt' | 'roads'> & { owners: (string | null)[]; stands: (string | null)[]; nodeAt: number[]; bAt: number[]; roads: number[] } }

/** A JSON-safe copy of everything that changes during a game. The map itself is rebuilt from the same data on every machine. */
export function snapshot(s: State): Snapshot {
  const { map: _m, island: _i, parishes, nodeAt, bAt, roads, ...rest } = s;
  void _m; void _i;
  return { v: 2, state: JSON.parse(JSON.stringify({ ...rest, owners: parishes.map((p) => p.owner), stands: parishes.map((p) => p.stand), nodeAt: Array.from(nodeAt), bAt: Array.from(bAt), roads: Array.from(roads) })) };
}
export function restore(snap: Snapshot): State {
  const { map, island, parishes } = staticMap();
  if (snap.v !== 2) throw new Error('Saved game from an older version.');
  const { owners, stands, nodeAt, bAt, roads, ...rest } = snap.state;
  // JSON turns Infinity (a spring's endless water) into null
  for (const n of rest.nodes) { if (n.max === null) n.max = Infinity; if (n.amt === null) n.amt = Infinity; }
  return {
    ...(rest as Omit<State, 'map' | 'island' | 'parishes' | 'nodeAt' | 'bAt' | 'roads'>),
    map, island, parishes: parishes.map((p, k) => ({ ...p, owner: owners[k] ?? null, stand: stands?.[k] ?? null })),
    nodeAt: Int32Array.from(nodeAt), bAt: Int32Array.from(bAt), roads: Uint8Array.from(roads),
  };
}
