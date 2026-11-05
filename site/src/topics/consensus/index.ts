import type { Lab, Topic } from '../../core/types';
import { fmtCount, fmtDuration, fmtInt } from '../../core/format';
import source from './engine.ts?raw';
import { Cluster } from './engine';

type P = { nodes: number; latencyMs: number; spreadMs: number; commandsPerSec: number };

const DT = 0.01;
const BASE_TIMEOUT = 0.15;
const HEARTBEAT = 0.05;
const SPLIT_SECONDS = 2;

interface S {
  c: Cluster;
  nextCommand: number;
  carry: number;
  noLeaderTicks: number;
  healAt: number;
  splitActive: boolean;
  killedLeader: number;
  termAtKill: number;
  firstLeaderAt: number;
}

const groupSizes = (c: Cluster) => {
  const counts = new Map<number, number>();
  for (const n of c.nodes) if (n.alive) counts.set(n.group, (counts.get(n.group) ?? 0) + 1);
  return counts;
};

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'nodes', label: 'Nodes', kind: 'range', min: 3, max: 7, step: 2, rebuild: true },
    { key: 'latencyMs', label: 'Network delay', kind: 'range', min: 1, max: 40, step: 1, unit: 'ms', rebuild: true },
    { key: 'spreadMs', label: 'Random extra election timeout', kind: 'range', min: 0, max: 300, step: 10, unit: 'ms', rebuild: true },
    { key: 'commandsPerSec', label: 'Client commands', kind: 'range', min: 0, max: 200, step: 5, unit: 'per s' },
  ],
  defaults: { nodes: 5, latencyMs: 10, spreadMs: 150, commandsPerSec: 50 },
  create(p, rng) {
    const c = new Cluster(p.nodes, { latency: p.latencyMs / 1000, electionBase: BASE_TIMEOUT, electionSpread: p.spreadMs / 1000, heartbeat: HEARTBEAT }, () => rng.next());
    return { c, nextCommand: 1, carry: 0, noLeaderTicks: 0, healAt: 0, splitActive: false, killedLeader: -1, termAtKill: 0, firstLeaderAt: -1 };
  },
  step(s, p) {
    s.carry += p.commandsPerSec * DT;
    while (s.carry >= 1) {
      s.carry -= 1;
      s.c.propose(s.nextCommand++);
    }
    s.c.advance(DT);
    if (!s.c.leader()) s.noLeaderTicks++;
    else if (s.firstLeaderAt < 0) s.firstLeaderAt = s.c.now;
    if (s.splitActive && s.c.now >= s.healAt) {
      s.splitActive = false;
      for (const n of s.c.nodes) n.group = 0;
    }
  },
  sample: (s) => ({ committed: s.c.committed.length, term: s.c.leader()?.term ?? 0, elections: s.c.elections }),
  charts: [
    { title: 'Commands committed', series: [{ key: 'committed', label: 'Measured', role: 'measured' }] },
    { title: 'Elections held', series: [{ key: 'elections', label: 'Measured', role: 'measured' }] },
  ],
  metrics(s) {
    const leader = s.c.leader();
    return [
      { label: 'Leader', value: leader ? `Node ${leader.id + 1}, term ${leader.term}` : 'No leader', role: 'measured', tone: leader ? 'good' : 'bad' },
      { label: 'Needed to commit', value: `${s.c.majority} of ${s.c.nodes.length}`, role: 'predicted' },
      { label: 'Committed', value: fmtCount(s.c.committed.length), role: 'measured' },
      { label: 'Time without a leader', value: fmtDuration(s.noLeaderTicks * DT), role: 'measured' },
      { label: 'Safety violations', value: fmtInt(s.c.violations), role: 'measured', tone: s.c.violations ? 'bad' : 'good' },
    ];
  },
  math(s, p) {
    const n = s.c.nodes.length;
    const alive = s.c.nodes.filter((x) => x.alive).length;
    const biggest = Math.max(0, ...groupSizes(s.c).values());
    return [
      { expr: `Majority of ${n} nodes: floor(${n} ÷ 2) + 1`, result: String(s.c.majority) },
      { expr: `Failures it can survive: ${n} − ${s.c.majority}`, result: String(n - s.c.majority) },
      { expr: `Largest group that can talk: ${biggest} of ${n}, ${alive} up`, result: biggest >= s.c.majority ? 'can commit' : 'cannot commit', tone: biggest >= s.c.majority ? 'good' : 'bad' },
      { expr: `Timeout: ${Math.round(BASE_TIMEOUT * 1000)} ms + random up to ${p.spreadMs} ms`, result: p.spreadMs ? 'ties are rare' : 'elections can tie forever', tone: p.spreadMs ? 'good' : 'bad' },
    ];
  },
  views: (s) => [
    {
      kind: 'cells',
      title: 'Nodes: role, term, log length, committed',
      items: s.c.nodes.map((n) => ({
        label: n.alive ? `${n.id + 1}: ${n.role}` : `${n.id + 1}: down`,
        value: n.alive ? `t${n.term} ${n.log.length}/${n.commitIndex}` : '',
        tone: !n.alive ? 'bad' : n.role === 'leader' ? 'good' : n.role === 'candidate' ? 'warn' : 'neutral',
      })),
    },
    { kind: 'note', title: 'Network', text: s.splitActive ? `Split for another ${Math.max(0, s.healAt - s.c.now).toFixed(1)} s. Groups can't reach each other.` : 'All connected.' },
  ],
  actions: [
    {
      key: 'kill-leader',
      label: 'Kill the leader, or else any node',
      run: (s) => {
        const target = s.c.leader() ?? s.c.nodes.find((n) => n.alive);
        if (!target) return;
        s.killedLeader = target.id;
        s.termAtKill = target.term;
        target.alive = false;
        target.role = 'follower';
      },
    },
    {
      key: 'restore',
      label: 'Restore all nodes',
      run: (s) => {
        for (const n of s.c.nodes) {
          if (!n.alive) {
            n.alive = true;
            n.electionAt = s.c.now + BASE_TIMEOUT;
          }
        }
      },
    },
    {
      key: 'split',
      label: 'Split the network for 2 s, leader in the minority',
      run: (s) => {
        const leader = s.c.leader();
        const minoritySize = s.c.nodes.length - s.c.majority;
        const minority = new Set<number>(leader ? [leader.id] : []);
        for (const n of s.c.nodes) if (minority.size < minoritySize) minority.add(n.id);
        for (const n of s.c.nodes) n.group = minority.has(n.id) ? 1 : 0;
        s.splitActive = true;
        s.healAt = s.c.now + SPLIT_SECONDS;
      },
    },
  ],
  trace(s) {
    const leader = s.c.leader();
    return {
      values: { term: String(leader?.term ?? '-'), votes: `${s.c.majority} votes to win`, log: fmtInt(leader?.log.length ?? 0), commit: fmtInt(s.c.committed.length), safe: `${fmtInt(s.c.violations)} violations` },
    };
  },
  experiments: [
    {
      title: 'Kill the leader',
      act: ['kill-leader'],
      actAt: 100,
      ticks: 200,
      question: 'A 5-node cluster has a leader, and it dies. No person steps in. What happens?',
      options: ['Writes stop until an operator acts', 'A follower notices, wins a vote, and carries on in under a second'],
      answer: 1,
      explain: 'Followers expect regular heartbeats. When they stop, one times out first, asks for votes, and needs 3 of 5 to win. No committed data is lost, since a node can only win if its log is up to date.',
      check: (s) => {
        const leader = s.c.leader();
        return Boolean(leader && leader.id !== s.killedLeader && leader.term > s.termAtKill && s.c.violations === 0);
      },
    },
    {
      title: 'Lose two of five',
      act: ['kill-leader', 'kill-leader'],
      actAt: 100,
      ticks: 300,
      question: 'Two of the five nodes die. Can the cluster still commit new commands?',
      options: ['Yes, since 3 nodes are still a majority', 'No, it needs all of them'],
      answer: 0,
      explain: 'A majority of 5 is 3, so you can lose 2. This is why clusters have odd sizes: 4 nodes also only survive 1 failure, so the extra node would buy nothing.',
      check: (s, _p, h) => h[h.length - 1].committed > h[h.length - 80].committed && s.c.violations === 0,
    },
    {
      title: 'Lose three of five',
      act: ['kill-leader', 'kill-leader', 'kill-leader'],
      actAt: 100,
      ticks: 300,
      question: 'Now three nodes die, leaving two. What happens?',
      options: ['The two keep going', 'Nothing commits until a node returns'],
      answer: 1,
      explain: 'Two can\'t form a majority, so no leader can be elected. The system stops rather than risk disagreeing with nodes it can\'t see. That\'s the C in CAP: when in doubt, it refuses. No data is wrong, it\'s just unavailable.',
      check: (_s, _p, h) => h[h.length - 1].committed === h[h.length - 150].committed,
    },
    {
      title: 'Split the network',
      act: ['split'],
      actAt: 100,
      ticks: 1100,
      question: 'The network splits, with the leader in the smaller group. It keeps accepting commands, while the larger group elects a new leader. When it heals, what happens to the old leader\'s commands?',
      options: ['Both sets get merged', 'They\'re thrown away, since they never reached a majority', 'The two groups stay diverged'],
      answer: 1,
      explain: 'Two nodes did think they were leader, but only one could commit anything, because only one side has a majority. On healing, the old leader sees a higher term, steps down, and overwrites its uncommitted entries. Clients were never told those succeeded.',
      check: (s) => s.c.sawTwoLeaders && s.c.truncated > 0 && s.c.violations === 0 && s.c.leader() !== undefined,
    },
    {
      title: 'Remove the randomness',
      set: { spreadMs: 0 },
      ticks: 400,
      question: 'What if every node uses exactly the same election timeout?',
      options: ['Elections get faster and more predictable', 'Everyone votes for themselves, again and again, and no leader appears'],
      answer: 1,
      explain: 'All nodes time out together, become candidates at once, and vote for themselves, so nobody gets a majority. The small random delay is what breaks the tie, and it\'s one of the simplest clever ideas in distributed systems.',
      check: (s) => !s.c.leader() && s.c.elections >= 10,
    },
  ],
};

