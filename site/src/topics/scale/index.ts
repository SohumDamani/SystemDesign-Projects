import type { Lab, Topic } from '../../core/types';
import { fmtCount, fmtInt, fmtPct } from '../../core/format';
import { tailMean } from '../../core/stats';
import source from './engine.ts?raw';
import { bottleneck, tiers, type Architecture, type Tier } from './engine';

type P = { traffic: number; webServers: number; cdn: boolean; cache: boolean; replicas: number; shards: number };

const DT = 0.2;
const MAX_QUEUE_SECONDS = 5; // past this, requests time out

interface S {
  backlog: Record<string, number>;
  latency: number;
  served: number;
  errors: number;
  errorRate: number;
  list: Tier[];
}

const arch = (p: P): Architecture => p;

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'traffic', label: 'Traffic', kind: 'range', min: 100, max: 100000, step: 100, unit: 'req/s' },
    { key: 'webServers', label: 'Web servers', kind: 'range', min: 1, max: 100, step: 1 },
    { key: 'replicas', label: 'Read replicas per shard', kind: 'range', min: 0, max: 8, step: 1 },
    { key: 'shards', label: 'Database shards', kind: 'range', min: 1, max: 16, step: 1 },
    { key: 'cache', label: 'Add a cache', kind: 'toggle' },
    { key: 'cdn', label: 'Add a CDN', kind: 'toggle' },
  ],
  defaults: { traffic: 500, webServers: 1, cdn: false, cache: false, replicas: 0, shards: 1 },
  create: (p) => ({ backlog: {}, latency: 0, served: 0, errors: 0, errorRate: 0, list: tiers(arch(p)) }),
  step(s, p, rng) {
    s.list = tiers(arch(p));
    let latency = 0;
    let dropped = 0;
    for (const t of s.list) {
      if (t.capacity === Infinity) {
        latency += t.baseMs * t.share;
        continue;
      }
      const arrivals = rng.poisson(t.load * DT);
      let q = (s.backlog[t.name] ?? 0) + arrivals - t.capacity * DT;
      if (q < 0) q = 0;
      // A queue that would take too long to drain means requests are timing out.
      const limit = t.capacity * MAX_QUEUE_SECONDS;
      if (q > limit) {
        dropped += (q - limit) / Math.max(t.load, 1) * t.load;
        q = limit;
      }
      s.backlog[t.name] = q;
      latency += (t.baseMs + (q / t.capacity) * 1000) * t.share;
    }
    const offered = p.traffic * DT;
    const failed = Math.min(offered, dropped);
    s.errors += failed;
    s.served += offered - failed;
    s.errorRate = s.errorRate * 0.9 + (failed / offered) * 0.1;
    s.latency = s.latency * 0.8 + latency * 0.2;
  },
  sample(s) {
    const idle = s.list.reduce((a, t) => a + t.baseMs * t.share, 0);
    return { latency: s.latency, idle, errors: s.errorRate * 100 };
  },
  charts: [
    { title: 'Average latency', unit: 'ms', series: [{ key: 'latency', label: 'Measured', role: 'measured' }, { key: 'idle', label: 'With no queues', role: 'predicted' }] },
    { title: 'Requests timing out', unit: '%', series: [{ key: 'errors', label: 'Measured', role: 'measured' }] },
  ],
  metrics(s) {
    const b = bottleneck(s.list);
    const u = b.load / b.capacity;
    return [
      { label: 'Bottleneck', value: u < 0.8 ? 'None yet' : b.name, role: 'predicted', tone: u >= 1 ? 'bad' : u >= 0.8 ? 'warn' : 'good' },
      { label: 'Busiest tier', value: fmtPct(u), role: 'predicted', tone: u >= 1 ? 'bad' : undefined },
      { label: 'Latency', value: `${fmtInt(s.latency)} ms`, role: 'measured' },
      { label: 'Timeouts', value: fmtPct(s.errorRate, 1), role: 'measured', tone: s.errorRate > 0.01 ? 'bad' : undefined },
    ];
  },
  math: (s) =>
    s.list
      .filter((t) => t.capacity !== Infinity)
      .map((t) => {
        const u = t.load / t.capacity;
        return { expr: `${t.name}: ${fmtCount(t.load)} ÷ ${fmtCount(t.capacity)} per node`, result: fmtPct(u), tone: u >= 1 ? ('bad' as const) : u >= 0.8 ? ('warn' as const) : ('good' as const) };
      }),
  views: (s) => [
    {
      kind: 'bars',
      title: 'Load on each tier, as a share of its capacity',
      max: 1,
      marker: { value: 1, label: '100% of capacity' },
      items: s.list
        .filter((t) => t.capacity !== Infinity)
        .map((t) => {
          const u = t.load / t.capacity;
          return { label: t.name, value: u, display: fmtPct(u), tone: u >= 1 ? ('bad' as const) : u >= 0.8 ? ('warn' as const) : ('neutral' as const) };
        }),
    },
  ],
  trace(s) {
    const b = bottleneck(s.list);
    return { values: { worst: `${b.name}, ${fmtPct(b.load / b.capacity)}` }, active: ['worst'] };
  },
  experiments: [
    {
      title: 'Ten times the traffic',
      set: { traffic: 5000 },
      ticks: 100,
      question: 'You have one web server and one database, and traffic jumps to 5,000 req/s. Which tier fails first?',
      options: ['The web server', 'Database reads', 'Database writes'],
      answer: 0,
      explain: 'One web server handles about 1,000 req/s, so it\'s at 500%. The database is still fine, at 63% for reads and 35% for writes. Web servers are the easiest tier to scale: keep them stateless and put a load balancer in front.',
      check: (s) => bottleneck(s.list).name === 'Web servers',
    },
    {
      title: 'Add web servers',
      set: { traffic: 20000, webServers: 25 },
      ticks: 100,
      question: 'Traffic is 20,000 req/s and you\'ve added 25 web servers. Where does the problem move?',
      options: ['Nowhere, the system is healthy', 'Database reads', 'The load balancer'],
      answer: 1,
      explain: 'Web servers are fine at 80%, but they all talk to one database, which now gets 12,600 reads a second against a capacity of 5,000. Scaling one tier just moves the bottleneck to the next.',
      check: (s) => bottleneck(s.list).name === 'Database reads',
    },
    {
      title: 'Add a cache',
      set: { traffic: 20000, webServers: 25, cache: true },
      ticks: 100,
      question: 'A cache with an 80% hit rate absorbs most of those reads. What\'s the bottleneck now?',
      options: ['The cache itself', 'Database reads', 'Database writes'],
      answer: 2,
      explain: 'Reads fall to 2,520 a second, comfortably within capacity. A cache doesn\'t help writes, though, and they are at 1,400 against a capacity of 1,000.',
      check: (s) => bottleneck(s.list).name === 'Database writes',
    },
    {
      title: 'Replicas for a write problem',
      set: { traffic: 20000, webServers: 25, cache: true, replicas: 4 },
      ticks: 100,
      question: 'You add 4 read replicas to fix the write overload. What happens to write load?',
      options: ['It falls to about 28%', 'It stays at 140%', 'It gets worse'],
      answer: 1,
      explain: 'Replicas can serve reads, but every write still goes to the one primary. This is a classic interview mistake. For write scaling you need to split the data.',
      check: (s) => bottleneck(s.list).name === 'Database writes' && bottleneck(s.list).load / bottleneck(s.list).capacity > 1,
    },
    {
      title: 'Shard the database',
      set: { traffic: 20000, webServers: 25, cache: true, shards: 2 },
      ticks: 150,
      question: 'Instead, you split the database into 2 shards. Does the system become healthy?',
      options: ['Yes, every tier falls under 100%', 'No, writes are still overloaded', 'No, reads get worse'],
      answer: 0,
      explain: 'Each shard takes half the writes, so write load falls to 70%. Sharding works, but it costs you cross-shard joins and a resharding plan, which is why you only reach for it after simpler options.',
      check: (s, _p, h) => s.list.every((t) => t.load / t.capacity < 1) && tailMean(h, 'errors', 30) < 1,
    },
  ],
};

