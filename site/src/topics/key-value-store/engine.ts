// A Dynamo-style replicated store: quorum reads and writes, and vector clocks for conflicts.
import type { Rng } from '../../core/rng';

export interface Replica {
  name: string;
  alive: boolean;
  versions: Map<number, number>; // key -> newest version this replica has applied
}

interface PendingApply {
  replica: Replica;
  key: number;
  version: number;
  at: number;
}

export interface Store {
  replicas: Replica[];
  acknowledged: Map<number, number>; // key -> newest version a client was told succeeded
  pending: PendingApply[];
  pendingAcks: { key: number; version: number; at: number }[];
  nextVersion: number;
  now: number;
}

export interface OpResult {
  ok: boolean;
  latency: number;
  stale?: boolean;
}

export function createStore(n: number): Store {
  const replicas = Array.from({ length: n }, (_, i) => ({ name: `R${i + 1}`, alive: true, versions: new Map() }));
  return { replicas, acknowledged: new Map(), pending: [], pendingAcks: [], nextVersion: 1, now: 0 };
}

/** Sends the write to all live replicas. It succeeds once the W fastest have applied it. */
export function write(store: Store, key: number, w: number, meanDelay: number, rng: Rng): OpResult {
  const alive = store.replicas.filter((r) => r.alive);
  if (alive.length < w) return { ok: false, latency: 0 };
  const version = store.nextVersion++;
  const delays = alive.map((replica) => {
    const delay = rng.exponential(meanDelay);
    store.pending.push({ replica, key, version, at: store.now + delay });
    return delay;
  });
  delays.sort((a, b) => a - b);
  const latency = delays[w - 1];
  store.pendingAcks.push({ key, version, at: store.now + latency });
  return { ok: true, latency };
}

/** Asks all live replicas and takes the newest version among the R fastest replies. */
export function read(store: Store, key: number, r: number, meanDelay: number, rng: Rng): OpResult {
  const alive = store.replicas.filter((x) => x.alive);
  if (alive.length < r) return { ok: false, latency: 0 };
  const replies = alive
    .map((replica) => ({ delay: rng.exponential(meanDelay), version: replica.versions.get(key) ?? 0 }))
    .sort((a, b) => a.delay - b.delay)
    .slice(0, r);
  const newest = Math.max(...replies.map((x) => x.version));
  return { ok: true, latency: replies[r - 1].delay, stale: newest < (store.acknowledged.get(key) ?? 0) };
}

/** Moves time forward, applying any replication and acknowledgements that are now due. */
export function advance(store: Store, dt: number) {
  store.now += dt;
  store.pending = store.pending.filter((p) => {
    if (p.at > store.now) return true;
    if (p.replica.alive && (p.replica.versions.get(p.key) ?? 0) < p.version) p.replica.versions.set(p.key, p.version);
    return false;
  });
  store.pendingAcks = store.pendingAcks.filter((a) => {
    if (a.at > store.now) return true;
    if ((store.acknowledged.get(a.key) ?? 0) < a.version) store.acknowledged.set(a.key, a.version);
    return false;
  });
}

// Vector clocks tell "newer" apart from "written at the same time, with no knowledge of each other".
export type VectorClock = Record<string, number>;

export function increment(clock: VectorClock, node: string): VectorClock {
  return { ...clock, [node]: (clock[node] ?? 0) + 1 };
}

/** True if a has seen everything b has seen. */
export function descends(a: VectorClock, b: VectorClock): boolean {
  return Object.keys(b).every((node) => (a[node] ?? 0) >= b[node]);
}

export function merge(a: VectorClock, b: VectorClock): VectorClock {
  const out: VectorClock = { ...a };
  for (const [node, count] of Object.entries(b)) out[node] = Math.max(out[node] ?? 0, count);
  return out;
}

export function compare(a: VectorClock, b: VectorClock): 'same' | 'newer' | 'older' | 'conflict' {
  const ab = descends(a, b);
  const ba = descends(b, a);
  if (ab && ba) return 'same';
  if (ab) return 'newer';
  if (ba) return 'older';
  return 'conflict';
}

const show = (c: VectorClock) =>
  '[' +
  Object.entries(c)
    .map(([n, v]) => `${n}:${v}`)
    .join(' ') +
  ']';

/** Walks through two clients writing the same key on each side of a network split. */
export function conflictDemo(): string[] {
  const base = increment({}, 'A');
  const left = increment(base, 'A');
  const right = increment(base, 'B');
  const relation = compare(left, right);
  const resolved = increment(merge(left, right), 'A');
  return [
    `Write through node A: ${show(base)}`,
    'Network splits. Each side keeps accepting writes.',
    `Client 1 writes through A: ${show(left)}`,
    `Client 2 writes through B: ${show(right)}`,
    `Comparing the two: ${relation}, since neither has seen the other`,
    `A client reads both, merges them, and writes: ${show(resolved)}`,
    `Compared with both earlier versions: ${compare(resolved, left)} and ${compare(resolved, right)}`,
  ];
}
