import type { Lab, Topic } from '../../core/types';
import { fmtDuration, fmtInt, fmtPct } from '../../core/format';
import source from './engine.ts?raw';
import { percentile, predictedLatency, serve, slowShareAfterFanout } from './engine';

type P = { rate: number; serviceMs: number; servers: number; fixed: boolean; fanout: number; slowShare: number };

const DT = 0.1;
const WINDOW = 3000;

interface S {
  now: number;
  freeAt: number[];
  latencies: number[];
  finishes: number[];
  sum: number;
  count: number;
  inSystemSum: number;
  samples: number;
  sorted: number[];
  fanoutSlow: number;
  fanoutTotal: number;
  lastWait: number;
}

const mean = (s: S) => (s.count ? s.sum / s.count : 0);
const avgInSystem = (s: S) => (s.samples ? s.inSystemSum / s.samples : 0);

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'rate', label: 'Requests arriving', kind: 'range', min: 5, max: 1500, step: 5, unit: 'per s' },
    { key: 'serviceMs', label: 'Time per request', kind: 'range', min: 1, max: 100, step: 1, unit: 'ms' },
    { key: 'servers', label: 'Servers', kind: 'range', min: 1, max: 16, step: 1 },
    { key: 'fixed', label: 'Every request takes exactly the same time', kind: 'toggle' },
    { key: 'fanout', label: 'Backends each page calls', kind: 'range', min: 1, max: 200, step: 1 },
    { key: 'slowShare', label: 'Backend calls that are slow', kind: 'range', min: 0, max: 0.1, step: 0.005, format: (v) => fmtPct(v, 1) },
  ],
  defaults: { rate: 50, serviceMs: 10, servers: 1, fixed: false, fanout: 1, slowShare: 0.01 },
  create: (p) => ({ now: 0, freeAt: Array(p.servers).fill(0), latencies: [], finishes: [], sum: 0, count: 0, inSystemSum: 0, samples: 0, sorted: [], fanoutSlow: 0, fanoutTotal: 0, lastWait: 0 }),
  step(s, p, rng) {
    const service = p.serviceMs / 1000;
    while (s.freeAt.length < p.servers) s.freeAt.push(s.now);
    if (s.freeAt.length > p.servers) s.freeAt.length = p.servers;
    const arrivals: number[] = [];
    for (let i = rng.poisson(p.rate * DT); i > 0; i--) arrivals.push(s.now + rng.next() * DT);
    arrivals.sort((a, b) => a - b);
    for (const at of arrivals) {
      const work = p.fixed ? service : rng.exponential(service);
      const finish = serve(s.freeAt, at, work);
      const latency = finish - at;
      s.lastWait = latency - work;
      s.latencies.push(latency);
      s.finishes.push(finish);
      s.sum += latency;
      s.count++;
    }
    if (s.latencies.length > WINDOW) s.latencies.splice(0, s.latencies.length - WINDOW);
    s.now += DT;
    s.finishes = s.finishes.filter((f) => f > s.now);
    s.inSystemSum += s.finishes.length;
    s.samples++;
    s.sorted = [...s.latencies].sort((a, b) => a - b);
    for (let i = 0; i < 100; i++) {
      s.fanoutTotal++;
      let slow = false;
      for (let k = 0; k < p.fanout && !slow; k++) slow = rng.chance(p.slowShare);
      if (slow) s.fanoutSlow++;
    }
  },
  sample(s, p) {
    const predicted = predictedLatency(p.rate, p.serviceMs / 1000, p.servers, p.fixed);
    return {
      p50: percentile(s.sorted, 50) * 1000,
      p99: percentile(s.sorted, 99) * 1000,
      mean: mean(s) * 1000,
      math: Number.isFinite(predicted) ? predicted * 1000 : 0,
      backlog: s.finishes.length,
    };
  },
  charts: [
    { title: 'Latency', unit: 'ms', series: [{ key: 'mean', label: 'Measured average', role: 'measured' }, { key: 'math', label: 'Math', role: 'predicted' }, { key: 'p99', label: 'p99', role: 'other' }, { key: 'p50', label: 'p50', role: 'other' }] },
    { title: 'Requests in the system', series: [{ key: 'backlog', label: 'Measured', role: 'measured' }] },
  ],
  metrics(s, p) {
    const util = (p.rate * p.serviceMs) / 1000 / p.servers;
    const predicted = predictedLatency(p.rate, p.serviceMs / 1000, p.servers, p.fixed);
    return [
      { label: 'Utilization', value: fmtPct(util), role: 'predicted', tone: util >= 1 ? 'bad' : util > 0.8 ? 'warn' : 'good' },
      { label: 'Average latency', value: Number.isFinite(predicted) ? fmtDuration(predicted) : 'Grows forever', role: 'predicted' },
      { label: 'Average latency', value: fmtDuration(mean(s)), role: 'measured' },
      { label: 'p99 latency', value: fmtDuration(percentile(s.sorted, 99)), role: 'measured' },
      { label: 'Pages hitting a slow backend', value: fmtPct(s.fanoutTotal ? s.fanoutSlow / s.fanoutTotal : 0, 1), role: 'measured' },
    ];
  },
  math(s, p) {
    const util = (p.rate * p.serviceMs) / 1000 / p.servers;
    const w = mean(s);
    return [
      { expr: `Utilization: ${fmtInt(p.rate)}/s × ${p.serviceMs} ms ÷ ${p.servers} servers`, result: fmtPct(util), tone: util >= 1 ? 'bad' : util > 0.8 ? 'warn' : 'good' },
      { expr: `Little's law: ${fmtInt(p.rate)}/s × ${fmtDuration(w)} average latency`, result: `${(p.rate * w).toFixed(1)} requests in system`, tone: 'good' },
      { expr: `Fan-out: 1 − (1 − ${fmtPct(p.slowShare, 1)})^${p.fanout}`, result: `${fmtPct(slowShareAfterFanout(p.slowShare, p.fanout), 1)} of pages are slow` },
    ];
  },
  views: (s) => [
    {
      kind: 'bars',
      title: 'How the latest requests were spread',
      items: [50, 90, 95, 99, 99.9].map((q) => ({ label: `p${q}`, value: percentile(s.sorted, q) * 1000, display: fmtDuration(percentile(s.sorted, q)) })),
    },
  ],
  trace: (s, p) => ({
    values: {
      util: fmtPct((p.rate * p.serviceMs) / 1000 / p.servers),
      wait: fmtDuration(Math.max(0, s.lastWait)),
      total: fmtDuration(mean(s)),
    },
  }),
  experiments: [
    {
      title: 'Half busy',
      set: { rate: 50, serviceMs: 10, servers: 1 },
      ticks: 300,
      question: 'A server takes 10 ms per request, and it\'s 50% busy. What\'s the average latency?',
      options: ['10 ms', 'About 20 ms', 'About 100 ms'],
      answer: 1,
      explain: 'Even at 50%, half of requests arrive while another is being served and have to wait. The formula is service time ÷ (1 − utilization), so 10 ÷ 0.5 = 20 ms. Twice the raw service time, at only half load.',
      check: (s) => mean(s) > 0.014 && mean(s) < 0.028,
    },
    {
      title: 'Nearly full',
      set: { rate: 95, serviceMs: 10, servers: 1 },
      ticks: 1500,
      question: 'Same server, now at 95% busy. What happens to average latency?',
      options: ['About 21 ms, since load almost doubled', 'About 200 ms, ten times worse', 'About 20 s'],
      answer: 1,
      explain: '10 ÷ 0.05 = 200 ms. Load went up less than double, and latency went up tenfold. This curve is why teams aim for 60 to 70% utilization. The last few percent of capacity are incredibly expensive.',
      check: (s) => mean(s) > 0.08 && mean(s) < 0.45,
    },
    {
      title: 'Add a second server',
      set: { rate: 95, serviceMs: 10, servers: 2 },
      ticks: 600,
      question: 'At 95 requests a second, you add a second server. Does latency roughly halve from 200 ms to 100 ms?',
      options: ['Yes, about 100 ms', 'Far better, about 13 ms'],
      answer: 1,
      explain: 'At 47.5% utilization, most requests walk straight in. A bit of spare capacity removes almost all the waiting, which is the nonlinearity working in your favor. That\'s also why a shared queue with many servers beats many separate queues.',
      check: (s) => mean(s) < 0.02,
    },
    {
      title: 'The tail at scale',
      set: { rate: 50, serviceMs: 10, servers: 2, fanout: 100, slowShare: 0.01 },
      ticks: 200,
      question: 'Only 1% of backend calls are slow. Each page calls 100 backends and waits for all of them. What share of pages are slow?',
      options: ['About 1%', 'About 10%', 'About 63%'],
      answer: 2,
      explain: '1 − 0.99^100 = 63%. Your p99 backend latency becomes the typical page latency. This is why large systems obsess over tail latency, and use tricks like sending a duplicate request to another replica after a short wait.',
      check: (s) => {
        const v = s.fanoutSlow / s.fanoutTotal;
        return v > 0.55 && v < 0.72;
      },
    },
    {
      title: 'Little\'s law',
      set: { rate: 80, serviceMs: 10, servers: 1 },
      ticks: 800,
      question: 'If 80 requests arrive per second, and each spends 50 ms in the system, how many are inside at any moment, on average?',
      options: ['About 4', 'About 40', 'You can\'t tell without more detail'],
      answer: 0,
      explain: 'Requests in system = arrival rate × time in system. 80 × 0.05 = 4. It holds for almost any stable system, regardless of distribution, so it\'s great for sanity checks. If a service does 1,000 QPS at 200 ms, it has about 200 requests in flight.',
      check: (s, p) => {
        const expected = p.rate * mean(s);
        const seen = avgInSystem(s);
        return Math.abs(seen - expected) / expected < 0.2;
      },
    },
  ],
};

