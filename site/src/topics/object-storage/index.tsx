import { useState } from 'react';
import type { CustomViewProps, Lab, Topic } from '../../core/types';
import { fmtCount, fmtDuration, fmtInt, fmtPct } from '../../core/format';
import { atMostFail, choose } from '../../core/stats';
import source from './engine.ts?raw';
import { decode, encode, failuresNow, type DiskGroup, type Encoded } from './engine';

type P = { mode: 'replication' | 'erasure'; copies: number; k: number; m: number; afr: number; repairDays: number };

const TEXT = 'Object storage keeps bytes safe by spreading them across many independent failure domains.';
const DAYS_PER_TICK = 30;
const GROUPS = 3000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface S {
  now: number;
  groups: DiskGroup[];
  lostGroups: number;
  demo: Encoded;
  alive: boolean[];
  result: string | null;
}

const layout = (p: P) => (p.mode === 'replication' ? { data: 1, parity: p.copies - 1 } : { data: p.k, parity: p.m });
const overhead = (p: P) => {
  const l = layout(p);
  return l.parity / l.data;
};

/** Chance a group fails in a year: a disk fails, and more than `parity` others fail during the repair. */
function annualLossChance(p: P): number {
  const l = layout(p);
  const n = l.data + l.parity;
  const pDownInWindow = (p.afr * p.repairDays) / 365;
  const pExceed = 1 - atMostFail(n - 1, l.parity - 1, pDownInWindow);
  return Math.min(1, n * p.afr * pExceed);
}

const nines = (loss: number) => (loss <= 0 ? '12+' : Math.min(15, Math.max(0, -Math.log10(loss))).toFixed(1));

function fresh(p: P): DiskGroup[] {
  const l = layout(p);
  return Array.from({ length: GROUPS }, () => ({ failedUntil: Array(l.data + l.parity).fill(0), lost: false }));
}

function ShardView({ state, act, rerender }: CustomViewProps<S, P>) {
  const [message, setMessage] = useState('');
  const { demo, alive } = state;
  const toggle = (i: number) => {
    state.alive = state.alive.map((a, j) => (j === i ? !a : a));
    setMessage('');
    rerender();
  };
  const dead = alive.filter((a) => !a).length;
  return (
    <div className="lab-panel">
      <h4>
        Destroy shards of a real object. {demo.k} data and {demo.m} parity shards, so any {demo.k} are enough.
      </h4>
      <div className="cells" style={{ marginBottom: 8 }}>
        {demo.shards.map((s, i) => (
          <button key={i} className={'cell tone-' + (alive[i] ? (i < demo.k ? 'neutral' : 'warn') : 'bad')} onClick={() => toggle(i)} aria-pressed={!alive[i]} style={{ textAlign: 'left' }}>
            <span>{i < demo.k ? `Data ${i + 1}` : `Parity ${i - demo.k + 1}`}</span>
            <b>{alive[i] ? [...s.slice(0, 2)].map((b) => b.toString(16).padStart(2, '0')).join('') : 'Lost'}</b>
          </button>
        ))}
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <button
          onClick={() => {
            act('reconstruct');
            setMessage(state.result === TEXT ? 'Rebuilt perfectly from the surviving shards.' : state.result === null ? 'Too many shards lost, so the data is gone.' : 'Rebuilt text does not match.');
          }}
        >
          Rebuild the object
        </button>
        <span className="small muted">
          {dead} lost, {demo.m} can be tolerated
        </span>
      </div>
      {message && <p className="small" style={{ marginBottom: 4 }}>{message}</p>}
      {state.result && <p className="small" style={{ margin: 0, overflowWrap: 'anywhere' }}>"{state.result}"</p>}
    </div>
  );
}

