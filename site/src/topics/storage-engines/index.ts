import type { Lab, Topic } from '../../core/types';
import { fmtBytes, fmtCount, fmtInt } from '../../core/format';
import { tailMean } from '../../core/stats';
import source from './engine.ts?raw';
import { BTree, LsmTree, RECORD_BYTES } from './engine';

type P = { engine: 'lsm' | 'btree'; keys: number; writesPerTick: number; readsPerTick: number; memtable: number; maxFiles: number; bloom: boolean; pageKb: number };

const NO_COMPACTION = 40;

interface S {
  store: LsmTree | BTree;
  distinct: Set<number>;
  readAmp: number;
  lastGet: string;
}

const isLsm = (x: LsmTree | BTree): x is LsmTree => x instanceof LsmTree;
const writeAmp = (s: S) => (s.store.stats.userBytes ? s.store.stats.diskBytes / s.store.stats.userBytes : 0);
const spaceAmp = (s: S) => (s.distinct.size ? s.store.storedRecords / s.distinct.size : 1);

const lab: Lab<S, P> = {
  secondsPerTick: 0.1,
  params: [
    { key: 'engine', label: 'Storage engine', kind: 'choice', rebuild: true, options: [{ value: 'lsm', label: 'LSM tree' }, { value: 'btree', label: 'B-tree' }] },
    { key: 'keys', label: 'Distinct keys', kind: 'range', min: 500, max: 50000, step: 500 },
    { key: 'writesPerTick', label: 'Writes per tick', kind: 'range', min: 1, max: 200, step: 1 },
    { key: 'readsPerTick', label: 'Reads per tick', kind: 'range', min: 1, max: 200, step: 1 },
    { key: 'memtable', label: 'LSM memory buffer', kind: 'range', min: 50, max: 2000, step: 50, unit: 'records', rebuild: true },
    { key: 'maxFiles', label: 'LSM files before compacting', kind: 'range', min: 2, max: NO_COMPACTION, step: 1, rebuild: true, format: (v) => (v === NO_COMPACTION ? 'Never compact' : String(v)) },
    { key: 'bloom', label: 'LSM Bloom filter on each file', kind: 'toggle', rebuild: true },
    { key: 'pageKb', label: 'B-tree page size', kind: 'range', min: 1, max: 16, step: 1, unit: 'KB', rebuild: true },
  ],
  defaults: { engine: 'lsm', keys: 5000, writesPerTick: 50, readsPerTick: 20, memtable: 200, maxFiles: 8, bloom: true, pageKb: 4 },
  create: (p) => ({ store: p.engine === 'lsm' ? new LsmTree(p.memtable, p.maxFiles === NO_COMPACTION ? Infinity : p.maxFiles, p.bloom) : new BTree(p.pageKb * 1024), distinct: new Set(), readAmp: 0, lastGet: '' }),
  step(s, p, rng) {
    for (let i = 0; i < p.writesPerTick; i++) {
      const key = rng.int(p.keys);
      s.store.put(key, rng.int(1000));
      s.distinct.add(key);
    }
    const before = s.store.stats.filesTouched;
    for (let i = 0; i < p.readsPerTick; i++) {
      const v = s.store.get(rng.int(p.keys));
      s.lastGet = v === undefined ? 'not found' : `value ${v}`;
    }
    const touched = (s.store.stats.filesTouched - before) / p.readsPerTick;
    s.readAmp = s.readAmp ? s.readAmp * 0.95 + touched * 0.05 : touched;
  },
  sample: (s) => ({ write: writeAmp(s), read: s.readAmp, space: spaceAmp(s) }),
  charts: [
    { title: 'Write amplification: bytes on disk per byte stored', series: [{ key: 'write', label: 'Measured', role: 'measured' }] },
    { title: 'Read amplification: pages or files per lookup', series: [{ key: 'read', label: 'Measured', role: 'measured' }] },
    { title: 'Space amplification: copies kept per live key', series: [{ key: 'space', label: 'Measured', role: 'measured' }] },
  ],
  metrics(s, p) {
    const expectedWrite = p.engine === 'btree' ? 1 + (p.pageKb * 1024) / RECORD_BYTES : undefined;
    const st = s.store;
    return [
      { label: 'Write amplification', value: `${writeAmp(s).toFixed(1)}×`, role: 'measured' },
      ...(expectedWrite ? [{ label: 'Write amplification', value: `${expectedWrite.toFixed(0)}×`, role: 'predicted' as const }] : []),
      { label: 'Read amplification', value: `${s.readAmp.toFixed(1)}`, role: 'measured' },
      { label: 'Space amplification', value: `${spaceAmp(s).toFixed(2)}×`, role: 'measured' },
      { label: isLsm(st) ? 'Files on disk' : 'Tree height', value: isLsm(st) ? fmtInt(st.tables.length) : fmtInt(st.height), role: 'measured' },
      { label: 'Total disk written', value: fmtBytes(st.stats.diskBytes), role: 'measured' },
    ];
  },
  math(s, p) {
    const page = p.pageKb * 1024;
    return [
      { expr: `B-tree: rewrites a ${fmtBytes(page)} page for a ${RECORD_BYTES}-byte record, plus the log`, result: `${(1 + page / RECORD_BYTES).toFixed(0)}× writes` },
      { expr: `LSM: log + flush + each time compaction rewrites it`, result: 'usually 5 to 30×' },
      { expr: `Reads without Bloom filters check up to every file`, result: isLsm(s.store) ? `${s.store.tables.length} files` : `${s.store.height} pages per read`, tone: isLsm(s.store) && s.store.tables.length > 8 ? 'warn' : undefined },
    ];
  },
  views(s) {
    if (isLsm(s.store)) {
      return [{ kind: 'bars', title: 'LSM files, newest first, by records', items: s.store.tables.slice(0, 10).map((t, i) => ({ label: `File ${i + 1}`, value: t.keys.length })) }];
    }
    return [{ kind: 'note', title: 'B-tree', text: `${fmtCount(s.store.splits)} page splits so far. Updates happen in place, so there are no old copies to clean up.` }];
  },
  trace(s) {
    return {
      values: { get: s.lastGet, amp: `${writeAmp(s).toFixed(1)}× written`, files: isLsm(s.store) ? `${s.store.tables.length} files, ${s.store.compactions} compactions` : `height ${s.store.height}` },
    };
  },
  experiments: [
    {
      title: 'B-tree writes',
      set: { engine: 'btree', pageKb: 4 },
      ticks: 200,
      question: 'A B-tree stores a 100-byte record by updating a 4 KB page in place, plus a log entry. How much actually gets written per record?',
      options: ['About 2 times the record', 'About 42 times the record', 'About 500 times'],
      answer: 1,
      explain: 'Disks write whole pages, so you pay 4,096 + 100 bytes for a 100-byte record. Real databases batch several updates per page, which softens it. But for write-heavy systems, this is a big reason to look elsewhere.',
      check: (s) => writeAmp(s) > 35 && writeAmp(s) < 50,
    },
    {
      title: 'LSM writes',
      set: { engine: 'lsm', memtable: 200, maxFiles: 8 },
      ticks: 400,
      question: 'An LSM tree buffers writes in memory, and flushes sorted files in bulk. How does its write amplification compare?',
      options: ['Worse than the B-tree', 'Much better, even counting compaction'],
      answer: 1,
      explain: 'Writes are batched and sequential, so even after compaction rewrites things a few times, the total stays well below the B-tree. That\'s why write-heavy systems such as Cassandra and RocksDB use them.',
      check: (s) => writeAmp(s) < 20,
    },
    {
      title: 'Never compact',
      set: { engine: 'lsm', maxFiles: NO_COMPACTION, bloom: false, memtable: 100 },
      ticks: 400,
      question: 'What if you skip compaction, and have no Bloom filters? Each read may need to check every file.',
      options: ['Reads stay about the same', 'Read amplification keeps climbing'],
      answer: 1,
      explain: 'Writes got cheaper, but a lookup now searches many files, newest first. This is the fundamental LSM tradeoff: compaction costs writes, and skipping it costs reads and space.',
      check: (_s, _p, h) => tailMean(h, 'read', 30) > 3,
    },
    {
      title: 'Add Bloom filters',
      set: { engine: 'lsm', maxFiles: NO_COMPACTION, bloom: true, memtable: 100 },
      ticks: 400,
      question: 'Same uncompacted files, but each now has a Bloom filter that can say "this key is definitely not here". How many files does a read touch?',
      options: ['Still many', 'Only about one or two'],
      answer: 1,
      explain: 'The filter skips almost every file that doesn\'t hold the key, without a disk read. A tiny bit of memory removes most of the read cost. That\'s why every LSM database uses them.',
      check: (_s, _p, h) => tailMean(h, 'read', 30) < 2.5,
    },
    {
      title: 'Old copies pile up',
      set: { engine: 'lsm', maxFiles: NO_COMPACTION, keys: 500, memtable: 100, writesPerTick: 100 },
      ticks: 200,
      question: 'If keys are updated constantly with no compaction, how much disk space is used, compared to the live data?',
      options: ['About the same', 'Many times more, because old versions stay on disk'],
      answer: 1,
      explain: 'An LSM never overwrites: each update is another copy somewhere. Space stays wasted until compaction drops old versions. A B-tree updates in place, so it stays close to 1×.',
      check: (s) => spaceAmp(s) > 3,
    },
  ],
};

