/** Game constants and content definitions. Tune balance here. */
export const W = 52, H = 66;
/** Simulation step in seconds. The sim always advances in fixed steps so every machine computes the same game. */
export const DT = 0.1;
export const CARRY = 10, SPEED = 2.4, TRAIN = 12, SEA_R = 5, WIN_N = 6, MAX_PLAYERS = 4;

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

export type BType = 'tc' | 'house' | 'farm' | 'depot' | 'cistern' | 'seawall' | 'market' | 'composter' | 'windbreak' | 'aqua' | 'solar' | 'hub' | 'hq' | 'port' | 'airport';
/**
 * Houses come in five kinds, one per age. A new house is built as the kind of your current age; older houses can be
 * upgraded one step at a time, each paid for. wind: 0 blows down easily, 1 handles high winds (half the hurricane
 * damage), 2 hurricane-proof. garden: food per second from the kitchen or rooftop garden.
 */
export interface HouseLevel { name: string; pop: number; cost: Cost; hp: number; wind: 0 | 1 | 2; garden: number; about: string }
export const HOUSES: HouseLevel[] = [
  { name: 'Thatch Hut', pop: 3, cost: { stone: 25 }, hp: 120, wind: 0, garden: 0, about: 'Wattle walls and a thatch roof. Quick to raise, easy to blow down.' },
  { name: 'Chattel House', pop: 5, cost: { stone: 40 }, hp: 200, wind: 1, garden: 0.04, about: 'Timber on coral-stone blocks, with a steep roof that rides out high winds.' },
  { name: 'Coral Stone House', pop: 8, cost: { stone: 70, bbd: 20 }, hp: 400, wind: 2, garden: 0.04, about: 'Thick walls of cut coral stone. Stands up to a hurricane.' },
  { name: 'Townhouse', pop: 15, cost: { stone: 110, bbd: 50 }, hp: 500, wind: 2, garden: 0.07, about: 'Two storeys of block and steel, with a rooftop garden.' },
  { name: 'Apartment Block', pop: 25, cost: { stone: 160, bbd: 100 }, hp: 700, wind: 2, garden: 0.12, about: 'Homes for a whole street, solar on the roof and greens growing on top.' },
];
/** The most people one co-op can house. */
export const POP_MAX = 60;

export interface BDef { name: string; w: number; h: number; cost: Cost; hp: number; pop?: number; drop?: boolean; coast?: boolean; age?: number; build: number; desc: string; landmark?: boolean }
export const BT: Record<BType, BDef> = {
  tc: { name: 'Town Centre', w: 2, h: 2, cost: {}, hp: 1200, pop: 5, drop: true, build: 1, desc: 'Trains workers and takes drop-offs. Advance your age here.' },
  house: { name: 'House', w: 1, h: 1, cost: { stone: 25 }, hp: 120, pop: 3, build: 10, desc: 'Homes for your workers. Built as the kind of house your age allows, and upgraded as you advance.' },
  farm: { name: 'Farm Plot', w: 1, h: 1, age: 2, cost: { stone: 50 }, hp: 150, build: 10, desc: 'One worker grows food here forever. Uses a little water.' },
  depot: { name: 'Co-op Depot', w: 1, h: 1, cost: { stone: 60 }, hp: 300, drop: true, build: 14, desc: 'Workers drop off resources here, so trips are shorter.' },
  cistern: { name: 'Cistern', w: 1, h: 1, age: 2, cost: { stone: 50, bbd: 20 }, hp: 250, build: 12, desc: 'Catches rain: +0.5 water/s. Dry in a drought.' },
  seawall: { name: 'Seawall', w: 1, h: 1, age: 2, cost: { stone: 80 }, hp: 600, coast: true, build: 16, desc: 'Shields buildings within 5 tiles from hurricanes. Coast tiles only.' },
  market: { name: 'Market', w: 1, h: 1, age: 2, cost: { stone: 80 }, hp: 350, build: 18, desc: 'Sell surplus food and stone at the best prices, or truck in water.' },
  aqua: { name: 'Aquaponics', w: 1, h: 1, age: 4, cost: { stone: 120, bbd: 80 }, hp: 300, build: 22, desc: 'Fish and greens together: +2 food/s, uses 0.5 water/s. Half speed without solar nearby.' },
  solar: { name: 'Solar Array', w: 1, h: 1, age: 4, cost: { stone: 60, bbd: 100 }, hp: 200, build: 14, desc: 'Powers aquaponics within 5 tiles.' },
  composter: { name: 'Composter', w: 1, h: 1, age: 3, cost: { stone: 40, bbd: 20 }, hp: 150, build: 10, desc: 'Turns crop waste into compost. Farm plots within 3 tiles grow 40% faster.' },
  windbreak: { name: 'Windbreak', w: 1, h: 1, age: 3, cost: { stone: 20, food: 30 }, hp: 250, build: 12, desc: 'A row of trees and bamboo. Shields buildings within 3 tiles from hurricanes, anywhere inland.' },
  hub: { name: 'Co-op Hub', w: 1, h: 1, age: 5, cost: { stone: 150, bbd: 150 }, hp: 500, drop: true, build: 24, desc: 'The co-op\'s distribution centre. Takes drop-offs and raises your co-op dues by half.' },
  hq: { name: 'AgroCorp HQ', w: 2, h: 2, cost: {}, hp: 9999, build: 1, desc: '' },
  port: { name: 'Bridgetown Port', w: 2, h: 2, cost: {}, hp: 9999, build: 1, landmark: true, desc: 'Ships export your surplus and bring in supplies. Fishing boats sail from here.' },
  airport: { name: 'Grantley Adams Airport', w: 2, h: 2, cost: {}, hp: 9999, build: 1, landmark: true, desc: 'Air freight pays top prices for fresh food. Tourists bring income to whoever holds Christ Church.' },
};
export const BUILD_LIST: BType[] = ['house', 'depot', 'farm', 'cistern', 'market', 'seawall', 'composter', 'windbreak', 'aqua', 'solar', 'hub'];
/**
 * The five ages. cost/time are what it takes to advance INTO that age (age 1 is where everyone starts).
 * Reaching the Co-op Age is required to win.
 */
