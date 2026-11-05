import type { Lab, Topic } from '../../core/types';
import { fmtCount, fmtDuration, fmtPct } from '../../core/format';
import { tailMean } from '../../core/stats';
import source from './engine.ts?raw';
import { CircuitBreaker, RetryBudget, retryDelay, type Attempt } from './engine';

type P = { traffic: number; capacity: number; timeoutSec: number; retries: number; backoff: boolean; breaker: boolean; budget: boolean };

const DT = 0.05;
const QUEUE_SECONDS = 5; // the service queues at most this much work
const SLOW_FACTOR = 0.2;
const SLOW_SECONDS = 10;

interface S {
  now: number;
  queue: Attempt[];
  head: number;
  watching: Attempt[]; // waiting for a reply or a timeout, oldest first
  retryAt: { requestId: number; number: number; at: number }[];
  nextRequest: number;
  slowUntil: number;
  breaker: CircuitBreaker;
  budget: RetryBudget;
  goodput: number;
  load: number;
  wasted: number;
  failed: number;
  fastFailed: number;
  succeeded: number;
  carry: number;
  capacityNow: number;
}

function attemptSend(s: S, requestId: number, number: number, capacity: number) {
  s.load += 1 / DT;
  const attempt: Attempt = { requestId, number, sentAt: s.now, served: false, givenUp: false };
  if (s.queue.length - s.head >= capacity * QUEUE_SECONDS) {
    // The service is full, so this fails immediately.
    attempt.givenUp = true;
    return attempt;
  }
  s.queue.push(attempt);
  s.watching.push(attempt);
  return attempt;
}

