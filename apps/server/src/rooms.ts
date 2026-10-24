import { randomBytes, randomInt } from 'node:crypto';
import {
  AI_AFTER_S, AI_EVERY, CODE_LEN, DIFFICULTY, DT, MAX_PLAYERS, PLAYER_COLORS, PROTOCOL, applyCommand, caretaker, createGame, snapshot, stateHash, step,
  type ClientMsg, type Command, type Difficulty, type LobbyInfo, type Mode, type ServerMsg, type State,
} from '@bim/sim';

/** A connection as the room sees it. The WebSocket server wraps real sockets in this. */
export interface Conn { send(m: ServerMsg): void; close(): void }

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, L or O: easy to read out loud
const HASH_EVERY = 50;
const PAUSE_LIMIT = 3, PAUSE_MAX_S = 60;
const IDLE_ROOM_MS = 10 * 60 * 1000;
const LOBBY_SEAT_MS = 10 * 60 * 1000, HOST_HANDOVER_MS = 60 * 1000;
const MAX_CMDS_PER_TICK = 25;

interface Slot { name: string; token: string; conn: Conn | null; pauses: number; lastSeen: number; awaySince: number; ai: boolean }

export class Room {
  code: string;
  slots: Slot[] = [];
  host = 0;
  mode: Mode = 'coop';
  difficulty: Difficulty = 'normal';
  state: State | null = null;
  private pending: [string, Command][] = [];
  private perTick = new Map<string, number>();
  private hashes = new Map<number, string>();
  paused = false;
  private pausedBy = '';
  private pausedAt = 0;
  private acc = 0;
  private last = Date.now();
  emptySince = 0;

  constructor(code: string) { this.code = code; }

  get started() { return !!this.state; }
  pid(slot: number) { return `p${slot + 1}`; }
  lobby(): LobbyInfo {
    return {
      code: this.code, host: this.host, mode: this.mode, difficulty: this.difficulty, started: this.started,
      players: this.slots.map((s, k) => ({ slot: k, name: s.name, color: PLAYER_COLORS[k], connected: !!s.conn, ai: s.ai })),
    };
  }
  broadcast(m: ServerMsg) { for (const s of this.slots) s.conn?.send(m); }
  private sendLobby() { this.broadcast({ t: 'lobby', lobby: this.lobby() }); }

  /** Adds a new player, or reconnects an existing one by token. Returns the slot, or an error message. */
  join(conn: Conn, name: string, token?: string): number | string {
    const back = token ? this.slots.findIndex((s) => s.token === token) : -1;
    if (back >= 0) {
      const s = this.slots[back];
      s.conn?.close(); s.conn = conn; s.lastSeen = Date.now(); s.ai = false; s.awaySince = 0; this.emptySince = 0;
      conn.send({ t: 'joined', code: this.code, slot: back, token: s.token });
      this.sendLobby();
      if (this.state) conn.send({ t: 'start', snap: snapshot(this.state), you: this.pid(back) });
      if (this.paused) conn.send({ t: 'paused', paused: true, by: this.pausedBy });
      return back;
    }
    if (this.started) return 'That game has already started. Ask the host for a new code.';
    if (this.slots.length >= MAX_PLAYERS) return `That game is full (${MAX_PLAYERS} players).`;
    const slot: Slot = { name: cleanName(name, this.slots.length), token: randomBytes(12).toString('hex'), conn, pauses: 0, lastSeen: Date.now(), awaySince: 0, ai: false };
    this.slots.push(slot); this.emptySince = 0;
    const k = this.slots.length - 1;
    conn.send({ t: 'joined', code: this.code, slot: k, token: slot.token });
    this.sendLobby();
    return k;
  }

  /**
   * A connection closed. Phones drop their connection whenever the browser goes to the background (say, to send the
   * code on WhatsApp), so the seat is kept and the player can come straight back. Only tapping Leave in the lobby
   * gives the seat up.
   */
  disconnect(conn: Conn, leaving = false) {
    const k = this.slots.findIndex((s) => s.conn === conn); if (k < 0) return;
    if (!this.started && leaving) this.removeSeat(k);
    // -1 means 'just left': the next update stamps the time from the room's own clock
    else { this.slots[k].conn = null; this.slots[k].awaySince = -1; }
    if (!this.slots.some((s) => s.conn)) this.emptySince = -1;
    this.sendLobby();
  }
  private removeSeat(k: number) {
    this.slots.splice(k, 1);
    if (this.host === k) this.host = 0; else if (this.host > k) this.host--;
  }

