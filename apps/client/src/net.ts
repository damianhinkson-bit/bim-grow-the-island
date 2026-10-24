import {
  DT, PROTOCOL, applyCommand, restore, snapshot, stateHash, step,
  type ClientMsg, type CmdResult, type Command, type GameEvent, type LobbyInfo, type RoomSave, type ServerMsg, type State,
} from '@bim/sim';
import type { GameSession } from './game';

const HASH_EVERY = 50;
/** How often (in ticks) the phone saves the game, so the room survives a server restart: every 5 s. */
const SAVE_EVERY = 50;
/** Saves older than this aren't offered to rebuild a room. */
const SAVE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Where the game server lives: the same host that served this page (Vite's dev server proxies /ws to it). */
export function serverUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* storage blocked or full */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};
/** In memory too, in case storage is blocked or full: a server restart mid-game is the common case. */
const memSaves = new Map<string, RoomSave>();
function loadSave(code: string): RoomSave | null {
  let sv = memSaves.get(code) ?? null;
  if (!sv) { try { sv = JSON.parse(store.get(`bim:save:${code}`) ?? 'null'); } catch { sv = null; } }
  return sv && Date.now() - sv.at < SAVE_MAX_AGE_MS ? sv : null;
}

export interface NetHandlers {
  lobby(l: LobbyInfo, mySlot: number): void;
  started(g: NetworkGame): void;
  error(msg: string, fatal: boolean): void;
  status(msg: string | null): void;
  result(r: CmdResult): void;
  paused(p: boolean, by: string): void;
  presence(name: string, connected: boolean): void;
  caretaker(name: string): void;
}

/**
 * An online game. The server sends one message per 0.1 s tick with everyone's commands; this plays them in order on
 * the local copy of the game, exactly as the server and every other phone do.
 */
export class NetworkGame implements GameSession {
  state!: State;
  me = '';
  readonly online = true;
  code = '';
  slot = -1;
  lobbyInfo: LobbyInfo | null = null;
  private token = '';
  private ws: WebSocket | null = null;
  private queue: Extract<ServerMsg, { t: 'tick' }>[] = [];
  private acc = 0;
  private prev = new Map<number, { x: number; y: number }>();
  private lastSeq = 0;
  private serverPaused = false;
  private closing = false;
  private retries = 0;

  constructor(private h: NetHandlers, private name: string) {}

  get started() { return !!this.state; }
  /** Whether a player (by id like 'p2') is connected right now. */
  connected(pid: string): boolean {
    const slot = Number(pid.slice(1)) - 1;
    return this.lobbyInfo?.players.find((p) => p.slot === slot)?.connected ?? true;
  }
  /** Whether the caretaker is running a player's co-op. */
  caretaken(pid: string): boolean {
    const slot = Number(pid.slice(1)) - 1;
    return this.lobbyInfo?.players.find((p) => p.slot === slot)?.ai ?? false;
  }
  get alpha() { return Math.min(1, this.acc / DT); }
  get paused() { return this.serverPaused; }
  set paused(_v: boolean) { this.raw({ t: 'pause' }); }

  create() { this.open(() => this.raw({ t: 'create', name: this.name, v: PROTOCOL })); }
  join(code: string) {
    this.code = code.toUpperCase().trim();
    this.token = store.get(`bim:token:${this.code}`) ?? '';
    this.open(() => this.raw({ t: 'join', code: this.code, name: this.name, token: this.token || undefined, v: PROTOCOL }));
  }
  settings(m: Partial<Pick<LobbyInfo, 'mode' | 'difficulty'>>) { this.raw({ t: 'settings', ...m }); }
  startGame() { this.raw({ t: 'start' }); }
  leave() {
    this.closing = true; clearTimeout(this.retryTimer); document.removeEventListener('visibilitychange', this.onVisible);
    this.raw({ t: 'leave' }); this.ws?.close();
    if (this.code) { store.del(`bim:token:${this.code}`); store.del(`bim:save:${this.code}`); memSaves.delete(this.code); }
  }

  send(c: Command): CmdResult {
    // commands take effect on the next server tick; the outcome arrives through handlers.result
    this.raw({ t: 'cmd', c });
    return { ok: true };
  }
  prevPos(id: number) { return this.prev.get(id); }
  newEvents(): GameEvent[] {
    if (!this.state) return [];
    const out = this.state.events.filter((e) => e.seq > this.lastSeq && (!e.to || e.to === this.me));
    if (this.state.events.length) this.lastSeq = this.state.events[this.state.events.length - 1].seq;
    return out;
  }

  /** Plays queued ticks at real-time pace, catching up quickly if several are waiting (e.g. after a hiccup). */
  advance(dt: number) {
    if (!this.state) return;
    this.acc += Math.min(dt, 0.25);
    let n = 0;
    const backlog = () => this.queue.length > 3;
    while (this.queue.length && (this.acc >= DT || backlog()) && n < 20) {
      this.applyTick(this.queue.shift()!);
      this.acc = Math.max(0, this.acc - DT); n++;
    }
    // never run ahead of the server: without a tick to play, hold at the end of the current step
    if (!this.queue.length) this.acc = Math.min(this.acc, DT);
  }

