import type { Lab, Topic } from '../../core/types';
import { fmtCount, fmtDuration, fmtInt, fmtPct, signed } from '../../core/format';
import source from './engine.ts?raw';
import { advancePool, kill, type Balancer, type Server, type Strategy } from './engine';

type P = { traffic: number; capA: number; capB: number; capC: number; strategy: Strategy; healthCheck: number };
const DT = 0.2;

function makeServer(name: string, capacity: number): Server {
  return { name, capacity, up: true, routable: true, downAt: 0, queue: 0, fluidQueue: 0, arrivals: 0, rate: 0, lost: 0 };
}

const totalQueue = (b: Balancer) => b.servers.reduce((a, s) => a + s.queue, 0);
const totalFluid = (b: Balancer) => b.servers.reduce((a, s) => a + s.fluidQueue, 0);

function predictedGrowth(b: Balancer, p: P): number {
  const alive = b.servers.filter((s) => s.up);
  if (!alive.length) return 0;
  if (p.strategy === 'round-robin') {
    const share = p.traffic / alive.length;
    return alive.reduce((a, s) => a + Math.max(0, share - s.capacity), 0);
  }
  return Math.max(0, p.traffic - alive.reduce((a, s) => a + s.capacity, 0));
}

function toggle(b: Balancer, i: number) {
  const s = b.servers[i];
  if (s.up) kill(b, s);
  else s.up = true;
}

