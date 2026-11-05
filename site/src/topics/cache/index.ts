import type { Lab, Topic } from '../../core/types';
import { fmtInt, fmtPct } from '../../core/format';
import { zipfSampler } from '../../core/rng';
import { tailMean, zipfTopShare } from '../../core/stats';
import source from './engine.ts?raw';
import { FifoCache, HOT_KEY, LfuCache, LruCache, finishFills, read, type Cache, type ReadStats } from './engine';

type P = { policy: 'lru' | 'lfu' | 'fifo'; capacity: number; skew: number; traffic: number; ttl: number; coalesce: boolean; dbCapacity: number };

const DT = 0.1;
const KEYS = 5000;
const FILL_SECONDS = 0.2;

interface S {
  now: number;
  cache: Cache;
  zipf: ReturnType<typeof zipfSampler>;
  inFlight: Map<number, number>;
  stats: ReadStats;
  tick: ReadStats;
  hitRate: number;
  dbLoad: number;
  lastHot: number;
}

const blank = (): ReadStats => ({ hits: 0, dbReads: 0, coalesced: 0, hotDbReads: 0 });

function build(p: P): Cache {
  if (p.policy === 'lfu') return new LfuCache(p.capacity, p.ttl);
  if (p.policy === 'fifo') return new FifoCache(p.capacity, p.ttl);
  return new LruCache(p.capacity, p.ttl);
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'policy', label: 'Eviction policy', kind: 'choice', rebuild: true, options: [{ value: 'lru', label: 'LRU, least recently used' }, { value: 'lfu', label: 'LFU, least frequently used' }, { value: 'fifo', label: 'FIFO, first in first out' }] },
    { key: 'capacity', label: 'Cache size', kind: 'range', min: 50, max: 5000, step: 50, unit: 'keys', rebuild: true },
    { key: 'skew', label: 'Traffic skew (Zipf s)', kind: 'range', min: 0, max: 1.5, step: 0.1, rebuild: true },
    { key: 'traffic', label: 'Read traffic', kind: 'range', min: 100, max: 5000, step: 100, unit: 'req/s' },
    { key: 'ttl', label: 'Time to live', kind: 'range', min: 0, max: 60, step: 1, rebuild: true, format: (v) => (v === 0 ? 'Never expires' : `${v} s`) },
    { key: 'dbCapacity', label: 'Database capacity', kind: 'range', min: 100, max: 3000, step: 100, unit: 'req/s' },
    { key: 'coalesce', label: 'Coalesce concurrent misses', kind: 'toggle' },
  ],
  defaults: { policy: 'lru', capacity: 500, skew: 1, traffic: 2000, ttl: 0, coalesce: false, dbCapacity: 1000 },
  create: (p) => ({ now: 0, cache: build(p), zipf: zipfSampler(KEYS, p.skew), inFlight: new Map(), stats: blank(), tick: blank(), hitRate: 0, dbLoad: 0, lastHot: 0 }),
  step(s, p, rng) {
    s.now += DT;
    s.tick = blank();
    const n = rng.poisson(p.traffic * DT);
    for (let i = 0; i < n; i++) read(s.cache, s.zipf(rng), s.now, FILL_SECONDS, p.coalesce, s.inFlight, s.tick);
    finishFills(s.cache, s.now, s.inFlight);
    s.stats.hits += s.tick.hits;
    s.stats.dbReads += s.tick.dbReads;
    s.stats.coalesced += s.tick.coalesced;
    s.stats.hotDbReads += s.tick.hotDbReads;
    s.lastHot += s.tick.hotDbReads;
    const total = s.tick.hits + s.tick.dbReads + s.tick.coalesced;
    s.hitRate = s.hitRate * 0.97 + (total ? s.tick.hits / total : 0) * 0.03;
    s.dbLoad = s.dbLoad * 0.9 + (s.tick.dbReads / DT) * 0.1;
  },
  sample: (s, p) => ({ hit: s.hitRate * 100, bestHit: zipfTopShare(p.capacity, KEYS, p.skew) * 100, db: s.dbLoad, dbCap: p.dbCapacity }),
  charts: [
    { title: 'Hit rate', unit: '%', series: [{ key: 'hit', label: 'Measured', role: 'measured' }, { key: 'bestHit', label: 'Best possible', role: 'predicted' }] },
    { title: 'Database load', unit: 'req/s', series: [{ key: 'db', label: 'Measured', role: 'measured' }, { key: 'dbCap', label: 'Capacity', role: 'predicted' }] },
  ],
  metrics(s, p) {
    const best = zipfTopShare(p.capacity, KEYS, p.skew);
    return [
      { label: 'Best possible hit rate', value: fmtPct(best), role: 'predicted' },
      { label: 'Hit rate', value: fmtPct(s.hitRate), role: 'measured' },
      { label: 'Database load', value: `${fmtInt(s.dbLoad)} req/s`, role: 'measured', tone: s.dbLoad > p.dbCapacity ? 'bad' : undefined },
      { label: 'Hot key database reads', value: fmtInt(s.lastHot), role: 'measured' },
    ];
  },
  math(s, p) {
    const best = zipfTopShare(p.capacity, KEYS, p.skew);
    const hotShare = zipfTopShare(1, KEYS, p.skew);
    const expected = p.traffic * hotShare * FILL_SECONDS;
    return [
      { expr: `Cache holds ${fmtInt(p.capacity)} of ${fmtInt(KEYS)} keys, or ${fmtPct(p.capacity / KEYS)}`, result: `up to ${fmtPct(best)} of reads` },
      { expr: `Database load: ${fmtInt(p.traffic)} × (1 − ${fmtPct(best)})`, result: `${fmtInt(p.traffic * (1 - best))} req/s`, tone: p.traffic * (1 - best) > p.dbCapacity ? 'bad' : 'good' },
      { expr: `Stampede: hot key gets ${fmtInt(p.traffic * hotShare)} req/s × ${FILL_SECONDS} s refill`, result: p.coalesce ? '1 read when coalesced' : `≈ ${fmtInt(expected)} reads` },
    ];
  },
  actions: [
    {
      key: 'expire-hot',
      label: 'Expire the hottest key',
      run: (s) => {
        s.cache.remove(HOT_KEY);
        s.lastHot = 0;
      },
    },
  ],
  trace(s, p) {
    return {
      values: { hit: fmtInt(s.tick.hits), miss: fmtInt(s.tick.dbReads), wait: p.coalesce ? fmtInt(s.tick.coalesced) : 'off', size: `${fmtInt(s.cache.size)} of ${fmtInt(p.capacity)}` },
      active: s.tick.dbReads ? ['miss'] : ['hit'],
    };
  },
  experiments: [
    {
      title: 'A small cache goes far',
      ticks: 600,
      question: 'The cache holds only 10% of all keys, and traffic is skewed the way real traffic usually is (Zipf, s = 1). What hit rate should you expect?',
      options: ['About 10%, the share of keys it holds', 'About 70%', 'Close to 100%'],
      answer: 1,
      explain: 'Popular keys get most of the reads, so holding the top 10% catches most traffic. The formula gives an upper bound of 75%, and LRU gets close to it without knowing which keys are popular. This skew is why caches pay off so well.',
      check: (_s, _p, h) => {
        const hit = tailMean(h, 'hit', 100);
        return hit > 55 && hit < 80;
      },
    },
    {
      title: 'No skew, no magic',
      set: { skew: 0 },
      ticks: 600,
      question: 'Same cache, but now every key is equally popular. What happens to the hit rate?',
      options: ['Stays about the same', 'Falls to about 10%', 'Falls to 0%'],
      answer: 1,
      explain: 'With uniform traffic the hit rate is simply the share of keys the cache holds: 500 of 5,000. Before you size a cache, ask how skewed the traffic is, since that decides whether it\'s worth having.',
      check: (_s, _p, h) => tailMean(h, 'hit', 100) < 15,
    },
    {
      title: 'The stampede',
      act: ['expire-hot'],
      actAt: 100,
      ticks: 115,
      question: 'The hottest key expires while it\'s receiving about 220 req/s, and refilling it takes 0.2 s. How many reads hit the database for that one key?',
      options: ['Exactly 1', 'A few dozen', 'Thousands'],
      answer: 1,
      explain: 'Every request that misses during the refill also goes to the database: about 220 × 0.2 = 44 reads for one value. With a truly hot key on a fragile database, that spike alone can cause an outage.',
      check: (s) => s.lastHot >= 15 && s.lastHot <= 90,
    },
    {
      title: 'Coalesce the misses',
      set: { coalesce: true },
      act: ['expire-hot'],
      actAt: 100,
      ticks: 115,
      question: 'Same expiry, now with concurrent misses coalesced, so only the first request fetches and others wait for it. How many database reads?',
      options: ['Exactly 1', 'About 22', 'About 44'],
      answer: 0,
      explain: 'Only one request reaches the database, and everyone else shares its answer. A lock around the refill does the same job. Adding random jitter to TTLs also helps, by stopping many keys from expiring at once.',
      check: (s) => s.lastHot <= 2,
    },
  ],
};

