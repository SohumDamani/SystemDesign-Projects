// Three ways to decide which database a row lives on, and what each makes cheap or expensive.
import { HashRing, hash32 } from '../consistent-hashing/engine';

export const KEY_SPACE = 1_000_000;

export type Strategy = 'hash' | 'consistent' | 'range';

export interface Router {
  route(key: number): number;
  /** How many shards a query for keys from..to must ask. */
  shardsForRange(from: number, to: number): number;
  addShard(): void;
  readonly shards: number;
}

/** hash(key) % N. Even load, but scans must ask everyone, and resizing moves almost everything. */
export class HashRouter implements Router {
  constructor(public shards: number) {}

  route(key: number) {
    return hash32(`k${key}`) % this.shards;
  }

  shardsForRange() {
    return this.shards;
  }

  addShard() {
    this.shards++;
  }
}

/** Like hash routing for even load and scans, but adding a shard moves only about 1/N of the keys. */
export class ConsistentRouter implements Router {
  private ring = new HashRing(100);
  shards = 0;

  constructor(shards: number) {
    for (let i = 0; i < shards; i++) this.addShard();
  }

  route(key: number) {
    return Number(this.ring.lookup(`k${key}`).slice(1));
  }

  shardsForRange() {
    return this.shards;
  }

  addShard() {
    this.ring.add(`s${this.shards}`);
    this.shards++;
  }
}

/** Contiguous key ranges. Scans touch few shards, but ordered keys all land in one place. */
export class RangeRouter implements Router {
  constructor(public shards: number) {}

  route(key: number) {
    return Math.min(this.shards - 1, Math.floor((key / KEY_SPACE) * this.shards));
  }

  shardsForRange(from: number, to: number) {
    return this.route(to) - this.route(from) + 1;
  }

  addShard() {
    this.shards++;
  }
}

export function makeRouter(strategy: Strategy, shards: number): Router {
  if (strategy === 'consistent') return new ConsistentRouter(shards);
  if (strategy === 'range') return new RangeRouter(shards);
  return new HashRouter(shards);
}

/** Replays a sample of keys through a resize, and reports the share that changed shard. */
export function movedShareOnResize(router: Router, sample: number[]): number {
  const before = sample.map((k) => router.route(k));
  router.addShard();
  let moved = 0;
  sample.forEach((k, i) => {
    if (router.route(k) !== before[i]) moved++;
  });
  return moved / sample.length;
}
