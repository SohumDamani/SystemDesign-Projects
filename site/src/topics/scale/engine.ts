// Follows a stream of requests through an architecture and works out the load on each tier.
export interface Architecture {
  traffic: number; // requests per second arriving
  webServers: number;
  cdn: boolean;
  cache: boolean;
  replicas: number;
  shards: number;
}

// Rules of thumb. Real numbers depend on hardware and on the work each request does.
export const WEB_CAPACITY = 1000; // req/s per stateless web server
export const DB_READ_CAPACITY = 5000; // reads/s per database node
export const DB_WRITE_CAPACITY = 1000; // writes/s per primary
export const CACHE_CAPACITY = 100000; // ops/s per cache node

export const STATIC_SHARE = 0.3; // images, scripts and CSS
export const READ_SHARE = 0.9; // of dynamic requests
export const CACHE_HIT_RATE = 0.8;

export interface Tier {
  name: string;
  load: number; // req/s per node
  capacity: number; // req/s per node
  baseMs: number; // latency with no queue
  /** Fraction of all requests that pass through this tier. */
  share: number;
}

export function tiers(a: Architecture): Tier[] {
  const staticReqs = a.traffic * STATIC_SHARE;
  const dynamicReqs = a.traffic - staticReqs;
  const reads = dynamicReqs * READ_SHARE;
  const writes = dynamicReqs - reads;
  const webRequests = a.cdn ? dynamicReqs : a.traffic;
  const dbReads = a.cache ? reads * (1 - CACHE_HIT_RATE) : reads;
  const list: Tier[] = [];

  if (a.cdn) list.push({ name: 'CDN', load: staticReqs, capacity: Infinity, baseMs: 15, share: STATIC_SHARE });
  list.push({ name: 'Web servers', load: webRequests / a.webServers, capacity: WEB_CAPACITY, baseMs: 5, share: a.cdn ? 1 - STATIC_SHARE : 1 });
  if (a.cache) list.push({ name: 'Cache', load: reads, capacity: CACHE_CAPACITY, baseMs: 1, share: (reads / a.traffic) });
  // Each shard has one primary. Reads spread across the primary and its replicas.
  list.push({ name: 'Database reads', load: dbReads / ((1 + a.replicas) * a.shards), capacity: DB_READ_CAPACITY, baseMs: 10, share: dbReads / a.traffic });
  // Replicas copy writes but can't take them, so only shards spread write load.
  list.push({ name: 'Database writes', load: writes / a.shards, capacity: DB_WRITE_CAPACITY, baseMs: 15, share: writes / a.traffic });
  return list;
}

export function bottleneck(list: Tier[]): Tier {
  return list.reduce((worst, t) => (t.load / t.capacity > worst.load / worst.capacity ? t : worst));
}
