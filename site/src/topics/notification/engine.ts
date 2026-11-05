// Delivery workers, third-party providers that fail, retries, and duplicate protection.
import type { Rng } from '../../core/rng';

export type Channel = 'push' | 'email' | 'sms';
export const CHANNELS: Channel[] = ['push', 'email', 'sms'];

export interface Task {
  id: number;
  channel: Channel;
  attempts: number;
  createdAt: number;
  readyAt: number;
}

export interface Provider {
  down: boolean;
  failRate: number; // the provider rejects the send
  ackLossRate: number; // delivered, but our side never hears back
}

export const SEND_SECONDS = 0.1;
export const TIMEOUT_SECONDS = 2;

export interface Outcome {
  delivered: boolean;
  /** What our side believes. A lost ack looks exactly like a failure. */
  confirmed: boolean;
  busyFor: number;
}

export function attemptSend(p: Provider, rng: Rng): Outcome {
  if (p.down) return { delivered: false, confirmed: false, busyFor: TIMEOUT_SECONDS };
  if (rng.chance(p.failRate)) return { delivered: false, confirmed: false, busyFor: SEND_SECONDS };
  if (rng.chance(p.ackLossRate)) return { delivered: true, confirmed: false, busyFor: TIMEOUT_SECONDS };
  return { delivered: true, confirmed: true, busyFor: SEND_SECONDS };
}

/** Wait longer after each failure, with jitter, so retries don't all arrive together. */
export function backoffSeconds(attempt: number, rng: Rng): number {
  return 0.5 * 2 ** attempt * rng.range(0.5, 1.5);
}

export class Queue {
  ready: Task[] = [];
  delayed: Task[] = [];
  private head = 0;

  push(task: Task) {
    this.ready.push(task);
  }

  pop(): Task | undefined {
    if (this.head >= this.ready.length) return undefined;
    const task = this.ready[this.head++];
    if (this.head > 1024) {
      this.ready = this.ready.slice(this.head);
      this.head = 0;
    }
    return task;
  }

  get length() {
    return this.ready.length - this.head;
  }

  retryLater(task: Task, at: number) {
    task.readyAt = at;
    this.delayed.push(task);
  }

  releaseDue(now: number) {
    this.delayed = this.delayed.filter((t) => {
      if (t.readyAt > now) return true;
      this.push(t);
      return false;
    });
  }

  /** How long the first waiting task of a channel has been waiting. */
  oldestAge(channel: Channel, now: number): number {
    for (let i = this.head; i < this.ready.length; i++) {
      if (this.ready[i].channel === channel) return now - this.ready[i].readyAt;
    }
    return 0;
  }
}
