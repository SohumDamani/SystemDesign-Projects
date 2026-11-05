import type { Lab, Topic } from '../../core/types';
import { fmtCount, fmtDuration, fmtInt, fmtPct } from '../../core/format';
import { zipfSampler } from '../../core/rng';
import source from './engine.ts?raw';
import { WindowedCounter, topAds, type ClickEvent } from './engine';

type P = { rate: number; windowSec: number; latenessSec: number; meanDelaySec: number; dupRate: number; dedupe: boolean };

const DT = 0.25;
const ADS = 200;

interface InFlight {
  event: ClickEvent;
  arrivesAt: number;
}

interface S {
  now: number;
  counter: WindowedCounter;
  zipf: ReturnType<typeof zipfSampler>;
  inFlight: InFlight[];
  nextId: number;
  trueClicks: number;
  arrived: number;
  latest?: { start: number; total: number };
  outputDelay: number;
  countedTotal: number;
  closedSeen: number;
  trueByWindow: Map<number, number>;
  trueInClosed: number;
}

const lateRate = (s: S) => (s.arrived ? s.counter.late / s.arrived : 0);

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'rate', label: 'Clicks', kind: 'range', min: 10, max: 500, step: 10, unit: 'per s' },
    { key: 'windowSec', label: 'Window size', kind: 'range', min: 5, max: 60, step: 5, unit: 's', rebuild: true },
    { key: 'latenessSec', label: 'Allowed lateness (watermark)', kind: 'range', min: 0, max: 60, step: 1, unit: 's', rebuild: true },
    { key: 'meanDelaySec', label: 'Average event delay', kind: 'range', min: 0, max: 30, step: 0.5, unit: 's' },
    { key: 'dupRate', label: 'Events delivered twice', kind: 'range', min: 0, max: 0.2, step: 0.01, format: (v) => fmtPct(v) },
    { key: 'dedupe', label: 'Deduplicate by event ID', kind: 'toggle', rebuild: true },
  ],
  defaults: { rate: 100, windowSec: 10, latenessSec: 5, meanDelaySec: 3, dupRate: 0, dedupe: false },
  create: (p) => ({ now: 0, counter: new WindowedCounter(p.windowSec, p.latenessSec, p.dedupe), zipf: zipfSampler(ADS, 1), inFlight: [], nextId: 1, trueClicks: 0, arrived: 0, outputDelay: 0, countedTotal: 0, closedSeen: 0, trueByWindow: new Map(), trueInClosed: 0 }),
  step(s, p, rng) {
    s.now += DT;
    for (let i = rng.poisson(p.rate * DT); i > 0; i--) {
      const event: ClickEvent = { id: s.nextId++, ad: s.zipf(rng), eventTime: s.now + rng.next() * DT };
      s.trueClicks++;
      const windowStart = Math.floor(event.eventTime / p.windowSec) * p.windowSec;
      s.trueByWindow.set(windowStart, (s.trueByWindow.get(windowStart) ?? 0) + 1);
      s.inFlight.push({ event, arrivesAt: s.now + rng.exponential(Math.max(0.001, p.meanDelaySec)) });
      if (rng.chance(p.dupRate)) s.inFlight.push({ event, arrivesAt: s.now + rng.exponential(Math.max(0.001, p.meanDelaySec)) + 0.5 });
    }
    s.inFlight = s.inFlight.filter((f) => {
      if (f.arrivesAt > s.now) return true;
      s.arrived++;
      s.counter.add(f.event, s.now);
      return false;
    });
    s.counter.closeReady(s.now);
    for (; s.closedSeen < s.counter.closed.length; s.closedSeen++) {
      const w = s.counter.closed[s.closedSeen];
      s.countedTotal += w.total;
      s.trueInClosed += s.trueByWindow.get(w.start) ?? 0;
      s.latest = { start: w.start, total: w.total };
      s.outputDelay = w.closedAt - (w.start + p.windowSec);
    }
  },
  sample: (s, p) => ({ late: lateRate(s) * 100, lateMath: Math.exp(-p.latenessSec / Math.max(0.001, p.meanDelaySec)) * 100, output: s.outputDelay, outputMath: p.latenessSec }),
  charts: [
    { title: 'Events arriving too late to count', unit: '%', series: [{ key: 'late', label: 'Measured', role: 'measured' }, { key: 'lateMath', label: 'Upper bound', role: 'predicted' }] },
    { title: 'Result delay after a window ends', unit: 's', series: [{ key: 'output', label: 'Measured', role: 'measured' }, { key: 'outputMath', label: 'Math', role: 'predicted' }] },
  ],
  metrics(s, p) {
    const countedVsTrue = s.trueInClosed ? s.countedTotal / s.trueInClosed : 1;
    return [
      { label: 'Late events, at most', value: fmtPct(Math.exp(-p.latenessSec / Math.max(0.001, p.meanDelaySec)), 1), role: 'predicted' },
      { label: 'Late events', value: fmtPct(lateRate(s), 1), role: 'measured', tone: lateRate(s) > 0.02 ? 'warn' : 'good' },
      { label: 'Result delay', value: fmtDuration(s.outputDelay), role: 'measured' },
      { label: 'Windows published', value: fmtInt(s.counter.closed.length), role: 'measured' },
      { label: 'Duplicates dropped', value: fmtCount(s.counter.duplicatesDropped), role: 'measured' },
      { label: 'Counted vs real clicks', value: `${countedVsTrue.toFixed(3)}×`, role: 'measured', tone: countedVsTrue > 1.01 ? 'bad' : undefined },
    ];
  },
  math(_s, p) {
    const mean = Math.max(0.001, p.meanDelaySec);
    return [
      { expr: `Chance of arriving later than the watermark: e^(−${p.latenessSec} ÷ ${p.meanDelaySec})`, result: fmtPct(Math.exp(-p.latenessSec / mean), 1) },
      { expr: `Results appear ${p.latenessSec} s after each window ends`, result: `${p.latenessSec} s delay` },
      { expr: `Double delivery without dedup inflates counts by`, result: p.dedupe ? '0%, dropped' : fmtPct(p.dupRate), tone: p.dedupe || !p.dupRate ? 'good' : 'bad' },
    ];
  },
  views(s) {
    const last = s.counter.closed[s.counter.closed.length - 1];
    return [
      { kind: 'bars', title: last ? `Top ads in window starting at ${fmtInt(last.start)} s` : 'Top ads, once a window closes', items: last ? topAds(last.counts, 5).map(([ad, c]) => ({ label: `Ad ${ad}`, value: c })) : [] },
      { kind: 'log', title: 'Published windows', lines: s.counter.closed.slice(-5).reverse().map((w) => ({ text: `Window ${fmtInt(w.start)} s: ${fmtInt(w.total)} clicks` })) },
    ];
  },
  trace: (s) => ({
    values: { wm: `${s.counter.watermark.toFixed(1)} s`, late: fmtCount(s.counter.late), latest: s.latest ? `${fmtInt(s.latest.total)} clicks` : '' },
  }),
  experiments: [
    {
      title: 'Publish immediately',
      set: { latenessSec: 0, meanDelaySec: 3, windowSec: 10 },
      ticks: 240,
      question: 'Close each window as soon as the time passes, with no allowance for lateness. Events take about 3 seconds to arrive on average. What happens to accuracy?',
      options: ['Almost nothing is missed', 'A meaningful share of clicks gets missed', 'All are lost'],
      answer: 1,
      explain: 'Clicks near the end of a window arrive after it\'s closed, so they don\'t get counted. Results come fast, but they undercount, and advertisers are billed on these numbers.',
      check: (s) => lateRate(s) > 0.05,
    },
    {
      title: 'Wait for stragglers',
      set: { latenessSec: 12, meanDelaySec: 3, windowSec: 10 },
      ticks: 240,
      question: 'Now wait 12 seconds, four times the average delay. What share of events arrive too late?',
      options: ['Under 2%', 'About 25%', 'About 50%'],
      answer: 0,
      explain: 'For exponentially distributed delays, the share later than 4 averages is e^(−4) = 1.8%, and in practice lower. But each result now appears 12 seconds later. That\'s the core tradeoff: fresh or correct. Some systems publish early and correct later.',
      check: (s) => lateRate(s) < 0.02,
    },
    {
      title: 'Double delivery',
      set: { dupRate: 0.1, dedupe: false, latenessSec: 15, meanDelaySec: 1 },
      ticks: 200,
      question: 'Your pipeline delivers at-least-once, and 10% of events arrive twice. With no deduplication, what happens to billed clicks?',
      options: ['Nothing, since the counts are the same', 'About 10% too high'],
      answer: 1,
      explain: 'Each duplicate counts as a click, so advertisers get overcharged. In an ad system, that\'s real money and legal risk. Every event needs an ID, and exactly-once must hold across the whole pipeline.',
      check: (s) => {
        const ratio = s.countedTotal / Math.max(1, s.trueInClosed);
        return s.trueInClosed > 1000 && ratio > 1.05 && ratio < 1.16;
      },
    },
    {
      title: 'Deduplicate',
      set: { dupRate: 0.1, dedupe: true, latenessSec: 15, meanDelaySec: 1 },
      ticks: 200,
      question: 'Remember recently seen event IDs and drop repeats. What share of events get counted twice?',
      options: ['None', 'About 5%', 'About 10%'],
      answer: 0,
      explain: 'A repeat ID is dropped, so counts match reality. The cost is memory for recent IDs, and in a distributed pipeline those IDs have to be saved atomically with offsets, or a crash can bring duplicates back.',
      check: (s) => s.counter.duplicatesDropped > 50 && s.trueInClosed > 1000 && s.countedTotal <= s.trueInClosed,
    },
  ],
};