function onFailed(s: S, p: P, a: Attempt, rng: { next(): number }) {
  if (p.breaker) s.breaker.onFailure(s.now);
  if (a.number <= p.retries && (!p.budget || s.budget.tryRetry())) {
    s.retryAt.push({ requestId: a.requestId, number: a.number + 1, at: s.now + retryDelay(a.number, 0.2, p.backoff, () => rng.next()) });
  } else {
    s.failed++;
  }
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'traffic', label: 'Incoming requests', kind: 'range', min: 100, max: 2000, step: 50, unit: 'per s' },
    { key: 'capacity', label: 'Service capacity', kind: 'range', min: 200, max: 2000, step: 50, unit: 'per s' },
    { key: 'timeoutSec', label: 'Client timeout', kind: 'range', min: 0.1, max: 3, step: 0.1, unit: 's' },
    { key: 'retries', label: 'Retries per request', kind: 'range', min: 0, max: 5, step: 1 },
    { key: 'backoff', label: 'Exponential backoff with jitter', kind: 'toggle' },
    { key: 'budget', label: 'Retry budget of 10%', kind: 'toggle' },
    { key: 'breaker', label: 'Circuit breaker', kind: 'toggle' },
  ],
  defaults: { traffic: 800, capacity: 1000, timeoutSec: 0.5, retries: 3, backoff: false, breaker: false, budget: false },
  create: () => ({ now: 0, queue: [], head: 0, watching: [], retryAt: [], nextRequest: 1, slowUntil: 0, breaker: new CircuitBreaker(0.5, 2, 100), budget: new RetryBudget(0.1, 200), goodput: 0, load: 0, wasted: 0, failed: 0, fastFailed: 0, succeeded: 0, carry: 0, capacityNow: 0 }),
  step(s, p, rng) {
    s.now += DT;
    let loadBefore = s.load;
    s.load = 0;
    // New requests, and retries that are due.
    const send = (requestId: number, number: number) => {
      if (p.breaker && !s.breaker.allow(s.now)) {
        s.fastFailed++;
        return;
      }
      const a = attemptSend(s, requestId, number, p.capacity);
      if (a.givenUp) onFailed(s, p, a, rng);
    };
    for (let i = rng.poisson(p.traffic * DT); i > 0; i--) {
      s.budget.onRequest();
      send(s.nextRequest++, 1);
    }
    s.retryAt = s.retryAt.filter((r) => {
      if (r.at > s.now) return true;
      send(r.requestId, r.number);
      return false;
    });
    // The service works through its queue, including requests the client gave up on.
    const capacityNow = s.now < s.slowUntil ? p.capacity * SLOW_FACTOR : p.capacity;
    s.capacityNow = capacityNow;
    s.carry += capacityNow * DT;
    let good = 0;
    while (s.carry >= 1 && s.head < s.queue.length) {
      s.carry -= 1;
      const a = s.queue[s.head++];
      a.served = true;
      if (a.givenUp) {
        s.wasted++; // finished work nobody is waiting for any more
      } else {
        good++;
        s.succeeded++;
        if (p.breaker) s.breaker.onSuccess();
      }
    }
    if (s.carry > capacityNow * DT) s.carry = capacityNow * DT;
    if (s.head > 4096) {
      s.queue = s.queue.slice(s.head);
      s.head = 0;
    }
    // Clients time out, and may retry, while the abandoned request stays in the queue.
    let i = 0;
    for (; i < s.watching.length; i++) {
      const a = s.watching[i];
      if (a.served) continue;
      if (s.now - a.sentAt < p.timeoutSec) break;
      a.givenUp = true;
      onFailed(s, p, a, rng);
    }
    s.watching = s.watching.slice(i);
    s.goodput = s.goodput * 0.9 + (good / DT) * 0.1;
    loadBefore = loadBefore * 0.9 + s.load * 0.1;
    s.load = loadBefore;
  },
  sample: (s, p) => ({ goodput: s.goodput, offered: p.traffic, capacity: s.capacityNow, load: s.load, queue: s.queue.length - s.head }),
  charts: [
    { title: 'Requests that succeed', unit: 'per s', series: [{ key: 'goodput', label: 'Measured', role: 'measured' }, { key: 'offered', label: 'Incoming', role: 'predicted' }] },
    { title: 'Load on the service, with retries', unit: 'per s', series: [{ key: 'load', label: 'Measured', role: 'measured' }, { key: 'capacity', label: 'Capacity', role: 'predicted' }] },
  ],
  metrics(s, p) {
    const queued = s.queue.length - s.head;
    const total = s.succeeded + s.failed + s.fastFailed;
    return [
      { label: 'Worst-case load if all fail', value: `${fmtCount(p.traffic * (p.budget ? 1.1 : p.retries + 1))}/s`, role: 'predicted', tone: p.traffic * (p.budget ? 1.1 : p.retries + 1) > p.capacity ? 'warn' : 'good' },
      { label: 'Succeeding', value: `${fmtCount(s.goodput)}/s`, role: 'measured', tone: s.goodput < p.traffic * 0.5 ? 'bad' : 'good' },
      { label: 'Wait in queue', value: fmtDuration(queued / Math.max(1, s.capacityNow)), role: 'measured' },
      { label: 'Wasted work', value: fmtCount(s.wasted), role: 'measured', tone: s.wasted ? 'warn' : undefined },
      { label: 'Requests failed', value: fmtPct(total ? (s.failed + s.fastFailed) / total : 0), role: 'measured' },
      { label: 'Circuit breaker', value: p.breaker ? s.breaker.state : 'off', role: 'measured', tone: s.breaker.state === 'open' ? 'warn' : undefined },
    ];
  },
  math(_s, p) {
    const multiplied = p.traffic * (p.budget ? 1.1 : p.retries + 1);
    return [
      { expr: `Normal load: ${p.traffic} ÷ ${p.capacity} capacity`, result: fmtPct(p.traffic / p.capacity), tone: p.traffic < p.capacity ? 'good' : 'bad' },
      { expr: `If every attempt times out: ${p.traffic} × ${p.budget ? '1.1 with a budget' : `${p.retries + 1} attempts`}`, result: `${fmtCount(multiplied)}/s`, tone: multiplied > p.capacity ? 'bad' : 'good' },
      { expr: `That's more than capacity, so a queue can't drain`, result: multiplied > p.capacity ? 'it can get stuck' : 'it will recover', tone: multiplied > p.capacity ? 'bad' : 'good' },
    ];
  },
  views: (s) => [
    { kind: 'cells', title: 'Outcomes', items: [{ label: 'Succeeded', value: fmtCount(s.succeeded), tone: 'good' }, { label: 'Failed', value: fmtCount(s.failed), tone: s.failed ? 'bad' : 'neutral' }, { label: 'Failed fast', value: fmtCount(s.fastFailed), tone: s.fastFailed ? 'warn' : 'neutral' }, { label: 'Breaker opened', value: fmtCount(s.breaker.opens) }] },
  ],
  actions: [
    {
      key: 'slow',
      label: 'Slow the service to 20% for 10 s',
      run: (s) => {
        s.slowUntil = s.now + SLOW_SECONDS;
      },
    },
  ],
  trace: (s) => ({
    values: { state: s.breaker.state, queue: fmtCount(s.queue.length - s.head), good: `${fmtCount(s.goodput)}/s` },
  }),
  experiments: [
    {
      title: 'A blip that never ends',
      set: { traffic: 800, capacity: 1000, retries: 3, backoff: false, breaker: false, budget: false },
      act: ['slow'],
      actAt: 40,
      ticks: 700,
      question: 'A service handling 800 req/s, with capacity for 1,000, slows down for just 10 seconds. Clients retry 3 times. Once it\'s back to full speed, what happens?',
      options: ['It recovers within seconds', 'It stays down, even though nothing is wrong anymore'],
      answer: 1,
      explain: 'During the blip, a queue built up, so requests started timing out. Timeouts trigger retries, up to 4 times the load, which keeps the queue full, so everything times out. This is a metastable failure. The original cause is gone, and the outage feeds itself.',
      check: (_s, _p, h) => tailMean(h, 'goodput', 80) < 800 * 0.3,
    },
    {
      title: 'No retries',
      set: { traffic: 800, capacity: 1000, retries: 0, backoff: false, breaker: false, budget: false },
      act: ['slow'],
      actAt: 40,
      ticks: 1100,
      question: 'Same blip, with no retries at all. What happens after the 10 seconds?',
      options: ['It stays stuck', 'It recovers by itself'],
      answer: 1,
      explain: 'Load stays at 800, below capacity, so the queue drains using the spare 200 a second, and everything returns to normal in about 25 seconds. The retries were the entire problem. Though of course, without retries, ordinary brief failures reach your users.',
      check: (_s, _p, h) => tailMean(h, 'goodput', 80) > 800 * 0.7,
    },
    {
      title: 'Just add backoff?',
      set: { traffic: 800, capacity: 1000, retries: 3, backoff: true, breaker: false, budget: false },
      act: ['slow'],
      actAt: 40,
      ticks: 700,
      question: 'Everyone says "use exponential backoff". With 3 retries and backoff, new requests keep arriving at 800 a second. Does that fix it?',
      options: ['Yes, backoff solves it', 'No, each request still makes 4 attempts, only later'],
      answer: 1,
      explain: 'Backoff spreads retries out over time, and that helps with short spikes. But when new requests keep arriving regardless, the long-run load is still up to 4 times normal. You have to limit the number of retries, not only delay them.',
      check: (_s, _p, h) => tailMean(h, 'goodput', 80) < 800 * 0.5,
    },
    {
      title: 'A retry budget',
      set: { traffic: 800, capacity: 1000, retries: 3, backoff: true, breaker: false, budget: true },
      act: ['slow'],
      actAt: 40,
      ticks: 1500,
      question: 'Now retries are capped at 10% of normal traffic, so the worst-case load is 880 a second, which is under capacity. What happens?',
      options: ['It recovers', 'It stays stuck'],
      answer: 0,
      explain: 'Normal small failures still get retried, but during a big outage retries can\'t multiply the load. Recovery is slow, since only 120 a second of capacity is left over to drain the queue, but it does happen. The key is that total load stays under capacity, whatever happens.',
      check: (_s, _p, h) => tailMean(h, 'goodput', 80) > 800 * 0.7,
    },
    {
      title: 'A circuit breaker',
      set: { traffic: 800, capacity: 1000, retries: 3, backoff: false, breaker: true, budget: false },
      act: ['slow'],
      actAt: 40,
      ticks: 1100,
      question: 'With full retries, but a breaker that stops sending when most calls fail, does the service get a chance to recover?',
      options: ['Yes, the breaker gives it room to drain', 'No, it stays stuck'],
      answer: 0,
      explain: 'While open, it fails fast, sending nothing, so the queue drains. Then it lets a small number of requests through to test. If those work, it closes. Users see fast errors for a while, instead of a much longer outage.',
      check: (s, _p, h) => tailMean(h, 'goodput', 80) > 800 * 0.5 && s.breaker.opens > 0,
    },
  ],
};

