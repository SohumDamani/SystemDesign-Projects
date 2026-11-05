import type { Lab, Topic } from '../../core/types';
import { fmtCount, fmtDuration, fmtPct } from '../../core/format';
import source from './engine.ts?raw';
import { CHANNELS, Queue, SEND_SECONDS, attemptSend, backoffSeconds, type Channel, type Provider, type Task } from './engine';

type P = { eventsPerSec: number; workers: number; failRate: number; ackLoss: number; maxRetries: number; dedupe: boolean; queues: 'separate' | 'shared' };

const DT = 0.1;
const MIX: Record<Channel, number> = { push: 0.6, email: 0.3, sms: 0.1 };
const WORKER_SPLIT: Record<Channel, number> = { push: 0.5, email: 0.3, sms: 0.2 };

interface Pool {
  queue: Queue;
  busyUntil: number[];
}

interface S {
  now: number;
  nextId: number;
  pools: Pool[];
  providerDown: Record<Channel, boolean>;
  deliveredIds: Set<number>;
  delivered: number;
  duplicates: number;
  dead: number;
  attempts: number;
  lag: Record<Channel, number>;
  last: string;
}

const poolFor = (s: S, p: P, channel: Channel) => (p.queues === 'shared' ? s.pools[0] : s.pools[CHANNELS.indexOf(channel)]);

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'eventsPerSec', label: 'Notifications', kind: 'range', min: 10, max: 500, step: 10, unit: 'per s' },
    { key: 'workers', label: 'Delivery workers', kind: 'range', min: 5, max: 100, step: 1, rebuild: true },
    { key: 'failRate', label: 'Provider failure rate', kind: 'range', min: 0, max: 0.6, step: 0.05, format: (v) => fmtPct(v) },
    { key: 'ackLoss', label: 'Lost acknowledgements', kind: 'range', min: 0, max: 0.2, step: 0.01, format: (v) => fmtPct(v) },
    { key: 'maxRetries', label: 'Max retries', kind: 'range', min: 0, max: 6, step: 1 },
    { key: 'queues', label: 'Queues', kind: 'choice', rebuild: true, options: [{ value: 'separate', label: 'One queue per channel' }, { value: 'shared', label: 'One shared queue' }] },
    { key: 'dedupe', label: 'Send an idempotency key', kind: 'toggle' },
  ],
  defaults: { eventsPerSec: 100, workers: 20, failRate: 0.1, ackLoss: 0, maxRetries: 3, dedupe: false, queues: 'separate' },
  create(p) {
    const make = (n: number): Pool => ({ queue: new Queue(), busyUntil: Array(Math.max(1, n)).fill(0) });
    const pools = p.queues === 'shared' ? [make(p.workers)] : CHANNELS.map((c) => make(Math.round(p.workers * WORKER_SPLIT[c])));
    return { now: 0, nextId: 1, pools, providerDown: { push: false, email: false, sms: false }, deliveredIds: new Set(), delivered: 0, duplicates: 0, dead: 0, attempts: 0, lag: { push: 0, email: 0, sms: 0 }, last: '' };
  },
  step(s, p, rng) {
    s.now += DT;
    for (let i = rng.poisson(p.eventsPerSec * DT); i > 0; i--) {
      const r = rng.next();
      const channel: Channel = r < MIX.push ? 'push' : r < MIX.push + MIX.email ? 'email' : 'sms';
      const task: Task = { id: s.nextId++, channel, attempts: 0, createdAt: s.now, readyAt: s.now };
      poolFor(s, p, channel).queue.push(task);
    }
    for (const pool of s.pools) {
      pool.queue.releaseDue(s.now);
      for (let w = 0; w < pool.busyUntil.length; w++) {
        // A fast send frees the worker inside this tick, so it can take several.
        while (pool.busyUntil[w] <= s.now) {
          const task = pool.queue.pop();
          if (!task) break;
          const provider: Provider = { down: s.providerDown[task.channel], failRate: p.failRate, ackLossRate: p.ackLoss };
          const outcome = attemptSend(provider, rng);
          s.attempts++;
          pool.busyUntil[w] = Math.max(pool.busyUntil[w], s.now - DT) + outcome.busyFor;
          if (outcome.delivered) {
            if (!s.deliveredIds.has(task.id)) {
              s.deliveredIds.add(task.id);
              s.delivered++;
            } else if (!p.dedupe) {
              // The provider had no way to know this was a repeat, so the user sees it twice.
              s.duplicates++;
            }
          }
          if (outcome.confirmed) {
            s.last = `${task.channel} #${task.id} delivered on attempt ${task.attempts + 1}`;
            continue;
          }
          task.attempts++;
          if (task.attempts > p.maxRetries) {
            if (!s.deliveredIds.has(task.id)) s.dead++;
            s.last = `${task.channel} #${task.id} moved to dead letters`;
          } else {
            pool.queue.retryLater(task, s.now + backoffSeconds(task.attempts, rng));
            s.last = `${task.channel} #${task.id} will retry, attempt ${task.attempts + 1}`;
          }
        }
      }
    }
    for (const c of CHANNELS) s.lag[c] = poolFor(s, p, c).queue.oldestAge(c, s.now);
  },
  sample: (s) => ({ push: s.lag.push, sms: s.lag.sms, email: s.lag.email, delivered: s.delivered, duplicates: s.duplicates }),
  charts: [{ title: 'How long the oldest task has waited', unit: 's', series: [{ key: 'push', label: 'Push', role: 'measured' }, { key: 'sms', label: 'SMS', role: 'other' }, { key: 'email', label: 'Email', role: 'other' }] }],
  metrics(s, p) {
    const finished = s.delivered + s.dead;
    const predicted = 1 - Math.pow(p.failRate, p.maxRetries + 1);
    return [
      { label: 'Delivered', value: fmtPct(predicted, 2), role: 'predicted' },
      { label: 'Delivered', value: finished ? fmtPct(s.delivered / finished, 2) : '0%', role: 'measured' },
      { label: 'Duplicates', value: fmtCount(s.duplicates), role: 'measured', tone: s.duplicates ? 'bad' : undefined },
      { label: 'Dead letters', value: fmtCount(s.dead), role: 'measured', tone: s.dead ? 'warn' : undefined },
      { label: 'Push waiting', value: fmtDuration(s.lag.push), role: 'measured', tone: s.lag.push > 2 ? 'bad' : undefined },
    ];
  },
  math(_s, p) {
    const capacity = p.workers / SEND_SECONDS;
    const predicted = 1 - Math.pow(p.failRate, p.maxRetries + 1);
    return [
      { expr: `Reach: 1 − ${p.failRate.toFixed(2)}^${p.maxRetries + 1}`, result: fmtPct(predicted, 2) },
      { expr: `Worker capacity: ${p.workers} ÷ ${SEND_SECONDS} s`, result: `${fmtCount(capacity)} sends/s`, tone: capacity > p.eventsPerSec ? 'good' : 'bad' },
      { expr: `Duplicates: lost acks are retried`, result: p.dedupe ? 'dropped by the key' : `≈ ${fmtPct(p.ackLoss)} of sends`, tone: p.dedupe || !p.ackLoss ? 'good' : 'bad' },
    ];
  },
  views: (s) => [
    { kind: 'cells', title: 'Providers', items: CHANNELS.map((c) => ({ label: c.toUpperCase() === 'SMS' ? 'SMS' : c === 'push' ? 'Push' : 'Email', value: s.providerDown[c] ? 'Outage' : 'Healthy', tone: s.providerDown[c] ? 'bad' : 'good' })) },
    { kind: 'bars', title: 'Tasks waiting by queue', items: s.pools.map((pool, i) => ({ label: s.pools.length === 1 ? 'Shared' : ['Push', 'Email', 'SMS'][i], value: pool.queue.length + pool.queue.delayed.length })) },
  ],
  actions: [
    {
      key: 'sms-outage',
      label: 'Start or end an SMS outage',
      run: (s) => {
        s.providerDown.sms = !s.providerDown.sms;
      },
    },
    {
      key: 'push-outage',
      label: 'Start or end a push outage',
      run: (s) => {
        s.providerDown.push = !s.providerDown.push;
      },
    },
  ],
  trace: (s) => ({ values: { last: s.last, retry: `${fmtCount(s.attempts)} sends so far` }, active: s.last.includes('retry') ? ['retry'] : ['last'] }),
  experiments: [
    {
      title: 'Retries buy reliability',
      set: { failRate: 0.3, maxRetries: 3, ackLoss: 0 },
      ticks: 300,
      question: 'A provider fails 30% of the time. With 3 retries, what share of notifications eventually reach the provider?',
      options: ['About 70%', 'About 99%', 'Exactly 100%'],
      answer: 1,
      explain: 'A notification is lost only if all four attempts fail: 0.3^4 = 0.8%. Retries multiply reliability quickly, as long as failures are independent. A dead letter queue catches the rest so you can inspect them.',
      check: (s) => s.delivered + s.dead > 500 && s.delivered / (s.delivered + s.dead) > 0.96,
    },
    {
      title: 'The lost acknowledgement',
      set: { failRate: 0, ackLoss: 0.1, maxRetries: 3, dedupe: false },
      ticks: 300,
      question: 'The provider never fails, but 10% of its acknowledgements get lost. Your system retries anything unconfirmed. What do users see?',
      options: ['Nothing unusual', 'About 1 in 10 notifications arrives twice', 'About 1 in 10 never arrives'],
      answer: 1,
      explain: 'A lost ack looks just like a failure, so you retry something that already worked. This is why exactly-once delivery is so hard over a network. Retrying is safe only if repeats can be detected.',
      check: (s) => s.delivered > 500 && s.duplicates / s.delivered > 0.05 && s.duplicates / s.delivered < 0.16,
    },
    {
      title: 'Send an idempotency key',
      set: { failRate: 0, ackLoss: 0.1, maxRetries: 3, dedupe: true },
      ticks: 300,
      question: 'Each send now carries a unique key, and the provider drops repeats of a key it has already seen. How many duplicates reach users?',
      options: ['None', 'About half as many', 'The same'],
      answer: 0,
      explain: 'Your side can keep retrying safely, because the provider recognizes the repeat. You get at-least-once delivery plus deduplication, which behaves like exactly-once. The cost is that the provider, or you, must remember recent keys.',
      check: (s) => s.duplicates === 0 && s.delivered > 500,
    },
    {
      title: 'One queue, one outage',
      set: { queues: 'shared', workers: 20, failRate: 0, maxRetries: 3 },
      act: ['sms-outage'],
      actAt: 30,
      ticks: 300,
      question: 'SMS has an outage, and each attempt hangs for 2 seconds. All channels share one queue and one worker pool. What happens to push notifications?',
      options: ['Nothing, since push is healthy', 'They slow to a crawl, even though push is fine'],
      answer: 1,
      explain: 'SMS is only 10% of traffic, but its hung sends use up every worker. Healthy push traffic waits behind them. One slow dependency has taken down the whole system.',
      check: (s) => s.lag.push > 2,
    },
    {
      title: 'Isolate the blast',
      set: { queues: 'separate', workers: 20, failRate: 0, maxRetries: 3 },
      act: ['sms-outage'],
      actAt: 30,
      ticks: 300,
      question: 'Same outage, but each channel has its own queue and workers. How long do push notifications wait?',
      options: ['Almost no time', 'The same as before'],
      answer: 0,
      explain: 'This is the bulkhead pattern. SMS still fails, but it can only consume its own workers, so push and email carry on. Separate queues contain a failure to the part that actually failed.',
      check: (s) => s.lag.push < 1,
    },
  ],
};

