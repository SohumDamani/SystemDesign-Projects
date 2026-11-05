import type { Lab, Topic } from '../../core/types';
import { fmtBytes, fmtInt, fmtPct } from '../../core/format';
import source from './engine.ts?raw';
import { BlockStore, contentDefinedChunks, fixedChunks, insert, overwrite, randomFile, removeBytes, type Block } from './engine';

type P = { fileKb: number; blockKb: number; chunking: 'fixed' | 'content'; editType: 'overwrite' | 'insert'; editBytes: number; collaborators: number; editsPerMin: number; syncDelay: number };

const DT = 0.5;
const EDIT_EVERY = 8; // ticks

interface S {
  now: number;
  data: Uint8Array;
  store: BlockStore;
  blocks: Block[];
  fresh: Set<string>;
  edits: number;
  uploadedTotal: number;
  lastUpload: number;
  shareNow: number;
  shareSum: number;
  commits: number;
  conflicts: number;
  lastCommit: number;
}

const chunk = (data: Uint8Array, p: P) => (p.chunking === 'fixed' ? fixedChunks(data, p.blockKb * 1024) : contentDefinedChunks(data, p.blockKb * 1024));
const avgShare = (s: S) => (s.edits ? s.shareSum / s.edits : 0);

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'fileKb', label: 'File size', kind: 'range', min: 256, max: 8192, step: 256, rebuild: true, format: (v) => fmtBytes(v * 1024) },
    { key: 'blockKb', label: 'Block size', kind: 'range', min: 4, max: 1024, step: 4, rebuild: true, format: (v) => fmtBytes(v * 1024) },
    { key: 'chunking', label: 'How to split the file', kind: 'choice', rebuild: true, options: [{ value: 'fixed', label: 'Fixed-size blocks' }, { value: 'content', label: 'Content-defined blocks' }] },
    { key: 'editType', label: 'Type of edit', kind: 'choice', options: [{ value: 'overwrite', label: 'Overwrite bytes in place' }, { value: 'insert', label: 'Insert bytes' }] },
    { key: 'editBytes', label: 'Edit size', kind: 'range', min: 16, max: 65536, step: 16, format: (v) => fmtBytes(v) },
    { key: 'collaborators', label: 'People editing', kind: 'range', min: 1, max: 8, step: 1 },
    { key: 'editsPerMin', label: 'Edits per person per minute', kind: 'range', min: 1, max: 30, step: 1 },
    { key: 'syncDelay', label: 'Sync delay', kind: 'range', min: 0.5, max: 30, step: 0.5, unit: 's' },
  ],
  defaults: { fileKb: 2048, blockKb: 64, chunking: 'fixed', editType: 'overwrite', editBytes: 1024, collaborators: 2, editsPerMin: 4, syncDelay: 2 },
  create(p, rng) {
    const data = randomFile(p.fileKb * 1024, rng);
    const store = new BlockStore();
    const blocks = chunk(data, p);
    store.sync(blocks);
    return { now: 0, data, store, blocks, fresh: new Set(), edits: 0, uploadedTotal: 0, lastUpload: 0, shareNow: 0, shareSum: 0, commits: 0, conflicts: 0, lastCommit: -100 };
  },
  step(s, p, rng) {
    s.now += DT;
    if (Math.round(s.now / DT) % EDIT_EVERY === 0) {
      const at = rng.int(Math.max(1, s.data.length - p.editBytes));
      let next = p.editType === 'overwrite' ? overwrite(s.data, at, p.editBytes, rng) : insert(s.data, at, p.editBytes, rng);
      // Keep the file from growing without limit during long runs.
      if (next.length > p.fileKb * 1024 * 1.2) next = removeBytes(next, next.length - p.fileKb * 1024);
      s.data = next;
      s.blocks = chunk(s.data, p);
      const { uploaded, newBlocks } = s.store.sync(s.blocks);
      s.fresh = newBlocks;
      s.lastUpload = uploaded;
      s.uploadedTotal += uploaded;
      s.shareNow = uploaded / s.data.length;
      s.shareSum += s.shareNow;
      s.edits++;
    }
    // Two people conflict when one saves before seeing the other's last save.
    for (let c = rng.poisson((p.collaborators * p.editsPerMin * DT) / 60); c > 0; c--) {
      if (p.collaborators > 1 && s.now - s.lastCommit < p.syncDelay) s.conflicts++;
      s.commits++;
      s.lastCommit = s.now;
    }
  },
  sample: (s, p) => {
    const rate = ((p.collaborators - 1) * p.editsPerMin) / 60;
    return { upload: s.lastUpload / 1024, whole: s.data.length / 1024, conflict: s.commits ? (s.conflicts / s.commits) * 100 : 0, conflictMath: (1 - Math.exp(-(rate + p.editsPerMin / 60) * p.syncDelay)) * 100 };
  },
  charts: [
    { title: 'Uploaded by the latest edit', unit: 'KB', series: [{ key: 'upload', label: 'Measured', role: 'measured' }, { key: 'whole', label: 'Whole file', role: 'other' }] },
    { title: 'Saves that create a conflict', unit: '%', series: [{ key: 'conflict', label: 'Measured', role: 'measured' }, { key: 'conflictMath', label: 'Math', role: 'predicted' }] },
  ],
  metrics(s, p) {
    const blockBytes = p.blockKb * 1024;
    const expected = p.editType === 'overwrite' || p.chunking === 'content' ? Math.min(s.data.length, (Math.ceil(p.editBytes / blockBytes) + 1) * blockBytes) : s.data.length / 2;
    return [
      { label: 'Upload per edit', value: fmtBytes(expected), role: 'predicted' },
      { label: 'Latest upload', value: fmtBytes(s.lastUpload), role: 'measured' },
      { label: 'Share of file re-sent', value: fmtPct(avgShare(s), 1), role: 'measured' },
      { label: 'Blocks in the file', value: fmtInt(s.blocks.length), role: 'measured' },
      { label: 'Conflicts', value: fmtInt(s.conflicts), role: 'measured', tone: s.conflicts ? 'warn' : undefined },
    ];
  },
  math(s, p) {
    const blockBytes = p.blockKb * 1024;
    const others = ((p.collaborators) * p.editsPerMin) / 60;
    return [
      { expr: `Blocks: ${fmtBytes(s.data.length)} ÷ ${fmtBytes(blockBytes)}`, result: fmtInt(s.data.length / blockBytes) },
      { expr: p.editType === 'insert' && p.chunking === 'fixed' ? 'An insert shifts every block after it' : `Edit touches ${Math.ceil(p.editBytes / blockBytes)} to ${Math.ceil(p.editBytes / blockBytes) + 1} blocks`, result: p.editType === 'insert' && p.chunking === 'fixed' ? 'half the file on average' : fmtBytes((Math.ceil(p.editBytes / blockBytes) + 1) * blockBytes), tone: p.editType === 'insert' && p.chunking === 'fixed' ? 'bad' : 'good' },
      { expr: `Conflict chance: 1 − e^(−${others.toFixed(2)} saves/s × ${p.syncDelay} s)`, result: fmtPct(1 - Math.exp(-others * p.syncDelay)) },
    ];
  },
  views: (s) => [
    {
      kind: 'cells',
      title: `First blocks of the file: orange ones were uploaded by the last edit`,
      items: s.blocks.slice(0, 32).map((b, i) => ({ label: `#${i + 1}`, value: fmtBytes(b.length), tone: s.fresh.has(b.hash) ? 'warn' : 'neutral' })),
    },
  ],
  trace: (s) => ({
    values: { blocks: fmtInt(s.blocks.length), upload: fmtBytes(s.lastUpload), kept: fmtInt(s.blocks.length - s.fresh.size), conflicts: fmtInt(s.conflicts) },
  }),
  experiments: [
    {
      title: 'A small edit',
      set: { chunking: 'fixed', editType: 'overwrite', blockKb: 64, fileKb: 2048, editBytes: 1024 },
      ticks: 160,
      question: 'You change 1 KB in the middle of a 2 MB file, split into 64 KB blocks. How much actually uploads?',
      options: ['Just 1 KB', 'About 64 KB', 'The whole 2 MB'],
      answer: 1,
      explain: 'Only the blocks containing the change have new hashes, so only those upload. That\'s one block, or occasionally two. It\'s about 3% of the file, and that\'s the whole reason for block-level sync.',
      check: (s) => avgShare(s) < 0.07,
    },
    {
      title: 'Insert some bytes',
      set: { chunking: 'fixed', editType: 'insert', blockKb: 64, fileKb: 2048, editBytes: 100 },
      ticks: 160,
      question: 'Now you insert 100 bytes instead of overwriting. With fixed-size blocks, how much uploads?',
      options: ['About 64 KB, like before', 'A large part of the file'],
      answer: 1,
      explain: 'Inserting shifts every later byte, so every later block now contains different bytes and has a new hash. On average, half the file re-uploads for a 100-byte change. Fixed-size blocks are fragile in exactly this way.',
      check: (s) => avgShare(s) > 0.25,
    },
    {
      title: 'Cut by content',
      set: { chunking: 'content', editType: 'insert', blockKb: 64, fileKb: 2048, editBytes: 100 },
      ticks: 160,
      question: 'Same insert, but block boundaries now depend on the content rather than position. How much uploads?',
      options: ['A block or two', 'Half the file', 'The whole file'],
      answer: 0,
      explain: 'After the insert, the rolling hash soon finds the same cut points as before, so later blocks come out identical. Only the blocks around the change differ. It costs more CPU, but rsync, backup tools and dedup systems all rely on the idea.',
      check: (s) => avgShare(s) < 0.1,
    },
    {
      title: 'Edit at the same time',
      set: { collaborators: 5, editsPerMin: 12, syncDelay: 5 },
      ticks: 800,
      question: 'Five people each save 12 times a minute, and sync takes 5 seconds. How often does a save conflict with one the person hadn\'t seen yet?',
      options: ['Rarely, under 5%', 'About half the time', 'Nearly always'],
      answer: 2,
      explain: 'That\'s one save per second across the group, so within any 5-second window another save almost always lands: 1 − e^(−5) ≈ 99%. Whole-file sync with first-write-wins suits occasional edits. Real-time collaboration needs operational transforms or CRDTs.',
      check: (s) => s.commits > 50 && s.conflicts / s.commits > 0.8,
    },
  ],
};

