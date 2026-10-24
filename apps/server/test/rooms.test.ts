import { describe, expect, it } from 'vitest';
import { PROTOCOL, applyCommand, restore, snapshot, stateHash, step, workersOf, type RoomSave, type ServerMsg, type State } from '@bim/sim';
import { Lobby, type Conn } from '../src/rooms';

/** A fake phone: records what the server sends and plays the game in lockstep like the real client. */
class Phone implements Conn {
  inbox: ServerMsg[] = [];
  state: State | null = null;
  me = '';
  closed = false;
  send(m: ServerMsg) {
    this.inbox.push(m);
    if (m.t === 'start' || m.t === 'snap') { this.state = restore(JSON.parse(JSON.stringify(m.snap))); if (m.t === 'start') this.me = m.you; }
    if (m.t === 'tick' && this.state) { for (const [pid, c] of m.cmds) applyCommand(this.state, pid, c); step(this.state); }
  }
  close() { this.closed = true; }
  last<T extends ServerMsg['t']>(t: T) { return [...this.inbox].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined; }
}
const V = PROTOCOL;
let clock = 1_000_000;
const run = (lobby: Lobby, seconds: number) => { for (let k = 0; k < seconds * 10; k++) { clock += 100; lobby.update(clock); } };

function setup(n: number) {
  const lobby = new Lobby();
  const phones = Array.from({ length: n }, () => new Phone());
  lobby.handle(phones[0], { t: 'create', name: 'Damian', v: V });
  const code = phones[0].last('joined')!.code;
  for (let k = 1; k < n; k++) lobby.handle(phones[k], { t: 'join', code, name: `Friend ${k}`, v: V });
  const room = lobby.rooms.get(code)!;
  /** Starts the game on the test clock. */
  const start = () => { lobby.handle(phones[0], { t: 'start' }); (room as unknown as { last: number }).last = clock; };
  return { lobby, phones, code, room, start };
}

describe('rooms', () => {
  it('creates a room with a 5-letter code and lets friends join the lobby', () => {
    const { phones, code } = setup(3);
    expect(code).toMatch(/^[A-Z]{5}$/);
    const lobby = phones[2].last('lobby')!.lobby;
    expect(lobby.players.map((p) => p.name)).toEqual(['Damian', 'Friend 1', 'Friend 2']);
    expect(lobby.host).toBe(0);
  });
  it('only lets the host change settings and start', () => {
    const { lobby, phones } = setup(2);
    lobby.handle(phones[1], { t: 'start' });
    expect(phones[1].last('error')?.msg).toContain('host');
    lobby.handle(phones[0], { t: 'settings', mode: 'versus', difficulty: 'hard' });
    expect(phones[1].last('lobby')!.lobby).toMatchObject({ mode: 'versus', difficulty: 'hard' });
    lobby.handle(phones[0], { t: 'start' });
    expect(phones[0].me).toBe('p1'); expect(phones[1].me).toBe('p2');
  });
  it('keeps every phone in lockstep with the server as players send commands', () => {
    const { lobby, phones, room, start } = setup(3);
    start();
    for (let sec = 0; sec < 60; sec++) {
      phones.forEach((ph) => {
        const s = ph.state!;
        const idle = workersOf(s, ph.me).filter((w) => !w.task);
        for (const w of idle) {
          const n = s.nodes.filter((x) => x.type === 'tree' && x.amt > 0).sort((a, b) => Math.hypot(a.x - w.x, a.y - w.y) - Math.hypot(b.x - w.x, b.y - w.y))[0];
          if (n) lobby.handle(ph, { t: 'cmd', c: { type: 'gather', workers: [w.id], node: n.id } });
        }
      });
      run(lobby, 1);
    }
    const server = stateHash(room.state!);
    expect(room.state!.tick).toBeGreaterThanOrEqual(599);
    for (const ph of phones) { expect(ph.state!.tick).toBe(room.state!.tick); expect(stateHash(ph.state!)).toBe(server); }
    expect(room.state!.players.every((p) => p.flow.gain.food > 0)).toBe(true);
  });
  it('lets a dropped player rejoin a running game with their token', () => {
    const { lobby, phones, room, code, start } = setup(2);
    start();
    run(lobby, 5);
    expect(room.state!.tick).toBeGreaterThan(40);
    const token = phones[1].last('joined')!.token;
    lobby.drop(phones[1]);
    run(lobby, 5);
    const again = new Phone();
    lobby.handle(again, { t: 'join', code, name: 'Friend 1', token, v: V });
    expect(again.me).toBe('p2');
    run(lobby, 3);
    expect(stateHash(again.state!)).toBe(stateHash(room.state!));
    // a stranger can't join a running game
    const stranger = new Phone();
    lobby.handle(stranger, { t: 'join', code, name: 'X', v: V });
    expect(stranger.last('error')?.msg).toContain('already started');
  });
  it('resyncs a phone whose game drifted', () => {
    const { lobby, phones, room, start } = setup(2);
    start();
    run(lobby, 6);
    phones[1].state!.players[1].res.food += 999; // simulate a drift
    const tick = Math.floor(room.state!.tick / 50) * 50;
    lobby.handle(phones[1], { t: 'hash', tick, h: 'deadbeef' });
    expect(phones[1].last('snap')).toBeTruthy();
    expect(stateHash(phones[1].state!)).toBe(stateHash(room.state!));
  });
  it('pauses for everyone, with a limit per player', () => {
    const { lobby, phones, room, start } = setup(2);
    start();
    lobby.handle(phones[1], { t: 'pause' });
    expect(phones[0].last('paused')).toMatchObject({ paused: true, by: 'Friend 1' });
    const t0 = room.state!.tick; run(lobby, 3); expect(room.state!.tick).toBe(t0);
    lobby.handle(phones[0], { t: 'pause' });
    expect(room.paused).toBe(false);
  });
  it('rejects a wrong code and an outdated game version', () => {
    const lobby = new Lobby(); const ph = new Phone();
    lobby.handle(ph, { t: 'join', code: 'ZZZZZ', name: 'A', v: V });
    expect(ph.last('error')?.msg).toContain('No game');
    lobby.handle(ph, { t: 'create', name: 'A', v: 99 });
    expect(ph.last('error')?.msg).toContain('out of date');
  });
});

