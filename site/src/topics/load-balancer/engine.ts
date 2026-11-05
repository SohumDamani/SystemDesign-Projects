// The routing decisions a load balancer makes, plus a small queueing model of each server.
import type { Rng } from '../../core/rng';

export interface Server {
  name: string;
  capacity: number; // requests per second this server can finish
  up: boolean; // actually alive
  routable: boolean; // what the load balancer believes, from health checks
  downAt: number;
  queue: number; // requests waiting or in progress
  fluidQueue: number; // same server with all randomness removed: the math's answer
  arrivals: number;
  rate: number;
  lost: number;
}

export type Strategy = 'round-robin' | 'least-connections';

/** Round robin ignores load entirely. Each server gets the same share, fast or slow. */
export function roundRobin(live: Server[], counter: number): Server {
  return live[counter % live.length];
}

/**
 * Least connections sends each request to whichever server has the shortest queue.
 * Starting the scan at `counter` keeps ties from always landing on the first server.
 */
export function leastConnections(live: Server[], counter: number, queueOf: (s: Server) => number): Server {
  let best = live[counter % live.length];
  for (let i = 0; i < live.length; i++) {
    const candidate = live[(counter + i) % live.length];
    if (queueOf(candidate) < queueOf(best)) best = candidate;
  }
  return best;
}

export function route(strategy: Strategy, live: Server[], counter: number, queueOf: (s: Server) => number): Server {
  return strategy === 'round-robin' ? roundRobin(live, counter) : leastConnections(live, counter, queueOf);
}

export interface Balancer {
  servers: Server[];
  counter: number;
  fluidCounter: number;
  carry: number;
  now: number;
  wait: number;
  failed: number;
  lastPick: string;
}

const SLICE = 0.01; // simulate in 10 ms slices so requests and work interleave

/** Advances the pool by `seconds`, with random arrivals and service times. */
export function advancePool(b: Balancer, strategy: Strategy, trafficPerSec: number, healthCheckSec: number, seconds: number, rng: Rng) {
  const slices = Math.round(seconds / SLICE);
  let waitSum = 0;
  let waitCount = 0;
  for (const s of b.servers) s.arrivals = 0;

  for (let i = 0; i < slices; i++) {
    b.now += SLICE;
    // A dead server keeps receiving traffic until a health check notices.
    for (const s of b.servers) {
      if (!s.up && s.routable && b.now - s.downAt >= healthCheckSec) s.routable = false;
      if (s.up) s.routable = true;
    }
    const routable = b.servers.filter((s) => s.routable);
    const alive = b.servers.filter((s) => s.up);

    let arrivals = rng.poisson(trafficPerSec * SLICE);
    for (; arrivals > 0; arrivals--) {
      if (!routable.length) {
        b.failed++;
        continue;
      }
      const server = route(strategy, routable, b.counter++, (s) => s.queue);
      b.lastPick = server.name;
      if (!server.up) {
        server.lost++;
        b.failed++;
        continue;
      }
      waitSum += server.queue / server.capacity;
      waitCount++;
      server.queue++;
      server.arrivals++;
    }

    // The math's version: the exact average rate, no randomness, same routing rule.
    b.carry += trafficPerSec * SLICE;
    let whole = Math.floor(b.carry);
    b.carry -= whole;
    if (alive.length) {
      for (; whole > 0; whole--) route(strategy, alive, b.fluidCounter++, (s) => s.fluidQueue).fluidQueue++;
    }

    for (const s of alive) {
      s.queue = Math.max(0, s.queue - rng.poisson(s.capacity * SLICE));
      s.fluidQueue = Math.max(0, s.fluidQueue - s.capacity * SLICE);
    }
  }
  for (const s of b.servers) s.rate = s.rate * 0.85 + (s.arrivals / seconds) * 0.15;
  if (waitCount) b.wait = b.wait * 0.8 + (waitSum / waitCount) * 0.2;
}

export function kill(b: Balancer, s: Server) {
  s.up = false;
  s.downAt = b.now;
  s.lost += s.queue;
  b.failed += s.queue;
  s.queue = 0;
  s.fluidQueue = 0;
  s.rate = 0;
}
