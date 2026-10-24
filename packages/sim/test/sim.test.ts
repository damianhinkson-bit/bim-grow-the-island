import { describe, expect, it } from 'vitest';
import { AGRO, AGRO_HOME, P, W, applyCommand, createGame, owned, stateHash, step, tcOf, workersOf, type Command, type State } from '../src';

/** A simple scripted player: keeps idle workers gathering, trains workers, builds houses and farms, feeds neighbours. */
function bot(s: State, pid: string): Command[] {
  const out: Command[] = [];
  if (s.tick % 10 !== 0) return out;
  const ws = workersOf(s, pid), tc = tcOf(s, pid)!;
  const me = s.players.find((p) => p.id === pid)!;
  ws.filter((w) => !w.task).forEach((w) => {
    // each worker keeps a fixed job: two in three on food
    const type = w.id % 3 === 0 ? 'rock' : 'tree';
    const n = s.nodes.filter((n) => n.type === type && n.amt > 0).sort((a, b) => Math.hypot(a.x - w.x, a.y - w.y) - Math.hypot(b.x - w.x, b.y - w.y))[0];
    if (n) out.push({ type: 'gather', workers: [w.id], node: n.id });
  });
  if (tc && tc.queue === 0 && me.res.food > 120) out.push({ type: 'train', building: tc.id });
  if (s.tick % 50 === 0) {
    for (const p of s.parishes) if (p.owner !== pid) out.push({ type: 'claim', parish: p.id });
    const home = s.parishes[me.home];
    const i = home.tiles[(s.tick * 7) % home.tiles.length];
    out.push({ type: 'place', building: s.tick % 100 === 0 ? 'house' : 'farm', x: i % W, y: (i / W) | 0, workers: [] });
  }
  return out;
}

function run(players: number, ticks: number, seed = 7) {
  const s = createGame({ seed, players: Array.from({ length: players }, (_, k) => ({ name: `P${k + 1}` })) });
  for (let t = 0; t < ticks && !s.ended; t++) {
    for (const p of s.players) for (const c of bot(s, p.id)) applyCommand(s, p.id, c);
    step(s);
  }
  return s;
}

describe('map', () => {
  it('has the 11 real parishes with land in each', () => {
    const s = createGame({ players: [{ name: 'A' }] });
    expect(s.parishes.map((p) => p.name)).toContain('St. Michael');
    expect(s.parishes).toHaveLength(11);
    for (const p of s.parishes) expect(p.tiles.length).toBeGreaterThan(20);
  });
  it('starts each player in their own parish with a Town Centre and 4 workers', () => {
    const s = createGame({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] });
    expect(s.players.map((p) => s.parishes[p.home].name)).toEqual(['St. Michael', 'St. Philip', 'St. Andrew', 'St. James']);
    for (const p of s.players) { expect(tcOf(s, p.id)).toBeTruthy(); expect(workersOf(s, p.id)).toHaveLength(4); }
    expect(s.parishes[AGRO_HOME].owner).toBe(AGRO);
  });
});

describe('simulation', () => {
  it('is deterministic: same seed and commands give the same game', () => {
    const a = run(2, 3000), b = run(2, 3000);
    expect(stateHash(a)).toBe(stateHash(b));
    expect(a.tick).toBe(b.tick);
  });
  it('runs a 4-player game for 10 minutes without errors and players gather resources', () => {
    const s = run(4, 6000);
    for (const p of s.players) expect(p.stats.food).toBeGreaterThan(50);
    expect(s.weather.hurrIdx).toBeGreaterThanOrEqual(1);
  });
  it('keeps stockpiles separate per player', () => {
    const s = createGame({ players: [{ name: 'A' }, { name: 'B' }] });
    const tc = tcOf(s, 'p1')!;
    expect(applyCommand(s, 'p1', { type: 'train', building: tc.id }).ok).toBe(true);
    expect(s.players[0].res.food).toBe(150);
    expect(s.players[1].res.food).toBe(200);
  });
  it('rejects commands for things a player does not own', () => {
    const s = createGame({ players: [{ name: 'A' }, { name: 'B' }] });
    const tc2 = tcOf(s, 'p2')!;
    expect(applyCommand(s, 'p1', { type: 'train', building: tc2.id }).ok).toBe(false);
    const w2 = workersOf(s, 'p2')[0];
    applyCommand(s, 'p1', { type: 'move', workers: [w2.id], tile: w2.y * W + w2.x });
    expect(w2.task).toBeNull();
  });
  it('only lets a player build inside their own parishes', () => {
    const s = createGame({ players: [{ name: 'A' }, { name: 'B' }] });
    const philip = s.parishes[P.PHILIP].tiles[40];
    const r = applyCommand(s, 'p1', { type: 'place', building: 'house', x: philip % W, y: (philip / W) | 0, workers: [] });
    expect(r.ok).toBe(false);
  });
  it('lets a player feed a neighbouring parish', () => {
    const s = createGame({ players: [{ name: 'A' }] });
    s.players[0].res = { food: 999, water: 999, stone: 999, bbd: 999 };
    const nb = s.parishes[P.MICHAEL].adj.find((a) => s.parishes[a].owner === null)!;
    expect(applyCommand(s, 'p1', { type: 'claim', parish: nb }).ok).toBe(true);
    expect(owned(s, 'p1')).toBe(2);
  });
});

