/** Game constants and content definitions. Tune balance here. */
export const W = 52, H = 66;
/** Simulation step in seconds. The sim always advances in fixed steps so every machine computes the same game. */
export const DT = 0.1;
export const CARRY = 10, SPEED = 2.4, TRAIN = 12, AGE_T = 40, SEA_R = 5, WIN_N = 6, MAX_PLAYERS = 4;

export type Res = 'food' | 'water' | 'stone' | 'bbd';
export const RES: Res[] = ['food', 'water', 'stone', 'bbd'];
export type Cost = Partial<Record<Res, number>>;

export type NodeType = 'tree' | 'fish' | 'rock' | 'spring';
export const NT: Record<NodeType, { label: string; res: Res; rate: number; max: number }> = {
  tree: { label: 'Breadfruit tree', res: 'food', rate: 0.9, max: 120 },
  fish: { label: 'Flying fish', res: 'food', rate: 0.8, max: 200 },
  rock: { label: 'Coral stone', res: 'stone', rate: 0.75, max: 250 },
  spring: { label: 'Spring', res: 'water', rate: 1, max: Number.POSITIVE_INFINITY },
};

export type BType = 'tc' | 'house' | 'farm' | 'depot' | 'cistern' | 'seawall' | 'market' | 'aqua' | 'solar' | 'hq';
export interface BDef { name: string; w: number; h: number; cost: Cost; hp: number; pop?: number; drop?: boolean; coast?: boolean; age?: number; build: number; desc: string }
export const BT: Record<BType, BDef> = {
  tc: { name: 'Town Centre', w: 2, h: 2, cost: {}, hp: 1200, pop: 5, drop: true, build: 1, desc: 'Trains workers and takes drop-offs. Advance your age here.' },
  house: { name: 'Chattel House', w: 1, h: 1, cost: { stone: 40 }, hp: 200, pop: 5, build: 10, desc: '+5 population.' },
  farm: { name: 'Farm Plot', w: 1, h: 1, cost: { stone: 50 }, hp: 150, build: 10, desc: 'One worker grows food here forever. Uses a little water.' },
  depot: { name: 'Co-op Depot', w: 1, h: 1, cost: { stone: 60 }, hp: 300, drop: true, build: 14, desc: 'Workers drop off resources here, so trips are shorter.' },
  cistern: { name: 'Cistern', w: 1, h: 1, cost: { stone: 50, bbd: 20 }, hp: 250, build: 12, desc: 'Catches rain: +0.5 water/s. Dry in a drought.' },
  seawall: { name: 'Seawall', w: 1, h: 1, cost: { stone: 80 }, hp: 600, coast: true, build: 16, desc: 'Shields buildings within 5 tiles from hurricanes. Coast tiles only.' },
  market: { name: 'Market', w: 1, h: 1, cost: { stone: 80 }, hp: 350, build: 18, desc: 'Sell surplus food and stone at the best prices, or truck in water.' },
  aqua: { name: 'Aquaponics', w: 1, h: 1, age: 2, cost: { stone: 120, bbd: 80 }, hp: 300, build: 22, desc: 'Fish and greens together: +2 food/s, uses 0.5 water/s. Half speed without solar nearby.' },
  solar: { name: 'Solar Array', w: 1, h: 1, age: 2, cost: { stone: 60, bbd: 100 }, hp: 200, build: 14, desc: 'Powers aquaponics within 5 tiles.' },
  hq: { name: 'AgroCorp HQ', w: 2, h: 2, cost: {}, hp: 9999, build: 1, desc: '' },
};
export const BUILD_LIST: BType[] = ['house', 'farm', 'depot', 'cistern', 'seawall', 'market', 'aqua', 'solar'];
export const AGE_COST: Cost = { food: 400, water: 150, stone: 200, bbd: 150 };
export const TRAIN_COST: Cost = { food: 50 };
export const START_RES: Record<Res, number> = { food: 200, water: 100, stone: 120, bbd: 100 };
/** Food each worker eats per second (6 a minute). */
export const EAT = 0.1;
/** BBD per second each parish you feed pays in co-op dues. */
export const DUES = 0.5;
/** Selling at the Town Centre's roadside stall: always available, worse rate than the Market. */
export const STALL = { food: 50, bbd: 20 };

export type Difficulty = 'easy' | 'normal' | 'hard';
/**
 * AgroCorp tuning. grace: seconds before it starts spending. rate: income multiplier.
 * growth: extra income per parish it holds. warnAt: share of the price saved before it announces its target.
 */
export const DIFFICULTY: Record<Difficulty, { label: string; grace: number; rate: number; growth: number; warnAt: number }> = {
  easy: { label: 'Easy', grace: 360, rate: 0.55, growth: 0.15, warnAt: 0.6 },
  normal: { label: 'Normal', grace: 240, rate: 0.8, growth: 0.2, warnAt: 0.7 },
  hard: { label: 'Hard', grace: 120, rate: 1.1, growth: 0.25, warnAt: 0.8 },
};

export const HNAMES = ['Arlo', 'Bree', 'Cosmo', 'Della', 'Ezra', 'Fern', 'Gus', 'Hana', 'Ivo', 'Jules'];

/** Parish indexes follow the order in barbados.json. */
export const P = { LUCY: 0, PETER: 1, ANDREW: 2, JAMES: 3, JOSEPH: 4, THOMAS: 5, JOHN: 6, GEORGE: 7, MICHAEL: 8, PHILIP: 9, CHRIST: 10 } as const;
export const AGRO_HOME = P.LUCY;
/** Start parishes for 1, 2, 3 and 4 players, spread around the island. */
export const START_PARISHES: number[][] = [[P.MICHAEL], [P.MICHAEL, P.PHILIP], [P.MICHAEL, P.PHILIP, P.ANDREW], [P.MICHAEL, P.PHILIP, P.ANDREW, P.JAMES]];
export const PLAYER_COLORS = ['#FFC726', '#3FD0C9', '#FF7AC8', '#A7E04B'];
export const AGRO = 'agro';

export function canAfford(res: Record<Res, number>, c: Cost): boolean { return (Object.keys(c) as Res[]).every((k) => res[k] >= (c[k] ?? 0)); }
export function pay(res: Record<Res, number>, c: Cost): void { (Object.keys(c) as Res[]).forEach((k) => (res[k] -= c[k] ?? 0)); }
export function fmtCost(c: Cost): string {
  const e = Object.entries(c) as [Res, number][];
  return e.length ? e.map(([k, v]) => `${v} ${k === 'bbd' ? 'BBD' : k}`).join(' · ') : 'Free';
}
