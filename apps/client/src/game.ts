import { DT, applyCommand, createGame, step, type CmdResult, type Command, type Difficulty, type GameEvent, type Mode, type State } from '@bim/sim';

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
}

export class LocalGame implements GameSession {
  state: State;
  me = 'p1';
  paused = false;
  private acc = 0;
  private prev = new Map<number, { x: number; y: number }>();
  private lastSeq = 0;

  constructor(opts: { seed?: number; mode?: Mode; players?: number; difficulty?: Difficulty } = {}) {
    const n = opts.players ?? 1;
    this.state = createGame({ seed: opts.seed ?? (Date.now() % 2147483647), mode: opts.mode ?? 'coop', difficulty: opts.difficulty ?? 'normal', players: Array.from({ length: n }, (_, k) => ({ name: k === 0 ? 'You' : `Player ${k + 1}` })) });
  }
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