const topic: Topic = {
  problem: [
    'Things fail, so clients retry. That sounds harmless, and it\'s responsible for some of the worst outages in the industry. When a service slows down, retries add more load exactly when it can least handle it, and the system can get stuck in that state long after the original problem has passed.',
    'This lab reproduces that effect, a metastable failure, using real retry and circuit breaker logic. It\'s a favorite topic in senior interviews, since many people assume adding retries always makes things more reliable.',
  ],
  functional: [
    'Retry failed requests, when that\'s safe',
    'Stop calling a service that\'s clearly failing',
    'Recover automatically once the service is healthy',
  ],
  nonFunctional: [
    'Short failures are invisible to users',
    'Failures don\'t multiply load',
    'Total load stays under capacity, whatever happens',
  ],
  diagram: {
    nodes: [
      { id: 'c', label: 'Client', col: 0, row: 1, kind: 'client', note: 'Sends requests, with timeouts, and retries when one fails.' },
      { id: 'b', label: 'Circuit breaker', col: 1, row: 1, note: 'Closed lets traffic through. Open fails fast. Half-open tests whether things have recovered.' },
      { id: 'q', label: 'Request queue', col: 2, row: 1, kind: 'queue', note: 'Requests wait here. Clients can give up while their requests stay in line, wasting work.' },
      { id: 's', label: 'Service', col: 3, row: 1, note: 'Works through the queue, at a limited rate.' },
    ],
    edges: [
      { from: 'c', to: 'b' },
      { from: 'b', to: 'q' },
      { from: 'q', to: 's' },
    ],
  },
  ideas: [
    { title: 'Retry amplification', body: 'With 3 retries, a failure can mean 4 times the load. Across layers it multiplies: 3 retries at each of 3 layers means up to 64 calls for one user action. Retry at one layer only.' },
    { title: 'Metastable failure', body: 'The system has two stable states, working and stuck. A short trigger moves it into the stuck state, and retries or queues keep it there. The trigger can be gone, while the outage continues.' },
    { title: 'Circuit breaker', body: 'Track recent failures. If too many fail, stop calling for a while and fail fast. Then try a few requests, and resume if they succeed. Like a fuse, it protects the thing behind it.' },
    { title: 'Timeouts and load shedding', body: 'Requests nobody is waiting for still consume work. Drop requests whose deadline has passed, and reject new work when you\'re overloaded, so that the requests you do accept can succeed.' },
  ],
  estimator: {
    vars: [
      { key: 'traffic', label: 'Normal traffic', unit: 'qps' },
      { key: 'attempts', label: 'Attempts per request', unit: 'plain', assume: 4 },
      { key: 'layers', label: 'Extra multiplier from other layers', unit: 'plain', assume: 2 },
      { key: 'peakLoad', label: 'Worst-case load during failure', unit: 'qps' },
    ],
    eqs: [{ out: 'peakLoad', terms: [['traffic', 1], ['attempts', 1], ['layers', 1]] }],
    starts: [
      { key: 'traffic', value: 1000 },
      { key: 'peakLoad', value: 8000 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'call(request):' },
    { code: '  if breaker is open: fail fast', id: 'state' },
    { code: '  send, and wait up to the timeout' },
    { code: '  on success: record it, and return', id: 'good' },
    { code: '  on timeout:' },
    { code: '    if retries and budget remain:' },
    { code: '      wait with exponential backoff and jitter' },
    { code: '      try again' },
    { code: 'requests in the service\'s queue', id: 'queue' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'More retries', gain: 'Hides brief failures', cost: 'Multiplies load during real ones' },
    { choice: 'Backoff with jitter', gain: 'Avoids synchronized retry waves', cost: 'Slower recovery, and doesn\'t limit total retries' },
    { choice: 'Retry budget', gain: 'Load stays bounded', cost: 'Some retryable failures reach users during outages' },
    { choice: 'Circuit breaker', gain: 'Gives failing services room to recover', cost: 'Fails fast, and may reject requests that would have worked' },
    { choice: 'Long timeouts', gain: 'Fewer false failures', cost: 'Resources tied up waiting' },
  ],
  interview: [
    { q: 'At which layer should you retry?', a: 'Ideally one, usually nearest the user or at the point with the most context. Retrying at each layer multiplies load quickly. Pass deadlines down, so lower layers don\'t work on requests nobody is waiting for.' },
    { q: 'Which requests are safe to retry?', a: 'Only idempotent ones, or those with an idempotency key. And retry only errors likely to be temporary, like timeouts or 503s, not a 400, which will fail the same way every time.' },
    { q: 'How do you get out of a metastable state?', a: 'You must remove the sustaining load: shed traffic at the edge, disable retries with a flag, or scale up well past normal. Restarting servers rarely helps, because the load comes straight back.' },
    { q: 'What is load shedding?', a: 'Rejecting some requests on purpose, when overloaded, so you can serve the others well. It\'s better to serve 80% of users properly than to time out on all of them.' },
  ],
  mistakes: [
    'Assuming more retries always mean more reliability.',
    'Using retries with no limit on their total volume.',
    'Retrying at every layer of a call chain.',
  ],
};

export default topic;
