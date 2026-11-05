import type { Lab, Topic } from '../../core/types';
import { fmtCount, fmtInt, signed } from '../../core/format';
import { slope } from '../../core/stats';
import source from './engine.ts?raw';
import { append, assign, consume, createPartition, failover, replicate, restartConsumer, type Acks, type Partition } from './engine';

type P = { produceRate: number; partitions: number; consumers: number; consumerRate: number; acks: Acks; replicationMs: number; commitSec: number };

const DT = 0.1;
const BROKERS = 3;
const FAILOVER_SECONDS = 1;

interface S {
  now: number;
  parts: Partition[];
  nextPartition: number;
  produced: number;
  consumedTotal: number;
  lost: number;
  retried: number;
  duplicates: number;
  rate: number;
  lastCommit: number;
  killed: number;
  carry: number;
}

const lag = (s: S) => s.parts.reduce((a, x) => a + (x.end - x.position), 0);
const capacity = (p: P) => Math.min(p.partitions, p.consumers) * p.consumerRate;

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'produceRate', label: 'Messages produced', kind: 'range', min: 100, max: 5000, step: 100, unit: 'per s' },
    { key: 'partitions', label: 'Partitions', kind: 'range', min: 1, max: 16, step: 1, rebuild: true },
    { key: 'consumers', label: 'Consumers in the group', kind: 'range', min: 1, max: 16, step: 1 },
    { key: 'consumerRate', label: 'Speed per consumer', kind: 'range', min: 100, max: 2000, step: 100, unit: 'per s' },
    { key: 'acks', label: 'Producer acks', kind: 'choice', options: [{ value: '0', label: '0: don\'t wait' }, { value: '1', label: '1: leader has it' }, { value: 'all', label: 'all: replicas have it' }] },
    { key: 'replicationMs', label: 'Replication delay', kind: 'range', min: 0, max: 2000, step: 50, unit: 'ms' },
    { key: 'commitSec', label: 'Consumer commit interval', kind: 'range', min: 0.5, max: 30, step: 0.5, unit: 's' },
  ],
  defaults: { produceRate: 3000, partitions: 8, consumers: 8, consumerRate: 500, acks: 'all', replicationMs: 200, commitSec: 5 },
  create: (p) => ({ now: 0, parts: Array.from({ length: p.partitions }, (_, i) => createPartition(i)), nextPartition: 0, produced: 0, consumedTotal: 0, lost: 0, retried: 0, duplicates: 0, rate: 0, lastCommit: 0, killed: 0, carry: 0 }),
  step(s, p) {
    s.now += DT;
    s.carry += p.produceRate * DT;
    const whole = Math.floor(s.carry);
    s.carry -= whole;
    const each = Math.floor(whole / s.parts.length);
    let extra = whole - each * s.parts.length;
    for (const part of s.parts) {
      const count = each + (extra-- > 0 ? 1 : 0);
      if (!count) continue;
      if (append(part, count, s.now, p.replicationMs / 1000)) s.produced += count;
      // With acks=0 nobody knows the partition was offline, so these simply vanish.
      else if (p.acks === '0') s.lost += count;
      else s.retried += count;
    }
    for (const part of s.parts) replicate(part, s.now);
    const groups = assign(s.parts.length, p.consumers);
    let consumed = 0;
    for (const owned of groups) {
      if (!owned.length) continue;
      // A consumer shares its speed across the partitions it owns.
      const share = (p.consumerRate * DT) / owned.length;
      for (const id of owned) consumed += consume(s.parts[id], share);
    }
    s.consumedTotal += consumed;
    s.rate = s.rate * 0.9 + (consumed / DT) * 0.1;
    if (s.now - s.lastCommit >= p.commitSec) {
      for (const part of s.parts) part.committed = part.position;
      s.lastCommit = s.now;
    }
  },
  sample: (s, p) => ({ lag: lag(s), rate: s.rate, cap: capacity(p), produce: p.produceRate }),
  charts: [
    { title: 'Consumer lag', unit: 'messages', series: [{ key: 'lag', label: 'Measured', role: 'measured' }] },
    { title: 'Throughput', unit: 'per s', series: [{ key: 'rate', label: 'Consumed', role: 'measured' }, { key: 'cap', label: 'Math: capacity', role: 'predicted' }, { key: 'produce', label: 'Produced', role: 'other' }] },
  ],
  metrics(s, p) {
    const growth = Math.max(0, p.produceRate - capacity(p));
    return [
      { label: 'Lag growth', value: `${signed(growth)}/s`, role: 'predicted', tone: growth ? 'bad' : 'good' },
      { label: 'Lag', value: fmtCount(lag(s)), role: 'measured' },
      { label: 'Idle consumers', value: fmtInt(Math.max(0, p.consumers - p.partitions)), role: 'predicted', tone: p.consumers > p.partitions ? 'warn' : undefined },
      { label: 'Lost after being acked', value: fmtCount(s.lost), role: 'measured', tone: s.lost ? 'bad' : 'good' },
      { label: 'Duplicates', value: fmtCount(s.duplicates), role: 'measured', tone: s.duplicates ? 'warn' : undefined },
    ];
  },
  math(_s, p) {
    const effective = Math.min(p.partitions, p.consumers);
    return [
      { expr: `Active consumers: min(${p.partitions} partitions, ${p.consumers} consumers)`, result: String(effective) },
      { expr: `Capacity: ${effective} × ${fmtInt(p.consumerRate)}/s`, result: `${fmtInt(capacity(p))}/s`, tone: capacity(p) >= p.produceRate ? 'good' : 'bad' },
      { expr: `At risk with acks=${p.acks} if a leader dies: ${p.replicationMs} ms × ${fmtInt(p.produceRate / BROKERS)}/s`, result: p.acks === 'all' ? 'none, safely retried' : `≈ ${fmtInt((p.replicationMs / 1000) * (p.produceRate / BROKERS))}`, tone: p.acks === 'all' ? 'good' : 'warn' },
    ];
  },
  views(s, p) {
    const groups = assign(s.parts.length, p.consumers);
    return [
      { kind: 'bars', title: 'Lag by partition', items: s.parts.map((x) => ({ label: `P${x.id}`, value: x.end - x.position })) },
      { kind: 'cells', title: 'Consumers and their partitions', items: groups.slice(0, 16).map((g, i) => ({ label: `C${i + 1}`, value: g.length ? g.map((x) => `P${x}`).join(' ') : 'Idle', tone: g.length ? 'neutral' : 'warn' })) },
    ];
  },
  actions: [
    {
      key: 'kill',
      label: 'Kill a broker',
      run: (s, p) => {
        const b = s.killed++ % BROKERS;
        for (const part of s.parts) {
          if (part.id % BROKERS !== b) continue;
          const { lostAcknowledged, retried } = failover(part, s.now, FAILOVER_SECONDS, p.acks);
          s.lost += lostAcknowledged;
          s.retried += retried;
        }
      },
    },
    {
      key: 'crash',
      label: 'Crash the consumers',
      run: (s) => {
        for (const part of s.parts) s.duplicates += restartConsumer(part);
      },
    },
  ],
  trace: (s, p) => ({
    values: { offset: fmtInt(s.parts[0].end), hw: fmtInt(s.parts[0].replicated), pos: fmtInt(s.parts[0].position), commit: fmtInt(s.parts[0].committed), acks: `acks=${p.acks}` },
  }),
  experiments: [
    {
      title: 'More consumers than partitions',
      set: { partitions: 4, consumers: 8, produceRate: 3000, consumerRate: 500 },
      ticks: 150,
      question: 'You have 8 consumers at 500 messages a second each, and 3,000 messages a second coming in. But the topic has only 4 partitions. Does lag grow?',
      options: ['No, 8 × 500 = 4,000 a second is plenty', 'Yes, by about 1,000 a second'],
      answer: 1,
      explain: 'A partition goes to one consumer in a group, so 4 of the consumers sit idle. Capacity is 4 × 500 = 2,000, and lag grows by the difference. Partition count sets a hard ceiling on parallelism, and it\'s hard to change later.',
      check: (_s, _p, h) => {
        const v = slope(h, 'lag', 80, DT);
        return v > 800 && v < 1200;
      },
    },
    {
      title: 'Add partitions',
      set: { partitions: 8, consumers: 8, produceRate: 3000, consumerRate: 500 },
      ticks: 150,
      question: 'Same consumers and traffic, but 8 partitions. What happens to lag now?',
      options: ['It stays small', 'It still grows by 1,000 a second'],
      answer: 0,
      explain: 'All 8 consumers now work, for a capacity of 4,000 a second against 3,000 incoming. The price of more partitions is more files, more replication work, and ordering that\'s only guaranteed within each partition.',
      check: (s) => lag(s) < 2500,
    },
    {
      title: 'acks=1 and a dead leader',
      set: { acks: '1', replicationMs: 1000, produceRate: 3000 },
      act: ['kill'],
      actAt: 30,
      ticks: 60,
      question: 'Producers wait only for the leader, and followers are about a second behind. A leader dies. What happens to messages the producer was told succeeded?',
      options: ['They\'re safe', 'Roughly the last second of them are gone'],
      answer: 1,
      explain: 'The leader acknowledged them but died before followers got a copy, so the new leader never had them. The producer thinks they\'re safe. Acks=1 is faster, but it has this window of silent loss.',
      check: (s) => s.lost > 200,
    },
    {
      title: 'acks=all',
      set: { acks: 'all', replicationMs: 1000, produceRate: 3000 },
      act: ['kill'],
      actAt: 30,
      ticks: 60,
      question: 'Same failure, but producers now wait until followers have the message. How many acknowledged messages are lost?',
      options: ['None', 'About the same as before'],
      answer: 0,
      explain: 'Unreplicated messages were never acknowledged, so the producer simply retries them. Nothing it was told succeeded gets lost. The cost is that each send now waits for the replication delay.',
      check: (s) => s.lost === 0 && s.retried > 0,
    },
    {
      title: 'Crash before committing',
      set: { commitSec: 10, produceRate: 2000 },
      act: ['crash'],
      actAt: 80,
      ticks: 100,
      question: 'Consumers commit their position every 10 seconds, and they crash 8 seconds in. What happens on restart?',
      options: ['They continue exactly where they were', 'They re-process up to 8 seconds of messages'],
      answer: 1,
      explain: 'They restart from the last commit, so everything since gets processed again. That\'s at-least-once delivery. So consumers must be idempotent, or you\'ll double-charge someone. Committing more often shrinks the window at the cost of more overhead.',
      check: (s) => s.duplicates > 2000,
    },
  ],
};

