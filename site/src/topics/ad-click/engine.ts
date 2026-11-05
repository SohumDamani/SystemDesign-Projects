// Real windowed aggregation: events carry their own time, and arrive late and out of order.
export interface ClickEvent {
  id: number;
  ad: number;
  eventTime: number; // when the click happened
}

export interface WindowResult {
  start: number;
  counts: Map<number, number>;
  total: number;
  closedAt: number;
}

/**
 * Tumbling windows closed by a watermark. The watermark is a guess: "I've probably seen
 * everything up to this time." A longer wait means fewer late events, and later results.
 */
export class WindowedCounter {
  private open = new Map<number, Map<number, number>>();
  private seenIds = new Set<number>();
  private recentIds: number[] = [];
  maxEventTime = 0;
  closed: WindowResult[] = [];
  late = 0;
  duplicatesDropped = 0;

  constructor(private windowSeconds: number, private latenessSeconds: number, private dedupe: boolean) {}

  get watermark() {
    return this.maxEventTime - this.latenessSeconds;
  }

  private windowStart(t: number) {
    return Math.floor(t / this.windowSeconds) * this.windowSeconds;
  }

  add(event: ClickEvent, now: number) {
    if (this.dedupe) {
      if (this.seenIds.has(event.id)) {
        this.duplicatesDropped++;
        return;
      }
      this.seenIds.add(event.id);
      this.recentIds.push(event.id);
      if (this.recentIds.length > 200000) this.seenIds.delete(this.recentIds.shift()!);
    }
    this.maxEventTime = Math.max(this.maxEventTime, event.eventTime);
    const start = this.windowStart(event.eventTime);
    if (start + this.windowSeconds <= this.watermark) {
      this.late++; // its window has already been published
    } else {
      let counts = this.open.get(start);
      if (!counts) this.open.set(start, (counts = new Map()));
      counts.set(event.ad, (counts.get(event.ad) ?? 0) + 1);
    }
    this.closeReady(now);
  }

  closeReady(now: number) {
    for (const [start, counts] of this.open) {
      if (start + this.windowSeconds <= this.watermark) {
        let total = 0;
        for (const c of counts.values()) total += c;
        this.closed.push({ start, counts, total, closedAt: now });
        this.open.delete(start);
      }
    }
  }
}

export function topAds(counts: Map<number, number>, n: number): [number, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
