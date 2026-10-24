import { describe, expect, it } from 'vitest';
import { AGRO, AGRO_HOME, P, W, applyCommand, createGame, owned, stateHash, step, tcOf, workersOf, type Command, type State } from '../src';

/** A simple scripted player: keeps idle workers gathering, trains workers, builds houses and farms, feeds neighbours. */
function bot(s: State, pid: string): Command[] {
  const out: Command[] = [];
  if (s.tick % 10 !== 0) return out;
  const ws = workersOf(s, pid), tc = tcOf(s, pid)!;
  const me = s.players.find((p) => p.id === pid)!;
  ws.filter((w) => !w.task).forEach((w, k) => {
    const type = k % 3 === 0 ? 'rock' : k % 3 === 1 ? 'tree' : 'spring';
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
