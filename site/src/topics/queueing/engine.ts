// A first-come, first-served queue with c servers, computed one request at a time.

/** Sends a request to whichever server frees up first, and returns when it will finish. */
export function serve(freeAt: number[], arrival: number, service: number): number {
  let soonest = 0;
  for (let i = 1; i < freeAt.length; i++) if (freeAt[i] < freeAt[soonest]) soonest = i;
  const start = Math.max(arrival, freeAt[soonest]);
  const finish = start + service;
  freeAt[soonest] = finish;
  return finish;
}

/** The value below which `p` percent of the sorted values fall. */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/**
 * The chance a request has to wait at all, with c servers at a given offered load.
 * Known as Erlang C. For one server it comes out to simply the utilization.
 */
export function erlangC(servers: number, offeredLoad: number): number {
  const rho = offeredLoad / servers;
  if (rho >= 1) return 1;
  let term = 1;
  let sum = 1;
  for (let k = 1; k < servers; k++) {
    term *= offeredLoad / k;
    sum += term;
  }
  term *= offeredLoad / servers;
  const top = term / (1 - rho);
  return top / (sum + top);
}

/** Queueing theory's prediction of average time in the system. Infinite past capacity. */
export function predictedLatency(arrivalRate: number, serviceSeconds: number, servers: number, fixedService: boolean): number {
  const offered = arrivalRate * serviceSeconds;
  if (offered >= servers) return Infinity;
  const waitChance = erlangC(servers, offered);
  const wait = (waitChance * serviceSeconds) / (servers - offered);
  // Removing variability in service time cuts the wait about in half.
  return serviceSeconds + (fixedService ? wait / 2 : wait);
}

/** With fan-out, a request is slow if any backend it touches is slow. */
export const slowShareAfterFanout = (slowShare: number, fanout: number) => 1 - (1 - slowShare) ** fanout;
