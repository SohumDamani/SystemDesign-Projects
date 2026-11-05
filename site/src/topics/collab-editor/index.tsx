import { useState } from 'react';
import type { CustomViewProps, Lab, Topic } from '../../core/types';
import { fmtBytes, fmtCount, fmtInt } from '../../core/format';
import source from './engine.ts?raw';
import { CrdtDoc, IndexDoc, type CrdtOp } from './engine';

type Mode = 'crdt' | 'index' | 'last-write';
type P = { mode: Mode; editors: number; typingPerSec: number; latencyMs: number; deleteShare: number };

const DT = 0.1;
const CYCLE = 100; // ticks: people type for part of each cycle, then pause so everything arrives
const TYPING_TICKS = 55;
const OFFLINE_SECONDS = 5;

interface Message {
  to: number;
  at: number;
  op?: CrdtOp;
  index?: number;
  value?: string;
  remove?: boolean;
  doc?: string;
  version?: number;
}

interface S {
  tick: number;
  now: number;
  crdt: CrdtDoc[];
  plain: IndexDoc[];
  whole: { text: string; version: number }[];
  network: Message[];
  typed: number;
  deleted: number;
  offlineUntil: number;
  /** Measured at the end of each pause, when all messages have arrived. */
  converged: boolean | null;
  lost: number;
  checks: number;
  divergedChecks: number;
  nextLetter: number;
  sent: number;
  versionTicks: number;
}

const textOf = (s: S, mode: Mode, i: number) => (mode === 'crdt' ? s.crdt[i].text : mode === 'index' ? s.plain[i].text : s.whole[i].text);

const ALPHABETS = ['abcdefghij', 'KLMNOPQRST', '0123456789', 'uvwxyz!?#&', 'ABCDEFGHIJ'];

function send(s: S, p: P, from: number, message: Omit<Message, 'to' | 'at'>, delay: number) {
  for (let to = 0; to < p.editors; to++) {
    if (to !== from) s.network.push({ ...message, to, at: s.now + delay });
  }
  s.sent++;
}

function typeOnce(s: S, p: P, editor: number, letter: string, position: number) {
  const delay = p.latencyMs / 1000 + Math.max(0, s.offlineUntil - s.now);
  if (p.mode === 'crdt') {
    const doc = s.crdt[editor];
    send(s, p, editor, { op: doc.insert(Math.min(position, doc.text.length), letter) }, delay);
  } else if (p.mode === 'index') {
    const doc = s.plain[editor];
    const at = Math.min(position, doc.text.length);
    doc.insert(at, letter);
    send(s, p, editor, { index: at, value: letter }, delay);
  } else {
    const doc = s.whole[editor];
    const at = Math.min(position, doc.text.length);
    doc.text = doc.text.slice(0, at) + letter + doc.text.slice(at);
    doc.version = s.now + ++s.versionTicks * 1e-7;
    send(s, p, editor, { doc: doc.text, version: doc.version }, delay);
  }
  s.typed++;
}

function deleteOnce(s: S, p: P, editor: number, position: number) {
  const delay = p.latencyMs / 1000 + Math.max(0, s.offlineUntil - s.now);
  if (p.mode === 'crdt') {
    const op = s.crdt[editor].delete(position);
    if (op) {
      send(s, p, editor, { op }, delay);
      s.deleted++;
    }
  } else if (p.mode === 'index') {
    const doc = s.plain[editor];
    if (position < doc.text.length) {
      doc.delete(position);
      send(s, p, editor, { index: position, remove: true }, delay);
      s.deleted++;
    }
  } else {
    const doc = s.whole[editor];
    if (position < doc.text.length) {
      doc.text = doc.text.slice(0, position) + doc.text.slice(position + 1);
      doc.version = s.now + ++s.versionTicks * 1e-7;
      send(s, p, editor, { doc: doc.text, version: doc.version }, delay);
      s.deleted++;
    }
  }
}

