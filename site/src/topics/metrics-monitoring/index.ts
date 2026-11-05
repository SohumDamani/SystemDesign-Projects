import type { Lab, Topic } from '../../core/types';
import { fmtBytes, fmtCount, fmtDuration, fmtInt, fmtPct } from '../../core/format';
import source from './engine.ts?raw';
import { bytesPerSeries, downsample, evaluate, type Alert, type Point, type StorageTier } from './engine';

type P = { threshold: number; forSec: number; scrapeSec: number; base: number; noise: number; compress: boolean; tiers: boolean };

const DT = 1;
const SERIES = 10_000_000;

interface S {
  now: number;
  alert: Alert;
  value: number;
  scraped: number;
  nextScrape: number;
  incidentUntil: number;
  incidentStart: number;
  spikeUntil: number;
  detectedAt: number;
  firesDuringIncident: number;
  falseAlerts: number;
  firing: boolean;
  points: Point[];
}

const FULL_ONLY = (scrape: number): StorageTier[] => [{ name: 'Raw', days: 365, resolutionSeconds: scrape }];
const TIERED = (scrape: number): StorageTier[] => [
  { name: 'Raw', days: 7, resolutionSeconds: scrape },
  { name: '1-minute', days: 30, resolutionSeconds: 60 },
  { name: '1-hour', days: 328, resolutionSeconds: 3600 },
];

