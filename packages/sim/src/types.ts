import type { BType, Difficulty, NodeType, Res } from './defs';

/** Static map: identical for every game, derived from the real parish borders. */
export interface MapData {
  land: Uint8Array; coast: Uint8Array; pid: Int8Array; depth: Uint8Array; urban: Uint8Array; elev: Float32Array; scot: Float32Array;
  /** 1 where a real highway runs. */
  highway: Uint8Array;
}

/** pid: the parish the resource belongs to (for fish, the parish of the nearest shore). */
export interface Node { id: number; type: NodeType; i: number; x: number; y: number; amt: number; max: number; pid: number }

export interface Building {
  id: number; type: BType; x: number; y: number; w: number; h: number; owner: string;
  done: boolean; progress: number; hp: number; maxHp: number;
  queue: number; trainT: number; pest: number; worker: number | null; variant: number;
}

export type Goal = { k: 'tile'; i: number } | { k: 'rect'; x: number; y: number; w: number; h: number };
export type Task = { k: 'move' } | { k: 'gather'; n: number } | { k: 'build'; b: number } | { k: 'farm'; b: number };

export interface Worker {
  id: number; owner: string; x: number; y: number;
  path: number[] | null; goal: Goal | null; task: Task | null; phase: 'to' | 'work' | 'drop' | null;
  carry: Res | null; amt: number; dropB: number | null; working: boolean; face: number;
}

export interface Player {
  id: string; name: string; color: string; team: number; home: number;
  res: Record<Res, number>; age: number; ageT: number; stats: { food: number };
  /** True when the stockpile can't feed the workers: they then work at half speed. */
  hungry: boolean;
  /** Fishing boats based at the port. */
  boats: number;
  /** Running totals since the game began, so the dashboard can show rates per minute. */
  flow: Flow;
}

export interface Flow { gain: Record<Res, number>; upkeep: Record<Res, number>; spent: Record<Res, number>; eaten: number }

export interface Parish { id: number; name: string; poly: number[]; owner: string | null; tiles: number[]; adj: number[]; lx: number; ly: number }

export interface GameEvent { seq: number; t: number; kind: 'info' | 'warn' | 'bad' | 'good'; msg: string; to?: string }

export type Mode = 'coop' | 'versus';

/** A trade one player offers another: `from` gives `give`, receives `get`. Open until answered or 60 s pass. */
export interface Offer { id: number; from: string; to: string; give: Partial<Record<Res, number>>; get: Partial<Record<Res, number>>; t: number }

export interface Outcome { winners: string[]; reason: string }

export interface State {
  seed: number; rng: number; tick: number; time: number; mode: Mode; nextId: number;
  map: MapData;
  parishes: Parish[];
  nodes: Node[];
  nodeAt: Int32Array; bAt: Int32Array;
  /** 0 no road, 1 highway, 2 road a player built. Anyone can walk any road. */
  roads: Uint8Array;
  /** Bumps when roads change, so renderers redraw them. */
  roadVersion: number;
  buildings: Record<number, Building>;
  workers: Record<number, Worker>;
  players: Player[];
  difficulty: Difficulty;
  /** target: the parish AgroCorp is saving up to buy; warned: whether that has been announced. */
  agro: { bbd: number; target: number | null; warned: boolean };
  weather: { nextHurr: number; hurrWarned: boolean; nextDrought: number; droughtUntil: number; nextPest: number; stormT: number; hurrIdx: number };
  events: GameEvent[]; eventSeq: number;
  offers: Offer[];
  /** Bumps whenever parish ownership changes, so renderers know to redraw borders. */
  parishVersion: number;
  ended: Outcome | null;
}