  message(conn: Conn, m: ClientMsg) {
    const k = this.slots.findIndex((s) => s.conn === conn); if (k < 0) return;
    const slot = this.slots[k]; slot.lastSeen = Date.now();
    const err = (msg: string) => conn.send({ t: 'error', msg });
    switch (m.t) {
      case 'settings':
        if (k !== this.host) return err('Only the host can change the settings.');
        if (this.started) return;
        if (m.mode === 'coop' || m.mode === 'versus') this.mode = m.mode;
        if (m.difficulty && m.difficulty in DIFFICULTY) this.difficulty = m.difficulty;
        this.sendLobby(); return;
      case 'start': {
        if (k !== this.host) return err('Only the host can start the game.');
        if (this.started) return;
        if (this.mode === 'versus' && this.slots.length < 2) return err('Versus needs at least 2 players.');
        this.state = createGame({ seed: randomInt(1, 2 ** 31 - 1), mode: this.mode, difficulty: this.difficulty, players: this.slots.map((s) => ({ name: s.name })) });
        const snap = snapshot(this.state);
        this.slots.forEach((s, j) => s.conn?.send({ t: 'start', snap, you: this.pid(j) }));
        this.sendLobby();
        this.last = Date.now(); this.acc = 0;
        return;
      }
      case 'cmd': {
        if (!this.state || this.state.ended) return;
        const pid = this.pid(k), n = (this.perTick.get(pid) ?? 0) + 1;
        if (n > MAX_CMDS_PER_TICK) return;
        this.perTick.set(pid, n);
        if (m.c && typeof m.c === 'object' && typeof (m.c as { type?: unknown }).type === 'string') this.pending.push([pid, m.c]);
        return;
      }
      case 'hash': {
        const ours = this.hashes.get(m.tick);
        if (ours && ours !== m.h && this.state) conn.send({ t: 'snap', snap: snapshot(this.state) });
        return;
      }
      case 'pause': {
        if (!this.state) return;
        if (this.paused) { this.setPaused(false, slot.name); return; }
        if (slot.pauses >= PAUSE_LIMIT) return err(`You've used all ${PAUSE_LIMIT} of your pauses.`);
        slot.pauses++; this.setPaused(true, slot.name); return;
      }
      case 'leave': this.disconnect(conn, true); return;
    }
  }

  private setPaused(p: boolean, by: string) {
    this.paused = p; this.pausedBy = by; this.pausedAt = Date.now();
    this.broadcast({ t: 'paused', paused: p, by });
    this.last = Date.now(); this.acc = 0;
  }

