import type { CustomViewProps, Lab, Topic } from '../../core/types';
import { fmtCount, fmtInt } from '../../core/format';
import { tailMean } from '../../core/stats';
import source from './engine.ts?raw';
import { Generator, compose, lifetimeYears, makeLayout, type Layout } from './engine';

type P = { sequenceBits: number; machineBits: number; machines: number; ratePerMs: number; skewMs: number; protect: boolean };

const MS_PER_TICK = 10;

interface S {
  layout: Layout;
  generators: Generator[];
  offsets: number[];
  trueMs: number;
  generated: number;
  overflows: number;
  refused: number;
  duplicates: number;
  outOfOrder: number;
  maxTimestamp: number;
  perMsNow: number;
  seen: Map<number, Set<number>>;
  last?: { id: bigint; timestamp: number; machine: number; sequence: number };
}

function emit(s: S, machineIndex: number, trueMs: number) {
  const g = s.generators[machineIndex];
  const res = g.next(trueMs + s.offsets[machineIndex]);
  if (res.kind === 'overflow') {
    s.overflows++;
    return false;
  }
  if (res.kind === 'clock-moved-back') {
    s.refused++;
    return false;
  }
  // Remember recent IDs so a real collision can be caught.
  let bucket = s.seen.get(res.timestampMs);
  if (!bucket) s.seen.set(res.timestampMs, (bucket = new Set()));
  const key = machineIndex * 2 ** 16 + res.sequence;
  if (bucket.has(key)) s.duplicates++;
  bucket.add(key);
  if (res.timestampMs < s.maxTimestamp) s.outOfOrder++;
  s.maxTimestamp = Math.max(s.maxTimestamp, res.timestampMs);
  s.generated++;
  s.last = { id: 0n, timestamp: res.timestampMs, machine: g.machine, sequence: res.sequence };
  return true;
}