describe('caretaker', () => {
  it('takes over an away player after 2 minutes, in lockstep, and hands back on return', () => {
    const { lobby, phones, room, code, start } = setup(2);
    start();
    run(lobby, 2);
    const token = phones[1].last('joined')!.token;
    lobby.drop(phones[1]);
    run(lobby, 100);
    expect(room.slots[1].ai).toBe(false);
    run(lobby, 30);
    expect(room.slots[1].ai).toBe(true);
    expect(phones[0].last('lobby')!.lobby.players[1].ai).toBe(true);
    run(lobby, 60);
    const s = room.state!;
    expect(workersOf(s, 'p2').some((w) => w.task)).toBe(true);
    expect(stateHash(phones[0].state!)).toBe(stateHash(s));
    const back = new Phone();
    lobby.handle(back, { t: 'join', code, name: 'Friend 1', token, v: V });
    expect(room.slots[1].ai).toBe(false);
    run(lobby, 5);
    expect(stateHash(back.state!)).toBe(stateHash(room.state!));
  });
});

describe('lobby survives phones switching apps', () => {
  it("keeps the room and the host's seat while the host is away sending the code, so the friend can still join", () => {
    const lobby = new Lobby(); const host = new Phone();
    lobby.handle(host, { t: 'create', name: 'Damian', v: V });
    const { code, token } = host.last('joined')!;
    lobby.drop(host);            // host switches to WhatsApp: the browser drops the connection
    run(lobby, 90);              // a minute and a half later…
    const friend = new Phone();
    lobby.handle(friend, { t: 'join', code, name: 'Kemar', v: V });
    expect(friend.last('error')).toBeUndefined();
    const again = new Phone();   // host comes back: same room, same code, still the host
    lobby.handle(again, { t: 'join', code, name: 'Damian', token, v: V });
    const info = again.last('lobby')!.lobby;
    expect(info.code).toBe(code);
    expect(info.players.map((p) => [p.name, p.connected])).toEqual([['Damian', true], ['Kemar', true]]);
    expect(again.last('joined')!.slot).toBe(0);
  });
  it('passes the host role on if the host is gone for over a minute, and Leave frees a seat', () => {
    const lobby = new Lobby(); const a = new Phone(), b = new Phone(), c = new Phone();
    lobby.handle(a, { t: 'create', name: 'A', v: V });
    const code = a.last('joined')!.code;
    lobby.handle(b, { t: 'join', code, name: 'B', v: V });
    lobby.handle(c, { t: 'join', code, name: 'C', v: V });
    lobby.drop(a);
    run(lobby, 70);
    expect(b.last('lobby')!.lobby.host).toBe(0); // a minute isn't enough: the host is probably just sending the code
    lobby.handle(b, { t: 'start' });
    expect(b.last('error')?.msg).toContain('host');
    run(lobby, 240);
    expect(b.last('lobby')!.lobby.host).toBe(1);
    lobby.handle(b, { t: 'start' });
    expect(b.last('error')?.msg).toContain('Waiting for A');
    lobby.handle(c, { t: 'leave' });
    expect(b.last('lobby')!.lobby.players.map((p) => p.name)).toEqual(['A', 'B']);
  });
  it('frees a seat after 10 minutes away in the lobby, and deletes an empty room after 10 minutes', () => {
    const lobby = new Lobby(); const a = new Phone(), b = new Phone();
    lobby.handle(a, { t: 'create', name: 'A', v: V });
    const code = a.last('joined')!.code;
    lobby.handle(b, { t: 'join', code, name: 'B', v: V });
    lobby.drop(b);
    run(lobby, 610);
    expect(a.last('lobby')!.lobby.players.map((p) => p.name)).toEqual(['A']);
    lobby.drop(a);
    run(lobby, 610);
    expect(lobby.rooms.has(code)).toBe(false);
  });
});

