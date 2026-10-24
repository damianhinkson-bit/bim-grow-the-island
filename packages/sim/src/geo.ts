import data from './data/barbados.json';

/**
 * Real parish borders (geoBoundaries / Wikimedia Commons, CC BY 2.5), projected to tile units.
 * 1 tile ≈ 0.58 km. North is up, x grows east.
 */
export const GEO = data as { proj: number[]; par: [string, number[]][] };
const [LON0, LAT1, KX, KY, OX, OY] = GEO.proj;

export type Pt = [number, number];
export const toT = (lat: number, lon: number): Pt => [OX + (lon - LON0) * KX, OY + (LAT1 - lat) * KY];
/** Tiles per kilometre. */
export const KM = 1 / 0.5806;

export interface Hill { x: number; y: number; h: number; s: number }
/** Mount Hillaby, the Scotland District, the central ridge, Hackleton's Cliff, the St. Lucy plateau, the Christ Church ridge. */
export const HILLS: Hill[] = (
  [
    [13.2, -59.58, 1.0, 3.0], [13.228, -59.556, 0.55, 2.2], [13.168, -59.592, 0.65, 3.4], [13.178, -59.522, 0.6, 1.6],
    [13.14, -59.545, 0.45, 3.2], [13.3, -59.622, 0.32, 2.8], [13.085, -59.552, 0.28, 2.6], [13.25, -59.605, 0.45, 2.6],
  ] as const
).map(([la, lo, h, s]) => { const [x, y] = toT(la, lo); return { x, y, h, s: s * KM }; });

export const SCOT = (() => { const [x, y] = toT(13.225, -59.553); return { x, y }; })();

export interface Town { n: string; x: number; y: number; s: number }
export const TOWNS: Town[] = (
  [
    ['Bridgetown', 13.0975, -59.6167, 3], ['Speightstown', 13.25, -59.64, 2], ['Holetown', 13.187, -59.636, 2],
    ['Oistins', 13.066, -59.541, 2], ['Bathsheba', 13.213, -59.524, 1], ['Six Cross Roads', 13.118, -59.478, 1],
    ['Belleplaine', 13.242, -59.564, 1], ['Crab Hill', 13.314, -59.631, 1],
  ] as const
).map(([n, la, lo, s]) => { const [x, y] = toT(la, lo); return { n, x, y, s }; });

export const ROADS: Pt[][] = [
  [[13.0975, -59.614], [13.125, -59.626], [13.155, -59.633], [13.187, -59.632], [13.22, -59.635], [13.25, -59.636], [13.285, -59.632], [13.314, -59.63]],
  [[13.099, -59.61], [13.13, -59.6], [13.165, -59.592], [13.2, -59.585], [13.225, -59.575], [13.242, -59.564]],
  [[13.099, -59.608], [13.13, -59.585], [13.16, -59.565], [13.19, -59.545], [13.213, -59.527]],
  [[13.097, -59.606], [13.105, -59.57], [13.112, -59.53], [13.118, -59.48]],
  [[13.095, -59.607], [13.08, -59.58], [13.067, -59.545], [13.07, -59.51], [13.09, -59.49], [13.118, -59.48]],
  [[13.25, -59.638], [13.255, -59.61], [13.248, -59.585], [13.242, -59.564], [13.225, -59.54], [13.213, -59.527]],
].map((r) => r.map(([la, lo]) => toT(la, lo)));

export const RUNWAY: [Pt, Pt] = [toT(13.0712, -59.504), toT(13.079, -59.48)];
/** The Atlantic side (rocky, surf) lies east of a line from North Point to the St. Philip corner, plus the St. Lucy cliffs. */
export const ROCK_A = toT(13.335, -59.625), ROCK_B = toT(13.103, -59.428), ROCK_N = toT(13.302, 0)[1];

export function inPolyF(x: number, y: number, a: number[]): boolean {
  let c = false; const n = a.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = a[i], yi = a[i + 1], xj = a[j], yj = a[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export function heightAt(x: number, y: number): number {
  let h = 0.08;
  for (const k of HILLS) { const d = (x - k.x) ** 2 + (y - k.y) ** 2; h += k.h * Math.exp(-d / (2 * k.s * k.s)); }
  return h;
}
/** 0..1 weight of the Scotland District (clay, no coral cap). */
export function scotAt(x: number, y: number): number {
  const dx = (x - SCOT.x) / (3.0 * KM), dy = (y - SCOT.y) / (4.6 * KM);
  return Math.exp(-(dx * dx + dy * dy) * 1.6);
}
