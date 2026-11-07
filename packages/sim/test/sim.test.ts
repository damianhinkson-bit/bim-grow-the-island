import { describe, expect, it } from 'vitest';
import {
  AGRO, AGRO_HOME, AGRO_SLOT, BT, HOUSES, P, TOWN, W, addBuilding, applyCommand, bName, createGame, fishFactor, owned, placeBlock, popCap, popOf,
  restore, rivalCoop, SCORE, snapshot, stateHash, step, tcOf, townOrigin, townScore, workersOf, type BType, type State,
} from '../src';

/** Plays a game with every player run by the computer co-op AI. */
function run(players: number, ticks: number, seed = 7, minutes = 60) {
  const s = createGame({ seed, minutes, players: Array.from({ length: players }, (_, k) => ({ name: `P${k + 1}` })) });
  for (let t = 0; t < ticks && !s.ended; t++) {
    if (t % 25 === 0) for (const p of s.players) for (const c of rivalCoop(s, p.id)) applyCommand(s, p.id, c);
    step(s);
  }
  return s;
}
/** A free spot for a building in a player's town, or throws. */
function spot(s: State, pid: string, type: BType, near?: { x: number; y: number }): [number, number] {
  const me = s.players.find((p) => p.id === pid)!, o = townOrigin(me.slot);
  const cands: [number, number, number][] = [];
  for (let y = o.y; y < o.y + TOWN; y++) for (let x = o.x; x < o.x + TOWN; x++) cands.push([x, y, near ? Math.abs(x - near.x) + Math.abs(y - near.y) : 0]);
  cands.sort((a, b) => a[2] - b[2]);
  for (const [x, y] of cands) if (!placeBlock(s, pid, type, x, y)) return [x, y];
  throw new Error(`no spot for ${type}`);
}
const rich = (s: State, pid: string) => { const p = s.players.find((q) => q.id === pid)!; p.res = { food: 9999, water: 9999, stone: 9999, bbd: 9999 }; return p; };

describe('towns and island', () => {
  it('has the 11 real parishes on the island map', () => {
    const s = createGame({ players: [{ name: 'A' }] });
    expect(s.parishes.map((p) => p.name)).toContain('St. Michael');
    expect(s.parishes).toHaveLength(11);
    for (const p of s.parishes) expect(p.tiles.length).toBeGreaterThan(20);
    expect(s.parishes[AGRO_HOME].owner).toBe(AGRO);
  });
  it('gives each co-op its own coastal town with a Town Centre, 4 workers, a road and resources', () => {
    const s = createGame({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] });
    const slots = new Set(s.players.map((p) => p.slot));
    expect(slots.size).toBe(4);
    for (const p of s.players) {
      const tc = tcOf(s, p.id)!; expect(s.map.town[tc.y * W + tc.x]).toBe(p.slot);
      expect(workersOf(s, p.id)).toHaveLength(4);
      for (const w of workersOf(s, p.id)) expect(s.map.town[Math.floor(w.y) * W + Math.floor(w.x)]).toBe(p.slot);
      const here = s.nodes.filter((n) => n.town === p.slot);
      expect(here.filter((n) => n.type === 'tree').length).toBeGreaterThanOrEqual(10);
      expect(here.filter((n) => n.type === 'rock').length).toBeGreaterThanOrEqual(5);
      expect(here.filter((n) => n.type === 'spring').length).toBeGreaterThanOrEqual(1);
      expect(here.filter((n) => n.type === 'fish').length).toBeGreaterThanOrEqual(5);
      const o = townOrigin(p.slot); let shore = 0, road = 0;
      for (let y = o.y; y < o.y + TOWN; y++) for (let x = o.x; x < o.x + TOWN; x++) { shore += s.map.coast[y * W + x]; road += s.roads[y * W + x] ? 1 : 0; }
      expect(shore).toBeGreaterThan(10); expect(road).toBeGreaterThan(8);
      // a tree close to home, for a quick start
      expect(here.some((n) => n.type === 'tree' && Math.abs(n.x - tc.x) + Math.abs(n.y - tc.y) < 10)).toBe(true);
    }
    const hq = Object.values(s.buildings).find((b) => b.type === 'hq')!;
    expect(s.map.town[hq.y * W + hq.x]).toBe(AGRO_SLOT);
  });
});

