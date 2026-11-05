import type { Lab, Topic } from '../../core/types';
import { fmtDuration, fmtInt, fmtPct } from '../../core/format';
import { harmonic, tailMean } from '../../core/stats';
import source from './engine.ts?raw';
import { advance, conflictDemo, createStore, read, write, type Store } from './engine';

type P = { n: number; r: number; w: number; delayMs: number; writesPerSec: number; readsPerSec: number };

const DT = 0.05;
const KEYS = 20;

interface S {
  store: Store;
  reads: number;
  stale: number;
  writes: number;
  failedWrites: number;
  failedReads: number;
  staleRate: number;
  failRate: number;
  writeLatency: number;
  readLatency: number;
  log: string[];
}

const clamp = (v: number, n: number) => Math.min(v, n);

/** Expected value of the k-th fastest of n exponential delays. */
const orderStat = (k: number, n: number, mean: number) => mean * (harmonic(n) - harmonic(n - k));

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'n', label: 'N, copies of each key', kind: 'range', min: 1, max: 5, step: 1, rebuild: true },
    { key: 'r', label: 'R, replies a read waits for', kind: 'range', min: 1, max: 5, step: 1 },
    { key: 'w', label: 'W, acks a write waits for', kind: 'range', min: 1, max: 5, step: 1 },
    { key: 'delayMs', label: 'Average replica delay', kind: 'range', min: 1, max: 200, step: 1, unit: 'ms' },
    { key: 'writesPerSec', label: 'Writes', kind: 'range', min: 1, max: 200, step: 1, unit: 'per s' },
    { key: 'readsPerSec', label: 'Reads', kind: 'range', min: 1, max: 500, step: 1, unit: 'per s' },
  ],
  defaults: { n: 3, r: 1, w: 1, delayMs: 50, writesPerSec: 100, readsPerSec: 200 },
  create: (p) => ({ store: createStore(p.n), reads: 0, stale: 0, writes: 0, failedWrites: 0, failedReads: 0, staleRate: 0, failRate: 0, writeLatency: 0, readLatency: 0, log: [] }),
  step(s, p, rng) {
    const r = clamp(p.r, p.n);
    const w = clamp(p.w, p.n);
    const mean = p.delayMs / 1000;
    advance(s.store, DT);
    let staleNow = 0;
    let readsNow = 0;
    let failedNow = 0;
    let writesNow = 0;
    for (let i = rng.poisson(p.writesPerSec * DT); i > 0; i--) {
      const res = write(s.store, rng.int(KEYS), w, mean, rng);
      s.writes++;
      writesNow++;
      if (res.ok) s.writeLatency = s.writeLatency * 0.98 + res.latency * 0.02;
      else {
        s.failedWrites++;
        failedNow++;
      }
    }
    for (let i = rng.poisson(p.readsPerSec * DT); i > 0; i--) {
      const res = read(s.store, rng.int(KEYS), r, mean, rng);
      s.reads++;
      readsNow++;
      if (!res.ok) s.failedReads++;
      else {
        s.readLatency = s.readLatency * 0.98 + res.latency * 0.02;
        if (res.stale) {
          s.stale++;
          staleNow++;
        }
      }
    }
    if (readsNow) s.staleRate = s.staleRate * 0.97 + (staleNow / readsNow) * 0.03;
    if (writesNow) s.failRate = s.failRate * 0.9 + (failedNow / writesNow) * 0.1;
  },
  sample: (s, p) => ({
    stale: s.staleRate * 100,
    strongLine: 0,
    latency: s.writeLatency * 1000,
    latencyMath: orderStat(clamp(p.w, p.n), s.store.replicas.filter((x) => x.alive).length || 1, p.delayMs / 1000) * 1000,
    failed: s.failRate * 100,
  }),
  charts: [
    { title: 'Reads returning stale data', unit: '%', series: [{ key: 'stale', label: 'Measured', role: 'measured' }, { key: 'failed', label: 'Writes failing', role: 'other' }] },
    { title: 'Write latency', unit: 'ms', series: [{ key: 'latency', label: 'Measured', role: 'measured' }, { key: 'latencyMath', label: 'Math', role: 'predicted' }] },
  ],
  metrics(s, p) {
    const r = clamp(p.r, p.n);
    const w = clamp(p.w, p.n);
    const strong = r + w > p.n;
    return [
      { label: 'Consistency', value: strong ? 'Strong' : 'Eventual', role: 'predicted', tone: strong ? 'good' : 'warn' },
      { label: 'Stale reads, recently', value: fmtPct(s.staleRate, 2), role: 'measured', tone: s.staleRate > 0.0005 ? 'warn' : 'good' },
      { label: 'Failed writes', value: fmtInt(s.failedWrites), role: 'measured', tone: s.failedWrites ? 'bad' : undefined },
      { label: 'Failed reads', value: fmtInt(s.failedReads), role: 'measured', tone: s.failedReads ? 'bad' : undefined },
    ];
  },
  math(s, p) {
    const r = clamp(p.r, p.n);
    const w = clamp(p.w, p.n);
    const alive = s.store.replicas.filter((x) => x.alive).length;
    return [
      { expr: `R + W > N: ${r} + ${w} vs ${p.n}`, result: r + w > p.n ? 'reads always overlap writes' : 'a read can miss a write', tone: r + w > p.n ? 'good' : 'warn' },
      { expr: `Write waits for fastest ${w} of ${alive || 0} replicas`, result: alive >= w ? fmtDuration(orderStat(w, alive, p.delayMs / 1000)) : 'cannot succeed', tone: alive >= w ? undefined : 'bad' },
      { expr: `Read waits for fastest ${r} of ${alive || 0} replicas`, result: alive >= r ? fmtDuration(orderStat(r, alive, p.delayMs / 1000)) : 'cannot succeed', tone: alive >= r ? undefined : 'bad' },
    ];
  },
  views: (s) => [
    { kind: 'cells', title: 'Replicas', items: s.store.replicas.map((r) => ({ label: r.name, value: r.alive ? 'Up' : 'Down', tone: r.alive ? 'good' : 'bad' })) },
    { kind: 'log', title: 'Vector clock conflict walkthrough', lines: s.log.map((text) => ({ text })) },
  ],
  actions: [
    {
      key: 'kill',
      label: 'Kill a replica',
      run: (s) => {
        const r = s.store.replicas.find((x) => x.alive);
        if (r) r.alive = false;
      },
    },
    {
      key: 'restore',
      label: 'Restore all replicas',
      run: (s) => {
        s.store.replicas.forEach((r) => (r.alive = true));
      },
    },
    { key: 'conflict', label: 'Show a write conflict', run: (s) => (s.log = conflictDemo()) },
  ],
  trace(s, p) {
    const r = clamp(p.r, p.n);
    const w = clamp(p.w, p.n);
    return {
      values: { w: `W = ${w}`, wl: fmtDuration(s.writeLatency), r: `R = ${r}`, rl: fmtDuration(s.readLatency), stale: fmtPct(s.reads ? s.stale / s.reads : 0, 2) },
    };
  },
  experiments: [
    {
      title: 'Fast and loose',
      set: { n: 3, r: 1, w: 1 },
      ticks: 300,
      question: 'With N = 3, R = 1 and W = 1, a read can return before it has heard from the replica that got the latest write. How often do reads look stale?',
      options: ['Never', 'A noticeable share of reads', 'Almost all of them'],
      answer: 1,
      explain: 'R + W = 2 isn\'t greater than N = 3, so the replica you read from may not be the one you wrote to. This is eventual consistency: very fast and highly available, but reads can go back in time.',
      check: (s) => s.reads > 100 && s.stale / s.reads > 0.02,
    },
    {
      title: 'Quorum',
      set: { n: 3, r: 2, w: 2 },
      ticks: 300,
      question: 'Now R = 2 and W = 2. How many reads can return stale data?',
      options: ['None', 'A few, under 1%', 'The same as before'],
      answer: 0,
      explain: 'R + W = 4 > 3, so any 2 replicas you read must include at least one of the 2 you wrote to. It\'s pure counting, not luck. You pay in latency, since every operation now waits for a slower replica.',
      check: (s) => s.stale === 0 && s.reads > 100,
    },
    {
      title: 'Lose two replicas',
      set: { n: 3, r: 2, w: 2 },
      act: ['kill', 'kill'],
      actAt: 20,
      ticks: 120,
      question: 'With R = W = 2, two of the three replicas die. What happens to writes?',
      options: ['They keep working on the one remaining replica', 'They all fail', 'About half fail'],
      answer: 1,
      explain: 'A write needs 2 acknowledgements, and only one replica can answer, so nothing succeeds. That\'s the CAP tradeoff made concrete: you chose consistency, so you lost availability. Sloppy quorums and hinted handoff exist to relax this.',
      check: (_s, _p, h) => tailMean(h, 'failed', 20) > 90,
    },
    {
      title: 'What W costs',
      set: { n: 3, r: 1, w: 3 },
      ticks: 600,
      question: 'Replica delay averages 50 ms. With W = 3, a write waits for the slowest of three replicas. What is the average write latency?',
      options: ['About 50 ms', 'About 90 ms', 'About 150 ms'],
      answer: 1,
      explain: 'Waiting for the slowest of 3 random delays takes 50 × (1 + 1/2 + 1/3) ≈ 92 ms, whereas the fastest of 3 takes only about 17 ms. The higher your W, the more you depend on your slowest machine. That\'s why tail latency matters so much here.',
      check: (_s, _p, h) => {
        const l = tailMean(h, 'latency', 200);
        return l > 70 && l < 115;
      },
    },
  ],
};