const topic: Topic = {
  problem: [
    'A message queue lets one service hand work to another without both needing to be available at once. A modern distributed queue like Kafka is really a replicated, append-only log that consumers read at their own pace.',
    'Most of the interesting questions are about guarantees. How many messages can you lose in a failure? Can a message get processed twice? In what order will messages arrive? Every answer is a tradeoff against throughput and latency, and this lab lets you trigger each failure.',
  ],
  functional: [
    'Producers send messages to a topic, and consumers read them',
    'Messages stay available for a retention period, and can be re-read',
    'Configurable delivery guarantees',
  ],
  nonFunctional: [
    'Very high throughput, at gigabytes a second',
    'Durable and available through broker failures',
    'Scales by adding brokers and partitions',
  ],
  diagram: {
    nodes: [
      { id: 'p', label: 'Producers', col: 0, row: 1, kind: 'client', note: 'Choose a partition, often by hashing a key, then batch messages for throughput.' },
      { id: 'b1', label: 'Broker 1 (leader)', col: 1, row: 0, kind: 'store', note: 'Appends to the log on disk, and handles reads and writes for this partition.' },
      { id: 'b2', label: 'Broker 2 (follower)', col: 1, row: 1, kind: 'store', note: 'Copies from the leader. Being caught up puts it in the in-sync replica set.' },
      { id: 'b3', label: 'Broker 3 (follower)', col: 1, row: 2, kind: 'store', note: 'Can take over as leader without data loss if it\'s in sync.' },
      { id: 'c', label: 'Consumer group', col: 2, row: 1, kind: 'client', note: 'Each partition goes to one consumer in the group, which tracks its own offset.' },
      { id: 'z', label: 'Coordination', col: 2, row: 0, note: 'Tracks broker health, and elects partition leaders, using something like Raft or ZooKeeper.' },
    ],
    edges: [
      { from: 'p', to: 'b1' },
      { from: 'b1', to: 'b2', label: 'replicate' },
      { from: 'b2', to: 'b3', dashed: true },
      { from: 'b1', to: 'c', label: 'poll' },
      { from: 'z', to: 'b1', dashed: true },
    ],
  },
  ideas: [
    { title: 'The log', body: 'Messages are appended to a file and identified by offset. Sequential disk writes are fast, and since reading doesn\'t delete anything, many consumers can read independently and even replay.' },
    { title: 'Partitions', body: 'A topic splits into partitions, each on its own broker. This is how you scale. Order holds only within a partition, so messages with the same key go to the same one.' },
    { title: 'Consumer groups', body: 'A group shares the work, with each partition going to one consumer. Different groups each get all messages, which gives you both a queue and a publish-subscribe model.' },
    { title: 'Delivery semantics', body: 'At-most-once may lose messages but never repeats them. At-least-once never loses, but can repeat. Exactly-once is usually at-least-once plus deduplication or transactions.' },
  ],
  estimator: {
    vars: [
      { key: 'msgsPerSec', label: 'Messages', unit: 'qps' },
      { key: 'msgBytes', label: 'Bytes per message', unit: 'plain', assume: 1000 },
      { key: 'retention', label: 'Retention in days', unit: 'plain', assume: 7 },
      { key: 'replicas', label: 'Copies of the data', unit: 'plain', assume: 3 },
      { key: 'partitionRate', label: 'Bytes per second per partition', unit: 'plain', assume: 10e6 },
      { key: 'ingress', label: 'Incoming bandwidth', unit: 'bytesPerSec' },
      { key: 'partitions', label: 'Partitions needed', unit: 'count' },
      { key: 'storage', label: 'Total storage', unit: 'bytes' },
    ],
    eqs: [
      { out: 'ingress', terms: [['msgsPerSec', 1], ['msgBytes', 1]] },
      { out: 'partitions', terms: [['ingress', 1], ['partitionRate', -1]] },
      { out: 'storage', terms: [['ingress', 1], ['retention', 1], [86400, 1], ['replicas', 1]] },
    ],
    starts: [
      { key: 'msgsPerSec', value: 1_000_000 },
      { key: 'storage', value: 1e15 },
      { key: 'partitions', value: 100 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'produce(message):' },
    { code: '  leader appends it to the log', id: 'offset' },
    { code: '  followers copy it', id: 'hw' },
    { code: '  acknowledge according to acks', id: 'acks' },
    { code: '' },
    { code: 'consume():' },
    { code: '  read from position, up to what\'s replicated', id: 'pos' },
    { code: '  process messages' },
    { code: '  periodically commit position', id: 'commit' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'acks=0', gain: 'Fastest', cost: 'Messages can vanish silently' },
    { choice: 'acks=1', gain: 'Good speed', cost: 'Lost messages if the leader dies before replicating' },
    { choice: 'acks=all', gain: 'No acknowledged message is lost', cost: 'Waits for replication on each batch' },
    { choice: 'More partitions', gain: 'More parallelism', cost: 'Per-partition ordering only, and more overhead' },
    { choice: 'Commit often', gain: 'Fewer repeats after a crash', cost: 'More commit traffic' },
  ],
  interview: [
    { q: 'How can a queue on disk be so fast?', a: 'Sequential writes are very fast even on hard drives, batching reduces per-message work, and the OS page cache serves recent data from memory. Zero-copy sends data from disk to network without passing through the application.' },
    { q: 'How do you keep messages in order?', a: 'Order holds only within a partition. Use a key, such as a user ID, so related messages go to the same partition. If you need a global order, you\'re limited to one partition, which limits throughput.' },
    { q: 'What\'s the ISR?', a: 'The in-sync replica set: followers caught up with the leader. Acks=all waits for those, and only they can become leader without losing data. Requiring a minimum size protects you if most replicas fall behind.' },
    { q: 'Pull or push for consumers?', a: 'Pull suits most cases: consumers go at their own pace, and they can batch efficiently. Push gives lower latency, but it can overwhelm a slow consumer, so it needs back-pressure.' },
  ],
  mistakes: [
    'Assuming you can add consumers without limit.',
    'Promising global ordering in a partitioned topic.',
    'Using at-least-once with consumers that aren\'t idempotent.',
  ],
};

export default topic;