  /** Called often by the server loop. Runs as many 0.1 s ticks as real time calls for (at most 5 at once). */
  /** The time as the room's update loop last saw it (lets tests drive a fake clock). */
  private clock = Date.now();
  update(now: number) {
    this.clock = now;
    for (const sl of this.slots) if (sl.awaySince === -1) sl.awaySince = now;
    if (this.emptySince === -1) this.emptySince = now;
    if (!this.state) { this.lobbyUpkeep(now); return; }
    if (this.state.ended) return;
    // hand away players' co-ops to the caretaker after a while
    let changed = false;
    for (const sl of this.slots) if (!sl.conn && !sl.ai && sl.awaySince > 0 && now - sl.awaySince > AI_AFTER_S * 1000) { sl.ai = true; changed = true; }
    if (changed) this.sendLobby();
    if (this.paused) { if (now - this.pausedAt > PAUSE_MAX_S * 1000) this.setPaused(false, 'the timer'); return; }
    this.acc += now - this.last; this.last = now;
    let n = 0;
    while (this.acc >= DT * 1000 && n < 5) { this.tick(); this.acc -= DT * 1000; n++; }
    if (n === 5) this.acc = 0;
  }
  private tick() {
    const s = this.state!, cmds = this.pending; this.pending = []; this.perTick.clear();
    // the caretaker's moves go out with everyone else's, so every phone applies exactly the same commands
    if ((s.tick + 1) % AI_EVERY === 0) this.slots.forEach((sl, k) => { if (sl.ai) for (const c of caretaker(s, this.pid(k))) cmds.push([this.pid(k), c]); });
    for (const [pid, c] of cmds) { try { applyCommand(s, pid, c); } catch { /* a malformed command changes nothing */ } }
    step(s);
    this.broadcast({ t: 'tick', n: s.tick, cmds });
    if (s.tick % HASH_EVERY === 0) {
      this.hashes.set(s.tick, stateHash(s));
      for (const t of this.hashes.keys()) if (t < s.tick - HASH_EVERY * 20) this.hashes.delete(t);
    }
  }
  idleFor(now: number) { return this.emptySince > 0 ? now - this.emptySince : 0; }
  /** In the lobby: free seats of players gone for 10 minutes, and pass the host role on if the host has been gone a minute. */
  private lobbyUpkeep(now: number) {
    let changed = false;
    for (let k = this.slots.length - 1; k >= 0; k--) {
      const sl = this.slots[k];
      if (!sl.conn && sl.awaySince > 0 && now - sl.awaySince > LOBBY_SEAT_MS && this.slots.some((o) => o.conn)) { this.removeSeat(k); changed = true; }
    }
    const h = this.slots[this.host];
    if (h && !h.conn && h.awaySince > 0 && now - h.awaySince > HOST_HANDOVER_MS) {
      const next = this.slots.findIndex((o) => o.conn);
      if (next >= 0) { this.host = next; changed = true; }
    }
    if (changed) this.sendLobby();
  }
}

function cleanName(name: unknown, k: number): string {
  const n = typeof name === 'string' ? name.replace(/[^\p{L}\p{N} '._-]/gu, '').trim().slice(0, 16) : '';
  return n || `Player ${k + 1}`;
}

export class Lobby {
  rooms = new Map<string, Room>();
  private byConn = new Map<Conn, Room>();

  newCode(): string {
    for (let tries = 0; tries < 50; tries++) {
      let c = ''; for (let k = 0; k < CODE_LEN; k++) c += ALPHABET[randomInt(ALPHABET.length)];
      if (!this.rooms.has(c)) return c;
    }
    throw new Error('No free room codes');
  }

  handle(conn: Conn, m: ClientMsg) {
    if (!m || typeof m !== 'object' || typeof (m as { t?: unknown }).t !== 'string') return;
    if (m.t === 'create' || m.t === 'join') {
      if (m.v !== PROTOCOL) { conn.send({ t: 'error', msg: 'Your game is out of date. Reload the page.', fatal: true }); return; }
      this.byConn.get(conn)?.disconnect(conn);
      let room: Room | undefined;
      if (m.t === 'create') {
        if (this.rooms.size >= 500) { conn.send({ t: 'error', msg: 'The server is full right now. Try again soon.', fatal: true }); return; }
        room = new Room(this.newCode()); this.rooms.set(room.code, room);
      } else {
        room = this.rooms.get(String(m.code ?? '').toUpperCase().trim());
        if (!room) { conn.send({ t: 'error', msg: "No game with that code. Check the letters with the host.", fatal: true }); return; }
      }
      const r = room.join(conn, m.name, m.t === 'join' ? m.token : undefined);
      if (typeof r === 'string') { conn.send({ t: 'error', msg: r, fatal: true }); if (!room.slots.length) this.rooms.delete(room.code); return; }
      this.byConn.set(conn, room);
      return;
    }
    this.byConn.get(conn)?.message(conn, m);
  }
  drop(conn: Conn) { this.byConn.get(conn)?.disconnect(conn); this.byConn.delete(conn); }

  update(now: number) {
    for (const [code, r] of this.rooms) {
      r.update(now);
      const empty = !r.slots.length || (!r.slots.some((s) => s.conn) && r.idleFor(now) > IDLE_ROOM_MS);
      if (empty) this.rooms.delete(code);
    }
  }
}