describe('simulation', () => {
  it('is deterministic: same seed and commands give the same game', () => {
    const a = run(2, 3000), b = run(2, 3000);
    expect(stateHash(a)).toBe(stateHash(b));
  });
  it('runs a 4-player game for 10 minutes and everyone gathers', () => {
    const s = run(4, 6000);
    for (const p of s.players) expect(p.stats.food).toBeGreaterThan(50);
    expect(s.weather.hurrIdx).toBeGreaterThanOrEqual(1);
  });
  it('keeps stockpiles and workers separate per player', () => {
    const s = createGame({ players: [{ name: 'A' }, { name: 'B' }] });
    const theirs = workersOf(s, 'p2')[0];
    const tree = s.nodes.find((n) => n.type === 'tree' && n.town === 0)!;
    applyCommand(s, 'p1', { type: 'gather', workers: [theirs.id], node: tree.id });
    expect(theirs.task).toBeNull();
    s.players[0].res.food = 1; expect(s.players[1].res.food).toBe(200);
  });
  it('only lets you build in your own town, and docks and seawalls only on the shore', () => {
    const s = createGame({ players: [{ name: 'A' }, { name: 'B' }] }); rich(s, 'p1');
    const tc2 = tcOf(s, 'p2')!;
    expect(placeBlock(s, 'p1', 'house', tc2.x + 4, tc2.y + 4)).toContain('own town');
    const tc = tcOf(s, 'p1')!;
    const [gx, gy] = spot(s, 'p1', 'house', { x: tc.x + 5, y: tc.y });
    expect(placeBlock(s, 'p1', 'dock', gx, gy)).toContain('shore');
    const [dx, dy] = spot(s, 'p1', 'dock');
    expect(s.map.coast[dy * W + dx] || s.map.coast[dy * W + dx + 1]).toBe(1);
    for (let k = 0; k < 3; k++) { const [x, y] = spot(s, 'p1', 'dock'); expect(applyCommand(s, 'p1', { type: 'place', building: 'dock', x, y, workers: [] }).ok).toBe(true); }
    const [x4, y4] = spot(s, 'p1', 'dock');
    expect(applyCommand(s, 'p1', { type: 'place', building: 'dock', x: x4, y: y4, workers: [] }).msg).toContain('room for 3');
  });
  it('lays paths in your own town for 2 stone a tile, and workers walk faster on them', () => {
    const s = createGame({ players: [{ name: 'A' }, { name: 'B' }] });
    const tc = tcOf(s, 'p1')!, before = s.players[0].res.stone;
    const tiles: number[] = []; for (let x = tc.x - 6; x < tc.x - 1; x++) tiles.push((tc.y + 5) * W + x);
    const r = applyCommand(s, 'p1', { type: 'road', tiles });
    expect(r.ok).toBe(true); expect(s.players[0].res.stone).toBe(before - 2 * tiles.filter((i) => s.roads[i] >= 2).length);
    const tc2 = tcOf(s, 'p2')!;
    expect(applyCommand(s, 'p1', { type: 'road', tiles: [(tc2.y + 5) * W + tc2.x] }).msg).toContain('own town');
  });
  it('lets you feed a neighbouring parish, and a co-op stand keeps AgroCorp and rivals out', () => {
    const s = createGame({ players: [{ name: 'A' }, { name: 'B' }] }); rich(s, 'p1'); rich(s, 'p2');
    const near = s.parishes[s.players[0].home].adj.find((a) => s.parishes[a].owner === null)!;
    expect(applyCommand(s, 'p1', { type: 'claim', parish: near }).ok).toBe(true);
    expect(s.parishes[near].owner).toBe('p1');
    expect(applyCommand(s, 'p1', { type: 'stand', parish: near }).ok).toBe(true);
    expect(s.parishes[near].stand).toBe('p1');
    // a rival next door can't win it over while the stand is there
    s.parishes.forEach((p) => { if (p.adj.includes(near) && p.owner === null) p.owner = 'p2'; });
    expect(applyCommand(s, 'p2', { type: 'claim', parish: near }).msg).toContain('stand');
  });
});

