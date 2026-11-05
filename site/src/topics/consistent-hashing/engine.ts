// A real consistent hash ring, plus the plain modulo scheme it replaces.

/** FNV-1a followed by a finalizer that spreads the bits evenly around the ring. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export interface RingPoint {
  position: number;
  server: string;
}

export class HashRing {
  points: RingPoint[] = [];
  servers: string[] = [];
  constructor(private virtualNodes: number) {}

  /** Each server appears at many points on the ring, called virtual nodes. */
  add(server: string) {
    this.servers.push(server);
    for (let i = 0; i < this.virtualNodes; i++) {
      this.points.push({ position: hash32(`${server}#${i}`), server });
    }
    this.points.sort((a, b) => a.position - b.position);
  }

  remove(server: string) {
    this.servers = this.servers.filter((s) => s !== server);
    this.points = this.points.filter((p) => p.server !== server);
  }

  /** Walk clockwise from the key's position to the next server point. Binary search makes it O(log n). */
  lookup(key: string): string {
    const target = hash32(key);
    let lo = 0;
    let hi = this.points.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.points[mid].position < target) lo = mid + 1;
      else hi = mid;
    }
    return this.points[lo === this.points.length ? 0 : lo].server;
  }
}

/** The naive approach: changing the server count remaps nearly every key. */
export function moduloLookup(key: string, servers: string[]): string {
  return servers[hash32(key) % servers.length];
}