const topic: Topic = {
  problem: [
    'Many systems need a group of machines to agree on something: who the leader is, what order writes happened in, which configuration is current. That\'s hard when machines crash, messages get delayed, and the network can split at any moment.',
    'Raft solves this with a simple rule: nothing counts until a majority has it. Two majorities always overlap, so two sides of a split can never both make progress. etcd, Consul and many databases rely on it. This lab runs a real implementation that you can attack.',
  ],
  functional: [
    'Elect one leader at a time',
    'Replicate an ordered log of commands',
    'Keep working while a majority of nodes is up',
  ],
  nonFunctional: [
    'Never lose or reorder a committed command',
    'Recover from a leader failure in under a second or so',
    'Prefers being correct over being available',
  ],
  diagram: {
    nodes: [
      { id: 'c', label: 'Client', col: 0, row: 1, kind: 'client', note: 'Sends commands to the leader, and hears back only once they\'re committed.' },
      { id: 'l', label: 'Leader', col: 1, row: 1, note: 'Appends to its log, and replicates to followers through regular heartbeats.' },
      { id: 'a', label: 'Follower', col: 2, row: 0, note: 'Copies the log. Starts an election if the heartbeats stop.' },
      { id: 'b', label: 'Follower', col: 2, row: 1, note: 'Grants its vote only to a candidate with a log at least as up to date as its own.' },
      { id: 'd', label: 'Follower', col: 2, row: 2, note: 'Once a majority has an entry, it\'s committed, and can never be lost.' },
    ],
    edges: [
      { from: 'c', to: 'l' },
      { from: 'l', to: 'a', label: 'append' },
      { from: 'l', to: 'b' },
      { from: 'l', to: 'd' },
    ],
  },
  ideas: [
    { title: 'Terms', body: 'Time is divided into numbered terms, each with at most one leader. A node seeing a higher term than its own immediately steps down, so old leaders can\'t cause trouble.' },
    { title: 'Elections', body: 'A follower that hears nothing for a random timeout becomes a candidate and asks for votes. Each node votes once per term, so only one candidate can win a majority.' },
    { title: 'Log replication', body: 'The leader appends commands to its log, and sends them to followers. Once a majority has an entry, it\'s committed. Followers with conflicting entries get overwritten by the leader.' },
    { title: 'Why it\'s safe', body: 'A candidate needs votes from a majority, and voters refuse anyone with an older log. Any majority overlaps with the one that committed an entry, so a new leader always has every committed entry.' },
  ],
  lab,
  pseudocode: [
    { code: 'on election timeout:' },
    { code: '  term += 1, and vote for myself', id: 'term' },
    { code: '  ask everyone for a vote', id: 'votes' },
    { code: '  a majority of votes: become leader' },
    { code: '' },
    { code: 'leader, on command:' },
    { code: '  append to my log, and replicate', id: 'log' },
    { code: '  once a majority has it: commit', id: 'commit' },
    { code: 'committed entries must match on every node', id: 'safe' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'More nodes', gain: 'Survives more failures', cost: 'Writes wait for more acknowledgements, and get slower' },
    { choice: 'Short election timeout', gain: 'Faster failover', cost: 'More false elections on a slow network' },
    { choice: 'Consensus over simple replication', gain: 'No split brain, and no lost commits', cost: 'Lower throughput, and it needs a majority up' },
    { choice: 'Odd cluster sizes', gain: 'Best fault tolerance per node', cost: 'Even sizes add cost but no extra tolerance' },
  ],
  interview: [
    { q: 'Why not use consensus for everything?', a: 'Each write needs a majority round trip, which limits throughput and adds latency. Most systems use it only for the critical small stuff, such as metadata and leader election, and use faster replication for the bulk data.' },
    { q: 'What happens to a client whose command was on the old leader?', a: 'It might never hear back. The client retries with the new leader, ideally with a unique ID, so that a command that actually committed doesn\'t apply twice.' },
    { q: 'Raft or Paxos?', a: 'They offer similar guarantees. Raft was designed to be easier to understand and build, with a strong leader and a clear log structure, which is why most newer systems use it.' },
    { q: 'How are reads handled?', a: 'Reading from the leader isn\'t quite enough, since it may have been deposed without knowing. It confirms it\'s still leader with a majority round trip, or relies on a lease based on clock assumptions.' },
  ],
  mistakes: [
    'Saying a two-node cluster is more reliable than one. It\'s actually less so.',
    'Forgetting the safety rule that voters reject candidates with older logs.',
    'Treating consensus as a way to store large volumes of data.',
  ],
};

export default topic;
