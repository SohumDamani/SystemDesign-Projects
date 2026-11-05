import type { CustomViewProps, Lab, Topic } from '../../core/types';
import { fmtInt, fmtPct } from '../../core/format';
import source from './engine.ts?raw';
import { HashRing, hash32, moduloLookup } from './engine';

type P = { strategy: 'ring' | 'modulo'; vnodes: number; servers: number };

const KEY_COUNT = 10000;
const COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9', '#34a853', '#e66767'];

interface S {
  ring: HashRing;
  servers: string[];
  next: number;
  keys: string[];
  owner: string[];
  counts: Map<string, number>;
  movedShare: number;
  expectedShare: number;
  lastChange: string;
  lastKey: string;
  lastPosition: number;
  lastOwner: string;
}

function place(s: S, p: P) {
  const lookup = p.strategy === 'ring' ? (k: string) => s.ring.lookup(k) : (k: string) => moduloLookup(k, s.servers);
  const counts = new Map(s.servers.map((n) => [n, 0]));
  let moved = 0;
  s.keys.forEach((key, i) => {
    const owner = lookup(key);
    if (s.owner[i] && s.owner[i] !== owner) moved++;
    s.owner[i] = owner;
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  });
  s.counts = counts;
  return moved / s.keys.length;
}

function imbalance(s: S): number {
  const values = [...s.counts.values()];
  return Math.max(...values) / (s.keys.length / s.servers.length);
}

function relativeStd(s: S): number {
  const avg = s.keys.length / s.servers.length;
  const values = [...s.counts.values()];
  const variance = values.reduce((a, v) => a + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance) / avg;
}

function addServer(s: S, p: P) {
  const name = `S${s.next++}`;
  const before = s.servers.length;
  s.servers.push(name);
  s.ring.add(name);
  s.movedShare = place(s, p);
  s.expectedShare = p.strategy === 'ring' ? 1 / (before + 1) : before / (before + 1);
  s.lastChange = `Added ${name}`;
}

function removeServer(s: S, p: P) {
  if (s.servers.length <= 1) return;
  const name = s.servers[s.servers.length - 1];
  const before = s.servers.length;
  s.servers = s.servers.slice(0, -1);
  s.ring.remove(name);
  s.movedShare = place(s, p);
  s.expectedShare = p.strategy === 'ring' ? 1 / before : (before - 1) / before;
  s.lastChange = `Removed ${name}`;
}