const topic: Topic = {
  problem: [
    'Every large system started as one server running everything. Growing it is a series of small moves, each fixing whichever part is about to break: separate the database, add web servers behind a load balancer, add replicas and a cache, push static files to a CDN, then finally split the data.',
    'The skill is knowing which move comes next. Each one removes a bottleneck and reveals the next. The lab lets you make those moves in order and watch where the load goes.',
  ],
  functional: [
    'Serve users whose number grows by orders of magnitude',
    'Separate static content, reads and writes as load demands',
    'Keep working when individual machines fail',
  ],
  nonFunctional: [
    'No single point of failure',
    'Stateless web tier, so servers can be added freely',
    'Latency stays steady as traffic grows',
  ],
  diagram: {
    nodes: [
      { id: 'u', label: 'Users', col: 0, row: 1, kind: 'client', note: 'Static files come from the CDN, and dynamic requests go to your servers.' },
      { id: 'cdn', label: 'CDN', col: 1, row: 0, kind: 'external', note: 'Serves images, video and scripts from locations close to users.' },
      { id: 'lb', label: 'Load balancer', col: 1, row: 1, note: 'Spreads requests across web servers and removes unhealthy ones.' },
      { id: 'web', label: 'Web servers', col: 2, row: 1, note: 'Stateless. Session data lives in a shared store, so any server can handle any user.' },
      { id: 'cache', label: 'Cache', col: 3, row: 0, kind: 'store', note: 'Absorbs most reads, so far fewer reach the database.' },
      { id: 'db', label: 'Primary database', col: 3, row: 1, kind: 'store', note: 'Takes all writes. Shard it when one primary can no longer keep up.' },
      { id: 'rep', label: 'Read replicas', col: 3, row: 2, kind: 'store', note: 'Copies of the primary that serve reads. They may lag slightly behind it.' },
      { id: 'mq', label: 'Message queue', col: 2, row: 2, kind: 'queue', note: 'Lets slow work happen in the background, so a spike doesn\'t have to be handled instantly.' },
      { id: 'wk', label: 'Workers', col: 1, row: 2, note: 'Process queued jobs, and can scale independently of the web tier.' },
    ],
    edges: [
      { from: 'u', to: 'cdn', dashed: true },
      { from: 'u', to: 'lb' },
      { from: 'lb', to: 'web' },
      { from: 'web', to: 'cache' },
      { from: 'web', to: 'db' },
      { from: 'web', to: 'rep' },
      { from: 'db', to: 'rep', dashed: true },
      { from: 'web', to: 'mq' },
      { from: 'mq', to: 'wk' },
    ],
  },
  ideas: [
    { title: 'Vertical or horizontal', body: 'A bigger machine is simple but has a ceiling and remains a single point of failure. More machines has no ceiling, but only works once your servers are stateless.' },
    { title: 'SQL or NoSQL', body: 'Start with a relational database unless you have a specific reason not to. Consider NoSQL for very low latency, unstructured data, or huge volume where you don\'t need joins.' },
    { title: 'Replication', body: 'A primary takes writes and replicas serve reads. That helps read-heavy systems and survives a machine loss, but replicas can lag, and it does nothing for write load.' },
    { title: 'Sharding', body: 'Split data across databases by a key such as user ID. It\'s the way to scale writes, at the cost of hard resharding, hot keys, and no easy cross-shard joins.' },
    { title: 'Message queues', body: 'A queue decouples producers from consumers, so a spike waits in line instead of causing failures, and each side can scale on its own.' },
    { title: 'Multiple data centers', body: 'GeoDNS sends users to the nearest location. You then have to replicate data between regions and regularly test failing over from one to another.' },
  ],
  estimator: {
    vars: [
      { key: 'dau', label: 'Daily active users', unit: 'count' },
      { key: 'requests', label: 'Requests per user per day', unit: 'plain', assume: 40 },
      { key: 'peakFactor', label: 'Peak over average', unit: 'plain', assume: 2 },
      { key: 'capacity', label: 'Capacity per web server (req/s)', unit: 'plain', assume: 1000 },
      { key: 'kbPerRequest', label: 'Stored bytes per request', unit: 'plain', assume: 200 },
      { key: 'years', label: 'Years to keep data', unit: 'plain', assume: 5 },
      { key: 'avg', label: 'Average load', unit: 'qps' },
      { key: 'peak', label: 'Peak load', unit: 'qps' },
      { key: 'servers', label: 'Web servers at peak', unit: 'count' },
      { key: 'storage', label: 'Total storage', unit: 'bytes' },
    ],
    eqs: [
      { out: 'avg', terms: [['dau', 1], ['requests', 1], [86400, -1]] },
      { out: 'peak', terms: [['avg', 1], ['peakFactor', 1]] },
      { out: 'servers', terms: [['peak', 1], ['capacity', -1]] },
      { out: 'storage', terms: [['dau', 1], ['requests', 1], ['kbPerRequest', 1], [365, 1], ['years', 1]] },
    ],
    starts: [
      { key: 'dau', value: 1_000_000 },
      { key: 'peak', value: 10000 },
      { key: 'storage', value: 10e12 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'for each tier in the request path:' },
    { code: '  load = requests reaching this tier ÷ its nodes' },
    { code: '  utilization = load ÷ capacity per node' },
    { code: '  if utilization > 1: the queue grows' },
    { code: 'bottleneck = tier with the highest utilization', id: 'worst' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Vertical scaling', gain: 'No code changes', cost: 'A hard ceiling, and a single point of failure' },
    { choice: 'Read replicas', gain: 'Scales reads, adds redundancy', cost: 'Replica lag, no help for writes' },
    { choice: 'Sharding', gain: 'Scales writes and storage', cost: 'Cross-shard joins, resharding, hot keys' },
    { choice: 'Caching', gain: 'Lower latency and database load', cost: 'Stale data and more moving parts' },
    { choice: 'CDN', gain: 'Fast static content anywhere', cost: 'Cost, and care when invalidating files' },
  ],
  interview: [
    { q: 'Why must web servers be stateless?', a: 'If a user\'s session lives on one server, that user is stuck there, and a server failure logs them out. With state in a shared store, any server can handle any request, and you can add or remove machines freely.' },
    { q: 'What do you do when a shard gets too hot?', a: 'Consistent hashing reduces how much data moves when you add shards. For a single hot key like a celebrity, give it a dedicated shard or split its data further.' },
    { q: 'How do you know where the bottleneck is in production?', a: 'Measure utilization and queue depth at every tier, then follow requests with tracing. As the lab shows, the tier with the highest utilization sets the limit for the whole system.' },
  ],
  mistakes: [
    'Reaching for sharding before trying simpler fixes.',
    'Adding read replicas to fix a write problem.',
    'Designing for a million users before asking how many there actually are.',
  ],
};

export default topic;