const lab: Lab<Balancer, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'traffic', label: 'Incoming traffic', kind: 'range', min: 0, max: 3000, step: 50, unit: 'req/s' },
    { key: 'strategy', label: 'Routing strategy', kind: 'choice', options: [{ value: 'round-robin', label: 'Round robin' }, { value: 'least-connections', label: 'Least connections' }] },
    { key: 'capA', label: 'Server A capacity', kind: 'range', min: 100, max: 2000, step: 100, unit: 'req/s' },
    { key: 'capB', label: 'Server B capacity', kind: 'range', min: 100, max: 2000, step: 100, unit: 'req/s' },
    { key: 'capC', label: 'Server C capacity', kind: 'range', min: 100, max: 2000, step: 100, unit: 'req/s' },
    { key: 'healthCheck', label: 'Health check interval', kind: 'range', min: 1, max: 30, step: 1, unit: 's' },
  ],
  defaults: { traffic: 1500, capA: 1000, capB: 1000, capC: 200, strategy: 'round-robin', healthCheck: 5 },
  create: (p) => ({
    servers: [makeServer('A', p.capA), makeServer('B', p.capB), makeServer('C', p.capC)],
    counter: 0,
    fluidCounter: 0,
    carry: 0,
    now: 0,
    wait: 0,
    failed: 0,
    lastPick: '',
  }),
  step(b, p, rng) {
    b.servers[0].capacity = p.capA;
    b.servers[1].capacity = p.capB;
    b.servers[2].capacity = p.capC;
    advancePool(b, p.strategy, p.traffic, p.healthCheck, DT, rng);
  },
  sample: (b) => ({ measured: totalQueue(b), predicted: totalFluid(b) }),
  charts: [
    {
      title: 'Requests waiting across all servers',
      series: [
        { key: 'measured', label: 'Measured', role: 'measured' },
        { key: 'predicted', label: 'Predicted', role: 'predicted' },
      ],
    },
  ],
  metrics(b, p) {
    const alive = b.servers.filter((s) => s.up);
    const capacity = alive.reduce((a, s) => a + s.capacity, 0);
    return [
      { label: 'Average utilization', value: capacity ? fmtPct(p.traffic / capacity) : 'No capacity', tone: capacity && p.traffic / capacity < 1 ? undefined : 'bad' },
      { label: 'Backlog growth', value: `${signed(predictedGrowth(b, p))} req/s`, role: 'predicted' },
      { label: 'Wait for a new request', value: fmtDuration(b.wait), role: 'measured' },
      { label: 'Failed requests', value: fmtInt(b.failed), role: 'measured', tone: b.failed ? 'bad' : undefined },
    ];
  },
  math(b, p) {
    const alive = b.servers.filter((s) => s.up);
    if (!alive.length) return [{ expr: 'No servers are up', result: 'every request fails', tone: 'bad' }];
    const capacity = alive.reduce((a, s) => a + s.capacity, 0);
    const u = p.traffic / capacity;
    const steps = [{ expr: `Average: ${fmtInt(p.traffic)} ÷ ${fmtInt(capacity)} total capacity`, result: `${fmtPct(u)}, ${u < 1 ? 'looks healthy' : 'overloaded'}`, tone: (u < 1 ? 'good' : 'bad') as 'good' | 'bad' }];
    if (p.strategy === 'round-robin') {
      const share = p.traffic / alive.length;
      steps.push({ expr: `Round robin: ${fmtInt(p.traffic)} ÷ ${alive.length} servers`, result: `${fmtInt(share)} req/s each`, tone: 'good' });
      const over = alive.filter((s) => share > s.capacity);
      for (const s of over) steps.push({ expr: `Server ${s.name}: ${fmtInt(share)} − ${fmtInt(s.capacity)} capacity`, result: `+${fmtInt(share - s.capacity)} req/s backlog`, tone: 'bad' });
      if (!over.length) steps.push({ expr: 'Every server can absorb its share', result: 'no backlog', tone: 'good' });
    } else if (p.traffic <= capacity) {
      steps.push({ expr: `Least connections: ${fmtInt(capacity)} − ${fmtInt(p.traffic)}`, result: `${fmtInt(capacity - p.traffic)} req/s spare`, tone: 'good' });
    } else {
      steps.push({ expr: `Least connections: ${fmtInt(p.traffic)} − ${fmtInt(capacity)}`, result: `+${fmtInt(p.traffic - capacity)} req/s backlog`, tone: 'bad' });
    }
    return steps;
  },
  views: (b) => [
    {
      kind: 'bars',
      title: 'Load on each server, as a share of its capacity',
      max: 1,
      marker: { value: 1, label: '100% of capacity' },
      items: b.servers.map((s) => {
        const load = s.up ? s.rate / s.capacity : 0;
        return { label: `Server ${s.name}`, value: load, display: s.up ? fmtPct(load) : 'Down', tone: !s.up ? 'bad' : load > 1.02 ? 'bad' : 'neutral' };
      }),
    },
    {
      kind: 'cells',
      title: 'Queue on each server',
      items: b.servers.map((s) => ({ label: s.name, value: s.up ? fmtCount(s.queue) : `${fmtCount(s.lost)} lost`, tone: !s.up ? 'bad' : s.queue > 500 ? 'warn' : 'neutral' })),
    },
  ],
  actions: [
    { key: 'kill-a', label: 'Kill or restore server A', run: (b) => toggle(b, 0) },
    { key: 'kill-b', label: 'Kill or restore server B', run: (b) => toggle(b, 1) },
    { key: 'kill-c', label: 'Kill or restore server C', run: (b) => toggle(b, 2) },
  ],
  trace(b, p) {
    const queues = b.servers.map((s) => `${s.name}=${s.up ? fmtCount(s.queue) : 'down'}`).join(' ');
    return {
      values: {
        live: b.servers.filter((s) => s.routable).map((s) => s.name).join(', ') || 'none',
        rr: p.strategy === 'round-robin' ? `i=${fmtInt(b.counter)}, picks ${b.lastPick}` : '',
        lc: p.strategy === 'least-connections' ? `${queues}, picks ${b.lastPick}` : '',
      },
      active: [p.strategy === 'round-robin' ? 'rr' : 'lc'],
    };
  },
  experiments: [
    {
      title: 'Healthy on average',
      ticks: 150,
      question: 'Traffic is 1,500 req/s against 2,200 total capacity, so average utilization is 68%. With round robin, what happens to the queue?',
      options: ['It stays near zero, since 68% is comfortable', 'It grows by about 300 requests every second', 'It grows by about 700 requests every second'],
      answer: 1,
      explain: 'Round robin gives every server 500 req/s, but server C can only do 200. It falls behind by exactly 300 a second, forever. Average utilization hid the problem, because the spare capacity on A and B can\'t help a queue that has already formed on C.',
      check: (_b, _p, h) => {
        const slope = (h[h.length - 1].measured - h[50].measured) / ((h.length - 51) * DT);
        return slope > 250 && slope < 350;
      },
    },
    {
      title: 'Route around the slow server',
      set: { strategy: 'least-connections' },
      ticks: 150,
      question: 'Same servers, same traffic, but now the balancer picks the shortest queue. What happens to the backlog?',
      options: ['It still grows by 300 req/s', 'It grows, but more slowly', 'It stays close to zero'],
      answer: 2,
      explain: 'Least connections reacts to load, so server C simply gets less work once its queue builds. Total capacity of 2,200 exceeds traffic of 1,500, so no queue can grow without limit. The strategy, not the hardware, was the bug.',
      check: (_b, _p, h) => h[h.length - 1].measured < 150,
    },
    {
      title: 'Lose a server',
      set: { strategy: 'least-connections' },
      act: ['kill-a'],
      actAt: 25,
      ticks: 200,
      question: 'With least connections running, server A dies. Capacity drops to 1,200 against 1,500 req/s of traffic. How fast does the backlog grow?',
      options: ['It doesn\'t, the other servers absorb it', 'About 300 req/s', 'About 1,500 req/s'],
      answer: 1,
      explain: 'Traffic minus remaining capacity is 1,500 − 1,200 = 300 req/s of backlog, and no routing strategy can beat that. It\'s why you plan capacity for N−1 servers. Requests also fail until the health check notices, which is why that interval matters.',
      check: (_b, _p, h) => {
        const slope = (h[h.length - 1].measured - h[100].measured) / ((h.length - 101) * DT);
        return slope > 240 && slope < 360;
      },
    },
    {
      title: 'Run close to the limit',
      set: { strategy: 'least-connections', traffic: 2100 },
      ticks: 300,
      question: 'Traffic is 2,100 against 2,200 capacity, or 95% utilization. The simple math says no backlog. What does the run show?',
      options: ['No queue at all, the math is right', 'A real queue forms, larger than the math predicts', 'The system collapses and the queue grows forever'],
      answer: 1,
      explain: 'Real traffic is bursty. At 95% there\'s so little spare capacity that a random burst takes a long time to drain, so queues form even though the average fits. It\'s why teams target 60 to 70% utilization. The gap between the two lines is the cost of randomness.',
      check: (_b, _p, h) => {
        const tail = h.slice(100);
        const avg = (k: string) => tail.reduce((a, r) => a + r[k], 0) / tail.length;
        return avg('measured') > avg('predicted') * 1.5;
      },
    },
  ],
};