const topic: Topic = {
  problem: [
    'A notification system sends messages through push, SMS and email, on behalf of many other services. It rarely sends anything itself. It relies on third parties such as APNs, FCM and SMS gateways, and those fail, slow down and rate limit you.',
    'So the design is really about delivering reliably through unreliable partners: queueing, retries, not sending the same thing twice, and making sure trouble with one provider doesn\'t become trouble with all of them.',
  ],
  functional: [
    'Send push, SMS and email notifications',
    'Accept requests from many internal services',
    'Respect user preferences and opt-outs',
  ],
  nonFunctional: [
    'Soft real time: fast, with slight delays acceptable at peak',
    'No lost notifications, and few duplicates',
    'One provider\'s outage doesn\'t affect the others',
  ],
  diagram: {
    nodes: [
      { id: 's', label: 'Internal services', col: 0, row: 1, kind: 'client', note: 'Billing, shipping and so on. They call one API and don\'t need to know about providers.' },
      { id: 'n', label: 'Notification service', col: 1, row: 1, note: 'Validates, applies rate limits, checks preferences, and renders templates.' },
      { id: 'q1', label: 'Push queue', col: 2, row: 0, kind: 'queue', note: 'Each channel has its own queue so failures are isolated.' },
      { id: 'q2', label: 'Email queue', col: 2, row: 1, kind: 'queue', note: 'Absorbs spikes, so a burst waits instead of failing.' },
      { id: 'q3', label: 'SMS queue', col: 2, row: 2, kind: 'queue', note: 'Separate from others, so an SMS gateway outage stays here.' },
      { id: 'w', label: 'Workers', col: 3, row: 1, note: 'Send to the provider, retry with backoff, and log the result.' },
      { id: 'p', label: 'Providers', col: 4, row: 1, kind: 'external', note: 'APNs, FCM, email and SMS gateways, which are outside your control.' },
    ],
    edges: [
      { from: 's', to: 'n' },
      { from: 'n', to: 'q1' },
      { from: 'n', to: 'q2' },
      { from: 'n', to: 'q3' },
      { from: 'q1', to: 'w' },
      { from: 'q2', to: 'w' },
      { from: 'q3', to: 'w' },
      { from: 'w', to: 'p' },
    ],
  },
  ideas: [
    { title: 'Queues decouple', body: 'Services hand off and move on. A spike becomes a longer queue rather than a failure, and workers can scale independently of the callers.' },
    { title: 'Retries with backoff', body: 'Retry failed sends, waiting longer each time and adding jitter so retries don\'t arrive as a wave. Send what still fails to a dead letter queue.' },
    { title: 'At-least-once, then dedupe', body: 'Exactly-once delivery over a network isn\'t really achievable, so retry until confirmed and make repeats harmless with an event ID both sides remember.' },
    { title: 'Bulkheads', body: 'Give each channel its own queue and workers, so a provider outage only consumes its own share. It\'s the same idea as watertight compartments in a ship.' },
  ],
  estimator: {
    vars: [
      { key: 'perDay', label: 'Notifications per day', unit: 'count' },
      { key: 'peakFactor', label: 'Peak over average', unit: 'plain', assume: 5 },
      { key: 'workerRate', label: 'Sends per second per worker', unit: 'plain', assume: 10 },
      { key: 'logBytes', label: 'Log bytes per send', unit: 'plain', assume: 500 },
      { key: 'days', label: 'Days of logs', unit: 'plain', assume: 90 },
      { key: 'avg', label: 'Average send rate', unit: 'qps' },
      { key: 'peak', label: 'Peak send rate', unit: 'qps' },
      { key: 'workers', label: 'Workers at peak', unit: 'count' },
      { key: 'logs', label: 'Log storage', unit: 'bytes' },
    ],
    eqs: [
      { out: 'avg', terms: [['perDay', 1], [86400, -1]] },
      { out: 'peak', terms: [['avg', 1], ['peakFactor', 1]] },
      { out: 'workers', terms: [['peak', 1], ['workerRate', -1]] },
      { out: 'logs', terms: [['perDay', 1], ['logBytes', 1], ['days', 1]] },
    ],
    starts: [
      { key: 'perDay', value: 16_000_000 },
      { key: 'peak', value: 2000 },
      { key: 'workers', value: 100 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'worker loop:' },
    { code: '  task = next ready task' },
    { code: '  result = send(task, idempotency_key = task.id)' },
    { code: '  if confirmed: log it, and move on' },
    { code: '  else if attempts < max_retries:' },
    { code: '    retry after backoff with jitter', id: 'retry' },
    { code: '  else: move to dead letter queue' },
    { code: 'latest event', id: 'last' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Separate queues', gain: 'Failures stay isolated', cost: 'Some idle capacity, and more to operate' },
    { choice: 'More retries', gain: 'Higher reach', cost: 'Possible duplicates, and more load during outages' },
    { choice: 'Idempotency keys', gain: 'Retries are safe', cost: 'Someone must remember keys for a while' },
    { choice: 'Second provider per channel', gain: 'Survives a provider outage', cost: 'More contracts and code' },
  ],
  interview: [
    { q: 'How do you avoid spamming users?', a: 'Rate limit per user and per notification type, respect opt-outs, and check preferences before enqueueing. Collapse similar notifications into a digest where possible.' },
    { q: 'How do you track whether notifications worked?', a: 'Log each state change: sent, delivered, opened, clicked. Open and click rates tell you when a template or provider has a problem.' },
    { q: 'What if a device token is invalid?', a: 'Providers report dead tokens. Remove them, or you\'ll waste sends and may hurt your standing with the provider. The same goes for bounced email addresses.' },
    { q: 'Why not just send directly from each service?', a: 'Every service would need to handle retries, templates, preferences and provider keys. Centralizing keeps that in one place, and gives one place to enforce rate limits.' },
  ],
  mistakes: [
    'Promising exactly-once delivery.',
    'A single queue shared by all channels.',
    'Retrying instantly, which piles more load on a provider already in trouble.',
  ],
};

export default topic;
