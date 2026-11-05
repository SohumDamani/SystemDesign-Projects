import type { Lab, Topic } from '../../core/types';
import { fmtCount, fmtInt, fmtPct } from '../../core/format';
import source from './engine.ts?raw';
import { MerkleTree, diffTrees, gossipRound, predictNextRound } from './engine';

type P = { nodes: number; fanout: number; loss: number; keyPower: number; differences: number };

interface S {
  informed: Uint8Array;
  count: number;
  predicted: number;
  round: number;
  rounds: number[];
  messages: number;
  lastRoundMessages: number;
  merkle: { comparisons: number; found: number; keys: number; expected: number };
  waitTicks: number;
}

function startRumor(s: S, p: P, rng: { int(n: number): number }) {
  s.informed = new Uint8Array(p.nodes);
  s.informed[rng.int(p.nodes)] = 1;
  s.count = 1;
  s.predicted = 1;
  s.round = 0;
  s.waitTicks = 0;
}

function runMerkle(p: P, rng: { int(n: number): number }) {
  const keys = 2 ** p.keyPower;
  const a = Array.from({ length: keys }, (_, i) => i * 7);
  const b = [...a];
  const changed = new Set<number>();
  while (changed.size < Math.min(p.differences, keys)) changed.add(rng.int(keys));
  for (const c of changed) b[c] = -1;
  const diff = diffTrees(new MerkleTree(a), new MerkleTree(b));
  return { comparisons: diff.comparisons, found: diff.differing.length, keys, expected: changed.size };
}

const averageRounds = (s: S) => (s.rounds.length ? s.rounds.reduce((a, b) => a + b, 0) / s.rounds.length : 0);

