// Concurrent bookings against one room type, with four ways to handle the race.
import type { Rng } from '../../core/rng';

export type Strategy = 'none' | 'pessimistic' | 'optimistic' | 'constraint';

export interface Inventory {
  total: number;
  reserved: number;
  version: number; // goes up on every successful write
}

export interface Txn {
  id: number;
  reservationId: number;
  arrivedAt: number;
  finishAt: number;
  // What this transaction read when it started.
  readReserved: number;
  readVersion: number;
  attempts: number;
}

export type TxnResult = 'booked' | 'sold-out' | 'conflict' | 'duplicate';

/**
 * No locking. Check first, then write based on what was read. Two transactions can both
 * see one room left, and both book it. This is the classic race condition.
 */
export function commitUnsafe(inv: Inventory, t: Txn): TxnResult {
  if (t.readReserved >= inv.total) return 'sold-out';
  inv.reserved++;
  inv.version++;
  return 'booked';
}

/** Commit only if nobody changed the row since it was read. Otherwise retry from the start. */
export function commitOptimistic(inv: Inventory, t: Txn): TxnResult {
  if (t.readVersion !== inv.version) return 'conflict';
  if (t.readReserved >= inv.total) return 'sold-out';
  inv.reserved++;
  inv.version++;
  return 'booked';
}

/** One atomic statement: UPDATE ... SET reserved = reserved + 1 WHERE reserved < total. */
export function commitWithConstraint(inv: Inventory): TxnResult {
  if (inv.reserved >= inv.total) return 'sold-out';
  inv.reserved++;
  inv.version++;
  return 'booked';
}

/** A lock queue. Only the holder runs, so everyone else waits in line. */
export class RowLock {
  queue: Txn[] = [];
  holder: Txn | null = null;

  acquire(t: Txn, now: number, hold: number) {
    if (!this.holder) {
      this.holder = t;
      t.finishAt = now + hold;
    } else {
      this.queue.push(t);
    }
  }

  release(now: number, hold: number): Txn | null {
    this.holder = this.queue.shift() ?? null;
    if (this.holder) this.holder.finishAt = now + hold;
    return this.holder;
  }
}

export const retryDelay = (attempts: number, rng: Rng) => rng.range(0.005, 0.02) * attempts;