const topic: Topic = {
  problem: [
    'Advertisers pay per click, so counting clicks accurately is directly about money. At billions of events a day, you need near real-time counts per ad, and top lists to help them adjust their campaigns, as well as final numbers correct enough to bill on.',
    'The fundamental difficulty is that events arrive late and out of order, from phones that lose signal and networks that retry. You can\'t wait forever, and you can\'t count wrong. Watermarks are how you pick your point on that line.',
  ],
  functional: [
    'Count clicks per ad over recent time windows',
    'Return the top N ads each minute',
    'Filter by region, device and so on',
  ],
  nonFunctional: [
    'Accurate enough for billing',
    'Handles late and duplicate events correctly',
    'End-to-end delay of a few minutes at most',
  ],
  diagram: {
    nodes: [
      { id: 'l', label: 'Click logs', col: 0, row: 1, kind: 'client', note: 'Log files from ad servers, with event time, ad ID, user and so on.' },
      { id: 'q1', label: 'Message queue', col: 1, row: 1, kind: 'queue', note: 'Decouples producers, and keeps raw events for replay.' },
      { id: 'a', label: 'Aggregation', col: 2, row: 1, note: 'Stream processors count in windows, using watermarks to decide when to emit.' },
      { id: 'q2', label: 'Results queue', col: 3, row: 1, kind: 'queue', note: 'Delivers results exactly once to the database.' },
      { id: 'd', label: 'Aggregates database', col: 4, row: 1, kind: 'store', note: 'Time-series style store of counts, read by dashboards.' },
      { id: 'r', label: 'Raw data store', col: 1, row: 2, kind: 'store', note: 'The source of truth, and enables recalculation when something goes wrong.' },
      { id: 'b', label: 'Recalculation', col: 2, row: 2, note: 'Batch job that replays raw events to fix any errors in stream results.' },
    ],
    edges: [
      { from: 'l', to: 'q1' },
      { from: 'q1', to: 'a' },
      { from: 'a', to: 'q2' },
      { from: 'q2', to: 'd' },
      { from: 'q1', to: 'r', dashed: true },
      { from: 'r', to: 'b' },
      { from: 'b', to: 'd', dashed: true },
    ],
  },
  ideas: [
    { title: 'Event time, not processing time', body: 'Count by when the click happened, not when you received it. Otherwise a network delay moves clicks into the wrong minute, which matters when you bill on them.' },
    { title: 'Watermarks', body: 'A watermark says you\'ve probably seen everything before a certain time. Waiting longer catches more stragglers but delays results. Very late data goes to a correction job.' },
    { title: 'Window types', body: 'Tumbling windows are consecutive and non-overlapping, for per-minute counts. Sliding windows overlap, for "top ads in the last 5 minutes". Both work with watermarks.' },
    { title: 'Exactly-once', body: 'To be exact, offsets and results have to commit together, atomically. Keeping raw data gives you a backstop: you can always recalculate the truth.' },
  ],
  estimator: {
    vars: [
      { key: 'dau', label: 'Daily active users', unit: 'count' },
      { key: 'clicksPerUser', label: 'Clicks per user per day', unit: 'plain', assume: 1 },
      { key: 'peakFactor', label: 'Peak over average', unit: 'plain', assume: 5 },
      { key: 'eventBytes', label: 'Bytes per click', unit: 'plain', assume: 100 },
      { key: 'days', label: 'Days of raw data', unit: 'plain', assume: 30 },
      { key: 'clicksDay', label: 'Clicks per day', unit: 'count' },
      { key: 'avg', label: 'Average click rate', unit: 'qps' },
      { key: 'peak', label: 'Peak click rate', unit: 'qps' },
      { key: 'storage', label: 'Raw data', unit: 'bytes' },
    ],
    eqs: [
      { out: 'clicksDay', terms: [['dau', 1], ['clicksPerUser', 1]] },
      { out: 'avg', terms: [['clicksDay', 1], [86400, -1]] },
      { out: 'peak', terms: [['avg', 1], ['peakFactor', 1]] },
      { out: 'storage', terms: [['clicksDay', 1], ['eventBytes', 1], ['days', 1]] },
    ],
    starts: [
      { key: 'dau', value: 1e9 },
      { key: 'peak', value: 50000 },
      { key: 'storage', value: 3e12 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'on_event(click):' },
    { code: '  if deduping and click.id already seen: drop it' },
    { code: '  watermark = newest event time − allowed lateness', id: 'wm' },
    { code: '  window = floor(click.time ÷ size)' },
    { code: '  if that window has closed: mark as late', id: 'late' },
    { code: '  else: count[window][click.ad] += 1' },
    { code: '  publish every window ending before the watermark', id: 'latest' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Longer watermark', gain: 'More accurate', cost: 'Slower results' },
    { choice: 'Event time', gain: 'Correct assignment to windows', cost: 'Must handle late arrivals' },
    { choice: 'Stream plus batch recalculation', gain: 'Fast results, and a truth to fall back on', cost: 'Two systems to run' },
    { choice: 'Dedup with exactly-once', gain: 'Correct billing', cost: 'Overhead and complexity' },
  ],
  interview: [
    { q: 'What do you do with very late events?', a: 'Don\'t try to keep windows open indefinitely. Send them to a correction path, and have a daily batch reconciliation against raw data that produces the final billable numbers.' },
    { q: 'How do you find the top N ads?', a: 'Keep a counter per ad in each window, along with a min-heap of size N, and emit them together. For very high cardinality, an approximate sketch trades a little accuracy for much less memory.' },
    { q: 'How do you handle a hot ad?', a: 'Split its count across several aggregator nodes by adding a random suffix to the key, then merge partial counts. Hot keys are otherwise a real bottleneck in stream processing.' },
    { q: 'How do you recover from a bad code deploy?', a: 'This is why you keep raw events. Replay them through the fixed code, and overwrite the affected results. Immutable input makes recovery simple.' },
  ],
  mistakes: [
    'Counting by processing time.',
    'Assuming at-least-once delivery is good enough for billing.',
    'Throwing away raw events after aggregating.',
  ],
};

export default topic;