  private applyTick(m: Extract<ServerMsg, { t: 'tick' }>) {
    const s = this.state;
    if (m.n <= s.tick) return; // already covered by a snapshot
    this.prev.clear();
    for (const w of Object.values(s.workers)) this.prev.set(w.id, { x: w.x, y: w.y });
    for (const [pid, c] of m.cmds) {
      let r: CmdResult;
      try { r = applyCommand(s, pid, c); } catch { r = { ok: false }; }
      if (pid === this.me && (r.msg || !r.ok)) this.h.result(r);
    }
    step(s);
    if (s.tick % HASH_EVERY === 0) this.raw({ t: 'hash', tick: s.tick, h: stateHash(s) });
    if (s.tick % SAVE_EVERY === 0) this.save();
  }

  /** Keeps a copy of the room (seats, settings and, once started, the game) to rebuild it if the server restarts. */
  private save() {
    if (!this.code || !this.lobbyInfo) return;
    const sv: RoomSave = { lobby: this.lobbyInfo, snap: this.state ? snapshot(this.state) : undefined, at: Date.now() };
    memSaves.set(this.code, sv);
    store.set(`bim:save:${this.code}`, JSON.stringify(sv));
  }
  private revived = false;

  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private rejoin() { this.open(() => this.raw({ t: 'join', code: this.code, name: this.name, token: this.token, v: PROTOCOL })); }
  /** When the player switches back to the browser, reconnect at once instead of waiting for the next retry. */
  private onVisible = () => {
    if (document.visibilityState !== 'visible' || this.closing || !this.code || !this.token) return;
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) { clearTimeout(this.retryTimer); this.retries = 0; this.rejoin(); }
  };
  private open(first: () => void) {
    document.removeEventListener('visibilitychange', this.onVisible);
    document.addEventListener('visibilitychange', this.onVisible);
    this.closing = false;
    let ws: WebSocket;
    try { ws = new WebSocket(serverUrl()); } catch { this.h.error("Couldn't reach the game server.", true); return; }
    this.ws = ws;
    ws.onopen = () => { this.retries = 0; this.h.status(null); first(); };
    ws.onmessage = (e) => { let m: ServerMsg; try { m = JSON.parse(String(e.data)); } catch { return; } this.onMsg(m); };
    ws.onclose = () => {
      if (this.ws !== ws || this.closing) return;
      // reconnect with our seat token; the server sends the current game back
      if (this.code && this.token && this.retries < 30) {
        this.retries++;
        // quiet in the lobby (it happens every time the phone switches apps); say so once a game is running
        if (this.state) this.h.status('Connection lost. Reconnecting…');
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => this.rejoin(), Math.min(5000, 800 * this.retries));
      } else if (!this.code) this.h.error("Couldn't reach the game server. Check your connection and try again.", true);
      else this.h.error('Lost the connection to the game.', true);
    };
  }
  private raw(m: ClientMsg) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }

  private onMsg(m: ServerMsg) {
    switch (m.t) {
      case 'joined':
        this.code = m.code; this.slot = m.slot; this.token = m.token; this.revived = false;
        store.set(`bim:token:${m.code}`, m.token);
        break;
      case 'lobby': {
        // during a game, lobby updates tell us who dropped out or came back
        const before = this.lobbyInfo;
        this.lobbyInfo = m.lobby;
        if (!this.state || m.lobby.players.some((p, k) => p.key !== before?.players[k]?.key)) this.save();
        if (this.state && before) for (const p of m.lobby.players) {
          const was = before.players.find((q) => q.slot === p.slot);
          if (!was || p.slot === this.slot) continue;
          if (was.connected !== p.connected) this.h.presence(p.name, p.connected);
          if (!was.ai && p.ai) this.h.caretaker(p.name);
        }
        this.h.lobby(m.lobby, this.slot);
        break;
      }
      case 'start': {
        const first = !this.state;
        this.state = restore(m.snap); this.me = m.you; this.queue = []; this.acc = 0;
        this.lastSeq = this.state.eventSeq;
        if (first) { this.h.started(this); if (this.state.tick > 30) this.h.status('The game started while you were away. You\'re in now.'); }
        break;
      }
      case 'tick': this.queue.push(m); break;
      case 'snap': this.state = restore(m.snap); this.queue = this.queue.filter((q) => q.n > this.state.tick); this.lastSeq = this.state.eventSeq; break;
      case 'paused': this.serverPaused = m.paused; this.h.paused(m.paused, m.by); break;
      case 'error': {
        // the server doesn't know our room: it probably restarted (it does on every update). Rebuild it from our save.
        const sv = m.gone && this.code && this.token && !this.revived ? loadSave(this.code) : null;
        if (sv) {
          this.revived = true;
          this.h.status(this.state ? 'The game server restarted. Picking up where you left off…' : null);
          this.raw({ t: 'revive', code: this.code, name: this.name, token: this.token, v: PROTOCOL, save: sv });
          break;
        }
        this.h.error(m.msg, !!m.fatal); if (m.fatal) { this.closing = true; this.ws?.close(); }
        break;
      }
    }
  }
}
