/** Deterministic PRNG (mulberry32) so seeded scenarios and replays are bit-for-bit reproducible. */
export class Prng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, maxInclusive: number): number {
    return min + Math.floor(this.next() * (maxInclusive - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Picks from weighted buckets: [[value, weight], ...]. */
  weighted<T>(buckets: readonly (readonly [T, number])[]): T {
    const total = buckets.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [v, w] of buckets) {
      r -= w;
      if (r <= 0) return v;
    }
    return buckets[buckets.length - 1]![0];
  }
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