export const AGES: { name: string; short: string; cost: Cost; time: number; unlocks: string }[] = [
  { name: 'Foraging Age', short: 'Foraging', cost: {}, time: 0, unlocks: 'Gathering, huts and depots.' },
  { name: 'Rain-fed Farming Age', short: 'Farming', cost: { food: 150, stone: 50 }, time: 20, unlocks: 'Chattel houses, farm plots, cisterns, the market and seawalls.' },
  { name: 'Recovery Age', short: 'Recovery', cost: { food: 300, water: 100, stone: 150, bbd: 80 }, time: 30, unlocks: 'Coral stone houses, and composters and windbreaks to repair worn-out land.' },
  { name: 'Sustainable Tech Age', short: 'Sustainable Tech', cost: { food: 400, water: 150, stone: 200, bbd: 150 }, time: 40, unlocks: 'Townhouses, aquaponics and solar power.' },
  { name: 'Co-op Age', short: 'Co-op', cost: { food: 600, water: 200, stone: 300, bbd: 300 }, time: 50, unlocks: 'Apartment blocks and the Co-op Hub. Reaching this age is needed to win.' },
];
export const MAX_AGE = AGES.length;
/** Windbreak shield radius and composter reach, in tiles. */
export const WINDBREAK_R = 3, COMPOST_R = 3, COMPOST_BONUS = 1.4, HUB_DUES = 1.5;
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

// ---------- roads, port and airport
/** Coral stone per road tile. */
export const ROAD_COST = 5;
/** Share of each port or airport deal's BBD that goes to whoever holds that parish. */
export const FEE = 0.1;
export const BOAT_COST: Cost = { stone: 60, bbd: 40 };
/** Food per second each fishing boat lands. */
export const BOAT_RATE = 0.4;
export const MAX_BOATS = 3;
/** BBD per second the airport's parish holder earns from tourists while the airport is open. */
export const TOURISM = 0.3;
/** Food each road-linked player gets from the relief ship after a hurricane. */
export const RELIEF = 80;
export type Landmark = 'port' | 'airport';
export type DealId = 'export-food' | 'export-stone' | 'import-food' | 'import-water' | 'airfreight';
export interface Deal { label: string; give: Cost; get: Cost }
export const DEALS: Record<Landmark, Partial<Record<DealId, Deal>>> = {
  port: {
    'export-food': { label: 'Export 100 food', give: { food: 100 }, get: { bbd: 60 } },
    'export-stone': { label: 'Export 100 stone', give: { stone: 100 }, get: { bbd: 50 } },
    'import-food': { label: 'Import 100 food', give: { bbd: 80 }, get: { food: 100 } },
    'import-water': { label: 'Import 100 water', give: { bbd: 40 }, get: { water: 100 } },
  },
  airport: {
    airfreight: { label: 'Air-freight 50 fresh food', give: { food: 50 }, get: { bbd: 45 } },
  },
};