const sampleBytes = (p: P) => (p.compress ? 2 : 16);
const tiersFor = (p: P) => (p.tiers ? TIERED(p.scrapeSec) : FULL_ONLY(p.scrapeSec));

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'threshold', label: 'Alert threshold', kind: 'range', min: 40, max: 100, step: 1, unit: '%' },
    { key: 'forSec', label: 'Must hold for', kind: 'range', min: 0, max: 300, step: 5, unit: 's' },
    { key: 'scrapeSec', label: 'Scrape interval', kind: 'range', min: 1, max: 60, step: 1, unit: 's' },
    { key: 'base', label: 'Normal CPU level', kind: 'range', min: 20, max: 80, step: 1, unit: '%' },
    { key: 'noise', label: 'Noise', kind: 'range', min: 0, max: 25, step: 1, unit: '%' },
    { key: 'compress', label: 'Compress samples', kind: 'toggle' },
    { key: 'tiers', label: 'Downsample older data', kind: 'toggle' },
  ],
  defaults: { threshold: 80, forSec: 60, scrapeSec: 15, base: 50, noise: 8, compress: true, tiers: true },
  create: () => ({ now: 0, alert: { state: 'ok', pendingSince: 0, fires: 0 }, value: 50, scraped: 50, nextScrape: 0, incidentUntil: 0, incidentStart: -1, spikeUntil: 0, detectedAt: -1, firesDuringIncident: 0, falseAlerts: 0, firing: false, points: [] }),
  step(s, p, rng) {
    s.now += DT;
    const incident = s.now < s.incidentUntil;
    const spike = s.now < s.spikeUntil;
    s.value = Math.max(0, Math.min(100, p.base + rng.gaussian(0, p.noise) + (incident || spike ? 45 : 0)));
    s.points.push({ t: s.now, value: s.value });
    if (s.points.length > 600) s.points.shift();
    if (s.now >= s.nextScrape) {
      s.nextScrape = s.now + p.scrapeSec;
      s.scraped = s.value;
      const fired = evaluate(s.alert, { threshold: p.threshold, forSeconds: p.forSec }, s.scraped, s.now);
      s.firing = s.alert.state === 'firing';
      if (fired) {
        if (incident) {
          s.firesDuringIncident++;
          if (s.detectedAt < 0) s.detectedAt = s.now;
        } else s.falseAlerts++;
      }
    }
  },
  sample: (s, p) => ({ value: s.value, threshold: p.threshold, firing: s.firing ? 100 : 0 }),
  charts: [{ title: 'CPU, and when the alert fires', unit: '%', series: [{ key: 'value', label: 'CPU', role: 'measured' }, { key: 'threshold', label: 'Threshold', role: 'predicted' }, { key: 'firing', label: 'Firing', role: 'other' }] }],
  metrics(s, p) {
    const delay = s.detectedAt > 0 ? s.detectedAt - s.incidentStart : -1;
    return [
      { label: 'Alert state', value: s.alert.state === 'firing' ? 'Firing' : s.alert.state === 'pending' ? 'Pending' : 'OK', role: 'measured', tone: s.firing ? 'bad' : s.alert.state === 'pending' ? 'warn' : 'good' },
      { label: 'Time to detect', value: fmtDuration(p.forSec + p.scrapeSec / 2), role: 'predicted' },
      { label: 'Time to detect', value: delay >= 0 ? fmtDuration(delay) : 'No incident yet', role: 'measured' },
      { label: 'False alarms', value: fmtInt(s.falseAlerts), role: 'measured', tone: s.falseAlerts ? 'bad' : 'good' },
      { label: 'Storage for 1 year', value: fmtBytes(bytesPerSeries(tiersFor(p), sampleBytes(p)) * SERIES), role: 'predicted' },
    ];
  },
  math(_s, p) {
    const raw = bytesPerSeries(FULL_ONLY(p.scrapeSec), 16) * SERIES;
    const current = bytesPerSeries(tiersFor(p), sampleBytes(p)) * SERIES;
    return [
      { expr: `Detection: hold ${p.forSec} s + half a ${p.scrapeSec} s scrape`, result: fmtDuration(p.forSec + p.scrapeSec / 2) },
      { expr: `Raw data: ${fmtCount(SERIES)} series ÷ ${p.scrapeSec} s × 16 bytes for a year`, result: fmtBytes(raw) },
      { expr: `With your storage settings`, result: `${fmtBytes(current)}, ${fmtPct(current / raw, 1)} of raw`, tone: 'good' },
    ];
  },
  views(s, p) {
    const minute = downsample(s.points, 60).slice(-8);
    return [
      { kind: 'bars', title: 'One-minute averages from the raw data', max: 100, marker: { value: p.threshold, label: 'Threshold' }, items: minute.map((m) => ({ label: `${fmtInt(m.t)} s`, value: m.value, display: m.value.toFixed(1) })) },
      { kind: 'table', title: 'Storage tiers', columns: ['Tier', 'Kept for', 'Resolution'], rows: tiersFor(p).map((t) => [t.name, `${t.days} days`, fmtDuration(t.resolutionSeconds)]) },
    ];
  },
  actions: [
    {
      key: 'incident',
      label: 'Start a 3-minute incident',
      run: (s) => {
        s.incidentStart = s.now;
        s.incidentUntil = s.now + 180;
        s.detectedAt = -1;
      },
    },
    {
      key: 'spike',
      label: 'Short 10-second spike',
      run: (s) => {
        s.spikeUntil = s.now + 10;
      },
    },
  ],
  trace: (s, p) => ({
    values: { value: s.scraped.toFixed(1), rule: `> ${p.threshold}`, state: s.alert.state, fires: fmtInt(s.alert.fires) },
    active: [s.alert.state === 'firing' ? 'fires' : 'state'],
  }),
  experiments: [
    {
      title: 'A hair trigger',
      set: { threshold: 70, forSec: 0, scrapeSec: 5, base: 55, noise: 12 },
      ticks: 300,
      question: 'CPU normally sits at 55%, with noise. You page when one reading passes 70%. In five minutes with no real incident, how many times does it page?',
      options: ['None', 'Once or twice', 'Many times'],
      answer: 2,
      explain: 'Noise alone regularly crosses the line, so on-call gets paged again and again for nothing. Eventually they ignore it, and that\'s how real incidents get missed. Alert fatigue is one of the worst failure modes of monitoring.',
      check: (s) => s.falseAlerts >= 3,
    },
    {
      title: 'Require it to hold',
      set: { threshold: 70, forSec: 60, scrapeSec: 5, base: 55, noise: 12 },
      ticks: 300,
      question: 'Same noise, but now it must stay above 70% for a full 60 seconds. How many false pages?',
      options: ['None or almost none', 'About the same'],
      answer: 0,
      explain: 'Random noise is very unlikely to stay high for 12 consecutive readings. The "for" duration filters out noise, and the only cost is a slower alert when something is really wrong.',
      check: (s) => s.falseAlerts <= 1,
    },
    {
      title: 'What patience costs',
      set: { threshold: 80, forSec: 60, scrapeSec: 15, base: 50, noise: 5 },
      act: ['incident'],
      actAt: 20,
      ticks: 150,
      question: 'A real incident starts. With a 60-second hold and 15-second scrapes, about how long before anyone gets paged?',
      options: ['Immediately', 'About 70 seconds', 'About 5 minutes'],
      answer: 1,
      explain: 'You wait for the next scrape to see it, then for the hold time: about 60 + 7.5 seconds, with some variance. This is the tradeoff you\'re choosing when you tune alerts: false alarms against detection time.',
      check: (s) => s.detectedAt > 0 && s.detectedAt - s.incidentStart >= 55 && s.detectedAt - s.incidentStart <= 95,
    },
    {
      title: 'A brief spike',
      set: { threshold: 80, forSec: 60, scrapeSec: 5, base: 50, noise: 3 },
      act: ['spike'],
      actAt: 30,
      ticks: 120,
      question: 'CPU jumps to 95% for 10 seconds and then recovers, perhaps from garbage collection. Does the alert fire with a 60-second hold?',
      options: ['Yes', 'No, it goes to pending and then clears'],
      answer: 1,
      explain: 'The alert moves to pending, then drops back when the value recovers, and nobody gets woken up. The chart still shows the spike, so you can look at it later.',
      check: (s) => s.alert.fires === 0,
    },
    {
      title: 'What a year of data costs',
      set: { scrapeSec: 10, compress: true, tiers: true },
      ticks: 5,
      question: 'Keeping raw data for a year would be enormous. What do compression plus downsampling older data save?',
      options: ['About half', 'Around 99%'],
      answer: 1,
      explain: 'Time-series compression stores small differences, using around 2 bytes per sample rather than 16. Downsampling means old data is one point an hour rather than 360. Nobody needs 10-second resolution from eight months ago.',
      check: (_s, p) => bytesPerSeries(tiersFor(p), sampleBytes(p)) / bytesPerSeries(FULL_ONLY(p.scrapeSec), 16) < 0.02,
    },
  ],
};

