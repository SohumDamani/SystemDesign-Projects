import type { Lab, PseudoLine, Topic } from '../../core/types';
import { fmtBytes, fmtInt, fmtPct } from '../../core/format';
import luaSource from '../../../../Rate Limiter/app/rate_limit.lua?raw';
import engineSource from './engine.ts?raw';
import runnerSource from './luaRunner.ts?raw';
import { FixedWindow, LeakyBucket, LuaSlidingCounter, SlidingLog, TokenBucket, type Decision, type Limiter } from './engine';

type Algo = 'sliding-counter' | 'fixed-window' | 'sliding-log' | 'token-bucket' | 'leaky-bucket';
type P = { algo: Algo; limit: number; window: number; rate: number; pattern: 'steady' | 'edge' };

interface S {
  t: number;
  limiter: Limiter;
  hits: number[];
  worst: number;
  allowed: number;
  rejected: number;
  allowedNow: number;
  offeredNow: number;
  last?: Decision;
  burstAllowed: number;
}

const DT = 0.25;

function build(p: P): Limiter {
  switch (p.algo) {
    case 'fixed-window':
      return new FixedWindow(p.limit, p.window);
    case 'sliding-log':
      return new SlidingLog(p.limit, p.window);
    case 'token-bucket':
      return new TokenBucket(p.limit, p.window);
    case 'leaky-bucket':
      return new LeakyBucket(p.limit, p.window);
    default:
      return new LuaSlidingCounter(luaSource, p.limit, p.window);
  }
}

function offered(s: S, p: P, poisson: (m: number) => number): number {
  if (p.pattern === 'steady') return poisson(p.rate * DT);
  // Edge pattern: a full burst right before and right after every other window boundary.
  const k = Math.floor(s.t / p.window);
  const intoWindow = s.t - k * p.window;
  const lastTick = intoWindow > p.window - DT - 1e-9;
  const firstTick = intoWindow < DT - 1e-9;
  if (k % 2 === 0 && lastTick) return p.limit;
  if (k % 2 === 1 && firstTick) return p.limit;
  return 0;
}