const lab: Lab<S, P> = {
  secondsPerTick: DAYS_PER_TICK * 86400,
  params: [
    { key: 'mode', label: 'Redundancy', kind: 'choice', rebuild: true, options: [{ value: 'erasure', label: 'Erasure coding' }, { value: 'replication', label: 'Replication' }] },
    { key: 'copies', label: 'Copies, for replication', kind: 'range', min: 1, max: 5, step: 1, rebuild: true },
    { key: 'k', label: 'Data shards, for erasure coding', kind: 'range', min: 2, max: 12, step: 1, rebuild: true },
    { key: 'm', label: 'Parity shards, for erasure coding', kind: 'range', min: 1, max: 6, step: 1, rebuild: true },
    { key: 'afr', label: 'Disk failures per year', kind: 'range', min: 0.01, max: 1, step: 0.01, format: (v) => fmtPct(v) },
    { key: 'repairDays', label: 'Repair time', kind: 'range', min: 1, max: 60, step: 1, unit: 'days' },
  ],
  defaults: { mode: 'erasure', copies: 3, k: 8, m: 4, afr: 0.02, repairDays: 5 },
  create(p) {
    const demo = encode(encoder.encode(TEXT), p.k, p.m);
    return { now: 0, groups: fresh(p), lostGroups: 0, demo, alive: demo.shards.map(() => true), result: null };
  },
  step(s, p, rng) {
    // Simulates a fleet over many years, jumping 30 days per tick, with failures at the given rate.
    const dayStep = DAYS_PER_TICK;
    const l = layout(p);
    const failChance = (p.afr * dayStep) / 365;
    s.now += dayStep;
    for (const g of s.groups) {
      if (g.lost) continue;
      for (let d = 0; d < g.failedUntil.length; d++) {
        if (g.failedUntil[d] <= s.now && rng.chance(failChance)) {
          // A failure lands somewhere within this step.
          g.failedUntil[d] = s.now - rng.next() * dayStep + p.repairDays;
        }
      }
      if (failuresNow(g, s.now) > l.parity) {
        g.lost = true;
        s.lostGroups++;
      }
    }
  },
  sample: (s) => ({ lost: s.lostGroups, share: (s.lostGroups / GROUPS) * 100 }),
  charts: [{ title: 'Object groups lost, of 3,000', series: [{ key: 'lost', label: 'Measured', role: 'measured' }] }],
  metrics(s, p) {
    const l = layout(p);
    const loss = annualLossChance(p);
    return [
      { label: 'Storage overhead', value: `+${fmtPct(overhead(p))}`, role: 'predicted' },
      { label: 'Disks to lose before data loss', value: String(l.parity + 1), role: 'predicted' },
      { label: 'Durability', value: `${nines(loss)} nines`, role: 'predicted', tone: 'good' },
      { label: 'Groups lost', value: fmtInt(s.lostGroups), role: 'measured', tone: s.lostGroups ? 'bad' : 'good' },
      { label: 'Simulated time', value: fmtDuration(s.now * 86400) },
    ];
  },
  math(_s, p) {
    const l = layout(p);
    const n = l.data + l.parity;
    return [
      { expr: `Stores ${n} units for every ${l.data} of data`, result: `${(n / l.data).toFixed(2)}× size` },
      { expr: `Chance one more disk fails during repair: ${fmtPct(p.afr)} × ${p.repairDays} ÷ 365`, result: fmtPct((p.afr * p.repairDays) / 365, 3) },
      { expr: `Ways for ${l.parity + 1} of ${n} disks to fail`, result: fmtCount(choose(n, l.parity + 1)) },
      { expr: 'Loss per object group per year, about', result: annualLossChance(p).toExponential(1) },
    ];
  },
  View: ShardView,
  actions: [
    {
      key: 'reconstruct',
      label: 'Rebuild the object',
      run: (s) => {
        const out = decode(s.demo, s.alive);
        s.result = out ? decoder.decode(out) : null;
      },
    },
    {
      key: 'kill-parity-count',
      label: 'Destroy as many shards as parity allows',
      run: (s) => {
        s.alive = s.demo.shards.map((_, i) => i >= s.demo.m);
      },
    },
    {
      key: 'kill-too-many',
      label: 'Destroy one shard too many',
      run: (s) => {
        s.alive = s.demo.shards.map((_, i) => i > s.demo.m);
      },
    },
    {
      key: 'restore',
      label: 'Restore all shards',
      run: (s) => {
        s.alive = s.demo.shards.map(() => true);
        s.result = null;
      },
    },
  ],
  trace: (s, p) => ({
    values: { k: `${p.k} data + ${p.m} parity`, alive: `${s.alive.filter(Boolean).length} alive`, out: s.result === null ? 'not rebuilt' : 'rebuilt' },
  }),
  experiments: [
    {
      title: 'Half the storage',
      set: { mode: 'erasure', k: 8, m: 4 },
      ticks: 5,
      question: 'Three-way replication uses 200% extra storage. What does 8+4 erasure coding use, while surviving more failures?',
      options: ['200%', '100%', '50%'],
      answer: 2,
      explain: '4 parity shards for 8 data shards adds 50%, and you can lose any 4. Across exabytes, that saves a fortune. The tradeoff is CPU to encode and rebuild, and more disks involved on each read.',
      check: (_s, p) => Math.abs(overhead(p) - 0.5) < 0.01,
    },
    {
      title: 'Lose four shards',
      set: { mode: 'erasure', k: 8, m: 4 },
      act: ['kill-parity-count', 'reconstruct'],
      actAt: 1,
      ticks: 3,
      question: 'You destroy 4 of the 12 shards, including data shards. Can the original object be rebuilt?',
      options: ['Yes, byte for byte', 'Only partly', 'No'],
      answer: 0,
      explain: 'Any 8 of the 12 shards are enough, whichever they are. That really happened here: the bytes above were rebuilt with Gaussian elimination over GF(256). Each parity shard is an independent equation in the 8 unknown data shards.',
      check: (s) => s.result === TEXT,
    },
    {
      title: 'Lose five shards',
      set: { mode: 'erasure', k: 8, m: 4 },
      act: ['kill-too-many', 'reconstruct'],
      actAt: 1,
      ticks: 3,
      question: 'Now 5 of the 12 are gone. What happens?',
      options: ['Most of the data comes back', 'Nothing can be recovered'],
      answer: 1,
      explain: 'Seven equations can\'t solve for eight unknowns. It\'s a sharp cliff, not gradual decay. That\'s why repair speed matters: the contest is to rebuild before the next failure.',
      check: (s) => s.result === null,
    },
    {
      title: 'Compare on a bad fleet',
      set: { mode: 'replication', copies: 2, afr: 0.3, repairDays: 30 },
      ticks: 60,
      question: 'Disks are failing 30% a year, with 30-day repairs. Keeping only 2 copies, do you lose data within 5 years?',
      options: ['No', 'Yes, many objects'],
      answer: 1,
      explain: 'With only one spare copy and slow repairs, two overlapping failures are common. Durability depends on failure rate, repair time and redundancy together, and only the combination gives you those nines.',
      check: (s) => s.lostGroups > 20,
    },
    {
      title: 'Same fleet, better coding',
      set: { mode: 'erasure', k: 8, m: 4, afr: 0.3, repairDays: 30 },
      ticks: 60,
      question: 'Same awful fleet, using 8+4. How many objects are lost?',
      options: ['Almost none, with less overhead than 3 copies', 'About the same as 2 copies'],
      answer: 0,
      explain: 'It takes 5 overlapping failures among 12 disks to lose anything, which is rare even here. And it uses less extra storage than 2 copies. That\'s why cold data at large scale is almost always erasure coded.',
      check: (s) => s.lostGroups < 20,
    },
  ],
};

