import type { Lab, Topic } from '../../core/types';
import { fmtCount, fmtInt, fmtPct } from '../../core/format';
import { zipfSampler } from '../../core/rng';
import source from './engine.ts?raw';
import { KEY_SPACE, makeRouter, movedShareOnResize, type Router, type Strategy } from './engine';

type P = { strategy: Strategy; shards: number; pattern: 'random' | 'ordered' | 'skewed'; writesPerSec: number; capacity: number; scanWidth: number };

const DT = 0.1;

interface S {
  router: Router;
  loads: number[];
  rows: number[];
  sequence: number;
  zipf: ReturnType<typeof zipfSampler>;
  celebrity: boolean;
  celebrityKey: number;
  scansTouched: number;
  scans: number;
  moved: number | null;
  sampleKeys: number[];
  lastKey: number;
  lastShard: number;
}

const avgLoad = (s: S) => s.loads.reduce((a, b) => a + b, 0) / Math.max(1, s.loads.length);
const peakLoad = (s: S) => Math.max(...s.loads);
const imbalance = (s: S) => (avgLoad(s) ? peakLoad(s) / avgLoad(s) : 1);

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'strategy', label: 'Shard by', kind: 'choice', rebuild: true, options: [{ value: 'hash', label: 'hash(key) % shards' }, { value: 'consistent', label: 'Consistent hashing' }, { value: 'range', label: 'Key ranges' }] },
    { key: 'shards', label: 'Shards', kind: 'range', min: 2, max: 16, step: 1, rebuild: true },
    { key: 'pattern', label: 'Keys look like', kind: 'choice', rebuild: true, options: [{ value: 'random', label: 'Random user IDs' }, { value: 'ordered', label: 'Timestamps, always growing' }, { value: 'skewed', label: 'Some users far busier' }] },
    { key: 'writesPerSec', label: 'Writes', kind: 'range', min: 100, max: 20000, step: 100, unit: 'per s' },
    { key: 'capacity', label: 'Capacity per shard', kind: 'range', min: 100, max: 5000, step: 100, unit: 'per s' },
    { key: 'scanWidth', label: 'Range query width', kind: 'range', min: 100, max: 100000, step: 100, unit: 'keys' },
  ],
  defaults: { strategy: 'hash', shards: 8, pattern: 'random', writesPerSec: 4000, capacity: 1000, scanWidth: 1000 },
  create(p, rng) {
    const n = p.shards;
    return {
      router: makeRouter(p.strategy, n),
      loads: Array(n).fill(0),
      rows: Array(n).fill(0),
      // Time-ordered keys are always the largest yet, so they live at the very end of the range.
      sequence: Math.floor(KEY_SPACE * 0.96),
      zipf: zipfSampler(5000, 1),
      celebrity: false,
      celebrityKey: 424242,
      scansTouched: 0,
      scans: 0,
      moved: null,
      sampleKeys: Array.from({ length: 5000 }, () => rng.int(KEY_SPACE)),
      lastKey: 0,
      lastShard: 0,
    };
  },
  step(s, p, rng) {
    const n = rng.poisson(p.writesPerSec * DT);
    const counts = Array(s.router.shards).fill(0);
    for (let i = 0; i < n; i++) {
      let key: number;
      if (s.celebrity && rng.chance(0.4)) key = s.celebrityKey;
      else if (p.pattern === 'ordered') key = Math.min(KEY_SPACE - 1, s.sequence++ % KEY_SPACE);
      else if (p.pattern === 'skewed') key = (s.zipf(rng) * 197) % KEY_SPACE;
      else key = rng.int(KEY_SPACE);
      const shard = s.router.route(key);
      counts[shard]++;
      s.rows[shard]++;
      s.lastKey = key;
      s.lastShard = shard;
    }
    if (s.loads.length < counts.length) s.loads.push(...Array(counts.length - s.loads.length).fill(0));
    if (s.rows.length < counts.length) s.rows.push(...Array(counts.length - s.rows.length).fill(0));
    s.loads = s.loads.map((l, i) => l * 0.8 + (counts[i] / DT) * 0.2);
    const from = rng.int(KEY_SPACE - p.scanWidth);
    s.scansTouched += s.router.shardsForRange(from, from + p.scanWidth);
    s.scans++;
  },
  sample: (s, p) => ({ peak: peakLoad(s), avg: avgLoad(s), cap: p.capacity }),
  charts: [{ title: 'Load on the busiest shard', unit: 'writes/s', series: [{ key: 'peak', label: 'Busiest', role: 'measured' }, { key: 'cap', label: 'Capacity', role: 'predicted' }, { key: 'avg', label: 'Average', role: 'other' }] }],
  metrics(s, p) {
    return [
      { label: 'Even share per shard', value: fmtCount(p.writesPerSec / s.router.shards), role: 'predicted' },
      { label: 'Busiest shard', value: fmtCount(peakLoad(s)), role: 'measured', tone: peakLoad(s) > p.capacity ? 'bad' : 'good' },
      { label: 'Busiest over average', value: `${imbalance(s).toFixed(2)}×`, role: 'measured', tone: imbalance(s) > 1.5 ? 'bad' : undefined },
      { label: 'Shards per range query', value: s.scans ? (s.scansTouched / s.scans).toFixed(1) : '0', role: 'measured' },
      { label: 'Keys moved on last resize', value: s.moved === null ? 'Not resized yet' : fmtPct(s.moved), role: 'measured' },
    ];
  },
  math(s, p) {
    const n = s.router.shards;
    return [
      { expr: `Even share: ${fmtInt(p.writesPerSec)} ÷ ${n} shards`, result: `${fmtInt(p.writesPerSec / n)}/s`, tone: p.writesPerSec / n > p.capacity ? 'bad' : 'good' },
      { expr: p.strategy === 'hash' ? `Resizing to ${n + 1} shards moves ${n} ÷ ${n + 1} of keys` : p.strategy === 'consistent' ? `Resizing to ${n + 1} shards moves 1 ÷ ${n + 1} of keys` : 'Resizing means splitting a range and moving half of it', result: p.strategy === 'hash' ? fmtPct(n / (n + 1)) : p.strategy === 'consistent' ? fmtPct(1 / (n + 1)) : 'one shard\'s data', tone: p.strategy === 'hash' ? 'bad' : 'good' },
      { expr: `Range query of ${fmtInt(p.scanWidth)} keys touches`, result: p.strategy === 'range' ? `${Math.max(1, Math.ceil((p.scanWidth / KEY_SPACE) * n))} to ${Math.ceil((p.scanWidth / KEY_SPACE) * n) + 1} shards` : `all ${n} shards`, tone: p.strategy === 'range' ? 'good' : 'warn' },
    ];
  },
  views: (s, p) => [
    { kind: 'bars', title: 'Writes per second on each shard', marker: { value: p.capacity, label: 'Shard capacity' }, items: s.loads.map((l, i) => ({ label: `Shard ${i + 1}`, value: l, tone: l > p.capacity ? 'bad' : 'neutral' })) },
  ],
  actions: [
    {
      key: 'celebrity',
      label: 'One key goes viral, or stops',
      run: (s) => {
        s.celebrity = !s.celebrity;
      },
    },
    {
      key: 'add',
      label: 'Add a shard',
      run: (s) => {
        s.moved = movedShareOnResize(s.router, s.sampleKeys);
      },
    },
  ],
  trace: (s) => ({
    values: { key: fmtInt(s.lastKey), shard: `shard ${s.lastShard + 1}`, moved: s.moved === null ? '' : fmtPct(s.moved) },
  }),
  experiments: [
    {
      title: 'Timestamps and ranges',
      set: { strategy: 'range', pattern: 'ordered', shards: 8 },
      ticks: 100,
      question: 'You shard by key range, and keys are timestamps that always grow. With 8 shards, how is the write load spread?',
      options: ['Evenly', 'About double on some', 'All of it on one shard'],
      answer: 2,
      explain: 'Every new key is the largest so far, so it always falls in the last range. You have 8 databases, and one doing all the work. This is why teams avoid a plain timestamp or auto-increment as a range key.',
      check: (s) => imbalance(s) > 6,
    },
    {
      title: 'Hash those timestamps',
      set: { strategy: 'hash', pattern: 'ordered', shards: 8 },
      ticks: 100,
      question: 'Same timestamps, but now shard by a hash of the key. How is the load spread?',
      options: ['Still on one shard', 'Close to even'],
      answer: 1,
      explain: 'Hashing scatters neighboring keys across shards, so writes spread evenly. But you just gave up something: rows that were next to each other are now far apart.',
      check: (s) => imbalance(s) < 1.5,
    },
    {
      title: 'The price of hashing',
      set: { strategy: 'hash', scanWidth: 1000, shards: 8 },
      ticks: 60,
      question: 'A query asks for 1,000 consecutive keys, such as one hour of events. How many of the 8 hashed shards must it ask?',
      options: ['One or two', 'All 8'],
      answer: 1,
      explain: 'The keys could be anywhere, so it fans out to every shard and waits for the slowest. With range sharding, it would touch one or two. The shard key decides which queries are cheap, so choose it from your most common query.',
      check: (s) => s.scansTouched / s.scans === s.router.shards,
    },
    {
      title: 'One viral key',
      set: { strategy: 'hash', shards: 8, writesPerSec: 4000 },
      act: ['celebrity'],
      actAt: 10,
      ticks: 80,
      question: 'A hash spreads keys evenly. But one key suddenly gets 40% of all writes. What happens?',
      options: ['Hashing still keeps it even', 'One shard overloads anyway'],
      answer: 1,
      explain: 'Hashing evens out keys, not traffic. One key always maps to one shard. To fix it, you must split that key across shards with a suffix, cache it, or give it dedicated hardware.',
      check: (s, p) => peakLoad(s) > p.capacity * 1.3,
    },
    {
      title: 'Add a shard with modulo',
      set: { strategy: 'hash', shards: 8 },
      act: ['add'],
      actAt: 5,
      ticks: 10,
      question: 'Going from 8 shards to 9 with `hash % shards`, what share of data must move?',
      options: ['About 11%', 'About 50%', 'About 89%'],
      answer: 2,
      explain: 'Nearly every key computes a different remainder. That means copying almost your whole database, usually while serving traffic. It\'s the reason consistent hashing exists.',
      check: (s) => s.moved !== null && s.moved > 0.8,
    },
    {
      title: 'Add one with a ring',
      set: { strategy: 'consistent', shards: 8 },
      act: ['add'],
      actAt: 5,
      ticks: 10,
      question: 'Same resize, using consistent hashing. What share of data moves?',
      options: ['About 11%', 'About 50%', 'About 89%'],
      answer: 0,
      explain: 'Only the keys that the new shard takes over need to move, about 1 ÷ 9. An alternative that\'s common in practice is to start with many logical shards, and move whole logical shards between machines.',
      check: (s) => s.moved !== null && s.moved < 0.22,
    },
  ],
};

