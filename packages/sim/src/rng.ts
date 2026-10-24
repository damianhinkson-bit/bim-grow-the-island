/** Seeded random numbers (mulberry32). All game randomness goes through here so every player's game, and the server's, stays identical. */
export interface RngState { rng: number }

export function nextRand(s: RngState): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function makeRng(seed: number): () => number {
  const s = { rng: seed | 0 };
  return () => nextRand(s);
}