const lab: Lab<S, P> = {
  secondsPerTick: 1,
  params: [
    { key: 'nodes', label: 'Nodes', kind: 'range', min: 100, max: 20000, step: 100, rebuild: true },
    { key: 'fanout', label: 'Peers told each round', kind: 'range', min: 1, max: 10, step: 1 },
    { key: 'loss', label: 'Messages lost', kind: 'range', min: 0, max: 0.8, step: 0.05, format: (v) => fmtPct(v) },
    { key: 'keyPower', label: 'Keys in the replicas', kind: 'range', min: 8, max: 16, step: 1, rebuild: true, format: (v) => fmtInt(2 ** v) },
    { key: 'differences', label: 'Keys that differ', kind: 'range', min: 0, max: 200, step: 1, rebuild: true },
  ],
  defaults: { nodes: 1000, fanout: 3, loss: 0, keyPower: 16, differences: 1 },
  create(p, rng) {
    const s = { rounds: [], messages: 0, lastRoundMessages: 0, merkle: runMerkle(p, rng) } as unknown as S;
    startRumor(s, p, rng);
    return s;
  },
  step(s, p, rng) {
    if (s.count >= p.nodes) {
      // Everyone knows. Pause, then start a new rumor, so you can watch it again.
      s.waitTicks++;
      if (s.waitTicks > 6) startRumor(s, p, rng);
      return;
    }
    const res = gossipRound(s.informed, s.count, p.fanout, p.loss, rng);
    s.count += res.newlyInformed;
    s.predicted = Math.min(p.nodes, predictNextRound(s.predicted, p.nodes, p.fanout, p.loss));
    s.lastRoundMessages = res.messages;
    s.messages += res.messages;
    s.round++;
    if (s.count >= p.nodes) s.rounds.push(s.round);
  },
  sample: (s) => ({ informed: s.count, math: s.predicted }),
  charts: [{ title: 'Nodes that know the news', series: [{ key: 'informed', label: 'Measured', role: 'measured' }, { key: 'math', label: 'Math', role: 'predicted' }] }],
  metrics(s, p) {
    const reach = p.fanout * (1 - p.loss);
    const estimate = reach > 0 ? Math.log(p.nodes) / Math.log(1 + reach) + Math.log(p.nodes) / Math.max(reach, 0.01) : Infinity;
    return [
      { label: 'Rounds to reach everyone', value: Number.isFinite(estimate) ? `about ${fmtInt(estimate)}` : 'Never', role: 'predicted' },
      { label: 'Rounds to reach everyone', value: s.rounds.length ? averageRounds(s).toFixed(1) : 'Still spreading', role: 'measured' },
      { label: 'Share informed', value: fmtPct(s.count / p.nodes), role: 'measured' },
      { label: 'Messages this round', value: fmtCount(s.lastRoundMessages), role: 'measured' },
      { label: 'Merkle comparisons', value: fmtInt(s.merkle.comparisons), role: 'measured' },
      { label: 'Comparing every key', value: fmtInt(s.merkle.keys), role: 'predicted' },
    ];
  },
  math(s, p) {
    const reach = p.fanout * (1 - p.loss);
    return [
      { expr: `Each informed node reaches ${p.fanout} × (1 − ${fmtPct(p.loss)})`, result: `${reach.toFixed(1)} peers` },
      { expr: `Growth phase: log(${fmtInt(p.nodes)}) ÷ log(1 + ${reach.toFixed(1)})`, result: reach > 0 ? `${(Math.log(p.nodes) / Math.log(1 + reach)).toFixed(1)} rounds` : 'never' },
      { expr: `Merkle: ${s.merkle.expected} differing of ${fmtInt(s.merkle.keys)}, found ${s.merkle.found}`, result: `${fmtInt(s.merkle.comparisons)} comparisons`, tone: 'good' },
    ];
  },
  views: (s) => [
    { kind: 'bars', title: 'Latest rounds needed to reach everyone', items: s.rounds.slice(-6).map((r, i) => ({ label: `Rumor ${s.rounds.length - Math.min(6, s.rounds.length) + i + 1}`, value: r })) },
  ],
  trace: (s) => ({
    values: { round: fmtInt(s.round), knows: fmtInt(s.count), cmp: `${fmtInt(s.merkle.comparisons)} comparisons` },
  }),
  experiments: [
    {
      title: 'How fast does it spread?',
      set: { nodes: 1000, fanout: 3 },
      ticks: 40,
      question: 'In a group of 1,000 nodes, each node that knows some news tells 3 random peers each round. How many rounds until everyone knows?',
      options: ['About 10', 'About 100', 'About 333'],
      answer: 0,
      explain: 'The number of informed nodes roughly quadruples per round at the start, and that\'s exponential. Finding the very last few takes a bit longer, as random picks often hit people who already know. No coordinator, no list of nodes, and it still reaches everyone.',
      check: (s) => s.rounds.length > 0 && averageRounds(s) >= 5 && averageRounds(s) <= 15,
    },
    {
      title: 'Ten times the nodes',
      set: { nodes: 10000, fanout: 3 },
      ticks: 40,
      question: 'With 10,000 nodes, ten times as many, how many rounds does it take?',
      options: ['About 100, ten times as many', 'Only a few more'],
      answer: 1,
      explain: 'Growth depends on the logarithm of the size, so 10 times the nodes adds just a couple of rounds. This is why gossip scales so well, and why large clusters use it for membership and failure detection.',
      check: (s) => s.rounds.length > 0 && averageRounds(s) >= 6 && averageRounds(s) <= 18,
    },
    {
      title: 'A terrible network',
      set: { nodes: 1000, fanout: 3, loss: 0.5 },
      ticks: 40,
      question: 'Half of all messages get lost. What happens to the spread?',
      options: ['It fails', 'It takes a few more rounds, and still reaches everyone'],
      answer: 1,
      explain: 'There\'s no single message that matters, since the same news arrives from many directions. That redundancy is the point of gossip: reliability comes from repetition, not from any one delivery.',
      check: (s) => s.rounds.length > 0 && averageRounds(s) <= 25,
    },
    {
      title: 'Find one difference',
      set: { keyPower: 16, differences: 1 },
      ticks: 2,
      question: 'Two replicas hold 65,536 keys, and one key differs. By comparing hashes in a Merkle tree from the top down, how many comparisons does it take to find it?',
      options: ['About 33', 'About 32,000', 'All 65,536'],
      answer: 0,
      explain: 'If two subtree hashes match, everything below them is identical, so you skip it. You only descend along the differing path, 2 comparisons per level for 16 levels. A very small exchange of data finds the difference among 65,536 keys.',
      check: (s) => s.merkle.found === 1 && s.merkle.comparisons <= 40,
    },
    {
      title: 'Many differences',
      set: { keyPower: 16, differences: 200 },
      ticks: 2,
      question: 'If 200 keys differ, how does the work grow?',
      options: ['Still around 33', 'Roughly in proportion to the differences, far less than comparing everything'],
      answer: 1,
      explain: 'Each differing key needs its own path down, with shared upper levels. It\'s still only a few thousand comparisons, compared with 65,536 for a full scan. The cost depends on how much differs, not on how much data you have.',
      check: (s) => s.merkle.found === 200 && s.merkle.comparisons < 6000 && s.merkle.comparisons > 200,
    },
  ],
};