const topic: Topic = {
  problem: [
    'A cloud drive keeps your files in sync across devices and lets you share them. The hard requirement is that it can never lose or corrupt a file. People will forgive a slow sync, but they won\'t forgive a missing document.',
    'The clever part is what uploads. Sending a whole file for each small edit wastes huge amounts of bandwidth and storage. By splitting files into blocks and identifying each by a hash, you upload only what changed, and store identical blocks just once.',
  ],
  functional: [
    'Upload and download files',
    'Sync across devices',
    'See version history, and share with others',
  ],
  nonFunctional: [
    'Never lose data',
    'Fast sync, with minimal bandwidth',
    'Scales to huge storage, with reasonable cost',
  ],
  diagram: {
    nodes: [
      { id: 'c', label: 'Client', col: 0, row: 1, kind: 'client', note: 'Watches for changes, splits files into blocks, and hashes them.' },
      { id: 'b', label: 'Block servers', col: 1, row: 0, note: 'Receive new blocks, then compress and encrypt them before storing.' },
      { id: 's', label: 'Cloud storage', col: 2, row: 0, kind: 'store', note: 'Holds blocks by hash, replicated for durability, and moved to cold storage if unused.' },
      { id: 'a', label: 'API servers', col: 1, row: 1, note: 'Handle file metadata, sharing and permissions.' },
      { id: 'm', label: 'Metadata database', col: 2, row: 1, kind: 'store', note: 'Maps a file version to its list of block hashes. Needs strong consistency.' },
      { id: 'n', label: 'Notification service', col: 1, row: 2, note: 'Holds long polls open, so other devices hear about changes quickly.' },
      { id: 'q', label: 'Offline queue', col: 2, row: 2, kind: 'queue', note: 'Keeps changes for devices that are offline, until they come back.' },
    ],
    edges: [
      { from: 'c', to: 'b', label: 'new blocks' },
      { from: 'b', to: 's' },
      { from: 'c', to: 'a' },
      { from: 'a', to: 'm' },
      { from: 'a', to: 'n' },
      { from: 'n', to: 'c', dashed: true, label: 'long poll' },
      { from: 'n', to: 'q' },
    ],
  },
  ideas: [
    { title: 'Blocks and hashes', body: 'Split files into blocks and name each by a hash of its contents. A file version is just a list of hashes, so the client needs to upload only unknown blocks.' },
    { title: 'Deduplication', body: 'Identical blocks are stored once, even across users. It\'s a big saving for common files. You also get version history cheaply, since new versions share most of their blocks.' },
    { title: 'Metadata needs strong consistency', body: 'Blob storage can be eventually consistent, but the metadata can\'t. Two devices must never disagree on which blocks make up a file, so a relational database with ACID transactions fits well.' },
    { title: 'Conflicts', body: 'With two offline edits to the same file, the first to sync wins, and the other gets saved as a conflict copy. You keep both, and let the user sort it out.' },
  ],
  estimator: {
    vars: [
      { key: 'users', label: 'Registered users', unit: 'count' },
      { key: 'dauShare', label: 'Daily active share (0 to 1)', unit: 'plain', assume: 0.2 },
      { key: 'filesPerDay', label: 'Uploads per active user per day', unit: 'plain', assume: 2 },
      { key: 'fileBytes', label: 'Bytes per file', unit: 'plain', assume: 500000 },
      { key: 'quota', label: 'Average bytes used per user', unit: 'plain', assume: 2e9 },
      { key: 'dau', label: 'Daily active users', unit: 'count' },
      { key: 'uploadQps', label: 'Upload rate', unit: 'qps' },
      { key: 'dailyBytes', label: 'New data per day', unit: 'bytes' },
      { key: 'totalBytes', label: 'Total storage', unit: 'bytes' },
    ],
    eqs: [
      { out: 'dau', terms: [['users', 1], ['dauShare', 1]] },
      { out: 'uploadQps', terms: [['dau', 1], ['filesPerDay', 1], [86400, -1]] },
      { out: 'dailyBytes', terms: [['dau', 1], ['filesPerDay', 1], ['fileBytes', 1]] },
      { out: 'totalBytes', terms: [['users', 1], ['quota', 1]] },
    ],
    starts: [
      { key: 'users', value: 50_000_000 },
      { key: 'totalBytes', value: 500e15 },
      { key: 'uploadQps', value: 240 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'on_file_changed(file):' },
    { code: '  blocks = split file into chunks', id: 'blocks' },
    { code: '  for each block: hash = sha256(block)' },
    { code: '  ask server which hashes it doesn\'t have' },
    { code: '  upload only those blocks', id: 'upload' },
    { code: '  blocks reused without uploading', id: 'kept' },
    { code: '  commit new version = list of hashes' },
    { code: '  if base version is stale: save as conflict copy', id: 'conflicts' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Small blocks', gain: 'Less re-upload per edit, and better dedup', cost: 'More hashes and metadata, and more requests' },
    { choice: 'Content-defined blocks', gain: 'Resists inserts', cost: 'More CPU, and variable block sizes' },
    { choice: 'Cold storage for old blocks', gain: 'Much lower cost', cost: 'Slow retrieval' },
    { choice: 'Long polling', gain: 'Simple and enough for sync', cost: 'Less immediate than a WebSocket' },
  ],
  interview: [
    { q: 'Why are uploads separate from metadata?', a: 'They have very different needs. Blocks are large, slow and can go straight to storage, while metadata is small and needs strong consistency. Separating them lets each scale independently.' },
    { q: 'How do you avoid losing data?', a: 'Replicate across regions, store checksums and verify on read, keep old versions, and only commit metadata after every block is safely stored.' },
    { q: 'How do you save storage cost?', a: 'Dedup blocks, limit versions kept per file, move inactive data to cold storage, and compress. Don\'t compress blocks that are already compressed, like video.' },
    { q: 'How is real-time collaborative editing different?', a: 'Syncing whole-file versions isn\'t enough. Google Docs-style editing sends individual operations and merges them with operational transforms or CRDTs, which is a different system.' },
  ],
  mistakes: [
    'Uploading whole files each time.',
    'Using eventually consistent storage for metadata.',
    'Silently overwriting one user\'s edits on conflict.',
  ],
};

export default topic;