function send(s: S, n: number, trace: boolean): number {
  let passed = 0;
  for (let i = 0; i < n; i++) {
    const d = s.limiter.check(s.t, trace && i === n - 1);
    if (d.allowed) {
      passed++;
      s.allowed++;
      if (!s.limiter.drain) s.hits.push(s.t);
    } else s.rejected++;
    if (trace && i === n - 1) s.last = d;
  }
  return passed;
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    {
      key: 'algo',
      label: 'Algorithm',
      kind: 'choice',
      rebuild: true,
      options: [
        { value: 'sliding-counter', label: 'Sliding counter (real Lua)' },
        { value: 'fixed-window', label: 'Fixed window' },
        { value: 'sliding-log', label: 'Sliding log' },
        { value: 'token-bucket', label: 'Token bucket' },
        { value: 'leaky-bucket', label: 'Leaky bucket' },
      ],
    },
    { key: 'limit', label: 'Limit per window', kind: 'range', min: 5, max: 100, step: 5, unit: 'requests', rebuild: true },
    { key: 'window', label: 'Window size', kind: 'range', min: 5, max: 60, step: 5, unit: 's', rebuild: true },
    { key: 'pattern', label: 'Traffic shape', kind: 'choice', rebuild: true, options: [{ value: 'steady', label: 'Steady random traffic' }, { value: 'edge', label: 'Bursts at the window edge' }] },
    { key: 'rate', label: 'Steady traffic rate', kind: 'range', min: 0, max: 20, step: 0.5, unit: 'req/s' },
  ],
  defaults: { algo: 'sliding-counter', limit: 20, window: 10, rate: 3, pattern: 'steady' },
  create: (p) => ({ t: 0, limiter: build(p), hits: [], worst: 0, allowed: 0, rejected: 0, allowedNow: 0, offeredNow: 0, burstAllowed: 0 }),
  step(s, p, rng) {
    s.t += DT;
    const n = offered(s, p, (m) => rng.poisson(m));
    const passed = send(s, n, true);
    let toBackend = passed;
    if (s.limiter.drain) {
      toBackend = s.limiter.drain(s.t);
      for (let i = 0; i < toBackend; i++) s.hits.push(s.t);
    }
    while (s.hits.length && s.hits[0] <= s.t - p.window) s.hits.shift();
    s.worst = Math.max(s.worst, s.hits.length);
    s.offeredNow = s.offeredNow * 0.9 + (n / DT) * 0.1;
    s.allowedNow = s.allowedNow * 0.9 + (toBackend / DT) * 0.1;
  },
  sample: (s, p) => ({ rolling: s.hits.length, limit: p.limit, offered: s.offeredNow, allowed: s.allowedNow, cap: p.limit / p.window }),
  charts: [
    {
      title: 'Requests reaching the backend in the last window',
      series: [
        { key: 'rolling', label: 'Measured', role: 'measured' },
        { key: 'limit', label: 'Limit', role: 'predicted' },
      ],
    },
    {
      title: 'Throughput',
      unit: 'req/s',
      series: [
        { key: 'allowed', label: 'Passed', role: 'measured' },
        { key: 'cap', label: 'Limit ÷ window', role: 'predicted' },
        { key: 'offered', label: 'Offered', role: 'other' },
      ],
    },
  ],
  metrics(s, p) {
    const total = s.allowed + s.rejected;
    return [
      { label: 'Limit per window', value: fmtInt(p.limit), role: 'predicted' },
      { label: 'Worst window', value: fmtInt(s.worst), role: 'measured', tone: s.worst > p.limit * 1.25 ? 'bad' : undefined },
      { label: 'Rejected', value: total ? fmtPct(s.rejected / total) : '0%', role: 'measured' },
      { label: 'Memory per client', value: fmtBytes(s.limiter.storedValues() * 8), role: 'measured' },
    ];
  },
  math(s, p) {
    const cap = p.limit / p.window;
    const steps = [{ expr: `Sustained cap: ${p.limit} ÷ ${p.window} s`, result: `${cap.toFixed(1)} req/s` }];
    steps.push(p.pattern === 'steady' ? { expr: `Rejected share if traffic stays at ${p.rate} req/s`, result: p.rate > cap ? fmtPct(1 - cap / p.rate) : '0%' } : { expr: `Worst case for a fixed window: 2 × ${p.limit}`, result: `${p.limit * 2} requests` });
    return steps;
  },
  actions: [
    { key: 'one', label: 'Send one request', run: (s) => { s.burstAllowed = send(s, 1, true); if (s.limiter.drain) s.hits.push(s.t); } },
    { key: 'burst', label: 'Send a burst of 50', run: (s) => { s.burstAllowed = send(s, 50, true); } },
  ],
  trace(s, p) {
    const d = s.last;
    const values = { ...(d?.vars ?? {}) };
    if (d) values.outcome = d.allowed ? 'allowed' : 'rejected';
    if (p.algo === 'sliding-counter' && d) {
      const est = Number(d.vars.estimated_count ?? 0);
      values.test = `${(est + 1).toFixed(2)} > ${p.limit} is ${!d.allowed}`;
    }
    return { values, active: d ? [d.allowed ? 'allow' : 'reject'] : [], lines: d?.lines };
  },
  experiments: [
    {
      title: 'The window edge',
      set: { algo: 'fixed-window', pattern: 'edge', limit: 20, window: 10 },
      ticks: 200,
      question: 'A fixed window allows 20 requests per 10 seconds. A client sends 20 just before a boundary and 20 just after. How many reach the backend inside a single 10-second span?',
      options: ['20, since that is the limit', '40, double the limit', '30, because some get rejected'],
      answer: 1,
      explain: 'The counter resets at the boundary, so both bursts pass, and 40 requests arrive within half a second. The limit only holds per slot, not per any 10 seconds. That gap is what the sliding approaches close.',
      check: (s, p) => s.worst >= p.limit * 2 - 1,
    },
    {
      title: 'Fix it with your Lua script',
      set: { algo: 'sliding-counter', pattern: 'edge', limit: 20, window: 10 },
      ticks: 200,
      question: 'Same bursts, now through `rate_limit.lua`, which weights the previous window by how much of it still overlaps. What is the worst 10-second span?',
      options: ['Still 40', 'About 20', 'Close to 0, it blocks everything'],
      answer: 1,
      explain: 'Right after the boundary the previous count carries a weight near 1, so the estimate is already at the limit and the second burst is rejected. You pay for this accuracy with just two counters per client, not a full log.',
      check: (s, p) => s.worst <= p.limit * 1.25,
    },
    {
      title: 'Sustained overload',
      set: { algo: 'sliding-counter', pattern: 'steady', rate: 6, limit: 20, window: 10 },
      ticks: 480,
      question: 'Traffic holds at 6 req/s against a limit of 20 per 10 seconds. What throughput gets through?',
      options: ['About 6 req/s', 'About 2 req/s', 'About 4 req/s'],
      answer: 1,
      explain: 'The sustained cap is limit ÷ window, or 2 req/s. The remaining two-thirds of traffic is rejected, which matches the math: 1 − 2/6 = 67%.',
      check: (_s, _p, h) => {
        const tail = h.slice(-200);
        const avg = tail.reduce((a, r) => a + r.allowed, 0) / tail.length;
        return avg > 1.5 && avg < 2.6;
      },
    },
    {
      title: 'A burst into a full bucket',
      set: { algo: 'token-bucket', pattern: 'steady', rate: 0, limit: 20, window: 10 },
      act: ['burst'],
      actAt: 80,
      ticks: 84,
      question: 'A token bucket holds 20 tokens. The client has been quiet for 20 seconds, then fires 50 requests at once. How many pass immediately?',
      options: ['All 50', 'About 20', 'Only 2'],
      answer: 1,
      explain: 'Idle time fills the bucket up to its capacity, and the burst spends all of it at once. That\'s the point of a token bucket: it tolerates short bursts while still enforcing an average. The bucket size sets how big a burst you\'re willing to accept.',
      check: (s) => s.burstAllowed >= 19 && s.burstAllowed <= 22,
    },
  ],
};