const topic: Topic = {
  problem: [
    'Sooner or later a single database runs out of room or can\'t keep up with writes. Replicas can\'t help with this, since every write still goes to one place. So you split the data across many databases. That\'s sharding, and it changes almost everything.',
    'The most important decision is the shard key: the column that decides where a row lives. Pick well, and load spreads evenly while most queries touch one shard. Pick badly, and you\'ll have a very expensive system with one overloaded database and painful queries.',
  ],
  functional: [
    'Route each row to the correct shard',
    'Answer queries that span more than one shard',
    'Add capacity without downtime',
  ],
  nonFunctional: [
    'Load spreads evenly across shards',
    'Common queries touch only one shard',
    'Resizing moves as little data as possible',
  ],
  diagram: {
    nodes: [
      { id: 'a', label: 'Application', col: 0, row: 1, note: 'Knows only about rows, not where they live.' },
      { id: 'r', label: 'Shard router', col: 1, row: 1, note: 'Works out the shard from the key. It can be a library, a proxy, or the database itself.' },
      { id: 'm', label: 'Shard map', col: 1, row: 0, kind: 'store', note: 'Which key ranges or hash slots live where. Must be kept highly available.' },
      { id: 's1', label: 'Shard 1', col: 2, row: 0, kind: 'store', note: 'A normal database holding part of the data, usually with its own replicas.' },
      { id: 's2', label: 'Shard 2', col: 2, row: 1, kind: 'store', note: 'A normal database holding another part.' },
      { id: 's3', label: 'Shard 3', col: 2, row: 2, kind: 'store', note: 'Queries spanning shards have to be split up and their results merged.' },
    ],
    edges: [
      { from: 'a', to: 'r' },
      { from: 'r', to: 'm', dashed: true },
      { from: 'r', to: 's1' },
      { from: 'r', to: 's2' },
      { from: 'r', to: 's3' },
    ],
  },
  ideas: [
    { title: 'Hash sharding', body: 'Spreads keys evenly, and is the safe default for random access. But related rows scatter, so range queries must ask every shard, and plain modulo makes resizing very expensive.' },
    { title: 'Range sharding', body: 'Keeps neighboring keys together, so range queries are cheap. But popular or ever-growing keys all land in one place. Splitting ranges automatically helps, but doesn\'t solve timestamps.' },
    { title: 'Choosing a shard key', body: 'Look at your most common query. For a chat app, shard by conversation. For a store, shard by customer. The goal is that most requests need exactly one shard.' },
    { title: 'What you give up', body: 'Joins across shards, unique constraints across shards, and easy transactions. That\'s why you try caching and read replicas first, and shard only when you must.' },
  ],
  estimator: {
    vars: [
      { key: 'rows', label: 'Total rows', unit: 'count' },
      { key: 'rowBytes', label: 'Bytes per row', unit: 'plain', assume: 500 },
      { key: 'shardBytes', label: 'Bytes per shard', unit: 'plain', assume: 2e12 },
      { key: 'writesPerRow', label: 'Writes per second per billion rows', unit: 'plain', assume: 2000 },
      { key: 'total', label: 'Total data', unit: 'bytes' },
      { key: 'shards', label: 'Shards for storage', unit: 'count' },
      { key: 'writes', label: 'Total writes', unit: 'qps' },
      { key: 'perShard', label: 'Writes per shard', unit: 'qps' },
    ],
    eqs: [
      { out: 'total', terms: [['rows', 1], ['rowBytes', 1]] },
      { out: 'shards', terms: [['total', 1], ['shardBytes', -1]] },
      { out: 'writes', terms: [['rows', 1], ['writesPerRow', 1], [1e9, -1]] },
      { out: 'perShard', terms: [['writes', 1], ['shards', -1]] },
    ],
    starts: [
      { key: 'rows', value: 1e11 },
      { key: 'total', value: 100e12 },
      { key: 'shards', value: 50 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'write(key, row):' },
    { code: '  key from the shard key column', id: 'key' },
    { code: '  shard = router.route(key)', id: 'shard' },
    { code: '  shard.insert(row)' },
    { code: '' },
    { code: 'query(from, to):' },
    { code: '  ask every shard whose keys could match' },
    { code: '  merge the results' },
    { code: 'share of keys moved on the last resize', id: 'moved' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Hash sharding', gain: 'Even load', cost: 'Range queries hit every shard' },
    { choice: 'Range sharding', gain: 'Efficient range queries', cost: 'Hot spots with ordered or popular keys' },
    { choice: 'Consistent hashing', gain: 'Resizing moves little data', cost: 'A ring to maintain' },
    { choice: 'Directory of keys', gain: 'Total control over placement', cost: 'The directory becomes a critical dependency' },
  ],
  interview: [
    { q: 'How do you reshard without downtime?', a: 'Copy data to the new shards while writing to both, then switch reads over once they\'ve caught up, and finally stop writing to the old location. Starting with many logical shards makes this easier, since you only move whole units.' },
    { q: 'How do you handle a query that needs all shards?', a: 'Scatter-gather: send it to each shard, then merge. It\'s slower, and limited by the slowest shard. If it\'s frequent, keep a separate index or a copy partitioned by that field.' },
    { q: 'How do you get unique IDs across shards?', a: 'Auto-increment stops working. Use a Snowflake-style generator, or UUIDs. Including the shard ID inside the ID is a neat way to route later without a lookup.' },
    { q: 'What about transactions across shards?', a: 'Try to design them away by choosing a shard key that keeps related data together. If you can\'t, use two-phase commit or a saga, and accept the added complexity.' },
  ],
  mistakes: [
    'Sharding before trying caches and replicas.',
    'Using a timestamp or auto-increment ID as a range key.',
    'Assuming a hash solves hot keys.',
  ],
};

export default topic;
