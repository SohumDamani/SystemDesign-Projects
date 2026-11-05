import type { Lab, Topic } from '../../core/types';
import { fmtCount, fmtDuration, fmtInt, fmtPct } from '../../core/format';
import { harmonic, tailMean } from '../../core/stats';
import source from './engine.ts?raw';
import { advance, createCluster, failover, readOwnWrite, write, type Cluster, type Mode, type Routing } from './engine';

type P = { mode: Mode; routing: Routing; followers: number; delayMs: number; writesPerSec: number; gapMs: number };

const DT = 0.05;

interface S {
  c: Cluster;
  pendingReads: { position: number; at: number }[];
  reads: number;
  stale: number;
  staleRate: number;
  writeLatency: number;
  blocked: number;
  writes: number;
  lost: number;
  failovers: number;
  lastLag: number;
}

const lagMs = (s: S) => {
  const alive = s.c.followers.filter((f) => f.alive);
  if (!alive.length) return 0;
  return Math.max(...alive.map((f) => s.c.log - f.applied));
};

const predictedWriteLatency = (p: P) => {
  const mean = p.delayMs / 1000;
  if (p.mode === 'async') return 0;
  if (p.mode === 'semi-sync') return mean / p.followers;
  return mean * harmonic(p.followers);
};

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'mode', label: 'Replication', kind: 'choice', rebuild: true, options: [{ value: 'async', label: 'Asynchronous' }, { value: 'semi-sync', label: 'Semi-synchronous, one follower' }, { value: 'sync', label: 'Synchronous, all followers' }] },
    { key: 'routing', label: 'Reads go to', kind: 'choice', options: [{ value: 'follower', label: 'Any follower' }, { value: 'leader', label: 'The leader' }, { value: 'token', label: 'Follower, if caught up to my write' }] },
    { key: 'followers', label: 'Followers', kind: 'range', min: 1, max: 5, step: 1, rebuild: true },
    { key: 'delayMs', label: 'Replication delay', kind: 'range', min: 1, max: 2000, step: 1, unit: 'ms' },
    { key: 'writesPerSec', label: 'Writes', kind: 'range', min: 1, max: 500, step: 1, unit: 'per s' },
    { key: 'gapMs', label: 'Read your write after', kind: 'range', min: 0, max: 2000, step: 10, unit: 'ms' },
  ],
  defaults: { mode: 'async', routing: 'follower', followers: 2, delayMs: 300, writesPerSec: 50, gapMs: 100 },
  create: (p) => ({ c: createCluster(p.followers), pendingReads: [], reads: 0, stale: 0, staleRate: 0, writeLatency: 0, blocked: 0, writes: 0, lost: 0, failovers: 0, lastLag: 0 }),
  step(s, p, rng) {
    advance(s.c, DT);
    const delay = () => rng.exponential(p.delayMs / 1000);
    for (let i = rng.poisson(p.writesPerSec * DT); i > 0; i--) {
      s.writes++;
      const res = write(s.c, p.mode, delay);
      if (!res) {
        s.blocked++;
        continue;
      }
      s.writeLatency = s.writeLatency * 0.98 + res.latency * 0.02;
      s.pendingReads.push({ position: res.position, at: s.c.now + p.gapMs / 1000 });
    }
    let seen = 0;
    let stale = 0;
    s.pendingReads = s.pendingReads.filter((r) => {
      if (r.at > s.c.now) return true;
      seen++;
      if (readOwnWrite(s.c, r.position, p.routing, (n) => rng.int(n))) stale++;
      return false;
    });
    s.reads += seen;
    s.stale += stale;
    if (seen) s.staleRate = s.staleRate * 0.95 + (stale / seen) * 0.05;
    s.lastLag = lagMs(s);
  },
  sample: (s, p) => ({ stale: s.staleRate * 100, lag: s.lastLag, latency: s.writeLatency * 1000, latencyMath: predictedWriteLatency(p) * 1000 }),
  charts: [
    { title: 'Reads missing your own write', unit: '%', series: [{ key: 'stale', label: 'Measured', role: 'measured' }] },
    { title: 'Write latency', unit: 'ms', series: [{ key: 'latency', label: 'Measured', role: 'measured' }, { key: 'latencyMath', label: 'Math', role: 'predicted' }] },
    { title: 'Writes the slowest follower is behind', series: [{ key: 'lag', label: 'Measured', role: 'measured' }] },
  ],
  metrics(s, p) {
    return [
      { label: 'Write latency', value: fmtDuration(predictedWriteLatency(p)), role: 'predicted' },
      { label: 'Write latency', value: fmtDuration(s.writeLatency), role: 'measured' },
      { label: 'Own write missing', value: fmtPct(s.reads ? s.stale / s.reads : 0, 1), role: 'measured', tone: s.stale ? 'warn' : 'good' },
      { label: 'Acknowledged writes lost', value: fmtInt(s.lost), role: 'measured', tone: s.lost ? 'bad' : 'good' },
      { label: 'Writes blocked', value: fmtCount(s.blocked), role: 'measured', tone: s.blocked ? 'bad' : 'good' },
    ];
  },
  math(_s, p) {
    const atRisk = p.mode === 'async' ? (p.writesPerSec * p.delayMs) / 1000 : 0;
    return [
      { expr: `A follower is behind by: ${p.writesPerSec}/s × ${p.delayMs} ms`, result: `${fmtInt((p.writesPerSec * p.delayMs) / 1000)} writes` },
      { expr: `Lost if the leader dies now, with ${p.mode}`, result: p.mode === 'async' ? `≈ ${fmtInt(atRisk)} acknowledged writes` : 'none', tone: p.mode === 'async' ? 'warn' : 'good' },
      { expr: `A write waits for`, result: p.mode === 'async' ? 'nobody' : p.mode === 'semi-sync' ? 'the fastest follower' : 'the slowest follower', tone: p.mode === 'sync' ? 'warn' : undefined },
    ];
  },
  views: (s) => [
    { kind: 'cells', title: 'The cluster', items: [{ label: 'Leader log', value: fmtInt(s.c.log), tone: 'good' as const }, ...s.c.followers.map((f) => ({ label: f.name, value: f.alive ? fmtInt(f.applied) : 'Down', tone: (f.alive ? 'neutral' : 'bad') as 'neutral' | 'bad' }))] },
  ],
  actions: [
    {
      key: 'failover',
      label: 'Kill the leader, and fail over',
      run: (s) => {
        s.lost += failover(s.c);
        s.failovers++;
      },
    },
    {
      key: 'kill-follower',
      label: 'Kill a follower',
      run: (s) => {
        const f = s.c.followers.find((x) => x.alive);
        if (f) f.alive = false;
      },
    },
    {
      key: 'restore',
      label: 'Restore all followers',
      run: (s) => {
        for (const f of s.c.followers) {
          if (f.alive) continue;
          f.alive = true;
          f.applied = s.c.log;
          f.lastArrival = s.c.now;
        }
      },
    },
  ],
  trace: (s, p) => ({
    values: { pos: fmtInt(s.c.log), mode: p.mode, ack: fmtInt(s.c.acknowledged), route: p.routing, lag: fmtInt(s.lastLag) },
  }),
  experiments: [
    {
      title: 'Read your own write',
      set: { mode: 'async', routing: 'follower', delayMs: 500, gapMs: 100 },
      ticks: 300,
      question: 'You post a comment, then the page reloads 100 ms later, reading from a follower that\'s around 500 ms behind. How often does your own comment seem to be missing?',
      options: ['Almost never', 'Very often'],
      answer: 1,
      explain: 'The write hasn\'t reached that follower yet. To you, it looks like the site lost your comment. It\'s the most common user-visible replication bug, and is especially confusing because a refresh later fixes it.',
      check: (s) => s.reads > 50 && s.stale / s.reads > 0.3,
    },
    {
      title: 'Bring a token',
      set: { mode: 'async', routing: 'token', delayMs: 500, gapMs: 100 },
      ticks: 300,
      question: 'Now the client sends the position of its last write, and a follower that hasn\'t reached it passes the read to the leader. How often is your write missing?',
      options: ['Never', 'About the same'],
      answer: 0,
      explain: 'Read-your-writes consistency, with most reads still served by followers. A simpler version is to read from the leader for a few seconds after writing.',
      check: (s) => s.stale === 0 && s.reads > 50,
    },
    {
      title: 'Failover with async',
      set: { mode: 'async', delayMs: 1000, writesPerSec: 100, followers: 2 },
      act: ['failover'],
      actAt: 60,
      ticks: 70,
      question: 'Clients get acknowledged as soon as the leader writes, and followers are about a second behind. The leader dies. What happens to the most recent writes?',
      options: ['They\'re safe', 'They\'re gone, even though clients were told they succeeded'],
      answer: 1,
      explain: 'The new leader never received them. This is the price of async replication\'s speed, and with 100 writes a second and a second of lag, that\'s up to about 100 writes. Banks can\'t accept this. A social feed often can.',
      check: (s) => s.lost > 10,
    },
    {
      title: 'Wait for one follower',
      set: { mode: 'semi-sync', delayMs: 1000, writesPerSec: 100, followers: 2 },
      act: ['failover'],
      actAt: 60,
      ticks: 70,
      question: 'A write now waits until at least one follower has it, and the most caught-up follower takes over. How many acknowledged writes are lost?',
      options: ['None', 'About the same'],
      answer: 0,
      explain: 'Every acknowledged write exists on at least one follower, and that one becomes leader. You pay for this in latency, as each write now waits for the fastest follower.',
      check: (s) => s.lost === 0,
    },
    {
      title: 'Wait for everyone',
      set: { mode: 'sync', delayMs: 100, followers: 3, writesPerSec: 20 },
      ticks: 600,
      question: 'With 3 followers, each with an average 100 ms delay, a write waits for all of them. What\'s the average write latency?',
      options: ['About 100 ms', 'About 180 ms', 'About 300 ms'],
      answer: 1,
      explain: 'You wait for the slowest of three random delays: 100 × (1 + 1/2 + 1/3) ≈ 183 ms. And because followers apply in order, one slow delivery holds up the next, which raises it further.',
      check: (_s, _p, h) => {
        const l = tailMean(h, 'latency', 300);
        return l > 130 && l < 330;
      },
    },
    {
      title: 'Lose one follower under sync',
      set: { mode: 'sync', delayMs: 50, followers: 3, writesPerSec: 50 },
      act: ['kill-follower'],
      actAt: 20,
      ticks: 80,
      question: 'Fully synchronous replication, and one follower dies. What happens to writes?',
      options: ['They carry on with the others', 'They all stop'],
      answer: 1,
      explain: 'Every write needs every follower, so one failure stops all writes. More replicas made you less available. That\'s why fully synchronous replication is rare, and quorums or semi-sync are used instead.',
      check: (s) => s.blocked > 20,
    },
  ],
};