describe('server restarts', () => {
  it('rebuilds a running game from a phone\'s save when the server restarts, with the same code and seats', () => {
    const { lobby, phones, room, code, start } = setup(3);
    start();
    run(lobby, 20);
    const tokens = phones.map((p) => p.last('joined')!.token);
    // what each phone keeps: the latest seat list and a snapshot of its game
    const save: RoomSave = { lobby: phones[1].last('lobby')!.lobby, snap: snapshot(phones[1].state!), at: Date.now() };
    const tick = room.state!.tick;
    // Render redeploys: every connection drops and the new server knows nothing
    const fresh = new Lobby();
    const b = new Phone();
    fresh.handle(b, { t: 'join', code, name: 'Friend 1', token: tokens[1], v: V });
    expect(b.last('error')).toMatchObject({ gone: true });
    b.inbox = [];
    fresh.handle(b, { t: 'revive', code, name: 'Friend 1', token: tokens[1], v: V, save });
    expect(b.last('error')).toBeUndefined();
    expect(b.me).toBe('p2');
    expect(fresh.rooms.get(code)!.state!.tick).toBe(tick);
    // the others come back with their own tokens and get their own seats
    const a = new Phone(), c = new Phone();
    fresh.handle(a, { t: 'join', code, name: 'Damian', token: tokens[0], v: V });
    fresh.handle(c, { t: 'revive', code, name: 'Friend 2', token: tokens[2], v: V, save }); // a second rebuild just joins
    expect([a.me, c.me]).toEqual(['p1', 'p3']);
    const info = a.last('lobby')!.lobby;
    expect(info.host).toBe(0);
    expect(info.players.map((p) => [p.name, p.connected])).toEqual([['Damian', true], ['Friend 1', true], ['Friend 2', true]]);
    run(fresh, 10);
    const h = stateHash(fresh.rooms.get(code)!.state!);
    for (const ph of [a, b, c]) expect(stateHash(ph.state!)).toBe(h);
    // a stranger can't take a seat, or rebuild a room with a made-up save
    const x = new Phone();
    fresh.handle(x, { t: 'join', code, name: 'X', token: 'nope', v: V });
    expect(x.last('error')?.msg).toContain('already started');
    const y = new Phone();
    fresh.handle(y, { t: 'revive', code: 'QQQQQ', name: 'Y', token: 'mine', v: V, save });
    expect(y.last('error')?.msg).toContain('No game');
    expect(fresh.rooms.has('QQQQQ')).toBe(false);
  });
  it('rebuilds a lobby too, and the caretaker takes over seats nobody comes back to', () => {
    const { lobby, phones, code } = setup(2);
    const tokens = phones.map((p) => p.last('joined')!.token);
    const save: RoomSave = { lobby: phones[0].last('lobby')!.lobby, at: Date.now() };
    void lobby;
    const fresh = new Lobby(), a = new Phone();
    fresh.handle(a, { t: 'revive', code, name: 'Damian', token: tokens[0], v: V, save });
    expect(a.last('lobby')!.lobby.players.map((p) => [p.name, p.connected])).toEqual([['Damian', true], ['Friend 1', false]]);
    const b = new Phone();
    fresh.handle(b, { t: 'join', code, name: 'Friend 1', token: tokens[1], v: V });
    fresh.handle(a, { t: 'start' });
    expect(a.me).toBe('p1'); expect(b.me).toBe('p2');
  });
  it('turns a damaged save away', () => {
    const fresh = new Lobby(), a = new Phone();
    fresh.handle(a, { t: 'revive', code: 'ABCDE', name: 'A', token: 't', v: V, save: { lobby: { players: [] }, at: 0 } as unknown as RoomSave });
    expect(a.last('error')?.msg).toContain('damaged');
    expect(fresh.rooms.size).toBe(0);
  });
});