describe('AgroCorp and money', () => {
  it('waits out its grace period, warns about its target, then buys it', () => {
    const s = createGame({ players: [{ name: 'A' }], difficulty: 'normal' });
    let warnAt = -1, buyAt = -1;
    for (let t = 0; t < 20000 && buyAt < 0; t++) {
      step(s);
      if (warnAt < 0 && s.events.some((e) => e.kind === 'warn' && e.msg.startsWith('AgroCorp is about to'))) warnAt = s.time;
      if (owned(s, AGRO) > 1) buyAt = s.time;
    }
    expect(warnAt).toBeGreaterThan(240);
    expect(buyAt).toBeGreaterThan(warnAt + 10);
  });
  it('lets a player sell food at the Town Centre stall without a Market', () => {
    const s = createGame({ players: [{ name: 'A' }] });
    expect(applyCommand(s, 'p1', { type: 'market', trade: 'stall-food' }).ok).toBe(true);
    expect(s.players[0].res).toMatchObject({ food: 150, bbd: 120 });
    expect(applyCommand(s, 'p1', { type: 'market', trade: 'sell-food' }).ok).toBe(false);
  });
});

describe('roads, port and airport', () => {
  it('lays road tiles in your own parishes for 5 stone each', () => {
    const s = createGame({ players: [{ name: 'A' }] });
    const tiles = s.parishes[P.MICHAEL].tiles.filter((i) => !s.roads[i] && s.nodeAt[i] < 0 && s.bAt[i] < 0).slice(0, 3);
    const r = applyCommand(s, 'p1', { type: 'road', tiles });
    expect(r.ok).toBe(true);
    expect(tiles.every((i) => s.roads[i] === 2)).toBe(true);
    expect(s.players[0].res.stone).toBe(120 - 15);
    const away = s.parishes[P.PHILIP].tiles.find((i) => !s.roads[i])!;
    expect(applyCommand(s, 'p1', { type: 'road', tiles: [away] }).ok).toBe(false);
  });
  it('makes workers walk faster on roads', () => {
    const run = (onRoad: boolean) => {
      const s = createGame({ players: [{ name: 'A' }] });
      const w = workersOf(s, 'p1')[0];
      const row = Array.from({ length: 10 }, (_, k) => 30 * W + 20 + k);
      for (const i of row) { s.nodeAt[i] = -1; s.bAt[i] = -1; s.roads[i] = onRoad ? 2 : 0; }
      for (const i of row) s.map.land[i] = 1;
      w.x = 20.5; w.y = 30.5;
      applyCommand(s, 'p1', { type: 'move', workers: [w.id], tile: row[9] });
      let t = 0; while (w.task && t < 200) { step(s); t++; }
      return t;
    };
    const slow = run(false), fast = run(true);
    expect(fast).toBeLessThan(slow * 0.65);
  });
  it('trades at the port with a 10% fee to the parish holder', () => {
    const s = createGame({ players: [{ name: 'A' }, { name: 'B' }] });
    // p1 holds St. Michael (the port's parish) and starts on a highway; p2 starts unconnected
    expect(applyCommand(s, 'p2', { type: 'trade', at: 'port', deal: 'export-food' }).ok).toBe(false);
    expect(applyCommand(s, 'p1', { type: 'trade', at: 'port', deal: 'export-food' }).ok).toBe(true);
    expect(s.players[0].res).toMatchObject({ food: 100, bbd: 160 });
    // hand St. Michael to p2: now p1 pays p2 the 10% fee on the same deal
    s.parishes[P.MICHAEL].owner = 'p2';
    expect(applyCommand(s, 'p1', { type: 'trade', at: 'port', deal: 'export-food' }).ok).toBe(true);
    expect(s.players[0].res.bbd).toBe(160 + 54);
    expect(s.players[1].res.bbd).toBe(100 + 6);
  });
  it('launches fishing boats that land food, and closes the airport for hurricanes', () => {
    const s = createGame({ players: [{ name: 'A' }] });
    s.players[0].res.bbd = 500; s.players[0].res.stone = 500;
    expect(applyCommand(s, 'p1', { type: 'boat' }).ok).toBe(true);
    expect(s.players[0].boats).toBe(1);
    const f0 = s.players[0].flow.gain.food;
    for (let t = 0; t < 100; t++) step(s);
    expect(s.players[0].flow.gain.food - f0).toBeGreaterThan(3);
    s.weather.stormT = 3;
    expect(applyCommand(s, 'p1', { type: 'trade', at: 'airport', deal: 'airfreight' }).ok).toBe(false);
  });
});

