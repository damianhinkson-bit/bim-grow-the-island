import type { BType, NodeType, Res } from './defs';

/** Static map: identical for every game, derived from the real parish borders. */
export interface MapData {
  land: Uint8Array; coast: Uint8Array; pid: Int8Array; depth: Uint8Array; urban: Uint8Array; elev: Float32Array; scot: Float32Array;
}

export interface Node { id: number; type: NodeType; i: number; x: number; y: number; amt: number; max: number }

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
}

export interface Parish { id: number; name: string; poly: number[]; owner: string | null; tiles: number[]; adj: number[]; lx: number; ly: number }

export interface GameEvent { seq: number; t: number; kind: 'info' | 'warn' | 'bad' | 'good'; msg: string; to?: string }

export type Mode = 'coop' | 'versus';

export interface Outcome { winners: string[]; reason: string }

export interface State {
  seed: number; rng: number; tick: number; time: number; mode: Mode; nextId: number;
  map: MapData;
  parishes: Parish[];
  nodes: Node[];
  nodeAt: Int32Array; bAt: Int32Array;
  buildings: Record<number, Building>;
  workers: Record<number, Worker>;
  players: Player[];
  agro: { bbd: number };
  weather: { nextHurr: number; hurrWarned: boolean; nextDrought: number; droughtUntil: number; nextPest: number; stormT: number; hurrIdx: number };
  events: GameEvent[]; eventSeq: number;
  /** Bumps whenever parish ownership changes, so renderers know to redraw borders. */
  parishVersion: number;
  ended: Outcome | null;
}