function RingView({ state }: CustomViewProps<S, P>) {
  const size = 320;
  const c = size / 2;
  const r = 128;
  const colorOf = new Map(state.servers.map((n, i) => [n, COLORS[i % COLORS.length]]));
  const angle = (pos: number) => (pos / 2 ** 32) * 2 * Math.PI - Math.PI / 2;
  const points = state.ring.points.length > 400 ? state.ring.points.filter((_, i) => i % Math.ceil(state.ring.points.length / 400) === 0) : state.ring.points;
  const keyAngle = angle(state.lastPosition);
  return (
    <div className="lab-panel">
      <h4>The hash ring: each tick is a virtual node, each color a server</h4>
      <svg viewBox={`0 0 ${size} ${size}`} className="lab-svg" style={{ maxWidth: 340 }} role="img" aria-label={`Hash ring with ${state.servers.length} servers and ${state.ring.points.length} virtual nodes.`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line-strong)" />
        {points.map((pt, i) => {
          const a = angle(pt.position);
          return <line key={i} x1={c + (r - 9) * Math.cos(a)} y1={c + (r - 9) * Math.sin(a)} x2={c + (r + 9) * Math.cos(a)} y2={c + (r + 9) * Math.sin(a)} stroke={colorOf.get(pt.server)} strokeWidth="2" />;
        })}
        <circle cx={c + r * Math.cos(keyAngle)} cy={c + r * Math.sin(keyAngle)} r="5" fill="var(--ink)" />
        <text x={c} y={c - 6} textAnchor="middle">
          {state.lastKey}
        </text>
        <text x={c} y={c + 12} textAnchor="middle">
          goes to {state.lastOwner}
        </text>
      </svg>
      <div className="chips" style={{ marginTop: 8 }}>
        {state.servers.map((n) => (
          <span key={n} className="chip" style={{ borderColor: colorOf.get(n) }}>
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

const lab: Lab<S, P> = {
  secondsPerTick: 0.5,
  params: [
    { key: 'strategy', label: 'Placement', kind: 'choice', rebuild: true, options: [{ value: 'ring', label: 'Consistent hashing' }, { value: 'modulo', label: 'hash(key) % servers' }] },
    { key: 'vnodes', label: 'Virtual nodes per server', kind: 'range', min: 1, max: 500, step: 1, rebuild: true },
    { key: 'servers', label: 'Starting servers', kind: 'range', min: 2, max: 16, step: 1, rebuild: true },
  ],
  defaults: { strategy: 'ring', vnodes: 100, servers: 4 },
  create(p) {
    const ring = new HashRing(p.vnodes);
    const servers: string[] = [];
    for (let i = 0; i < p.servers; i++) {
      servers.push(`S${i}`);
      ring.add(`S${i}`);
    }
    const keys = Array.from({ length: KEY_COUNT }, (_, i) => `key-${i}`);
    const s: S = { ring, servers, next: p.servers, keys, owner: [], counts: new Map(), movedShare: 0, expectedShare: 0, lastChange: 'None yet', lastKey: keys[0], lastPosition: hash32(keys[0]), lastOwner: '' };
    place(s, p);
    s.lastOwner = s.owner[0];
    return s;
  },
  step(s, _p, rng) {
    const i = rng.int(s.keys.length);
    s.lastKey = s.keys[i];
    s.lastPosition = hash32(s.lastKey);
    s.lastOwner = s.owner[i];
  },
  sample: (s) => ({ moved: s.movedShare * 100, expected: s.expectedShare * 100, peak: imbalance(s) * 100 }),
  charts: [
    { title: 'Keys moved by the latest change', unit: '%', series: [{ key: 'moved', label: 'Measured', role: 'measured' }, { key: 'expected', label: 'Math', role: 'predicted' }] },
  ],
  metrics: (s, p) => [
    { label: 'Keys moved, latest change', value: fmtPct(s.expectedShare, 1), role: 'predicted' },
    { label: 'Keys moved, latest change', value: fmtPct(s.movedShare, 1), role: 'measured' },
    { label: 'Busiest over average', value: `${imbalance(s).toFixed(2)}×`, role: 'measured', tone: imbalance(s) > 1.4 ? 'bad' : undefined },
    { label: 'Spread of load', value: p.strategy === 'ring' ? fmtPct(1 / Math.sqrt(p.vnodes)) : 'about even', role: 'predicted' },
    { label: 'Spread of load', value: fmtPct(relativeStd(s)), role: 'measured' },
  ],
  math(s, p) {
    const n = s.servers.length;
    return [
      { expr: `Keys per server: ${fmtInt(KEY_COUNT)} ÷ ${n}`, result: fmtInt(KEY_COUNT / n) },
      p.strategy === 'ring' ? { expr: `Adding a server moves about 1 ÷ ${n + 1} of keys`, result: fmtPct(1 / (n + 1), 1), tone: 'good' } : { expr: `Adding a server moves about ${n} ÷ ${n + 1} of keys`, result: fmtPct(n / (n + 1), 1), tone: 'bad' },
      { expr: `Spread with ${p.vnodes} virtual nodes: 1 ÷ √${p.vnodes}`, result: fmtPct(1 / Math.sqrt(p.vnodes)) },
    ];
  },
  View: RingView,
  views: (s) => [
    {
      kind: 'bars',
      title: 'Keys on each server',
      marker: { value: KEY_COUNT / s.servers.length, label: 'Even share' },
      items: s.servers.map((n) => ({ label: n, value: s.counts.get(n) ?? 0 })),
    },
  ],
  actions: [
    { key: 'add', label: 'Add a server', run: (s, p) => addServer(s, p) },
    { key: 'remove', label: 'Remove a server', run: (s, p) => removeServer(s, p) },
  ],
  trace: (s) => ({ values: { key: s.lastKey, pos: fmtInt(s.lastPosition), owner: s.lastOwner, change: s.lastChange }, active: ['owner'] }),
  experiments: [
    {
      title: 'Add a server to the ring',
      act: ['add'],
      actAt: 1,
      ticks: 4,
      question: 'A ring has 4 servers and 10,000 keys, and you add a fifth. Roughly what share of keys move?',
      options: ['About 20%', 'About 50%', 'About 80%'],
      answer: 0,
      explain: 'Only the keys the new server takes over need to move, about 1 ÷ 5 of them. Everything else stays where it is, so caches stay warm and the database doesn\'t get flooded.',
      check: (s) => s.movedShare > 0.12 && s.movedShare < 0.3,
    },
    {
      title: 'Now use modulo',
      set: { strategy: 'modulo' },
      act: ['add'],
      actAt: 1,
      ticks: 4,
      question: 'Same keys, but placed with `hash(key) % servers`. You go from 4 servers to 5. How many keys move?',
      options: ['About 20%', 'About 50%', 'About 80%'],
      answer: 2,
      explain: 'A key only stays put if its hash gives the same answer mod 4 and mod 5, and that\'s true for about 1 in 5 keys. So 80% move. For a cache, that\'s almost a full flush, and all those misses land on the database at once.',
      check: (s) => s.movedShare > 0.7,
    },
    {
      title: 'One point per server',
      set: { vnodes: 1 },
      ticks: 4,
      question: 'If each server gets only one point on the ring, how even is the load?',
      options: ['Perfectly even', 'Slightly uneven, within 10%', 'Badly uneven, with one server holding far more than its share'],
      answer: 2,
      explain: 'Random points leave random gaps, and a server owns the whole gap before its point. A few points give a few gaps, so some servers get much more than others. That\'s the problem virtual nodes solve.',
      check: (s) => imbalance(s) > 1.3,
    },
    {
      title: 'Add virtual nodes',
      set: { vnodes: 400 },
      ticks: 4,
      question: 'Give each server 400 points on the ring. What happens to the busiest server?',
      options: ['It gets close to an even share', 'No change, since hashing is already random', 'It gets worse, because more points cause more collisions'],
      answer: 0,
      explain: 'With many small gaps per server, luck averages out. Spread falls with the square root of the number of virtual nodes, here about 1 ÷ √400 = 5%. The cost is memory and a slightly slower ring lookup.',
      check: (s) => imbalance(s) < 1.2,
    },
  ],
};

const topic: Topic = {
  problem: [
    'To spread data across servers, the obvious approach is `hash(key) % N`. It works perfectly until N changes. Add or lose one server and nearly every key maps somewhere else, which means a mass cache miss or a huge data migration at the worst possible moment.',
    'Consistent hashing fixes this by placing both keys and servers on a circle. A key belongs to the next server clockwise, so a change in servers only affects the keys next to it. This idea underpins Dynamo, Cassandra, and many caches and load balancers.',
  ],
  functional: [
    'Map any key to a server',
    'Allow servers to join and leave',
    'Move as few keys as possible when that happens',
  ],
  nonFunctional: [
    'Even load across servers',
    'Fast lookups, in O(log n)',
    'Support servers of different sizes',
  ],
  ideas: [
    { title: 'The ring', body: 'Hash servers and keys onto the same circular space. To find a key\'s owner, walk clockwise to the first server. Adding a server only takes keys from its clockwise neighbor.' },
    { title: 'Virtual nodes', body: 'Each server appears at many ring positions. This evens out the gaps, spreads a failed server\'s load across many others, and lets a bigger machine take more positions.' },
    { title: 'Why it matters', body: 'Moving 20% of the keys instead of 80% is the difference between a blip and an outage. When caches are fronting a database, each moved key is a future database read.' },
  ],
  estimator: {
    vars: [
      { key: 'keys', label: 'Total keys', unit: 'count' },
      { key: 'valueBytes', label: 'Bytes per key', unit: 'plain', assume: 1000 },
      { key: 'nodeBytes', label: 'Bytes per server', unit: 'plain', assume: 64e9 },
      { key: 'total', label: 'Total data', unit: 'bytes' },
      { key: 'servers', label: 'Servers', unit: 'count' },
      { key: 'moved', label: 'Keys moved when adding one', unit: 'count' },
      { key: 'movedBytes', label: 'Data moved when adding one', unit: 'bytes' },
    ],
    eqs: [
      { out: 'total', terms: [['keys', 1], ['valueBytes', 1]] },
      { out: 'servers', terms: [['total', 1], ['nodeBytes', -1]] },
      { out: 'moved', terms: [['keys', 1], ['servers', -1]] },
      { out: 'movedBytes', terms: [['moved', 1], ['valueBytes', 1]] },
    ],
    starts: [
      { key: 'keys', value: 1e9 },
      { key: 'servers', value: 16 },
      { key: 'total', value: 1e12 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'position = hash(key)', id: 'pos' },
    { code: 'server = first ring point clockwise of position', id: 'owner' },
    { code: 'on adding a server:' },
    { code: '  insert its virtual nodes into the sorted ring', id: 'change' },
    { code: '  move only the keys it now owns' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Modulo hashing', gain: 'Trivial, with even load', cost: 'Almost all keys move when N changes' },
    { choice: 'Consistent hashing', gain: 'Moves about 1/N of the keys', cost: 'Uneven load without virtual nodes, and a ring to maintain' },
    { choice: 'More virtual nodes', gain: 'More even load', cost: 'More memory, and more peers involved in rebalancing' },
  ],
  interview: [
    { q: 'How do you handle servers of different sizes?', a: 'Give bigger servers more virtual nodes, in proportion to their capacity. They then own a larger share of the ring.' },
    { q: 'How does replication work on a ring?', a: 'Walk clockwise from the key and store copies on the next N distinct physical servers, skipping virtual nodes that belong to a server you already chose. That\'s how Dynamo-style stores do it.' },
    { q: 'What about a single very hot key?', a: 'Consistent hashing balances key counts, not traffic, so one hot key can still overload its server. You need replication, a local cache, or special handling for that key.' },
  ],
  mistakes: [
    'Forgetting virtual nodes, then claiming the load is even.',
    'Saying nothing moves when a server is added. About 1/N of the keys still do.',
    'Confusing an even key count with even traffic.',
  ],
};

export default topic;
