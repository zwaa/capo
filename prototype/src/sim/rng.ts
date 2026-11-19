// Seeded, serialisable RNG (mulberry32). The state lives inside GameState so
// the same seed + the same player choices always produce the same month.

export interface RngHolder {
  rng: number;
}

export function rand(h: RngHolder): number {
  let t = (h.rng = (h.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function chance(h: RngHolder, p: number): boolean {
  return rand(h) < p;
}

export function int(h: RngHolder, min: number, max: number): number {
  return min + Math.floor(rand(h) * (max - min + 1));
}

export function pick<T>(h: RngHolder, items: readonly T[]): T {
  return items[Math.floor(rand(h) * items.length)];
}

export function shuffle<T>(h: RngHolder, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand(h) * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