describe('five ages', () => {
  it('starts in the Foraging Age with farms locked, and climbs through all five ages', () => {
    const s = createGame({ players: [{ name: 'A' }] });
    const me = s.players[0];
    expect(me.age).toBe(1);
    const free = s.parishes[P.MICHAEL].tiles.find((i) => !s.roads[i] && s.nodeAt[i] < 0 && s.bAt[i] < 0)!;
    expect(applyCommand(s, 'p1', { type: 'place', building: 'farm', x: free % W, y: (free / W) | 0, workers: [] }).msg).toContain('Rain-fed Farming Age');
    for (let age = 2; age <= 5; age++) {
      me.res = { food: 9999, water: 9999, stone: 9999, bbd: 9999 };
      expect(applyCommand(s, 'p1', { type: 'age' }).ok).toBe(true);
      let t = 0; while (me.age < age && t < 1000) { step(s); t++; }
      expect(me.age).toBe(age);
    }
    expect(applyCommand(s, 'p1', { type: 'age' }).ok).toBe(false);
  });
  it('makes composted farms grow faster and windbreaks shield buildings', async () => {
    const { composted, protectedB, addBuilding } = await import('../src');
    const s = createGame({ players: [{ name: 'A' }] });
    const farm = addBuilding(s, 'farm', 10, 40, 'p1', true);
    expect(composted(s, farm)).toBe(false);
    addBuilding(s, 'composter', 12, 40, 'p1', true);
    expect(composted(s, farm)).toBe(true);
    const house = addBuilding(s, 'house', 30, 30, 'p1', true);
    expect(protectedB(s, house)).toBe(false);
    addBuilding(s, 'windbreak', 32, 31, 'p1', true);
    expect(protectedB(s, house)).toBe(true);
  });
});

describe('online play support', () => {
  it('restores a snapshot that then plays on identically', async () => {
    const { snapshot, restore } = await import('../src');
    const a = createGame({ seed: 11, players: [{ name: 'A' }, { name: 'B' }] });
    for (let t = 0; t < 900; t++) { for (const p of a.players) for (const c of bot(a, p.id)) applyCommand(a, p.id, c); step(a); }
    const b = restore(JSON.parse(JSON.stringify(snapshot(a))));
    expect(stateHash(b)).toBe(stateHash(a));
    for (let t = 0; t < 900; t++) {
      for (const p of a.players) { const cs = bot(a, p.id); for (const c of cs) { applyCommand(a, p.id, c); applyCommand(b, p.id, c); } }
      step(a); step(b);
    }
    expect(stateHash(b)).toBe(stateHash(a));
    expect(b.nodes.filter((n) => n.type === 'spring').every((n) => n.max === Infinity)).toBe(true);
  });
  it('trades between players only when both can pay, and gifts only within a co-op team', () => {
    const s = createGame({ players: [{ name: 'A' }, { name: 'B' }] });
    const r = applyCommand(s, 'p1', { type: 'offer', to: 'p2', give: { food: 50 }, get: { stone: 30 } });
    expect(r.ok).toBe(true);
    const o = s.offers[0];
    expect(applyCommand(s, 'p1', { type: 'answer', offer: o.id, accept: true }).ok).toBe(false); // only the recipient answers
    expect(applyCommand(s, 'p2', { type: 'answer', offer: o.id, accept: true }).ok).toBe(true);
    expect(s.players[0].res).toMatchObject({ food: 150, stone: 150 });
    expect(s.players[1].res).toMatchObject({ food: 250, stone: 90 });
    expect(applyCommand(s, 'p1', { type: 'offer', to: 'p2', give: { food: 5000 }, get: {} }).ok).toBe(false);
    expect(applyCommand(s, 'p1', { type: 'gift', to: 'p2', give: { water: 40 } }).ok).toBe(true);
    expect(s.players[1].res.water).toBe(140);
    const v = createGame({ mode: 'versus', players: [{ name: 'A' }, { name: 'B' }] });
    expect(applyCommand(v, 'p1', { type: 'gift', to: 'p2', give: { water: 40 } }).ok).toBe(false);
  });
});
