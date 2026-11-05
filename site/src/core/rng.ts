// Seeded random numbers, so a lab run can be reproduced and tested.
export class Rng {
  private s: number;

  constructor(seed = 1) {
    this.s = seed >>> 0;
  }

  /** Uniform float in [0, 1). Mulberry32. */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  gaussian(mean = 0, sd = 1): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Arrivals in one interval. Normal approximation above 30 keeps it fast. */
  poisson(mean: number): number {
    if (mean <= 0) return 0;
    if (mean > 30) return Math.max(0, Math.round(this.gaussian(mean, Math.sqrt(mean))));
    const limit = Math.exp(-mean);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > limit);
    return k - 1;
  }

  exponential(mean: number): number {
    return -mean * Math.log(1 - this.next());
  }
}

/** Builds a Zipf sampler: rank 0 is the most popular of n items. */
export function zipfSampler(n: number, s: number): (rng: Rng) => number {
  const cdf = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += 1 / Math.pow(i + 1, s);
    cdf[i] = sum;
  }
  return (rng) => {
    const target = rng.next() * sum;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
}