const topic: Topic = {
  problem: [
    'A monitoring system collects numbers such as CPU, latency and error rate from thousands of servers, keeps them, draws graphs, and tells someone when something is wrong. It runs at a large and very steady write volume, and most data is never read again.',
    'That access pattern is unusual, so it calls for a special kind of database. But the hardest part is often the alerts themselves. Too sensitive and on-call stops trusting them, too cautious and you learn about outages from customers.',
  ],
  functional: [
    'Collect metrics from many sources',
    'Store them for a year, at decreasing resolution',
    'Query for dashboards, and send alerts',
  ],
  nonFunctional: [
    'Handles millions of samples per second',
    'Alerts are reliable, and have few false alarms',
    'Dashboards stay fast',
  ],
  diagram: {
    nodes: [
      { id: 's', label: 'Metric sources', col: 0, row: 1, kind: 'client', note: 'Servers, apps and databases, exposing metrics or pushing them through an agent.' },
      { id: 'c', label: 'Collectors', col: 1, row: 1, note: 'Pull metrics from endpoints on a schedule, or receive pushes.' },
      { id: 'q', label: 'Kafka', col: 2, row: 1, kind: 'queue', note: 'Absorbs spikes, and protects data if the database has a problem.' },
      { id: 'd', label: 'Time-series database', col: 3, row: 1, kind: 'store', note: 'Optimized for appends, with strong compression and fast aggregation over time.' },
      { id: 'a', label: 'Alert manager', col: 3, row: 2, note: 'Evaluates rules, deduplicates alerts, and routes them to people.' },
      { id: 'v', label: 'Dashboards', col: 3, row: 0, note: 'Query the database, usually over recent data, with heavy caching.' },
      { id: 'n', label: 'Email, SMS, pager', col: 2, row: 2, kind: 'external', note: 'How alerts reach whoever is on call.' },
    ],
    edges: [
      { from: 's', to: 'c' },
      { from: 'c', to: 'q' },
      { from: 'q', to: 'd' },
      { from: 'v', to: 'd' },
      { from: 'a', to: 'd' },
      { from: 'a', to: 'n' },
    ],
  },
  ideas: [
    { title: 'Pull or push', body: 'Pull lets collectors scrape targets on a schedule, and makes it easy to tell whether a target is down. Push suits short-lived jobs and restricted networks. Large systems often use both.' },
    { title: 'Time-series storage', body: 'Writes are huge and steady, and reads mostly look at recent data and aggregate. Purpose-built databases like Prometheus or InfluxDB cope far better than a general-purpose one.' },
    { title: 'Compression', body: 'Consecutive samples are similar, so store small differences rather than full values. Timestamps come at regular intervals, so deltas of deltas are nearly all zero. It can reach under 2 bytes per sample.' },
    { title: 'Alert state machine', body: 'A rule goes from OK to pending to firing, and only fires if the condition holds for a while. Grouping and deduplication then stop one failure from paging 100 times.' },
  ],
  estimator: {
    vars: [
      { key: 'hosts', label: 'Servers', unit: 'count' },
      { key: 'metricsPerHost', label: 'Metrics per server', unit: 'plain', assume: 100 },
      { key: 'scrape', label: 'Seconds between scrapes', unit: 'plain', assume: 10 },
      { key: 'sampleBytes', label: 'Bytes per sample', unit: 'plain', assume: 2 },
      { key: 'days', label: 'Days of raw data', unit: 'plain', assume: 30 },
      { key: 'series', label: 'Active series', unit: 'count' },
      { key: 'samples', label: 'Samples', unit: 'qps' },
      { key: 'storage', label: 'Raw storage', unit: 'bytes' },
    ],
    eqs: [
      { out: 'series', terms: [['hosts', 1], ['metricsPerHost', 1]] },
      { out: 'samples', terms: [['series', 1], ['scrape', -1]] },
      { out: 'storage', terms: [['samples', 1], ['sampleBytes', 1], [86400, 1], ['days', 1]] },
    ],
    starts: [
      { key: 'hosts', value: 100000 },
      { key: 'samples', value: 1_000_000 },
      { key: 'storage', value: 100e12 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'every scrape interval:' },
    { code: '  value = latest reading', id: 'value' },
    { code: '  if value <= threshold: state = ok', id: 'rule' },
    { code: '  else if state == ok: state = pending, note the time' },
    { code: '  else if pending for long enough: state = firing', id: 'state' },
    { code: '    notify the on-call person', id: 'fires' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Long "for" duration', gain: 'Few false alarms', cost: 'Slower detection' },
    { choice: 'Short scrape interval', gain: 'Finer detail, and earlier detection', cost: 'Proportionally more data and load' },
    { choice: 'Downsampling', gain: 'Massive storage savings', cost: 'Lost detail, and short spikes disappear from old data' },
    { choice: 'Pull', gain: 'Easy health detection, and simple targets', cost: 'Hard to use across firewalls or for short jobs' },
  ],
  interview: [
    { q: 'What about cardinality?', a: 'Each unique label combination is a separate series. A label like user ID can create millions of them and overload the database. It\'s among the most common ways to break a metrics system, so limit labels to low-cardinality values.' },
    { q: 'How do you avoid being paged 100 times for one failure?', a: 'Group related alerts, deduplicate repeats, and silence downstream alerts when the root cause is known. Alert on user-visible symptoms such as error rate rather than on every possible cause.' },
    { q: 'Why not use a regular database?', a: 'A general database struggles with the constant write volume and lacks time-based compression and rollups. You could make it work, with lots of tuning, but a time-series database does it out of the box.' },
    { q: 'What if the monitoring system itself fails?', a: 'It\'s a critical dependency, so keep it independent of what it monitors. Use a simple external check, called a dead man\'s switch, that pages if monitoring stops reporting.' },
  ],
  mistakes: [
    'Alerting on every cause rather than user-visible symptoms.',
    'Using high-cardinality labels such as user ID.',
    'Keeping full-resolution data forever.',
  ],
};

export default topic;
