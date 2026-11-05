// A leader with followers: how a write gets acknowledged, and what's lost if the leader dies.
export type Mode = 'async' | 'semi-sync' | 'sync';
export type Routing = 'leader' | 'follower' | 'token';

export interface Follower {
  name: string;
  alive: boolean;
  applied: number; // highest log position this follower has applied
  /** Writes on their way, in log order. */
  incoming: { position: number; at: number }[];
  lastArrival: number;
}

export interface Cluster {
  now: number;
  log: number; // highest position the leader has written
  acknowledged: number; // highest position a client was told succeeded
  followers: Follower[];
  pendingAcks: { position: number; at: number }[];
}

export function createCluster(followers: number): Cluster {
  return {
    now: 0,
    log: 0,
    acknowledged: 0,
    followers: Array.from({ length: followers }, (_, i) => ({ name: `F${i + 1}`, alive: true, applied: 0, incoming: [], lastArrival: 0 })),
    pendingAcks: [],
  };
}

/**
 * Appends a write, and ships it to followers. They apply the log in order, so a slow
 * delivery holds up everything behind it. Returns the latency the client sees, or null
 * if the write can't complete.
 */
export function write(c: Cluster, mode: Mode, randomDelay: () => number): { latency: number; position: number } | null {
  const alive = c.followers.filter((f) => f.alive);
  if (mode === 'sync' && alive.length < c.followers.length) return null; // sync needs every follower
  if (mode === 'semi-sync' && alive.length === 0) return null; // semi-sync needs at least one
  c.log++;
  const position = c.log;
  const arrivals: number[] = [];
  for (const f of alive) {
    const at = Math.max(f.lastArrival, c.now + randomDelay());
    f.lastArrival = at;
    f.incoming.push({ position, at });
    arrivals.push(at - c.now);
  }
  arrivals.sort((a, b) => a - b);
  const latency = mode === 'async' ? 0 : mode === 'semi-sync' ? arrivals[0] : arrivals[arrivals.length - 1];
  c.pendingAcks.push({ position, at: c.now + latency });
  return { latency, position };
}

export function advance(c: Cluster, dt: number) {
  c.now += dt;
  for (const f of c.followers) {
    if (!f.alive) continue;
    while (f.incoming.length && f.incoming[0].at <= c.now) f.applied = f.incoming.shift()!.position;
  }
  c.pendingAcks = c.pendingAcks.filter((a) => {
    if (a.at > c.now) return true;
    c.acknowledged = Math.max(c.acknowledged, a.position);
    return false;
  });
}

/** Read your own write. Returns true if the answer is missing it. */
export function readOwnWrite(c: Cluster, position: number, routing: Routing, pick: (n: number) => number): boolean {
  if (routing === 'leader') return false;
  const alive = c.followers.filter((f) => f.alive);
  if (!alive.length) return false;
  const follower = alive[pick(alive.length)];
  // With a token, the client says what it last wrote, and a lagging follower defers to the leader.
  if (routing === 'token' && follower.applied < position) return false;
  return follower.applied < position;
}

/**
 * The leader dies. The most caught-up follower takes over, and whatever it never
 * received is gone. If clients were told those writes succeeded, that's data loss.
 */
export function failover(c: Cluster): number {
  const alive = c.followers.filter((f) => f.alive);
  if (!alive.length) return 0;
  const successor = alive.reduce((best, f) => (f.applied > best.applied ? f : best));
  const lost = Math.max(0, c.acknowledged - successor.applied);
  c.log = successor.applied;
  c.acknowledged = Math.min(c.acknowledged, successor.applied);
  c.pendingAcks = [];
  for (const f of c.followers) {
    f.incoming = [];
    f.applied = Math.min(f.applied, successor.applied);
    f.lastArrival = c.now;
  }
  return lost;
}