const topic: Topic = {
  problem: [
    'Why does a website that\'s fine at 70% load become unusable at 95%? The answer isn\'t in the code. It comes from the math of waiting in line, and it applies to every server, database, and queue you\'ll ever design.',
    'This is the most useful lesson in the course for your intuition. You\'ll see that averages hide what users feel, that capacity planning is about avoiding a cliff, and that a little spare capacity goes a remarkably long way.',
  ],
  functional: [
    'Know how long requests will take at a given load',
    'Report latency in a way that reflects what users experience',
    'Decide how much spare capacity you need',
  ],
  nonFunctional: [
    'Stay well below the point where latency explodes',
    'Keep tail latency under control',
    'Absorb bursts without collapse',
  ],
  ideas: [
    { title: 'Utilization', body: 'Utilization is load divided by capacity. For a simple queue, average latency is service time ÷ (1 − utilization). That simple formula is why the curve shoots up near 100%.' },
    { title: 'Percentiles over averages', body: 'p99 latency is the time 99% of requests beat. An average can look fine while one request in a hundred takes seconds, and a heavy user loading many resources will hit those often.' },
    { title: 'Little\'s law', body: 'Requests in system = arrival rate × time in system. It holds for almost any stable system, and gives you a quick way to size connection pools and thread pools.' },
    { title: 'Tail at scale', body: 'When a page waits for many backends, rare slowness becomes common. With 100 calls, a 1% slow rate affects 63% of pages. Tail latency often matters more than the median.' },
  ],
  estimator: {
    vars: [
      { key: 'peak', label: 'Peak load', unit: 'qps' },
      { key: 'serviceSec', label: 'Seconds per request', unit: 'plain', assume: 0.05 },
      { key: 'target', label: 'Target utilization (0 to 1)', unit: 'plain', assume: 0.6 },
      { key: 'busy', label: 'Requests being worked on', unit: 'count' },
      { key: 'workers', label: 'Workers needed', unit: 'count' },
    ],
    eqs: [
      { out: 'busy', terms: [['peak', 1], ['serviceSec', 1]] },
      { out: 'workers', terms: [['busy', 1], ['target', -1]] },
    ],
    starts: [
      { key: 'peak', value: 2000 },
      { key: 'workers', value: 100 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'on_request(arrival_time):' },
    { code: '  server = whichever frees up first' },
    { code: '  start = max(arrival_time, server.free_at)' },
    { code: '  waited = start − arrival_time', id: 'wait' },
    { code: '  finish = start + service_time' },
    { code: '  latency = finish − arrival_time', id: 'total' },
    { code: 'utilization = arrival_rate × service_time ÷ servers', id: 'util' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Run at high utilization', gain: 'Fewer machines and lower cost', cost: 'Long queues, and no room for bursts' },
    { choice: 'Run at low utilization', gain: 'Stable latency and burst room', cost: 'Paying for idle capacity' },
    { choice: 'One shared queue', gain: 'Better than separate queues per server', cost: 'A coordination point' },
    { choice: 'Hedged requests', gain: 'Much lower tail latency', cost: 'A small amount of extra load' },
  ],
  interview: [
    { q: 'Why not plan for the average?', a: 'Because latency depends on utilization nonlinearly, and traffic is bursty. A system sized for the average spends the busiest moments far past the steep part of the curve.' },
    { q: 'How do you reduce tail latency?', a: 'Find the cause first: garbage collection, lock contention, or a slow disk. Then consider hedged requests, which send a second copy after a short wait, along with timeouts and removing slow replicas from rotation.' },
    { q: 'What happens when arrival rate exceeds capacity?', a: 'The queue grows without limit, and latency with it. Past that point, no amount of waiting helps. You must shed load or reject requests, so that the requests you keep can succeed.' },
    { q: 'How do you use Little\'s law in practice?', a: 'To size pools. At 2,000 QPS and 50 ms per request, 100 requests are in flight, so a connection pool of 20 would become the bottleneck long before the CPU does.' },
  ],
  mistakes: [
    'Reporting average latency and not percentiles.',
    'Planning capacity so servers run near 100%.',
    'Averaging percentiles across servers, which isn\'t a valid calculation.',
  ],
};

export default topic;