const topic: Topic = {
  problem: [
    'Object storage, such as S3, keeps files of any size behind a simple API: put, get, delete. It doesn\'t have folders or in-place edits, and in exchange it can scale to exabytes and offer a promise of 11 nines of durability, which means you\'d statistically lose one object in 100 billion per year.',
    'Most of the design is about how to get that durability affordably. Keeping three copies of everything works, but it\'s expensive at this scale. Erasure coding uses math to get better durability from far less disk, as you can try in the lab with real bytes.',
  ],
  functional: [
    'Create buckets, upload and download objects',
    'Object versioning',
    'List objects, and support multipart upload of large files',
  ],
  nonFunctional: [
    'Extremely high durability, of 11 nines',
    'High availability',
    'Low storage cost at huge scale',
  ],
  diagram: {
    nodes: [
      { id: 'c', label: 'Client', col: 0, row: 1, kind: 'client', note: 'Uses HTTP PUT and GET. Large files upload in parts, in parallel.' },
      { id: 'a', label: 'API service', col: 1, row: 1, note: 'Stateless. It authenticates, then coordinates metadata and data operations.' },
      { id: 'i', label: 'Auth service', col: 1, row: 0, note: 'Checks whether this caller may access this bucket.' },
      { id: 'm', label: 'Metadata store', col: 2, row: 0, kind: 'store', note: 'Maps bucket and name to an object ID. Small but critical, and heavily queried.' },
      { id: 'p', label: 'Placement service', col: 2, row: 1, note: 'Chooses data nodes across failure domains, using a cluster map and heartbeats.' },
      { id: 'd', label: 'Data nodes', col: 3, row: 1, kind: 'store', note: 'Store shards on disk, in large files with many small objects packed together.' },
    ],
    edges: [
      { from: 'c', to: 'a' },
      { from: 'a', to: 'i' },
      { from: 'a', to: 'm' },
      { from: 'a', to: 'p' },
      { from: 'a', to: 'd' },
      { from: 'p', to: 'd', dashed: true },
    ],
  },
  ideas: [
    { title: 'Separate metadata and data', body: 'Data is huge, immutable blobs, and metadata is small lookups. They have opposite needs, so keep them in separate systems. A data node only needs to look up by ID.' },
    { title: 'Erasure coding', body: 'Split an object into k data shards, and compute m parity shards. Any k of them can rebuild it. 8+4 survives 4 failures with 50% overhead, whereas 3 copies survive 2 failures with 200%.' },
    { title: 'Failure domains', body: 'Durability math assumes independent failures. Spread shards across disks, racks and data centers, so that one power failure doesn\'t take several shards at once.' },
    { title: 'Small objects', body: 'Millions of tiny files waste disk blocks and inodes. Pack many small objects into one large file, and keep an index of each object\'s offset.' },
  ],
  estimator: {
    vars: [
      { key: 'storage', label: 'Data stored', unit: 'bytes' },
      { key: 'avgObject', label: 'Bytes per object', unit: 'plain', assume: 5e6 },
      { key: 'overheadFactor', label: 'Size multiple for redundancy', unit: 'plain', assume: 1.5 },
      { key: 'diskBytes', label: 'Bytes per disk', unit: 'plain', assume: 20e12 },
      { key: 'metaBytes', label: 'Metadata bytes per object', unit: 'plain', assume: 1000 },
      { key: 'objects', label: 'Objects', unit: 'count' },
      { key: 'raw', label: 'Raw disk needed', unit: 'bytes' },
      { key: 'disks', label: 'Disks', unit: 'count' },
      { key: 'metadata', label: 'Metadata size', unit: 'bytes' },
    ],
    eqs: [
      { out: 'objects', terms: [['storage', 1], ['avgObject', -1]] },
      { out: 'raw', terms: [['storage', 1], ['overheadFactor', 1]] },
      { out: 'disks', terms: [['raw', 1], ['diskBytes', -1]] },
      { out: 'metadata', terms: [['objects', 1], ['metaBytes', 1]] },
    ],
    starts: [
      { key: 'storage', value: 100e15 },
      { key: 'objects', value: 1e10 },
      { key: 'disks', value: 10000 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'put(object):' },
    { code: '  split into k data shards', id: 'k' },
    { code: '  parity = encoding_matrix × data shards, in GF(256)' },
    { code: '  place all shards in different failure domains' },
    { code: '' },
    { code: 'get(object):' },
    { code: '  read any k shards', id: 'alive' },
    { code: '  data = inverse(matrix for those shards) × shards', id: 'out' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Replication', gain: 'Fast reads and simple repair', cost: 'High storage cost' },
    { choice: 'Erasure coding', gain: 'Much cheaper, and more durable', cost: 'CPU for encoding, and rebuilds touch many disks' },
    { choice: 'More parity', gain: 'More durable', cost: 'More storage, and more work on writes' },
    { choice: 'Multi-region', gain: 'Survives region loss', cost: 'Much higher cost and latency' },
  ],
  interview: [
    { q: 'How do you detect silent corruption?', a: 'Store checksums alongside shards, and verify on each read. Background scrubbing re-reads everything periodically, because some corruption occurs on data nobody is reading.' },
    { q: 'How does multipart upload work?', a: 'The client gets an upload ID, sends parts independently, and calls complete at the end. A failed part retries alone, and parts upload in parallel. Unfinished uploads need garbage collecting.' },
    { q: 'How do you list objects when metadata is sharded?', a: 'Listing by prefix across shards is hard. It\'s common to keep a separate listing table per bucket, or merge sorted results across shards with pagination.' },
    { q: 'How does versioning work?', a: 'Instead of overwriting, add a new row with a new version for the same name, and mark deletes with a delete marker. Old data is kept until a lifecycle rule removes it.' },
  ],
  mistakes: [
    'Treating metadata and data as one system.',
    'Claiming durability numbers without considering repair time.',
    'Placing shards with no regard for failure domains.',
  ],
};

export default topic;
