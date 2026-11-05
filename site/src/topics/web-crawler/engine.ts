// A crawler's core: a polite frontier, duplicate detection, and a depth limit for traps.
import { hash53 } from '../url-shortener/engine';

/** Answers "definitely new" or "probably seen" using very little memory. */
export class BloomFilter {
  private bits: Uint8Array;
  readonly k: number;
  inserted = 0;

  constructor(private size: number, k: number) {
    this.bits = new Uint8Array(Math.ceil(size / 8));
    this.k = Math.max(1, k);
  }

  private indexes(text: string): number[] {
    // Two hashes can simulate k independent hash functions.
    const a = hash53(text, 1);
    const b = hash53(text, 2);
    return Array.from({ length: this.k }, (_, i) => (a + i * b) % this.size);
  }

  mightContain(text: string): boolean {
    return this.indexes(text).every((i) => this.bits[i >> 3] & (1 << (i & 7)));
  }

  add(text: string) {
    for (const i of this.indexes(text)) this.bits[i >> 3] |= 1 << (i & 7);
    this.inserted++;
  }
}

export function bloomFalsePositiveRate(bitsPerItem: number, k: number, fill: number): number {
  return Math.pow(1 - Math.exp((-k * fill) / bitsPerItem), k);
}

export interface Link {
  url: string;
  host: number;
  depth: number;
}

const PAGES_PER_HOST = 500;
export const TRAP_HOST = -1;

/** A made-up web: the same page always has the same links. Most links stay on the same site. */
export function linksOn(page: Link, hostCount: number): Link[] {
  const depth = page.depth + 1;
  if (page.host === TRAP_HOST) {
    // A spider trap: every page links to two brand new pages, forever.
    return [0, 1].map((i) => ({ url: `${page.url}/${i}`, host: TRAP_HOST, depth }));
  }
  const seed = hash53(page.url);
  const count = 3 + (seed % 6);
  const links: Link[] = [];
  for (let i = 0; i < count; i++) {
    const h = hash53(page.url, i + 10);
    const host = h % 5 === 0 ? (h >>> 3) % hostCount : page.host;
    links.push({ url: `h${host}/p${(h >>> 8) % PAGES_PER_HOST}`, host, depth });
  }
  return links;
}

/** One FIFO queue per host, so a host is never hit faster than the politeness delay allows. */
export class Frontier {
  private queues = new Map<number, Link[]>();
  private nextAllowed = new Map<number, number>();
  private hosts: number[] = [];
  private cursor = 0;
  size = 0;

  push(link: Link) {
    let q = this.queues.get(link.host);
    if (!q) {
      this.queues.set(link.host, (q = []));
      this.hosts.push(link.host);
    }
    q.push(link);
    this.size++;
  }

  /** The next page from a host we're allowed to contact right now, if there is one. */
  pop(now: number, delay: number): Link | undefined {
    for (let i = 0; i < this.hosts.length; i++) {
      const host = this.hosts[(this.cursor + i) % this.hosts.length];
      const q = this.queues.get(host)!;
      if (q.length && (this.nextAllowed.get(host) ?? 0) <= now + 1e-9) {
        this.cursor = (this.cursor + i + 1) % this.hosts.length;
        this.nextAllowed.set(host, now + delay);
        this.size--;
        return q.shift();
      }
    }
    return undefined;
  }
}