const PSEUDO: Record<Algo, PseudoLine[]> = {
  'sliding-counter': [
    { code: 'now = redis TIME' },
    { code: 'cur = count in this window', id: 'current_count' },
    { code: 'prev = count in the previous window', id: 'previous_count' },
    { code: 'elapsed = seconds into this window', id: 'elapsed' },
    { code: 'weight = share of previous window still in view', id: 'weight' },
    { code: 'estimate = prev × weight + cur', id: 'estimated_count' },
    { code: 'if estimate + 1 > limit:', id: 'test' },
    { code: '  reject, and say when to retry', id: 'reject' },
    { code: 'else:' },
    { code: '  cur = cur + 1, allow the request', id: 'allow' },
    { code: 'result', id: 'outcome' },
  ],
  'fixed-window': [
    { code: 'window = floor(now / window_size)', id: 'window' },
    { code: 'if window changed: count = 0' },
    { code: 'if count < limit:', id: 'test' },
    { code: '  count = count + 1, allow', id: 'allow' },
    { code: 'else:' },
    { code: '  reject', id: 'reject' },
    { code: 'result', id: 'outcome' },
  ],
  'sliding-log': [
    { code: 'drop timestamps older than now - window', id: 'cutoff' },
    { code: 'if len(log) < limit:', id: 'test' },
    { code: '  append now to log, allow', id: 'allow' },
    { code: 'else:' },
    { code: '  reject', id: 'reject' },
    { code: 'result', id: 'outcome' },
  ],
  'token-bucket': [
    { code: 'tokens += elapsed × refill_rate, up to capacity', id: 'refill' },
    { code: 'if tokens >= 1:', id: 'tokens' },
    { code: '  tokens = tokens - 1, allow', id: 'allow' },
    { code: 'else:' },
    { code: '  reject', id: 'reject' },
    { code: 'result', id: 'outcome' },
  ],
  'leaky-bucket': [
    { code: 'release queued requests at drain_rate', id: 'drain' },
    { code: 'if queue is not full:', id: 'queue' },
    { code: '  add request to queue, accept', id: 'allow' },
    { code: 'else:' },
    { code: '  reject', id: 'reject' },
    { code: 'result', id: 'outcome' },
  ],
};

