// A job queue with leases: nothing is lost when workers die, but jobs can run twice.
export interface Job {
  id: number;
  createdAt: number;
  duration: number;
  /** Who holds it now, and until when. If the lease runs out, anyone can take it. */
  leaseUntil: number;
  attempts: number;
  completions: number;
  done: boolean;
}

export interface Worker {
  id: number;
  alive: boolean;
  job: Job | null;
  finishAt: number;
  restartAt: number;
}

export class JobQueue {
  ready: Job[] = [];
  private head = 0;
  leased = new Set<Job>();

  push(job: Job) {
    this.ready.push(job);
  }

  get length() {
    return this.ready.length - this.head;
  }

  /** Takes the next job, and starts its lease. */
  claim(now: number, leaseSeconds: number): Job | undefined {
    while (this.head < this.ready.length) {
      const job = this.ready[this.head++];
      if (this.head > 4096) {
        this.ready = this.ready.slice(this.head);
        this.head = 0;
      }
      if (job.done) continue;
      job.leaseUntil = now + leaseSeconds;
      job.attempts++;
      this.leased.add(job);
      return job;
    }
    return undefined;
  }

  /** Puts jobs back whose lease ran out, since their worker may be dead. */
  requeueExpired(now: number): number {
    let count = 0;
    for (const job of this.leased) {
      if (job.leaseUntil <= now) {
        this.leased.delete(job);
        this.push(job);
        count++;
      }
    }
    return count;
  }

  /** A long-running worker keeps saying "still working", so its lease stays valid. */
  heartbeat(job: Job, now: number, leaseSeconds: number) {
    job.leaseUntil = now + leaseSeconds;
  }

  complete(job: Job) {
    job.completions++;
    job.done = true;
    this.leased.delete(job);
  }
}
