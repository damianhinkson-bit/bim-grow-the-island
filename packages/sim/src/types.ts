import type { BType, Difficulty, NodeType, Res } from './defs';

/** The island map (island view and parishes): identical for every game, derived from the real parish borders. */
export interface IslandMap {
  land: Uint8Array; coast: Uint8Array; pid: Int8Array; depth: Uint8Array; urban: Uint8Array; elev: Float32Array; scot: Float32Array;
  /** 1 where a real highway runs. */
  highway: Uint8Array;
}

/**
 * The towns map: every co-op's town and AgroCorp's estate side by side, the same in every game.
 * kind: 0 grass, 1 sand, 2 shallow sea, 3 deep sea, 4 hedge (the town's edge). land: walkable and buildable ground.
 * coast: shore tiles (sand next to the sea) where docks and seawalls go. town: which town slot a tile is in.
 * road: the dirt road into each town. depth: 1 shallow, 2 deep, 0 on land.
 */
export interface MapData { land: Uint8Array; coast: Uint8Array; depth: Uint8Array; kind: Uint8Array; town: Int8Array; road: Uint8Array }

/** town: the town slot the resource is in. */
export interface Node { id: number; type: NodeType; i: number; x: number; y: number; amt: number; max: number; town: number }

export interface Building {
  id: number; type: BType; x: number; y: number; w: number; h: number; owner: string;
  done: boolean; progress: number; hp: number; maxHp: number;
  queue: number; trainT: number; pest: number; worker: number | null; variant: number;
  /** Houses only: which kind of house it is, 1–5 (see HOUSES). Other buildings: 1. */
  lvl: number;
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
  /** slot: which town on the towns map is theirs. */
  slot: number;
  res: Record<Res, number>; age: number; ageT: number; stats: { food: number };
  /** True when the stockpile can't feed the workers: they then work at half speed. */
  hungry: boolean;
  /** Running totals since the game began, so the dashboard can show rates per minute. */
  flow: Flow;
}

export interface Flow { gain: Record<Res, number>; upkeep: Record<Res, number>; spent: Record<Res, number>; eaten: number }

/** tiles, lx, ly are on the island grid. stand: the co-op whose stand guards it from being bought or won over. */
export interface Parish { id: number; name: string; poly: number[]; owner: string | null; stand: string | null; tiles: number[]; adj: number[]; lx: number; ly: number }

/**
 * Something that happened. `to`: only that player sees it. `news`: a public headline about what someone else did,
 * with `who` (a player id or 'agro') and `at` (a tile to jump to).
 */
export interface GameEvent { seq: number; t: number; kind: 'info' | 'warn' | 'bad' | 'good'; msg: string; to?: string; news?: boolean; who?: string; at?: { x: number; y: number } }

export type Mode = 'coop' | 'versus';

/** A trade one player offers another: `from` gives `give`, receives `get`. Open until answered or 60 s pass. */
export interface Offer { id: number; from: string; to: string; give: Partial<Record<Res, number>>; get: Partial<Record<Res, number>>; t: number }

export interface Outcome { winners: string[]; reason: string }

export interface State {
  seed: number; rng: number; tick: number; time: number; mode: Mode; nextId: number;
  map: MapData;
  /** The island (for the island view and parishes); static like map. */
  island: IslandMap;
  parishes: Parish[];
  nodes: Node[];
  nodeAt: Int32Array; bAt: Int32Array;
  /** 0 none, 1 a town's dirt road, 2+k a path player k laid. Anyone can walk any path; paths are faster. */
  roads: Uint8Array;
  /** Bumps when roads change, so renderers redraw them. */
  roadVersion: number;
  buildings: Record<number, Building>;
  workers: Record<number, Worker>;
  players: Player[];
  difficulty: Difficulty;
  /** target: the parish AgroCorp is saving up to buy; warned: whether that has been announced. */
  agro: { bbd: number; target: number | null; warned: boolean; nextBuild: number };
  weather: { nextHurr: number; hurrWarned: boolean; nextDrought: number; droughtUntil: number; nextPest: number; stormT: number; hurrIdx: number };
  events: GameEvent[]; eventSeq: number;
  offers: Offer[];
  /** Bumps whenever parish ownership changes, so renderers know to redraw borders. */
  parishVersion: number;
  ended: Outcome | null;
  /** When the match ends (game seconds); the best town score wins then. */
  endsAt: number;
}
