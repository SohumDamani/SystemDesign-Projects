// An alert rule's state machine, and the downsampling that keeps metric storage affordable.
export type AlertState = 'ok' | 'pending' | 'firing';

export interface AlertRule {
  threshold: number;
  forSeconds: number; // must stay above the threshold this long before paging anyone
}

export interface Alert {
  state: AlertState;
  pendingSince: number;
  fires: number;
}

/** Run at every scrape. "pending" is what protects you from one noisy reading. */
export function evaluate(alert: Alert, rule: AlertRule, value: number, now: number): boolean {
  if (value <= rule.threshold) {
    alert.state = 'ok';
    return false;
  }
  if (alert.state === 'ok') {
    alert.state = 'pending';
    alert.pendingSince = now;
  }
  if (alert.state === 'pending' && now - alert.pendingSince >= rule.forSeconds) {
    alert.state = 'firing';
    alert.fires++;
    return true;
  }
  return false;
}

export interface Point {
  t: number;
  value: number;
}

/** Replaces each bucket of points with its average. Older data rarely needs full detail. */
export function downsample(points: Point[], bucketSeconds: number): Point[] {
  const buckets = new Map<number, { sum: number; n: number }>();
  for (const p of points) {
    const key = Math.floor(p.t / bucketSeconds);
    const b = buckets.get(key) ?? { sum: 0, n: 0 };
    b.sum += p.value;
    b.n++;
    buckets.set(key, b);
  }
  return [...buckets.entries()].map(([key, b]) => ({ t: key * bucketSeconds, value: b.sum / b.n }));
}

export interface StorageTier {
  name: string;
  days: number;
  resolutionSeconds: number;
}

/** Bytes needed by one series across its retention tiers. */
export function bytesPerSeries(tiers: StorageTier[], bytesPerSample: number): number {
  return tiers.reduce((sum, tier) => sum + (tier.days * 86400 * bytesPerSample) / tier.resolutionSeconds, 0);
}
