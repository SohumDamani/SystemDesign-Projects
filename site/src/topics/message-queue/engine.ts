// A partitioned log: offsets, replication, consumer groups, and what each ack mode risks.
export type Acks = '0' | '1' | 'all';

export interface Partition {
  id: number;
  end: number; // next offset the leader will write
  replicated: number; // everything below this is safe on followers
  position: number; // next offset the consumer will read
  committed: number; // where the consumer restarts after a crash
  pending: { offset: number; at: number }[]; // writes waiting to reach followers
  offlineUntil: number; // no leader until this time
}

export function createPartition(id: number): Partition {
  return { id, end: 0, replicated: 0, position: 0, committed: 0, pending: [], offlineUntil: 0 };
}

/** Appends to the log. Returns false if the partition has no leader right now. */
export function append(p: Partition, count: number, now: number, replicationLag: number): boolean {
  if (now < p.offlineUntil) return false;
  p.end += count;
  p.pending.push({ offset: p.end, at: now + replicationLag });
  return true;
}

export function replicate(p: Partition, now: number) {
  while (p.pending.length && p.pending[0].at <= now) p.replicated = p.pending.shift()!.offset;
}

/** Consumers may only read what's fully replicated, so they never see data that could vanish. */
export function consume(p: Partition, budget: number): number {
  const taken = Math.min(budget, p.replicated - p.position);
  p.position += taken;
  return taken;
}

/** Each partition goes to exactly one consumer in a group. Extra consumers sit idle. */
export function assign(partitions: number, consumers: number): number[][] {
  const out: number[][] = Array.from({ length: consumers }, () => []);
  for (let p = 0; p < partitions; p++) out[p % consumers].push(p);
  return out;
}

/**
 * The leader dies. A follower takes over, knowing only what was replicated.
 * Anything written after that point is gone. Whether a client thought it was
 * safe depends on the ack mode, and that's the difference between a lost
 * message and a harmless retry.
 */
export function failover(p: Partition, now: number, pauseSeconds: number, acks: Acks): { lostAcknowledged: number; retried: number } {
  const unreplicated = p.end - p.replicated;
  p.end = p.replicated;
  p.pending = [];
  p.offlineUntil = now + pauseSeconds;
  if (acks === 'all') return { lostAcknowledged: 0, retried: unreplicated };
  return { lostAcknowledged: unreplicated, retried: 0 };
}

/** Restarts from the last commit, so anything processed since then runs a second time. */
export function restartConsumer(p: Partition): number {
  const redo = p.position - p.committed;
  p.position = p.committed;
  return redo;
}