function deliver(s: S) {
  s.network = s.network.filter((m) => {
    if (m.at > s.now) return true;
    if (m.op) s.crdt[m.to].integrate(m.op);
    else if (m.doc !== undefined) {
      // Last write wins: whichever version is newer replaces the whole document.
      if ((m.version ?? 0) > s.whole[m.to].version) s.whole[m.to] = { text: m.doc, version: m.version ?? 0 };
    } else if (m.remove) s.plain[m.to].delete(Math.min(m.index ?? 0, Math.max(0, s.plain[m.to].text.length - 1)));
    else s.plain[m.to].apply(m.index ?? 0, m.value ?? '');
    return false;
  });
}

function EditorsView({ state, params, rerender }: CustomViewProps<S, P>) {
  const [text, setText] = useState('hi');
  const add = (editor: number) => {
    for (const ch of text) typeOnce(state, params, editor, ch, Math.floor(textOf(state, params.mode, editor).length / 2));
    rerender();
  };
  return (
    <div className="lab-panel">
      <h4>Each editor's copy. Each person types different letters, so you can see who typed what.</h4>
      <div className="lab-input">
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Text to type" placeholder="Type some text" />
        {Array.from({ length: params.editors }, (_, i) => (
          <button key={i} onClick={() => add(i)}>
            As editor {i + 1}
          </button>
        ))}
      </div>
      <div className="log" style={{ maxHeight: 'none' }}>
        {Array.from({ length: params.editors }, (_, i) => {
          const t = textOf(state, params.mode, i);
          return (
            <div key={i} style={{ overflowWrap: 'anywhere' }}>
              Editor {i + 1}: {t.length > 140 ? `…${t.slice(-140)}` : t || '(empty)'}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'mode', label: 'How edits merge', kind: 'choice', rebuild: true, options: [{ value: 'crdt', label: 'CRDT: characters with IDs' }, { value: 'index', label: 'Send "insert at position N"' }, { value: 'last-write', label: 'Last write wins, whole file' }] },
    { key: 'editors', label: 'People editing', kind: 'range', min: 2, max: 5, step: 1, rebuild: true },
    { key: 'typingPerSec', label: 'Letters per second, per person', kind: 'range', min: 1, max: 20, step: 1 },
    { key: 'latencyMs', label: 'Network delay', kind: 'range', min: 0, max: 2500, step: 50, unit: 'ms' },
    { key: 'deleteShare', label: 'Keystrokes that delete', kind: 'range', min: 0, max: 0.5, step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
  ],
  defaults: { mode: 'crdt', editors: 3, typingPerSec: 3, latencyMs: 500, deleteShare: 0.1 },
  create: (p) => ({
    tick: 0,
    now: 0,
    crdt: Array.from({ length: p.editors }, (_, i) => new CrdtDoc(i + 1)),
    plain: Array.from({ length: p.editors }, () => new IndexDoc()),
    whole: Array.from({ length: p.editors }, () => ({ text: '', version: 0 })),
    network: [],
    typed: 0,
    deleted: 0,
    offlineUntil: 0,
    converged: null,
    lost: 0,
    checks: 0,
    divergedChecks: 0,
    nextLetter: 0,
    sent: 0,
    versionTicks: 0,
  }),
  step(s, p, rng) {
    s.tick++;
    s.now += DT;
    deliver(s);
    const phase = s.tick % CYCLE;
    if (phase > 0 && phase <= TYPING_TICKS) {
      for (let editor = 0; editor < p.editors; editor++) {
        for (let k = rng.poisson(p.typingPerSec * DT); k > 0; k--) {
          const length = textOf(s, p.mode, editor).length;
          const position = rng.int(length + 1);
          if (length && rng.chance(p.deleteShare)) deleteOnce(s, p, editor, Math.min(position, length - 1));
          else {
            const alphabet = ALPHABETS[editor % ALPHABETS.length];
            typeOnce(s, p, editor, alphabet[s.nextLetter++ % alphabet.length], position);
          }
        }
      }
    }
    if (phase === 0 && !s.network.length) {
      const texts = Array.from({ length: p.editors }, (_, i) => textOf(s, p.mode, i));
      s.converged = texts.every((t) => t === texts[0]);
      s.checks++;
      if (!s.converged) s.divergedChecks++;
      const expected = s.typed - s.deleted;
      s.lost = Math.max(0, expected - texts[0].length);
    }
  },
  sample: (s, p) => ({
    length: textOf(s, p.mode, 0).length,
    expected: Math.max(0, s.typed - s.deleted),
    inFlight: s.network.length,
  }),
  charts: [
    { title: 'Letters in the document', series: [{ key: 'length', label: 'Editor 1 has', role: 'measured' }, { key: 'expected', label: 'Should have', role: 'predicted' }] },
    { title: 'Edits still in transit', series: [{ key: 'inFlight', label: 'Measured', role: 'measured' }] },
  ],
  metrics(s, p) {
    const doc = s.crdt[0];
    return [
      { label: 'Copies match', value: s.converged === null ? 'Checked at next pause' : s.converged ? 'Yes' : 'No', role: 'measured', tone: s.converged === null ? undefined : s.converged ? 'good' : 'bad' },
      { label: 'Letters lost', value: fmtInt(s.lost), role: 'measured', tone: s.lost ? 'bad' : 'good' },
      { label: 'Letters typed', value: fmtCount(s.typed), role: 'measured' },
      { label: 'Metadata per letter', value: p.mode === 'crdt' ? '24 bytes' : 'None', role: 'predicted' },
      { label: 'Deleted but kept', value: p.mode === 'crdt' ? fmtInt(doc.tombstones) : '0', role: 'measured' },
    ];
  },
  math(s, p) {
    const concurrent = p.editors * p.typingPerSec * (p.latencyMs / 1000);
    const doc = s.crdt[0];
    return [
      { expr: `Letters typed before others see them: ${p.editors} × ${p.typingPerSec}/s × ${p.latencyMs} ms`, result: `${concurrent.toFixed(1)} at a time`, tone: concurrent > 1 ? 'warn' : 'good' },
      { expr: `CRDT storage: ${fmtInt(doc.chars.length)} characters × (1 + 24 bytes)`, result: fmtBytes(doc.chars.length * 25) },
      { expr: `Messages: each keystroke goes to ${p.editors - 1} others`, result: `${fmtCount(s.sent * (p.editors - 1))} so far` },
    ];
  },
  View: EditorsView,
  actions: [
    {
      key: 'offline',
      label: 'Go offline for 5 s, keep typing',
      run: (s) => {
        s.offlineUntil = s.now + OFFLINE_SECONDS;
      },
    },
  ],
  trace: (s, p) => ({
    values: { len: `${fmtInt(textOf(s, p.mode, 0).length)} letters`, net: `${fmtInt(s.network.length)} in transit`, ok: s.converged === null ? 'not checked yet' : s.converged ? 'all copies match' : 'copies differ' },
  }),
  experiments: [
    {
      title: 'Insert at position N',
      set: { mode: 'index', editors: 3, typingPerSec: 5, latencyMs: 500 },
      ticks: 200,
      question: 'Each edit is sent as "insert this at position N". Others apply it when it arrives. People are typing at the same time. Do all copies end up matching?',
      options: ['Yes', 'No, the copies end up different'],
      answer: 1,
      explain: 'By the time your "position 5" arrives, the other person has already added text before position 5, so it lands in the wrong place. Nothing crashes, yet everyone sees a different document. Fixing this with transforms is called operational transformation.',
      check: (s) => s.divergedChecks > 0,
    },
    {
      title: 'Last write wins',
      set: { mode: 'last-write', editors: 3, typingPerSec: 5, latencyMs: 500, deleteShare: 0 },
      ticks: 200,
      question: 'Instead, send the whole document with a timestamp, and the newest replaces all others. Do copies match? Is anything lost?',
      options: ['They match, and nothing is lost', 'They match, but people\'s letters get lost'],
      answer: 1,
      explain: 'Everyone converges on a single version, but concurrent typing is simply discarded. This is what a simple file sync does, and it\'s fine for whole-file edits that rarely overlap. It\'s useless for a shared document.',
      check: (s) => s.converged === true && s.lost > 5,
    },
    {
      title: 'Give characters identities',
      set: { mode: 'crdt', editors: 3, typingPerSec: 5, latencyMs: 500 },
      ticks: 200,
      question: 'Now every character has a permanent ID, and inserts say "after that character". Concurrent inserts are ordered by ID. Same heavy typing. What happens?',
      options: ['They match, and nothing is lost', 'They still diverge'],
      answer: 0,
      explain: 'Positions change but identities don\'t. "After character 3:17" means the same thing on every replica, and the tie-break is the same everywhere, so arrival order stops mattering. No server has to decide anything.',
      check: (s) => s.converged === true && s.lost === 0 && s.divergedChecks === 0,
    },
    {
      title: 'Work offline',
      set: { mode: 'crdt', editors: 3, typingPerSec: 3, latencyMs: 200 },
      act: ['offline'],
      actAt: 10,
      ticks: 200,
      question: 'Everyone keeps typing, while the network is down for 5 seconds. When it returns, can the copies merge, with no conflict dialog?',
      options: ['Yes, they merge automatically', 'Someone has to choose a version'],
      answer: 0,
      explain: 'Offline work is just very high latency, so CRDTs handle it automatically. This is why they\'re popular for local-first apps. Text from different people can end up interleaved, though. CRDTs guarantee a consistent result, not necessarily a sensible one.',
      check: (s) => s.converged === true && s.lost === 0,
    },
    {
      title: 'The cost of deleting',
      set: { mode: 'crdt', editors: 2, typingPerSec: 8, latencyMs: 100, deleteShare: 0.45 },
      ticks: 300,
      question: 'If half of keystrokes delete, does the data structure shrink?',
      options: ['Yes, deleted letters are removed', 'No, deleted letters are kept as tombstones'],
      answer: 1,
      explain: 'Another replica might still insert "after" a deleted letter, so it can\'t simply disappear. Tombstones and IDs mean a document can take far more memory than its visible text. Real systems compact this history once everyone has seen it.',
      check: (s) => s.crdt[0].tombstones > 20,
    },
  ],
};

const topic: Topic = {
  problem: [
    'A shared document feels simple: people type, and everyone sees it. The problem appears when two people edit at the same moment, each on their own copy. Messages cross on the wire, and each person applies the edits in a different order.',
    'If you\'re careless, copies silently diverge, or someone\'s work disappears. The two established solutions are operational transformation, used by Google Docs, and CRDTs. This lab runs a real sequence CRDT, against the simpler approaches it replaces.',
  ],
  functional: [
    'Several people edit one document at the same time',
    'See each other\'s edits within moments',
    'Keep working offline, and merge afterwards',
  ],
  nonFunctional: [
    'All copies end up identical',
    'Nobody\'s typing is lost',
    'Your own typing feels instant, regardless of network speed',
  ],
  diagram: {
    nodes: [
      { id: 'a', label: 'Editor A', col: 0, row: 0, kind: 'client', note: 'Applies your keystrokes locally right away, then sends them on.' },
      { id: 'b', label: 'Editor B', col: 0, row: 2, kind: 'client', note: 'Might be offline, and sync everything when it returns.' },
      { id: 's', label: 'Collaboration server', col: 1, row: 1, note: 'Relays edits over WebSockets. With OT it also transforms them, while with CRDTs it just passes them on.' },
      { id: 'l', label: 'Operation log', col: 2, row: 1, kind: 'store', note: 'Every edit, in order. It gives you history, and lets people catch up.' },
      { id: 'd', label: 'Snapshots', col: 2, row: 2, kind: 'store', note: 'Periodic full copies, so loading doesn\'t have to replay everything.' },
    ],
    edges: [
      { from: 'a', to: 's', label: 'ops' },
      { from: 'b', to: 's', label: 'ops' },
      { from: 's', to: 'l' },
      { from: 'l', to: 'd', dashed: true },
    ],
  },
  ideas: [
    { title: 'Why positions fail', body: '"Insert at position 5" is only true for the document you were looking at. If someone else has typed before that spot, 5 now means something different, so your edit lands in the wrong place.' },
    { title: 'Operational transformation', body: 'A central server orders all edits, and each is transformed against the ones it didn\'t know about. It\'s well proven in Google Docs, but it needs a server, and getting it right is famously difficult.' },
    { title: 'CRDTs', body: 'Give each character a permanent ID, and refer to IDs rather than positions. Merging becomes automatic and doesn\'t depend on order, so peers and offline editing just work. The cost is memory.' },
    { title: 'Local first', body: 'Apply edits to your own copy immediately, and send them afterwards. Typing feels instant on any network, because the network is never in the way of a keystroke.' },
  ],
  estimator: {
    vars: [
      { key: 'docs', label: 'Documents open at once', unit: 'count' },
      { key: 'editorsPerDoc', label: 'Editors per document', unit: 'plain', assume: 3 },
      { key: 'keystrokes', label: 'Edits per second per editor', unit: 'plain', assume: 2 },
      { key: 'opBytes', label: 'Bytes per edit', unit: 'plain', assume: 50 },
      { key: 'connPerServer', label: 'Connections per server', unit: 'plain', assume: 100000 },
      { key: 'connections', label: 'Connections', unit: 'count' },
      { key: 'editQps', label: 'Edits arriving', unit: 'qps' },
      { key: 'servers', label: 'Collaboration servers', unit: 'count' },
      { key: 'ingest', label: 'Edit bandwidth', unit: 'bytesPerSec' },
    ],
    eqs: [
      { out: 'connections', terms: [['docs', 1], ['editorsPerDoc', 1]] },
      { out: 'editQps', terms: [['connections', 1], ['keystrokes', 1]] },
      { out: 'servers', terms: [['connections', 1], ['connPerServer', -1]] },
      { out: 'ingest', terms: [['editQps', 1], ['opBytes', 1]] },
    ],
    starts: [
      { key: 'docs', value: 1_000_000 },
      { key: 'servers', value: 30 },
      { key: 'editQps', value: 500000 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'on_keystroke(letter):' },
    { code: '  id = (my_site, ++clock)' },
    { code: '  after = ID of the character before the cursor' },
    { code: '  apply locally now, and send to everyone', id: 'len' },
    { code: '' },
    { code: 'on_receive(op):' },
    { code: '  wait until op.after has arrived', id: 'net' },
    { code: '  insert after it, skipping newer IDs at that spot' },
    { code: 'every copy ends up the same', id: 'ok' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Operational transformation', gain: 'Compact, and proven at huge scale', cost: 'Needs a central server, and it\'s hard to get right' },
    { choice: 'CRDT', gain: 'Works offline and peer to peer', cost: 'Metadata and tombstones use lots of memory' },
    { choice: 'Last write wins', gain: 'Trivial', cost: 'Throws away concurrent work' },
    { choice: 'Locking sections', gain: 'No conflicts at all', cost: 'People get blocked from editing' },
  ],
  interview: [
    { q: 'Why does Google Docs use OT and not CRDTs?', a: 'It predates practical CRDTs, and a central server is natural for it. OT also keeps metadata small. Newer tools like Figma, Notion-style editors, and local-first apps often use CRDT-based approaches.' },
    { q: 'How do you show other people\'s cursors?', a: 'Treat them as lightweight, disposable messages that aren\'t saved. Send them through the same connection, and throttle them. A cursor position that\'s lost doesn\'t matter.' },
    { q: 'How do you store history and load documents quickly?', a: 'Keep an operation log, plus periodic snapshots. Loading means reading the latest snapshot and replaying the few operations since. History comes from the log.' },
    { q: 'How do you shrink tombstones?', a: 'Once every replica has seen a delete, the tombstone can be removed safely. It requires knowing what everyone has seen, which is harder when people can be offline for months.' },
  ],
  mistakes: [
    'Sending edits by position, without any transformation.',
    'Waiting for the server before showing a keystroke.',
    'Assuming convergence means the text will read sensibly.',
  ],
};

export default topic;