describe('AgroCorp', () => {
  it('waits out its grace period, warns about its target, then buys it', () => {
    const s = createGame({ players: [{ name: 'A' }] });
    const start = owned(s, AGRO); expect(start).toBe(2);
    for (let t = 0; t < 2300; t++) step(s);
    expect(owned(s, AGRO)).toBe(start);
    for (let t = 0; t < 6000 && owned(s, AGRO) < start + 1; t++) step(s);
    expect(owned(s, AGRO)).toBe(start + 1);
    expect(s.events.some((e) => e.msg.includes('about to buy'))).toBe(true);
  });
  it('builds factory farms, mills and towers on its estate, whose runoff makes fish scarcer, with public news', () => {
    const s = createGame({ seed: 7, players: [{ name: 'A' }] });
    for (let t = 0; t < 9000 && !s.ended; t++) step(s);
    const agro = Object.values(s.buildings).filter((b) => b.owner === AGRO && b.type !== 'hq');
    expect(agro.length).toBeGreaterThanOrEqual(2);
    for (const b of agro) expect(s.map.town[b.y * W + b.x]).toBe(AGRO_SLOT);
    expect(s.events.some((e) => e.news && e.who === AGRO && e.msg.includes('is building'))).toBe(true);
    const farms = agro.filter((b) => b.type === 'ffarm' && b.done).length;
    expect(fishFactor(s)).toBeCloseTo(Math.max(0.6, 1 - 0.1 * farms));
  }, 60000);
});

describe('money, trade and ages', () => {
  it('sells food at the Town Centre stall, and trades at the port with a fee to whoever feeds St. Michael', () => {
    const s = createGame({ players: [{ name: 'A' }, { name: 'B' }] });
    const b0 = s.players[0].res.bbd;
    expect(applyCommand(s, 'p1', { type: 'market', trade: 'stall-food' }).ok).toBe(true);
    expect(s.players[0].res.bbd).toBe(b0 + 20);
    s.parishes[P.MICHAEL].owner = 'p1';
    const p2bbd = s.players[1].res.bbd, p1bbd = s.players[0].res.bbd;
    expect(applyCommand(s, 'p2', { type: 'trade', at: 'port', deal: 'export-food' }).ok).toBe(true);
    expect(s.players[1].res.bbd).toBe(p2bbd + 54);
    expect(s.players[0].res.bbd).toBe(p1bbd + 6);
  });
  it('starts in the Foraging Age with farms locked, and climbs through all five ages', () => {
    const s = createGame({ players: [{ name: 'A' }] });
    const [x, y] = spot(s, 'p1', 'house');
    expect(placeBlock(s, 'p1', 'farm', x, y)).toContain('unlocks');
    for (let a = 2; a <= 5; a++) {
      rich(s, 'p1');
      expect(applyCommand(s, 'p1', { type: 'age' }).ok).toBe(true);
      for (let t = 0; t < 600 && s.players[0].age < a; t++) step(s);
      expect(s.players[0].age).toBe(a);
    }
  });
  it('builds the house of your age, and upgrades one step at a time once your age allows it', () => {
    const s = createGame({ players: [{ name: 'A' }] }); const me = rich(s, 'p1');
    const [x, y] = spot(s, 'p1', 'house');
    const r = applyCommand(s, 'p1', { type: 'place', building: 'house', x, y, workers: [] });
    const h = s.buildings[r.building!]; h.done = true; h.progress = 1;
    expect(bName(h)).toBe('Thatch Hut'); expect(popOf(h)).toBe(3);
    expect(applyCommand(s, 'p1', { type: 'upgrade', building: h.id }).msg).toContain('Reach the');
    me.age = 2; const cap = popCap(s, 'p1');
    expect(applyCommand(s, 'p1', { type: 'upgrade', building: h.id }).ok).toBe(true);
    expect(popCap(s, 'p1')).toBe(cap + 2);
    me.age = 5; for (let k = 0; k < 3; k++) applyCommand(s, 'p1', { type: 'upgrade', building: h.id });
    expect(bName(h)).toBe('Apartment Block'); expect(popOf(h)).toBe(HOUSES[4].pop);
  });
});

