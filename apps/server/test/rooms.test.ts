import { describe, expect, it } from 'vitest';
import { applyCommand, restore, stateHash, step, workersOf, type ServerMsg, type State } from '@bim/sim';
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
const V = 1;
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