const topic: Topic = {
  problem: [
    'In a cluster of thousands of machines, how does every node learn who\'s alive? A central coordinator is a bottleneck and a single point of failure. Having every node ping every other node takes far too many messages.',
    'Gossip solves this the way rumors spread: each node regularly tells a few random others what it knows. And when replicas need to find out what they disagree on, Merkle trees let them compare billions of keys by exchanging a handful of hashes. Dynamo, Cassandra and many other systems use both.',
  ],
  functional: [
    'Spread information to every node',
    'Detect failed nodes, with no central monitor',
    'Find differences between replicas efficiently',
  ],
  nonFunctional: [
    'Scales to thousands of nodes',
    'Works when many messages are lost',
    'Uses little network bandwidth',
  ],
  ideas: [
    { title: 'Why gossip works', body: 'Each round, the number of informed nodes multiplies, so reaching everyone takes about log N rounds. It needs no membership list to be perfect, and has no single point of failure.' },
    { title: 'Failure detection', body: 'Each node keeps a heartbeat counter for every other node, and shares that table through gossip. If a node\'s counter stops increasing everywhere for a while, it\'s presumed dead.' },
    { title: 'Merkle trees', body: 'Hash each key, then hash pairs of hashes, up to one root. Two replicas with the same root are identical. If they differ, descend only into the branches that differ.' },
    { title: 'Anti-entropy', body: 'Replicas can slowly drift through missed writes. Regular background comparison with Merkle trees finds and repairs differences, without scanning all of the data.' },
  ],
  estimator: {
    vars: [
      { key: 'nodes', label: 'Nodes', unit: 'count' },
      { key: 'fanout', label: 'Peers per round', unit: 'plain', assume: 3 },
      { key: 'interval', label: 'Seconds per round', unit: 'plain', assume: 1 },
      { key: 'msgBytes', label: 'Bytes per message', unit: 'plain', assume: 1000 },
      { key: 'msgRate', label: 'Messages across the cluster', unit: 'qps' },
      { key: 'bandwidth', label: 'Total bandwidth', unit: 'bytesPerSec' },
    ],
    eqs: [
      { out: 'msgRate', terms: [['nodes', 1], ['fanout', 1], ['interval', -1]] },
      { out: 'bandwidth', terms: [['msgRate', 1], ['msgBytes', 1]] },
    ],
    starts: [
      { key: 'nodes', value: 5000 },
      { key: 'bandwidth', value: 100e6 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'every round, on each node that knows:' },
    { code: '  pick a few random peers', id: 'round' },
    { code: '  send them what I know', id: 'knows' },
    { code: '' },
    { code: 'compare(replica A, replica B):' },
    { code: '  start at the two roots' },
    { code: '  if hashes match: everything below matches' },
    { code: '  else: compare both children', id: 'cmp' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Gossip over a coordinator', gain: 'No single point of failure, and it scales', cost: 'Information spreads in seconds, not instantly' },
    { choice: 'Higher fan-out', gain: 'Faster spread', cost: 'More messages, and much of it redundant' },
    { choice: 'Merkle tree comparison', gain: 'Finds differences with very little data', cost: 'Trees need maintaining as data changes' },
    { choice: 'Short failure timeout', gain: 'Finds dead nodes faster', cost: 'More false alarms during network hiccups' },
  ],
  interview: [
    { q: 'How do you avoid falsely marking nodes as dead?', a: 'Use a suspicion phase, so that a node is first marked suspect, and gets a chance to refute it. SWIM-style protocols also ask other nodes to probe it, in case the problem is only on your own path.' },
    { q: 'Why not have everyone ping everyone?', a: 'That\'s N² messages each round. With 5,000 nodes, that\'s 25 million. Gossip reaches the same result with about 15,000 messages per round.' },
    { q: 'How often do Merkle comparisons run?', a: 'In the background, and not continuously, since rebuilding trees takes work. Systems often split a tree per key range, so a small change only touches one small tree.' },
    { q: 'Is gossip consistent?', a: 'No, it\'s eventually consistent. Different nodes briefly have different views of the cluster. For things like membership, that\'s fine. When you need agreement, you need consensus.' },
  ],
  mistakes: [
    'Using gossip where you need strong agreement.',
    'Treating a single missed heartbeat as a failure.',
    'Scanning all keys to compare replicas.',
  ],
};

export default topic;