const topic: Topic = {
  problem: [
    'Databases are slow and memory is fast. A cache keeps recently used data in memory so most reads never reach the database. That cuts latency and, more importantly, protects the database from load it can\'t handle.',
    'A cache is smaller than the data behind it, so it must choose what to throw away, and it can return stale data. The design questions are about those two facts: which eviction policy, and how fresh the data needs to be.',
  ],
  functional: [
    'Serve reads from memory when the data is present',
    'Evict entries when full, and expire them when stale',
    'Fall through to the database on a miss',
  ],
  nonFunctional: [
    'Sub-millisecond reads',
    'A cache failure slows the system down but doesn\'t take it down',
    'A popular key expiring doesn\'t overload the database',
  ],
  diagram: {
    nodes: [
      { id: 'a', label: 'App server', col: 0, row: 0, note: 'Checks the cache first. On a miss it reads the database, then fills the cache.' },
      { id: 'c', label: 'Cache', col: 1, row: 0, kind: 'store', note: 'In-memory store such as Redis or Memcached, smaller than the data behind it.' },
      { id: 'd', label: 'Database', col: 1, row: 1, kind: 'store', note: 'The source of truth. Slower, and much harder to scale for reads.' },
    ],
    edges: [
      { from: 'a', to: 'c', label: '1. get' },
      { from: 'a', to: 'd', label: '2. on miss' },
    ],
  },
  ideas: [
    { title: 'Cache-aside', body: 'The application reads the cache and fills it after a miss. It\'s the most common pattern, and only data someone asked for gets cached. The first read of anything is always slow.' },
    { title: 'Write-through and write-back', body: 'Write-through updates cache and database together, keeping them consistent at the cost of slower writes. Write-back updates the cache and flushes later, which is fast but can lose data in a crash.' },
    { title: 'Why skew matters', body: 'Real traffic follows a power law: a few keys get most of the reads. That\'s why a cache holding a tiny share of keys can absorb most traffic.' },
    { title: 'Stampede', body: 'When a hot key expires, every in-flight request misses at once and hits the database. Coalescing misses, locking the refill, or refreshing early all prevent it.' },
  ],
  estimator: {
    vars: [
      { key: 'dau', label: 'Daily active users', unit: 'count' },
      { key: 'reads', label: 'Reads per user per day', unit: 'plain', assume: 40 },
      { key: 'keysPerUser', label: 'Keys per user', unit: 'plain', assume: 5 },
      { key: 'hotShare', label: 'Hot share of keys (0 to 1)', unit: 'plain', assume: 0.2 },
      { key: 'valueBytes', label: 'Bytes per value', unit: 'plain', assume: 1000 },
      { key: 'missRate', label: 'Miss rate (0 to 1)', unit: 'plain', assume: 0.1 },
      { key: 'readQps', label: 'Read load', unit: 'qps' },
      { key: 'dbQps', label: 'Database load', unit: 'qps' },
      { key: 'keys', label: 'Total keys', unit: 'count' },
      { key: 'memory', label: 'Cache memory', unit: 'bytes' },
    ],
    eqs: [
      { out: 'readQps', terms: [['dau', 1], ['reads', 1], [86400, -1]] },
      { out: 'dbQps', terms: [['readQps', 1], ['missRate', 1]] },
      { out: 'keys', terms: [['dau', 1], ['keysPerUser', 1]] },
      { out: 'memory', terms: [['keys', 1], ['hotShare', 1], ['valueBytes', 1]] },
    ],
    starts: [
      { key: 'dau', value: 10_000_000 },
      { key: 'memory', value: 10e9 },
      { key: 'readQps', value: 5000 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'read(key):' },
    { code: '  if key in cache: return it', id: 'hit' },
    { code: '  if a fetch for key is running: wait for it', id: 'wait' },
    { code: '  value = database.read(key)', id: 'miss' },
    { code: '  if cache is full: evict by policy', id: 'size' },
    { code: '  cache.put(key, value, ttl)' },
    { code: '  return value' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'LRU', gain: 'Simple, adapts to changing popularity', cost: 'One bulk scan can flush useful keys' },
    { choice: 'LFU', gain: 'Keeps steadily popular keys', cost: 'Slow to forget keys that used to be popular' },
    { choice: 'Long TTL', gain: 'Higher hit rate, less database load', cost: 'Users see stale data for longer' },
    { choice: 'Write-through', gain: 'Cache is always fresh', cost: 'Every write gets slower' },
  ],
  interview: [
    { q: 'How do you keep the cache consistent with the database?', a: 'Commonly you write to the database and then delete the cache key, so the next read refills it. A short TTL bounds how stale things can get if that delete fails. Perfect consistency between two systems needs much heavier machinery.' },
    { q: 'What happens when the cache goes down?', a: 'All its traffic lands on the database, which was sized assuming a cache. Plan for it with cache replicas, a local in-process cache, and load shedding or circuit breakers so the database survives.' },
    { q: 'How would you handle a very hot key?', a: 'Keep a small in-process copy on each application server for a second or two, or split it across several cache keys with a random suffix to spread the load across shards.' },
  ],
  mistakes: [
    'Sizing a cache by share of keys, when it\'s traffic skew that matters.',
    'Giving every key the same TTL, so large groups expire together.',
    'Treating the cache as durable storage.',
  ],
};

export default topic;