const topic: Topic = {
  problem: [
    'A key-value store is a giant distributed dictionary: `put(key, value)` and `get(key)`. It sounds trivial until the data won\'t fit on one machine and machines keep failing. Then you need to partition data, replicate it, and decide what happens when replicas disagree.',
    'The central tradeoff is the CAP theorem. When the network splits, you can either refuse some requests to stay consistent, or keep answering and risk conflicting data. Quorum settings let you choose where on that line to sit, per request.',
  ],
  functional: [
    '`put(key, value)` and `get(key)`',
    'Store data across many machines',
    'Keep working when machines fail',
  ],
  nonFunctional: [
    'Scales by adding machines',
    'Tunable consistency',
    'Low latency, even at high percentiles',
  ],
  diagram: {
    nodes: [
      { id: 'c', label: 'Client', col: 0, row: 1, kind: 'client', note: 'Talks to any node. That node acts as the coordinator for this request.' },
      { id: 'co', label: 'Coordinator', col: 1, row: 1, note: 'Finds the N replicas on the hash ring, sends to all, and waits for W or R replies.' },
      { id: 'a', label: 'Replica 1', col: 2, row: 0, kind: 'store', note: 'Writes to a commit log and memtable, then flushes to sorted files on disk.' },
      { id: 'b', label: 'Replica 2', col: 2, row: 1, kind: 'store', note: 'If this node is down, another can hold its writes and pass them on later. That\'s hinted handoff.' },
      { id: 'd', label: 'Replica 3', col: 2, row: 2, kind: 'store', note: 'Replicas compare Merkle trees in the background to find and repair differences cheaply.' },
    ],
    edges: [
      { from: 'c', to: 'co' },
      { from: 'co', to: 'a' },
      { from: 'co', to: 'b' },
      { from: 'co', to: 'd' },
    ],
  },
  ideas: [
    { title: 'Quorum: R + W > N', body: 'Store N copies, wait for W on writes and R on reads. If R + W > N, every read overlaps the latest write. Lower values are faster and more available, but can return old data.' },
    { title: 'Vector clocks', body: 'A version number can\'t tell you if two writes happened at the same time on different sides of a partition. A vector clock can, so the conflict can be kept and resolved instead of silently lost.' },
    { title: 'Handling failure', body: 'Nodes spot failures through gossip, sharing heartbeats with random peers. Hinted handoff covers short outages. Merkle trees find differences after long ones with little data transfer.' },
    { title: 'The storage engine', body: 'Writes append to a commit log and an in-memory table, later flushed as sorted files. Reads check memory, then a Bloom filter tells them which files might hold the key.' },
  ],
  estimator: {
    vars: [
      { key: 'users', label: 'Users', unit: 'count' },
      { key: 'keysPerUser', label: 'Keys per user', unit: 'plain', assume: 100 },
      { key: 'valueBytes', label: 'Bytes per value', unit: 'plain', assume: 1000 },
      { key: 'replicas', label: 'Copies, N', unit: 'plain', assume: 3 },
      { key: 'opsPerUser', label: 'Operations per user per day', unit: 'plain', assume: 50 },
      { key: 'nodeBytes', label: 'Bytes per node', unit: 'plain', assume: 2e12 },
      { key: 'keys', label: 'Total keys', unit: 'count' },
      { key: 'storage', label: 'Total storage', unit: 'bytes' },
      { key: 'nodes', label: 'Nodes', unit: 'count' },
      { key: 'qps', label: 'Average load', unit: 'qps' },
    ],
    eqs: [
      { out: 'keys', terms: [['users', 1], ['keysPerUser', 1]] },
      { out: 'storage', terms: [['keys', 1], ['valueBytes', 1], ['replicas', 1]] },
      { out: 'nodes', terms: [['storage', 1], ['nodeBytes', -1]] },
      { out: 'qps', terms: [['users', 1], ['opsPerUser', 1], [86400, -1]] },
    ],
    starts: [
      { key: 'users', value: 100_000_000 },
      { key: 'storage', value: 1e15 },
      { key: 'nodes', value: 100 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'put(key, value):' },
    { code: '  send to all N replicas for this key' },
    { code: '  wait for W acknowledgements', id: 'w' },
    { code: '  return success', id: 'wl' },
    { code: '' },
    { code: 'get(key):' },
    { code: '  ask all N replicas' },
    { code: '  wait for R replies', id: 'r' },
    { code: '  return the newest version among them', id: 'rl' },
    { code: '  share of reads that were stale', id: 'stale' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'W = N, R = 1', gain: 'Fast reads', cost: 'Slow writes, and one dead node blocks all writes' },
    { choice: 'W = 1, R = N', gain: 'Fast writes', cost: 'Slow reads, and one dead node blocks all reads' },
    { choice: 'W = R = quorum', gain: 'Consistent, and survives a minority of failures', cost: 'Every operation waits on more replicas' },
    { choice: 'Vector clocks', gain: 'Detects real conflicts', cost: 'Metadata grows, and clients must resolve conflicts' },
    { choice: 'Last write wins', gain: 'Simple', cost: 'Silently drops one of two concurrent writes, and depends on clocks' },
  ],
  interview: [
    { q: 'What does CAP really mean in practice?', a: 'Networks will partition, so the real choice is what to do when they do. CP systems refuse some requests to stay correct. AP systems keep answering and clean up later. Banks lean CP, while shopping carts lean AP.' },
    { q: 'How do you detect that a node has failed?', a: 'Gossip. Each node keeps a list of heartbeat counters, regularly exchanges it with random peers, and considers a node down if its counter hasn\'t moved for a while. It needs no central monitor and spreads quickly.' },
    { q: 'How do replicas catch up after an outage?', a: 'Hinted handoff covers short outages: another node holds the writes and replays them. For longer gaps, replicas compare Merkle trees, which pinpoint differing ranges while transferring very little data.' },
    { q: 'Why LSM trees rather than B-trees?', a: 'Appending to a log and flushing sorted files gives very fast writes, ideal for high-volume stores. The cost is read and space amplification, handled with Bloom filters and background compaction.' },
  ],
  mistakes: [
    'Stating CAP as "pick two", when partitions aren\'t optional.',
    'Using last-write-wins without noticing it loses data.',
    'Assuming R + W > N also protects you during node failures with sloppy quorums. It doesn\'t.',
  ],
};

export default topic;