const topic: Topic = {
  problem: [
    'A rate limiter caps how many requests a client can make in a period of time. It protects your service from abuse and runaway clients, keeps one customer from hurting the others, and controls cost when each call has a real price.',
    'It sits in the path of every request, so it has to be fast, and it usually runs across many servers, so its counters have to live somewhere shared and be updated atomically. The lab below runs the actual `rate_limit.lua` from this project, not a copy.',
  ],
  functional: [
    'Limit requests per user, IP or API key, with configurable rules',
    'Reject excess requests with HTTP 429 and a `Retry-After` header',
    'Work correctly across many application servers',
  ],
  nonFunctional: [
    'Adds only about a millisecond to each request',
    'Uses little memory per client',
    'If the limiter fails, the API keeps working, known as failing open',
  ],
  diagram: {
    nodes: [
      { id: 'c', label: 'Client', col: 0, row: 1, kind: 'client', note: 'Receives 429 with Retry-After when over the limit.' },
      { id: 'g', label: 'API gateway', col: 1, row: 1, note: 'Runs the limiter check before a request reaches any service.' },
      { id: 'r', label: 'Redis counters', col: 2, row: 0, kind: 'store', note: 'Shared counters. A Lua script makes check-and-increment atomic, with no race between servers.' },
      { id: 'a', label: 'API servers', col: 2, row: 1, note: 'Only see traffic that passed the limiter.' },
      { id: 'u', label: 'Rules config', col: 1, row: 2, kind: 'store', note: 'Limits per endpoint and plan, cached in memory and refreshed on a schedule.' },
    ],
    edges: [
      { from: 'c', to: 'g' },
      { from: 'g', to: 'r', label: 'EVALSHA' },
      { from: 'g', to: 'a', label: 'allowed' },
      { from: 'u', to: 'g', dashed: true },
    ],
  },
  ideas: [
    { title: 'Why a Lua script', body: 'If servers read a counter and then write it back, two can read the same value and both let a request through. Redis runs a Lua script as one atomic step, which removes that race without any locks.' },
    { title: 'Sliding window counter', body: 'Keep one counter per window and estimate the rolling count as `previous × overlap + current`. It uses two integers per client and gets very close to an exact log.' },
    { title: 'Token and leaky buckets', body: 'A token bucket allows bursts up to its size while enforcing an average rate. A leaky bucket queues requests and releases them evenly, which protects a fragile backend at the cost of added delay.' },
    { title: 'Where it runs', body: 'Client-side limits can be bypassed, so enforce on the server. An API gateway is the usual place, as it stops excess traffic before any of your code runs.' },
  ],
  estimator: {
    vars: [
      { key: 'users', label: 'Active users', unit: 'count' },
      { key: 'requests', label: 'Requests per user per day', unit: 'plain', assume: 100 },
      { key: 'peakFactor', label: 'Peak over average', unit: 'plain', assume: 3 },
      { key: 'bytesPerUser', label: 'Bytes per user in Redis', unit: 'plain', assume: 200 },
      { key: 'nodeOps', label: 'Ops per second per Redis node', unit: 'plain', assume: 100000 },
      { key: 'avg', label: 'Average checks', unit: 'qps' },
      { key: 'peak', label: 'Peak checks', unit: 'qps' },
      { key: 'memory', label: 'Redis memory', unit: 'bytes' },
      { key: 'nodes', label: 'Redis nodes for throughput', unit: 'count' },
    ],
    eqs: [
      { out: 'avg', terms: [['users', 1], ['requests', 1], [86400, -1]] },
      { out: 'peak', terms: [['avg', 1], ['peakFactor', 1]] },
      { out: 'memory', terms: [['users', 1], ['bytesPerUser', 1]] },
      { out: 'nodes', terms: [['peak', 1], ['nodeOps', -1]] },
    ],
    starts: [
      { key: 'users', value: 10_000_000 },
      { key: 'memory', value: 4e9 },
      { key: 'peak', value: 50000 },
    ],
  },
  lab,
  pseudocode: (p: P) => PSEUDO[p.algo ?? 'sliding-counter'],
  sources: [
    { name: 'rate_limit.lua', code: luaSource, lang: 'lua' },
    { name: 'engine.ts', code: engineSource, lang: 'ts' },
    { name: 'luaRunner.ts', code: runnerSource, lang: 'ts' },
  ],
  tradeoffs: [
    { choice: 'Fixed window', gain: 'Simplest, one counter', cost: 'Allows double the limit across a boundary' },
    { choice: 'Sliding log', gain: 'Exact', cost: 'Stores a timestamp per request, so memory grows with the limit' },
    { choice: 'Sliding window counter', gain: 'Nearly exact with two counters', cost: 'An estimate, assuming even traffic in the previous window' },
    { choice: 'Token bucket', gain: 'Allows controlled bursts', cost: 'Two values per client, and bucket size needs tuning' },
    { choice: 'Fail open', gain: 'A limiter outage doesn\'t take the API down', cost: 'No protection during the outage' },
  ],
  interview: [
    { q: 'How do you keep limits accurate across data centers?', a: 'A single global Redis adds latency. Commonly each region enforces a share of the limit locally and syncs counters asynchronously, accepting slight overshoot in exchange for speed.' },
    { q: 'What goes wrong with a read-then-write counter?', a: 'Two servers read 19, both decide it\'s under 20, and both write 20, so 21 requests pass. A Lua script or `INCR` makes the check and the increment one atomic step.' },
    { q: 'Does this script work on Redis Cluster?', a: 'Not as written: it builds its window keys inside the script instead of declaring them in `KEYS`, and Redis Cluster needs declared keys to route correctly. Pass both window keys in `KEYS` with a shared hash tag like `{user123}` so they land on one shard.' },
    { q: 'What should the client see when it\'s limited?', a: 'HTTP 429 with `Retry-After`, plus `X-RateLimit-Remaining` and `X-RateLimit-Limit` so well-behaved clients can slow down before they hit the wall.' },
  ],
  mistakes: [
    'Using read-then-write logic with no atomicity.',
    'Giving every endpoint the same limit, when costs differ hugely.',
    'Never saying what happens when the limiter itself is down.',
  ],
};

export default topic;
