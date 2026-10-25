/** Seeded, reproducible randomness. Every run of the engine is replayable from its seed. */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal sample (Box–Muller). */
  normal(): number;
  /** Uniform in [lo, hi). */
  uniform(lo: number, hi: number): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** Fisher–Yates shuffle (returns a new array). */
  shuffle<T>(xs: readonly T[]): T[];
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0 || 0x9e3779b9;
  let spare: number | null = null;

  const next = () => {
    // mulberry32
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const normal = () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };

  return {
    next,
    normal,
    uniform: (lo, hi) => lo + (hi - lo) * next(),
    int: (n) => Math.floor(next() * n),
    shuffle: (xs) => {
      const out = xs.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

/** Derive a stable child seed so sub-processes (CV folds, designs) don't perturb the main stream. */
export function deriveSeed(seed: number, salt: string): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < salt.length; i++) {
    h ^= salt.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
