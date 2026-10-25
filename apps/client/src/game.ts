import { DT, applyCommand, createGame, rivalCoop, step, type CmdResult, type Command, type Difficulty, type GameEvent, type Mode, type State } from '@bim/sim';

/**
 * The client talks to a game through this interface. LocalGame runs the simulation in the browser;
 * the multiplayer step adds a NetworkGame that sends commands to the server and receives state.
 */
export interface GameSession {
  readonly state: State;
  readonly me: string;
  send(c: Command): CmdResult;
  /** 0..1 progress into the next sim step, for smooth movement between steps. */
  readonly alpha: number;
  prevPos(id: number): { x: number; y: number } | undefined;
  advance(dtSeconds: number): void;
  newEvents(): GameEvent[];
  paused: boolean;
  /** True for online games, where pausing is shared and limited. */
  readonly online?: boolean;
  /** Online only: whether another player is connected right now. */
  connected?(pid: string): boolean;
  /** Online only: whether the computer is looking after a player's co-op. */
  caretaken?(pid: string): boolean;
  /** Solo: whether a player is a computer co-op. */
  isBot?(pid: string): boolean;
}

/** Names for the computer co-ops in a solo game: towns around the island. */
export const BOT_NAMES = ['Oistins Co-op', 'Holetown Co-op', 'Bathsheba Co-op'];
/** How often a computer co-op thinks, in ticks (3 s). */
const BOT_EVERY = 30;

export class LocalGame implements GameSession {
  state: State;
  me = 'p1';
  paused = false;
  private acc = 0;
  private prev = new Map<number, { x: number; y: number }>();
  private lastSeq = 0;

  /** Player ids run by the computer. */
  readonly bots: string[];
  /**
   * A game in this browser. With computer co-ops it's a race (versus): they gather, build, advance and feed parishes
   * like a player would, and AgroCorp is still after everyone's land.
   */
  constructor(opts: { seed?: number; mode?: Mode; players?: number; difficulty?: Difficulty; bots?: number } = {}) {
    const bots = Math.max(0, Math.min(3, opts.bots ?? 0)), n = bots ? 1 + bots : opts.players ?? 1;
    this.state = createGame({
      seed: opts.seed ?? (Date.now() % 2147483647), mode: bots ? 'versus' : opts.mode ?? 'coop', difficulty: opts.difficulty ?? 'normal',
      players: Array.from({ length: n }, (_, k) => ({ name: k === 0 ? 'You' : bots ? BOT_NAMES[k - 1] : `Player ${k + 1}` })),
    });
    this.bots = bots ? this.state.players.slice(1).map((p) => p.id) : [];
  }
  isBot(pid: string) { return this.bots.includes(pid); }
  get alpha() { return Math.min(1, this.acc / DT); }
  send(c: Command): CmdResult { return applyCommand(this.state, this.me, c); }
  prevPos(id: number) { return this.prev.get(id); }
  advance(dt: number) {
    if (this.paused || this.state.ended) return;
    this.acc += Math.min(dt, 0.25);
    let n = 0;
    while (this.acc >= DT && n < 6) {
      this.prev.clear();
      for (const w of Object.values(this.state.workers)) this.prev.set(w.id, { x: w.x, y: w.y });
      // each computer co-op thinks every 3 s, on its own beat
      this.bots.forEach((pid, k) => {
        if ((this.state.tick + k * 10) % BOT_EVERY) return;
        for (const c of rivalCoop(this.state, pid)) { try { applyCommand(this.state, pid, c); } catch { /* skip a bad move */ } }
      });
      step(this.state); this.acc -= DT; n++;
    }
    if (n === 6) this.acc = 0;
  }
  newEvents(): GameEvent[] {
    const out = this.state.events.filter((e) => e.seq > this.lastSeq && (!e.to || e.to === this.me));
    if (this.state.events.length) this.lastSeq = this.state.events[this.state.events.length - 1].seq;
    return out;
  }
}