describe('town score and the end of the match', () => {
  it('scores what a town has: homes, decorations, safe buildings, ages and parishes', () => {
    const s = createGame({ players: [{ name: 'A' }] }); rich(s, 'p1');
    const a = townScore(s, 'p1');
    const tc = tcOf(s, 'p1')!;
    for (const type of ['flowers', 'palm', 'bench'] as BType[]) {
      const [x, y] = spot(s, 'p1', type, { x: tc.x + 4, y: tc.y - 2 });
      const b = addBuilding(s, type, x, y, 'p1', true); expect(b.done).toBe(true);
    }
    const b = townScore(s, 'p1');
    expect(b.beauty - a.beauty).toBe(SCORE.beauty * ((BT.flowers.beauty ?? 0) + (BT.palm.beauty ?? 0) + (BT.bench.beauty ?? 0)));
    expect(b.total).toBeGreaterThan(a.total);
    s.players[0].age = 3; expect(townScore(s, 'p1').age).toBe(50);
  });
  it('ends when the time is up, and the best town wins', () => {
    const s = run(2, 20000, 3, 12);
    expect(s.ended?.reason).toBe('time');
    expect(s.time).toBeGreaterThanOrEqual(12 * 60);
    const scores = s.players.map((p) => townScore(s, p.id).total);
    const best = Math.max(...scores);
    expect(s.ended!.winners).toEqual(s.players.filter((_, k) => scores[k] === best).map((p) => p.id));
  }, 60000);
  it('ends early if AgroCorp buys 6 parishes', () => {
    const s = createGame({ players: [{ name: 'A' }] });
    s.parishes.filter((p) => p.owner === null).slice(0, 5).forEach((p) => (p.owner = AGRO));
    step(s);
    expect(s.ended).toMatchObject({ winners: [AGRO], reason: 'bought-out' });
  });
});

describe('online play support', () => {
  it('restores a snapshot that then plays on identically', () => {
    const s = run(2, 1500);
    const copy = restore(JSON.parse(JSON.stringify(snapshot(s))));
    for (let k = 0; k < 1500; k++) { step(s); step(copy); }
    expect(stateHash(copy)).toBe(stateHash(s));
  });
});

describe('computer co-ops', () => {
  it('grow a real town over 20 minutes: ages, parishes, homes, farms, a dock and decorations', () => {
    const s = run(3, 12000, 11);
    for (const p of s.players) {
      const mine = Object.values(s.buildings).filter((b) => b.owner === p.id && b.done);
      expect(p.age).toBeGreaterThanOrEqual(3);
      expect(owned(s, p.id)).toBeGreaterThanOrEqual(2);
      expect(workersOf(s, p.id).length).toBeGreaterThan(8);
      expect(mine.filter((b) => b.type === 'house').length).toBeGreaterThan(1);
      expect(mine.some((b) => b.type === 'farm')).toBe(true);
      expect(mine.some((b) => b.type === 'dock')).toBe(true);
      expect(mine.some((b) => BT[b.type].deco)).toBe(true);
      expect(townScore(s, p.id).total).toBeGreaterThan(150);
    }
  }, 60000);
});
