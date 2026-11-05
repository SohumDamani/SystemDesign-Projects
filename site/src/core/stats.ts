export type Row = Record<string, number>;

export function mean(rows: Row[], key: string): number {
  if (!rows.length) return 0;
  return rows.reduce((sum, r) => sum + r[key], 0) / rows.length;
}

/** Average of `key` across the last `n` samples. */
export function tailMean(history: Row[], key: string, n: number): number {
  return mean(history.slice(-n), key);
}

/** Change in `key` per second across the last `n` samples. */
export function slope(history: Row[], key: string, n: number, secondsPerTick: number): number {
  const rows = history.slice(-n);
  if (rows.length < 2) return 0;
  return (rows[rows.length - 1][key] - rows[0][key]) / ((rows.length - 1) * secondsPerTick);
}

/** Share of `n` items a cache of the top `c` would catch under Zipf popularity with exponent s. */
export function zipfTopShare(c: number, n: number, s: number): number {
  const top = Math.min(c, n);
  let partial = 0;
  let total = 0;
  for (let i = 1; i <= n; i++) {
    const w = 1 / Math.pow(i, s);
    total += w;
    if (i <= top) partial += w;
  }
  return total ? partial / total : 0;
}

/** Number of ways to choose k of n. */
export function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Probability that at most `lost` of `n` independent items fail, each with chance p. */
export function atMostFail(n: number, lost: number, p: number): number {
  let sum = 0;
  for (let k = 0; k <= lost; k++) sum += choose(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
  return sum;
}

export function harmonic(n: number): number {
  let h = 0;
  for (let i = 1; i <= n; i++) h += 1 / i;
  return h;
}