const topic: Topic = {
  problem: [
    'Every database has to answer one question: how do you lay out sorted data on a disk? Nearly all of them use one of two structures. B-trees update fixed-size pages in place, and LSM trees write new sorted files and clean up later.',
    'Neither one wins. You\'re trading between three kinds of amplification: extra bytes written, extra files read, and extra space used. Understanding this lets you explain why Postgres and Cassandra behave so differently, and it comes up constantly in deep-dive interviews.',
  ],
  functional: [
    'Store and find keys by value',
    'Survive a crash without losing acknowledged writes',
    'Support range scans over sorted keys',
  ],
  nonFunctional: [
    'High write throughput, or fast reads, depending on your needs',
    'Reasonable space usage',
    'Predictable latency, with few surprises from background work',
  ],
  diagram: {
    nodes: [
      { id: 'w', label: 'Writes', col: 0, row: 0, kind: 'client', note: 'Each write goes to the log first, so it survives a crash.' },
      { id: 'log', label: 'Write-ahead log', col: 1, row: 0, kind: 'queue', note: 'Appended sequentially. Used only for recovery after a crash.' },
      { id: 'mem', label: 'Memtable', col: 1, row: 1, note: 'Sorted in memory. When full, it\'s written out as one sorted file.' },
      { id: 'sst', label: 'Sorted files', col: 2, row: 1, kind: 'store', note: 'Immutable once written. Reads check the newest first.' },
      { id: 'c', label: 'Compaction', col: 3, row: 1, note: 'A background job that merges files and drops old versions.' },
      { id: 'bf', label: 'Bloom filters', col: 2, row: 0, note: 'One per file, so reads can skip files that can\'t hold the key.' },
    ],
    edges: [
      { from: 'w', to: 'log' },
      { from: 'w', to: 'mem' },
      { from: 'mem', to: 'sst', label: 'flush' },
      { from: 'sst', to: 'c' },
      { from: 'bf', to: 'sst', dashed: true },
    ],
  },
  ideas: [
    { title: 'B-tree', body: 'A shallow tree of fixed-size pages, sorted. Reads take a few page lookups. Writes update a page in place, so one small change rewrites a whole page. Used by most relational databases.' },
    { title: 'LSM tree', body: 'Writes go to memory, then flush as immutable sorted files. A background job merges them. Very fast writes, but reads may check several files. Used by Cassandra, RocksDB and many others.' },
    { title: 'Three amplifications', body: 'Write amplification is bytes written per byte stored. Read amplification is work per lookup. Space amplification is disk used per byte of live data. You can\'t minimize all three at once.' },
    { title: 'Compaction', body: 'The price of an LSM. Merge often and reads get fast, but you\'ll rewrite data more. Merge rarely and writes are cheap, but reads and space suffer. It also causes latency spikes if not managed.' },
  ],
  estimator: {
    vars: [
      { key: 'writes', label: 'Writes', unit: 'qps' },
      { key: 'recordBytes', label: 'Bytes per record', unit: 'plain', assume: 100 },
      { key: 'amplification', label: 'Write amplification', unit: 'plain', assume: 10 },
      { key: 'diskRate', label: 'Disk bandwidth per second', unit: 'plain', assume: 500e6 },
      { key: 'userRate', label: 'Data written by users', unit: 'bytesPerSec' },
      { key: 'actualRate', label: 'Actual disk writes', unit: 'bytesPerSec' },
      { key: 'disks', label: 'Disks at full speed', unit: 'count' },
    ],
    eqs: [
      { out: 'userRate', terms: [['writes', 1], ['recordBytes', 1]] },
      { out: 'actualRate', terms: [['userRate', 1], ['amplification', 1]] },
      { out: 'disks', terms: [['actualRate', 1], ['diskRate', -1]] },
    ],
    starts: [
      { key: 'writes', value: 100000 },
      { key: 'disks', value: 4 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'LSM put(key, value):' },
    { code: '  append to the log, then insert into the memtable' },
    { code: '  if memtable is full: write it as a sorted file', id: 'files' },
    { code: '  if too many files: merge them into one', id: 'amp' },
    { code: '' },
    { code: 'LSM get(key):' },
    { code: '  check the memtable, then files, newest first' },
    { code: '  skip any file whose Bloom filter says no', id: 'get' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'B-tree', gain: 'Fast, predictable reads, and no compaction', cost: 'Higher write amplification' },
    { choice: 'LSM tree', gain: 'High write throughput, and good compression', cost: 'Slower reads, and background compaction' },
    { choice: 'Compact more often', gain: 'Faster reads, less space used', cost: 'More write amplification' },
    { choice: 'Bigger memtable', gain: 'Fewer flushes', cost: 'More memory, and longer recovery from a crash' },
  ],
  interview: [
    { q: 'Which would you choose for a write-heavy workload?', a: 'An LSM tree, since it turns random writes into sequential ones. For read-heavy workloads with point lookups and transactions, a B-tree is often simpler and more predictable.' },
    { q: 'Why is sequential writing so much faster?', a: 'Spinning disks avoid seeks, and even SSDs perform better with large sequential writes, while also wearing less. Batching also means fewer write operations overall.' },
    { q: 'What causes latency spikes in an LSM?', a: 'Compaction competes for disk with foreground work. If it falls behind, writes get throttled. Rate limiting compaction, and using leveled compaction, helps a lot.' },
    { q: 'How do range scans differ?', a: 'A B-tree reads adjacent pages directly. An LSM has to merge results across several files. It works, but it\'s more work, which is why scan-heavy workloads often favor B-trees.' },
  ],
  mistakes: [
    'Saying one is simply better, rather than naming the tradeoff.',
    'Forgetting the write-ahead log when counting durability.',
    'Ignoring compaction when estimating disk bandwidth.',
  ],
};

export default topic;