const topic: Topic = {
  problem: [
    'One server has a hard ceiling on how many requests it can finish per second, and if it dies your whole product dies with it. A load balancer sits in front of a pool of servers and hands each request to one of them, so you can add capacity by adding machines and survive losing one.',
    'The interesting question is how it decides. A balancer that ignores load treats a struggling server exactly like a healthy one, and that\'s how a system with plenty of spare capacity still falls over.',
  ],
  functional: [
    'Spread incoming requests across a pool of servers',
    'Stop sending traffic to servers that fail health checks',
    'Allow servers to be added or removed without downtime',
  ],
  nonFunctional: [
    'Adds very little latency to each request',
    'Is not itself a single point of failure',
    'Copes with servers of different speeds',
  ],
  diagram: {
    nodes: [
      { id: 'c', label: 'Clients', col: 0, row: 1, kind: 'client', note: 'Know only one address: the load balancer\'s.' },
      { id: 'lb', label: 'Load balancer', col: 1, row: 1, note: 'Picks a server for each request and runs health checks against the pool.' },
      { id: 'a', label: 'Server A', col: 2, row: 0, note: 'Stateless, so any server can handle any request.' },
      { id: 'b', label: 'Server B', col: 2, row: 1, note: 'Stateless, so any server can handle any request.' },
      { id: 'd', label: 'Server C', col: 2, row: 2, note: 'Often slower: an older machine, a noisy neighbor, or a long garbage-collection pause.' },
      { id: 's', label: 'Shared state', col: 3, row: 1, kind: 'store', note: 'Sessions live in a shared store, not on the server, so any server can pick up any user.' },
    ],
    edges: [
      { from: 'c', to: 'lb' },
      { from: 'lb', to: 'a' },
      { from: 'lb', to: 'b' },
      { from: 'lb', to: 'd' },
      { from: 'a', to: 's' },
      { from: 'b', to: 's' },
      { from: 'd', to: 's' },
    ],
  },
  ideas: [
    { title: 'Round robin', body: 'Hand requests to each server in turn. It\'s simple and needs no state, and it works well when servers and requests are all alike. It fails when they aren\'t.' },
    { title: 'Least connections', body: 'Send each request to the server with the fewest in progress. Slow servers naturally get less work, at the cost of tracking connection counts.' },
    { title: 'Layer 4 or layer 7', body: 'A layer 4 balancer routes on IP and port and is very fast. A layer 7 balancer reads the HTTP request, so it can route by path or header, but does more work per request.' },
    { title: 'Health checks', body: 'The balancer probes each server regularly and removes those that stop answering. A shorter interval finds failures sooner but sends more probes and can react to brief blips.' },
  ],
  estimator: {
    vars: [
      { key: 'dau', label: 'Daily active users', unit: 'count' },
      { key: 'requests', label: 'Requests per user per day', unit: 'plain', assume: 50 },
      { key: 'peakFactor', label: 'Peak over average', unit: 'plain', assume: 3 },
      { key: 'capacity', label: 'Capacity per server (req/s)', unit: 'plain', assume: 1000 },
      { key: 'target', label: 'Target utilization (0 to 1)', unit: 'plain', assume: 0.65 },
      { key: 'avg', label: 'Average load', unit: 'qps' },
      { key: 'peak', label: 'Peak load', unit: 'qps' },
      { key: 'servers', label: 'Servers needed', unit: 'count' },
    ],
    eqs: [
      { out: 'avg', terms: [['dau', 1], ['requests', 1], [86400, -1]] },
      { out: 'peak', terms: [['avg', 1], ['peakFactor', 1]] },
      { out: 'servers', terms: [['peak', 1], ['capacity', -1], ['target', -1]] },
    ],
    starts: [
      { key: 'dau', value: 10_000_000 },
      { key: 'peak', value: 20000 },
      { key: 'servers', value: 50 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'on_request(request):' },
    { code: '  live = servers passing health checks', id: 'live' },
    { code: '  if strategy == round_robin:' },
    { code: '    server = live[i % len(live)]; i += 1', id: 'rr' },
    { code: '  else:' },
    { code: '    server = live with fewest connections', id: 'lc' },
    { code: '  send request to server' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Round robin', gain: 'No state, trivially fast', cost: 'Overloads slow servers, as the lab shows' },
    { choice: 'Least connections', gain: 'Adapts to slow servers', cost: 'Must track live connection counts' },
    { choice: 'Consistent hash on user', gain: 'The same user reaches the same server, so caches work', cost: 'Hot users create hot servers' },
    { choice: 'Short health check interval', gain: 'Finds failures faster, so fewer requests fail', cost: 'More probe traffic, and may eject servers on a blip' },
  ],
  interview: [
    { q: 'What if the load balancer itself fails?', a: 'Run two in active-passive or active-active, sharing a virtual IP or fronted by DNS. If one stops sending heartbeats, the other takes over the address.' },
    { q: 'How do you handle sticky sessions?', a: 'Avoid them when you can. Move session data to a shared store like Redis so servers stay stateless. If you must have them, hash the session ID, and accept that a server failure logs out its users.' },
    { q: 'How many servers should you provision?', a: 'Enough to handle peak load at your target utilization with one server down. Use the estimator above, then add one. Running at 95% looks efficient until the first burst, as the last experiment shows.' },
    { q: 'How does a new server warm up?', a: 'A cold server with an empty cache can be overwhelmed by a full share of traffic. Slow start ramps its share up over a minute or so.' },
  ],
  mistakes: [
    'Quoting average utilization without checking per-server load.',
    'Forgetting that the load balancer needs redundancy too.',
    'Capacity planning for the normal case, with no room to lose a server at peak.',
  ],
};

export default topic;
