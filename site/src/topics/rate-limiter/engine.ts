// Five rate limiting algorithms behind one interface. The sliding window counter is the
// real rate_limit.lua (see luaRunner.ts). The others are written out here to compare.
import { FakeRedis, LuaScript } from './luaRunner';

export interface Decision {
  allowed: boolean;
  /** Variables from inside the algorithm, shown beside the code. */
  vars: Record<string, string>;
  /** Lines that executed, when the algorithm is a real script. */
  lines?: number[];
}

export interface Limiter {
  check(now: number, trace: boolean): Decision;
  /** Requests released to the backend since the last call. Only a queue delays them. */
  drain?(now: number): number;
  /** How many numbers this algorithm must store per client right now. */
  storedValues(): number;
}

/** Counts per fixed time slot. Cheap, but allows double the limit across a boundary. */
export class FixedWindow implements Limiter {
  private id = -1;
  private count = 0;
  constructor(private limit: number, private windowSec: number) {}

  check(now: number): Decision {
    const id = Math.floor(now / this.windowSec);
    if (id !== this.id) {
      this.id = id;
      this.count = 0;
    }
    const allowed = this.count < this.limit;
    if (allowed) this.count++;
    return { allowed, vars: { window: String(id), count: String(this.count), test: `${this.count} of ${this.limit}` } };
  }

  storedValues() {
    return 2;
  }
}

/** Remembers every timestamp. Exact, but memory grows with the limit. */
export class SlidingLog implements Limiter {
  private log: number[] = [];
  constructor(private limit: number, private windowSec: number) {}

  check(now: number): Decision {
    const cutoff = now - this.windowSec;
    while (this.log.length && this.log[0] <= cutoff) this.log.shift();
    const allowed = this.log.length < this.limit;
    if (allowed) this.log.push(now);
    return { allowed, vars: { cutoff: cutoff.toFixed(2), count: String(this.log.length), test: `${this.log.length} of ${this.limit}` } };
  }

  storedValues() {
    return Math.max(1, this.log.length);
  }
}

/** A bucket refills at a steady rate, and each request takes one token. Bursts are allowed. */
export class TokenBucket implements Limiter {
  private tokens: number;
  private last = 0;
  private refillPerSec: number;
  constructor(private capacity: number, windowSec: number) {
    this.tokens = capacity;
    this.refillPerSec = capacity / windowSec;
  }

  check(now: number): Decision {
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.refillPerSec);
    this.last = now;
    const allowed = this.tokens >= 1;
    if (allowed) this.tokens -= 1;
    return { allowed, vars: { refill: `${this.refillPerSec.toFixed(2)}/s`, tokens: this.tokens.toFixed(1) } };
  }

  storedValues() {
    return 2;
  }
}

/** Requests wait in a queue that drains at a constant rate, so the backend sees a smooth flow. */
export class LeakyBucket implements Limiter {
  private queue = 0;
  private last = 0;
  private drained = 0;
  private drainPerSec: number;
  constructor(private capacity: number, windowSec: number) {
    this.drainPerSec = capacity / windowSec;
  }

  drain(now: number): number {
    this.drained += (now - this.last) * this.drainPerSec;
    this.last = now;
    const released = Math.min(this.queue, Math.floor(this.drained));
    this.queue -= released;
    this.drained = this.queue === 0 ? 0 : this.drained - released;
    return released;
  }

  check(): Decision {
    const allowed = this.queue < this.capacity;
    if (allowed) this.queue++;
    return { allowed, vars: { queue: `${this.queue} of ${this.capacity}`, drain: `${this.drainPerSec.toFixed(2)}/s` } };
  }

  storedValues() {
    return 2;
  }
}

/** The real script. Each request runs rate_limit.lua on the Lua VM against FakeRedis. */
export class LuaSlidingCounter implements Limiter {
  private redis = new FakeRedis();
  private script: LuaScript;
  constructor(source: string, private limit: number, private windowSec: number) {
    this.script = new LuaScript(source, this.redis);
  }

  check(now: number, trace: boolean): Decision {
    this.redis.now = Math.floor(now);
    const { reply, locals, lines } = this.script.run(['ratelimit:demo'], [this.windowSec, this.limit], trace);
    const vars: Record<string, string> = {};
    for (const [name, value] of Object.entries(locals)) {
      vars[name] = typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(3) : String(value);
    }
    return { allowed: reply[0] === 1, vars, lines };
  }

  storedValues() {
    return this.redis.size();
  }
}
