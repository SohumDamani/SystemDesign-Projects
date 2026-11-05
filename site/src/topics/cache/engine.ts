// Three real eviction policies behind one interface, plus a read path that can stampede.
export interface Cache {
  get(key: number, now: number): boolean;
  put(key: number, now: number): void;
  remove(key: number): void;
  readonly size: number;
}

interface Entry {
  expiresAt: number;
}

/** A JS Map keeps insertion order, so the first key is always the oldest. */
class OrderedCache implements Cache {
  protected map = new Map<number, Entry>();
  constructor(protected capacity: number, protected ttl: number, private touchOnRead: boolean) {}

  get size() {
    return this.map.size;
  }

  get(key: number, now: number): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= now) {
      this.map.delete(key);
      return false;
    }
    if (this.touchOnRead) {
      this.map.delete(key);
      this.map.set(key, entry);
    }
    return true;
  }

  put(key: number, now: number) {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.capacity) this.map.delete(this.map.keys().next().value!);
    this.map.set(key, { expiresAt: this.ttl > 0 ? now + this.ttl : Infinity });
  }

  remove(key: number) {
    this.map.delete(key);
  }
}

/** Evicts whatever was used longest ago. Each read moves the key to the back. */
export class LruCache extends OrderedCache {
  constructor(capacity: number, ttl: number) {
    super(capacity, ttl, true);
  }
}

/** Evicts whatever was inserted first, no matter how often it's read. */
export class FifoCache extends OrderedCache {
  constructor(capacity: number, ttl: number) {
    super(capacity, ttl, false);
  }
}

/** Evicts the least frequently used key. Buckets by frequency keep every operation O(1). */
export class LfuCache implements Cache {
  private entries = new Map<number, { freq: number; expiresAt: number }>();
  private buckets = new Map<number, Set<number>>();
  private minFreq = 1;
  constructor(private capacity: number, private ttl: number) {}

  get size() {
    return this.entries.size;
  }

  private bump(key: number, entry: { freq: number }) {
    const bucket = this.buckets.get(entry.freq)!;
    bucket.delete(key);
    if (!bucket.size) {
      this.buckets.delete(entry.freq);
      if (this.minFreq === entry.freq) this.minFreq++;
    }
    entry.freq++;
    if (!this.buckets.has(entry.freq)) this.buckets.set(entry.freq, new Set());
    this.buckets.get(entry.freq)!.add(key);
  }

  get(key: number, now: number): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= now) {
      this.remove(key);
      return false;
    }
    this.bump(key, entry);
    return true;
  }

  put(key: number, now: number) {
    const expiresAt = this.ttl > 0 ? now + this.ttl : Infinity;
    const existing = this.entries.get(key);
    if (existing) {
      existing.expiresAt = expiresAt;
      this.bump(key, existing);
      return;
    }
    if (this.entries.size >= this.capacity) {
      while (!this.buckets.get(this.minFreq)?.size) this.minFreq++;
      const victim = this.buckets.get(this.minFreq)!.values().next().value!;
      this.remove(victim);
    }
    this.entries.set(key, { freq: 1, expiresAt });
    if (!this.buckets.has(1)) this.buckets.set(1, new Set());
    this.buckets.get(1)!.add(key);
    this.minFreq = 1;
  }

  remove(key: number) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.buckets.get(entry.freq)?.delete(key);
    this.entries.delete(key);
  }
}

export interface ReadStats {
  hits: number;
  dbReads: number;
  coalesced: number;
  hotDbReads: number;
}

export const HOT_KEY = 0;

/**
 * The cache-aside read path. On a miss the value is fetched from the database and cached
 * when it returns. Without request coalescing, everyone who misses while that fetch is
 * running also goes to the database. That's a cache stampede.
 */
export function read(cache: Cache, key: number, now: number, fillSeconds: number, coalesce: boolean, inFlight: Map<number, number>, stats: ReadStats) {
  if (cache.get(key, now)) {
    stats.hits++;
    return;
  }
  if (coalesce && inFlight.has(key)) {
    stats.coalesced++;
    return;
  }
  stats.dbReads++;
  if (key === HOT_KEY) stats.hotDbReads++;
  if (!inFlight.has(key)) inFlight.set(key, now + fillSeconds);
}

/** Puts finished database fetches into the cache. */
export function finishFills(cache: Cache, now: number, inFlight: Map<number, number>) {
  for (const [key, readyAt] of inFlight) {
    if (readyAt <= now) {
      cache.put(key, now);
      inFlight.delete(key);
    }
  }
}