function IdView({ state, params }: CustomViewProps<S, P>) {
  const l = state.layout;
  const last = state.last;
  const id = last ? compose(l, last.timestamp, last.machine, last.sequence) : 0n;
  const groups = [
    { name: 'Sign', bits: 1, value: 0 },
    { name: `Timestamp, ${l.timestampBits} bits`, bits: l.timestampBits, value: last?.timestamp ?? 0 },
    { name: `Machine, ${l.machineBits} bits`, bits: l.machineBits, value: last?.machine ?? 0 },
    { name: `Sequence, ${l.sequenceBits} bits`, bits: l.sequenceBits, value: last?.sequence ?? 0 },
  ];
  return (
    <div className="lab-panel">
      <h4>
        The latest ID: {id.toString()} (0x{id.toString(16)})
      </h4>
      <div className="bitfield">
        {groups.map((g) => (
          <div key={g.name} className="bitgroup" style={{ flexGrow: g.bits }}>
            <span>{g.name}</span>
            <b>{g.value.toString(2).padStart(g.bits, '0')}</b>
            <span>= {g.value.toString()}</span>
          </div>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        With {params.machineBits} machine bits and {params.sequenceBits} sequence bits, this layout supports {fmtCount(2 ** params.machineBits)} machines, each making {fmtCount(2 ** params.sequenceBits)} IDs per millisecond, for {lifetimeYears(l).toFixed(1)} years.
      </p>
    </div>
  );
}

const lab: Lab<S, P> = {
  secondsPerTick: MS_PER_TICK / 1000,
  params: [
    { key: 'sequenceBits', label: 'Sequence bits', kind: 'range', min: 2, max: 14, step: 1, rebuild: true },
    { key: 'machineBits', label: 'Machine bits', kind: 'range', min: 1, max: 18, step: 1, rebuild: true },
    { key: 'machines', label: 'Machines running', kind: 'range', min: 1, max: 4, step: 1, rebuild: true },
    { key: 'ratePerMs', label: 'Requests per machine', kind: 'range', min: 1, max: 500, step: 1, unit: 'per ms' },
    { key: 'skewMs', label: 'Clock difference between machines', kind: 'range', min: 0, max: 50, step: 1, unit: 'ms', rebuild: true },
    { key: 'protect', label: 'Refuse to run if the clock goes backwards', kind: 'toggle', rebuild: true },
  ],
  defaults: { sequenceBits: 12, machineBits: 10, machines: 2, ratePerMs: 50, skewMs: 0, protect: true },
  create(p) {
    const layout = makeLayout(p.machineBits, p.sequenceBits);
    return {
      layout,
      generators: Array.from({ length: p.machines }, (_, i) => new Generator(i, layout, p.protect)),
      offsets: Array.from({ length: p.machines }, (_, i) => i * p.skewMs),
      trueMs: 1000,
      generated: 0,
      overflows: 0,
      refused: 0,
      duplicates: 0,
      outOfOrder: 0,
      maxTimestamp: 0,
      perMsNow: 0,
      seen: new Map(),
    };
  },
  step(s, p) {
    let made = 0;
    for (let ms = 0; ms < MS_PER_TICK; ms++) {
      s.trueMs++;
      for (let i = 0; i < p.ratePerMs; i++) {
        for (let m = 0; m < s.generators.length; m++) if (emit(s, m, s.trueMs)) made++;
      }
    }
    s.perMsNow = made / MS_PER_TICK / s.generators.length;
    for (const key of s.seen.keys()) if (key < s.trueMs - 200) s.seen.delete(key);
  },
  sample: (s, p) => ({ made: s.perMsNow, limit: Math.min(p.ratePerMs, 2 ** p.sequenceBits), requested: p.ratePerMs }),
  charts: [{ title: 'IDs per millisecond, per machine', series: [{ key: 'made', label: 'Measured', role: 'measured' }, { key: 'limit', label: 'Math', role: 'predicted' }, { key: 'requested', label: 'Requested', role: 'other' }] }],
  metrics: (s, p) => [
    { label: 'Most IDs per ms per machine', value: fmtInt(2 ** p.sequenceBits), role: 'predicted' },
    { label: 'Generated', value: fmtCount(s.generated), role: 'measured' },
    { label: 'Had to wait', value: fmtCount(s.overflows), role: 'measured', tone: s.overflows ? 'warn' : undefined },
    { label: 'Duplicates', value: fmtInt(s.duplicates), role: 'measured', tone: s.duplicates ? 'bad' : 'good' },
    { label: 'Out of time order', value: fmtCount(s.outOfOrder), role: 'measured', tone: s.outOfOrder ? 'warn' : undefined },
  ],
  math(s, p) {
    return [
      { expr: `Sequence: 2^${p.sequenceBits} IDs per ms`, result: `${fmtCount(2 ** p.sequenceBits * 1000)} IDs/s per machine` },
      { expr: `Machines: 2^${p.machineBits}`, result: fmtCount(2 ** p.machineBits) },
      { expr: `Timestamp: 2^${s.layout.timestampBits} ms`, result: `${lifetimeYears(s.layout).toFixed(1)} years`, tone: lifetimeYears(s.layout) < 10 ? 'bad' : 'good' },
    ];
  },
  View: IdView,
  actions: [
    {
      key: 'clock-back',
      label: 'Move machine 1\'s clock back 5 ms',
      run: (s) => {
        s.offsets[0] -= 5;
      },
    },
  ],
  trace: (s) => ({
    values: {
      time: String(s.last?.timestamp ?? ''),
      seq: String(s.last?.sequence ?? ''),
      machine: String(s.last?.machine ?? ''),
      back: fmtCount(s.refused),
      wait: fmtCount(s.overflows),
    },
  }),
  experiments: [
    {
      title: 'Run out of sequence numbers',
      set: { sequenceBits: 4, ratePerMs: 100 },
      ticks: 100,
      question: 'With 4 sequence bits, each machine can create 16 IDs per millisecond. Requests arrive at 100 per millisecond. What throughput do you get?',
      options: ['100 per ms', '16 per ms, and the rest must wait', 'It crashes'],
      answer: 1,
      explain: 'The sequence resets each millisecond, so 2^4 = 16 is a hard ceiling. A generator spins until the next millisecond once it\'s out of numbers. With the usual 12 bits that ceiling is over 4 million per second, per machine.',
      check: (_s, _p, h) => {
        const v = tailMean(h, 'made', 50);
        return v > 14 && v < 16.5;
      },
    },
    {
      title: 'The clock jumps back',
      set: { ratePerMs: 20, protect: false, machines: 1 },
      act: ['clock-back'],
      actAt: 50,
      ticks: 60,
      question: 'NTP corrects a machine\'s clock backwards by 5 ms, and the generator doesn\'t check for it. What happens?',
      options: ['Nothing, since IDs are based on time', 'It issues duplicate IDs', 'It waits automatically'],
      answer: 1,
      explain: 'The machine re-enters milliseconds it already used, restarts its sequence at 0, and creates IDs it has already handed out. For a primary key, that\'s data corruption. It\'s the main thing that can go wrong with timestamp-based IDs.',
      check: (s) => s.duplicates > 0,
    },
    {
      title: 'Guard against it',
      set: { ratePerMs: 20, protect: true, machines: 1 },
      act: ['clock-back'],
      actAt: 50,
      ticks: 60,
      question: 'Same clock jump, but now the generator refuses to run while the clock is behind its last timestamp. What happens?',
      options: ['Still some duplicates', 'No duplicates, but a short pause', 'It keeps running normally'],
      answer: 1,
      explain: 'The fix trades a brief outage for correctness: no new IDs until time catches up. Over those 5 ms, requests are refused and retried. Real systems also alert on this, and limit how far NTP may step the clock.',
      check: (s) => s.duplicates === 0 && s.refused > 0,
    },
    {
      title: 'Steal bits from time',
      set: { machineBits: 16, sequenceBits: 12 },
      ticks: 5,
      question: 'You need 65,536 machines, so you give machine ID 16 bits, leaving 35 for the timestamp. How long will these IDs last?',
      options: ['About 69 years', 'About 8 years', 'About 1 year'],
      answer: 2,
      explain: 'Every bit you take from the timestamp halves its range. 2^41 ms is about 69 years, but 2^35 ms is only about 1.1 years. A 64-bit ID is a budget, and you\'re dividing it between time, machines and throughput.',
      check: (s) => lifetimeYears(s.layout) < 1.3,
    },
    {
      title: 'Sorted, roughly',
      set: { machines: 3, skewMs: 10 },
      ticks: 60,
      question: 'Machine clocks differ by 10 ms. Are IDs from different machines still in exact time order?',
      options: ['Yes, always', 'No, IDs near the same moment can be out of order'],
      answer: 1,
      explain: 'Snowflake IDs sort by the local clock, so IDs from machines with different clocks interleave imperfectly. They\'re sorted roughly by time, which is fine for most uses. If you need a strict global order, you need a central sequencer.',
      check: (s) => s.outOfOrder > 0,
    },
  ],
};

const topic: Topic = {
  problem: [
    'A single database can hand out IDs with an auto-increment column, but that stops working once you have many databases, because they\'d all issue the same numbers. You need IDs that are unique across thousands of machines, and generated without coordinating on every request.',
    'The usual requirements are 64-bit IDs that roughly sort by time, at thousands of IDs per second. The clever answer divides the 64 bits between a timestamp, a machine ID and a counter, so uniqueness comes from the structure of the number itself.',
  ],
  functional: [
    'Generate unique IDs across many machines',
    'IDs are numeric and fit in 64 bits',
    'IDs sort roughly by creation time',
  ],
  nonFunctional: [
    'More than 10,000 IDs per second overall',
    'No single point of failure',
    'Very low latency, with no network call per ID',
  ],
  diagram: {
    nodes: [
      { id: 'a', label: 'App + generator 1', col: 0, row: 0, note: 'Generates IDs locally using its own clock and machine ID, with no network call.' },
      { id: 'b', label: 'App + generator 2', col: 0, row: 1, note: 'Has a different machine ID, so its IDs can never collide with generator 1\'s.' },
      { id: 'z', label: 'Coordination service', col: 1, row: 0, kind: 'store', note: 'Used only at startup, to give each machine a unique ID, for example with ZooKeeper.' },
      { id: 'n', label: 'NTP', col: 1, row: 1, kind: 'external', note: 'Keeps clocks close. It can move them backwards, which is the main risk.' },
    ],
    edges: [
      { from: 'a', to: 'z', dashed: true, label: 'at startup' },
      { from: 'b', to: 'z', dashed: true },
      { from: 'a', to: 'n', dashed: true },
      { from: 'b', to: 'n', dashed: true },
    ],
  },
  ideas: [
    { title: 'Multi-master auto-increment', body: 'Each database counts by k from a different start. It\'s simple, but hard to scale up or down, and IDs don\'t sort by time across servers.' },
    { title: 'UUID', body: 'Each machine generates 128 random bits with no coordination. It\'s simple and collisions are effectively impossible, but UUIDs are long, aren\'t numeric, don\'t sort by time, and fragment database indexes.' },
    { title: 'Ticket server', body: 'One database hands out IDs to everyone. It\'s easy and numeric, but it\'s a single point of failure and every ID needs a network call.' },
    { title: 'Snowflake', body: 'Sign bit, 41 bits of milliseconds, 10 of machine ID, 12 of sequence. It\'s sortable, numeric, needs no coordination per ID, and gives 4,096 IDs per millisecond per machine.' },
  ],
  estimator: {
    vars: [
      { key: 'idsPerDay', label: 'IDs per day', unit: 'count' },
      { key: 'peakFactor', label: 'Peak over average', unit: 'plain', assume: 3 },
      { key: 'perMachine', label: 'IDs per second per machine', unit: 'plain', assume: 4096000 },
      { key: 'idBytes', label: 'Bytes per ID', unit: 'plain', assume: 8 },
      { key: 'years', label: 'Years', unit: 'plain', assume: 10 },
      { key: 'avg', label: 'Average rate', unit: 'qps' },
      { key: 'peak', label: 'Peak rate', unit: 'qps' },
      { key: 'machines', label: 'Machines needed for throughput', unit: 'count' },
      { key: 'storage', label: 'Storage for the IDs alone', unit: 'bytes' },
    ],
    eqs: [
      { out: 'avg', terms: [['idsPerDay', 1], [86400, -1]] },
      { out: 'peak', terms: [['avg', 1], ['peakFactor', 1]] },
      { out: 'machines', terms: [['peak', 1], ['perMachine', -1]] },
      { out: 'storage', terms: [['idsPerDay', 1], ['idBytes', 1], [365, 1], ['years', 1]] },
    ],
    starts: [
      { key: 'idsPerDay', value: 1e9 },
      { key: 'peak', value: 100000 },
      { key: 'storage', value: 1e12 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'next_id():' },
    { code: '  now = current time in ms', id: 'time' },
    { code: '  if now < last: clock moved back, refuse', id: 'back' },
    { code: '  if now == last:' },
    { code: '    sequence += 1', id: 'seq' },
    { code: '    if sequence is exhausted: wait for next ms', id: 'wait' },
    { code: '  else: sequence = 0' },
    { code: '  last = now' },
    { code: '  return (now << 22) | (machine << 12) | sequence', id: 'machine' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'UUID', gain: 'No coordination at all', cost: '128 bits, not numeric, poor index locality' },
    { choice: 'Ticket server', gain: 'Short numeric IDs', cost: 'Single point of failure, and a network call each' },
    { choice: 'Snowflake', gain: '64 bits, sortable, local generation', cost: 'Depends on clocks, and machine IDs must be assigned' },
    { choice: 'More sequence bits', gain: 'More IDs per millisecond', cost: 'Fewer machines or a shorter lifetime' },
  ],
  interview: [
    { q: 'What happens at the end of the 69 years?', a: 'The timestamp overflows. Using a custom epoch, such as the year your system launched, buys you the whole range. Beyond that, you\'d need to migrate to a new ID scheme.' },
    { q: 'How do machines get their IDs?', a: 'From a coordination service such as ZooKeeper at startup, or from configuration. It only happens once, so it doesn\'t add latency to generating IDs.' },
    { q: 'How do you handle low traffic if you need even shard distribution?', a: 'If traffic is low, the sequence is almost always 0, so a `id % shards` scheme can skew badly. Start the sequence at a random value each millisecond, or shard on a hash of the ID.' },
  ],
  mistakes: [
    'Forgetting that clocks can move backwards.',
    'Calling Snowflake IDs strictly ordered. They\'re only roughly ordered across machines.',
    'Not stating the bit budget and what it limits.',
  ],
};

export default topic;