const topic: Topic = {
  problem: [
    'Replication means keeping the same data on several machines. You do it to survive failures, and to serve more reads than one machine can handle. In the most common setup, one leader takes all the writes and followers copy from it.',
    'The difficult part is the delay between the leader having data and the followers having it. That gap causes your own comment to vanish on refresh, and acknowledged writes to disappear in a failover. The lab lets you trigger both and then fix them.',
  ],
  functional: [
    'Copy every write from the leader to its followers',
    'Serve reads from followers',
    'Promote a follower when the leader fails',
  ],
  nonFunctional: [
    'Writes stay fast',
    'Acknowledged writes are not lost, to an agreed degree',
    'Failover is quick and doesn\'t need a human',
  ],
  diagram: {
    nodes: [
      { id: 'c', label: 'Clients', col: 0, row: 1, kind: 'client', note: 'Send writes to the leader, and most reads to followers.' },
      { id: 'l', label: 'Leader', col: 1, row: 1, kind: 'store', note: 'Accepts all writes, and records them in a replication log.' },
      { id: 'f1', label: 'Follower 1', col: 2, row: 0, kind: 'store', note: 'Applies the log in order. Always slightly behind.' },
      { id: 'f2', label: 'Follower 2', col: 2, row: 2, kind: 'store', note: 'Can be promoted to leader if the current one fails.' },
    ],
    edges: [
      { from: 'c', to: 'l', label: 'writes' },
      { from: 'l', to: 'f1', label: 'log' },
      { from: 'l', to: 'f2', label: 'log' },
      { from: 'c', to: 'f1', dashed: true, label: 'reads' },
      { from: 'c', to: 'f2', dashed: true },
    ],
  },
  ideas: [
    { title: 'Sync or async', body: 'Async acknowledges right away, so it\'s fast, but recent writes can be lost if the leader dies. Sync waits for followers, so it\'s safe, but slow and fragile. Semi-sync waits for one follower, which is a popular middle ground.' },
    { title: 'Replication lag', body: 'Followers are always a bit behind. It\'s usually milliseconds, but can stretch to minutes under load. Any read from a follower might be stale, so your design has to account for that.' },
    { title: 'Read-your-writes', body: 'Users expect to see their own changes. Read from the leader just after writing, or send a position token that a follower must have reached before answering.' },
    { title: 'Failover risks', body: 'Detecting a dead leader, picking a successor and redirecting traffic all take time. Beware split brain, where two nodes both think they\'re leader. That\'s what consensus is for.' },
  ],
  estimator: {
    vars: [
      { key: 'writes', label: 'Writes', unit: 'qps' },
      { key: 'reads', label: 'Reads per write', unit: 'plain', assume: 10 },
      { key: 'nodeReads', label: 'Reads per second per replica', unit: 'plain', assume: 5000 },
      { key: 'lagSeconds', label: 'Replication lag in seconds', unit: 'plain', assume: 0.5 },
      { key: 'readQps', label: 'Read load', unit: 'qps' },
      { key: 'replicas', label: 'Read replicas needed', unit: 'count' },
      { key: 'atRisk', label: 'Writes at risk in a failover', unit: 'count' },
    ],
    eqs: [
      { out: 'readQps', terms: [['writes', 1], ['reads', 1]] },
      { out: 'replicas', terms: [['readQps', 1], ['nodeReads', -1]] },
      { out: 'atRisk', terms: [['writes', 1], ['lagSeconds', 1]] },
    ],
    starts: [
      { key: 'writes', value: 2000 },
      { key: 'replicas', value: 10 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'write(data):' },
    { code: '  append to the leader\'s log', id: 'pos' },
    { code: '  ship to followers' },
    { code: '  wait according to mode', id: 'mode' },
    { code: '  acknowledge the client', id: 'ack' },
    { code: '' },
    { code: 'read:' },
    { code: '  send to', id: 'route' },
    { code: 'how far behind the slowest follower is', id: 'lag' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Asynchronous', gain: 'Fastest writes', cost: 'Can lose acknowledged writes in a failover' },
    { choice: 'Semi-synchronous', gain: 'No acknowledged writes lost, with one follower down still fine', cost: 'Each write waits for a follower' },
    { choice: 'Fully synchronous', gain: 'Every copy is current', cost: 'Slow, and one failure stops all writes' },
    { choice: 'Reads from followers', gain: 'Scales reads', cost: 'Stale reads, unless you handle them' },
  ],
  interview: [
    { q: 'How do you choose between them?', a: 'Ask what a lost write costs. For money, you need sync or a quorum. For likes on a post, async is fine. Many systems use different settings for different data.' },
    { q: 'What is split brain?', a: 'Two nodes both believe they\'re the leader, usually after a network partition, and accept conflicting writes. Consensus with majority votes prevents it, as only one side can have a majority.' },
    { q: 'How can users see data go backwards?', a: 'If two reads go to followers with different lag, the second can show older data. Monotonic reads fix this, by pinning a user to one replica, or by using position tokens.' },
    { q: 'How do you add a new follower?', a: 'Take a consistent snapshot of the leader, copy it over, then replay the log from that point until it\'s caught up. Then it can start serving reads.' },
  ],
  mistakes: [
    'Assuming replicas help with write load.',
    'Reading from followers right after a write, with no plan for staleness.',
    'Promising no data loss with async replication.',
  ],
};

export default topic;
