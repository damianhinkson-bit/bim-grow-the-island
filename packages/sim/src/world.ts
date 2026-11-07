import { H, TOWN, TOWN_COLS, TOWN_SLOTS, W } from './defs';
import type { MapData } from './types';

/** Top-left corner of a town slot in the world grid. */
export const townOrigin = (slot: number) => ({ x: (slot % TOWN_COLS) * TOWN, y: Math.floor(slot / TOWN_COLS) * TOWN });
/** Where each town's Town Centre (or AgroCorp's HQ) stands, in town-local tiles: 3x3, a little east of the middle. */
export const TC_LOCAL = { x: 16, y: 12 };
/** The dirt road comes in from the east edge along this row to the Town Centre. */
export const ROAD_ROW = 14;
/** The shore line's x (town-local) for row y: the sea is to the west of it, beach then grass to the east. */
export function shoreX(slot: number, y: number): number {
  return Math.round(5 + 1.6 * Math.sin(y * 0.33 + slot * 1.7) + 0.9 * Math.sin(y * 0.11 + slot * 2.9));
}

/**
 * Builds the towns map. Each town: sea to the west with a sandy beach, grass, a hedge round the other three sides,
 * and a dirt road in from the east to the Town Centre. The same for every game (it depends only on the slot).
 */
export function buildWorld(): MapData {
  const n = W * H;
  const land = new Uint8Array(n), coast = new Uint8Array(n), depth = new Uint8Array(n), kind = new Uint8Array(n).fill(3);
  const town = new Int8Array(n).fill(-1), road = new Uint8Array(n);
  for (let slot = 0; slot < TOWN_SLOTS; slot++) {
    const o = townOrigin(slot);
    for (let ly = 0; ly < TOWN; ly++) for (let lx = 0; lx < TOWN; lx++) {
      const i = (o.y + ly) * W + o.x + lx, sx = shoreX(slot, ly);
      town[i] = slot;
      const edge = lx === TOWN - 1 || ly === 0 || ly === TOWN - 1;
      if (lx < sx - 2) { kind[i] = 3; depth[i] = 2; }
      else if (lx < sx) { kind[i] = 2; depth[i] = 1; }
      else if (edge) kind[i] = 4;
      else { land[i] = 1; kind[i] = lx < sx + 2 ? 1 : 0; }
    }
    // shore: sand touching the sea
    for (let ly = 1; ly < TOWN - 1; ly++) for (let lx = 0; lx < TOWN - 1; lx++) {
      const i = (o.y + ly) * W + o.x + lx;
      if (kind[i] !== 1) continue;
      if (kind[i - 1] === 2 || kind[i - 1] === 3 || kind[i - W] === 2 || kind[i + W] === 2) coast[i] = 1;
    }
    // the road in from the east, ending at the Town Centre's door
    for (let lx = TC_LOCAL.x + 1; lx < TOWN - 1; lx++) road[(o.y + ROAD_ROW + 1) * W + o.x + lx] = 1;
  }
  return { land, coast, depth, kind, town, road };
}
