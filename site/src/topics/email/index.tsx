import { useState } from 'react';
import type { CustomViewProps, Lab, Topic } from '../../core/types';
import { fmtBytes, fmtCount, fmtInt, fmtPct } from '../../core/format';
import { tailMean } from '../../core/stats';
import source from './engine.ts?raw';
import { InvertedIndex, generateMailbox, scan, tokenize, type Mail } from './engine';

type P = { size: number; method: 'index' | 'scan'; order: 'rarest' | 'typed'; words: number; mailsPerSec: number };

const DT = 0.5;
const QUERIES = ['invoice', 'please', 'budget', 'kubernetes', 'alex', 'thanks', 'meeting', 'renewal', 'security', 'update', 'priya', 'audit'];

interface S {
  mails: Mail[];
  index: InvertedIndex;
  nextId: number;
  thread: number;
  comparisons: number;
  ema: number;
  lastQuery: string;
  lastHits: number;
  indexed: number;
  carry: number;
  writeOps: number;
}

function SearchBox({ state, params }: CustomViewProps<S, P>) {
  const [text, setText] = useState('budget report');
  const words = tokenize(text);
  const indexed = words.length ? state.index.search(words, params.order === 'rarest') : { ids: [], comparisons: 0 };
  const scanned = words.length ? scan(state.mails, words) : { ids: [], comparisons: 0 };
  const hits = indexed.ids.slice(0, 5).map((id) => state.mails[id]);
  return (
    <div className="lab-panel">
      <h4>Search this mailbox of {fmtInt(state.mails.length)} messages</h4>
      <div className="lab-input">
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Search terms" placeholder="budget report" />
      </div>
      <p className="small" style={{ marginBottom: 6 }}>
        {fmtInt(indexed.ids.length)} matches. The index did {fmtInt(indexed.comparisons)} comparisons, and a full scan would do {fmtInt(scanned.comparisons)}.
      </p>
      <div className="table-wrap">
        <table>
          <tbody>
            {hits.map((m) => (
              <tr key={m.id}>
                <td>{m.from}</td>
                <td>{m.subject}</td>
                <td>{m.folder}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'size', label: 'Mailbox size', kind: 'range', min: 1000, max: 50000, step: 1000, rebuild: true },
    { key: 'method', label: 'Search method', kind: 'choice', options: [{ value: 'index', label: 'Inverted index' }, { value: 'scan', label: 'Read every message' }] },
    { key: 'order', label: 'Intersect lists', kind: 'choice', options: [{ value: 'rarest', label: 'Rarest word first' }, { value: 'typed', label: 'As typed' }] },
    { key: 'words', label: 'Words per query', kind: 'range', min: 1, max: 3, step: 1 },
    { key: 'mailsPerSec', label: 'New mail arriving', kind: 'range', min: 0, max: 100, step: 5, unit: 'per s' },
  ],
  defaults: { size: 20000, method: 'index', order: 'rarest', words: 2, mailsPerSec: 10 },
  create(p, rng) {
    const mails = generateMailbox(p.size, rng);
    const index = new InvertedIndex();
    let writeOps = 0;
    for (const m of mails) writeOps += index.add(m);
    return { mails, index, nextId: p.size, thread: 0, comparisons: 0, ema: 0, lastQuery: '', lastHits: 0, indexed: mails.length, carry: 0, writeOps };
  },
  step(s, p, rng) {
    s.carry += p.mailsPerSec * DT;
    const fresh = Math.floor(s.carry);
    s.carry -= fresh;
    if (fresh) {
      const batch = generateMailbox(fresh, rng).map((m, i) => ({ ...m, id: s.nextId + i }));
      for (const m of batch) {
        s.mails.push(m);
        s.writeOps += s.index.add(m);
      }
      s.nextId += fresh;
    }
    const words = Array.from({ length: p.words }, () => QUERIES[rng.int(QUERIES.length)]);
    s.lastQuery = words.join(' ');
    const res = p.method === 'scan' ? scan(s.mails, words) : s.index.search(words, p.order === 'rarest');
    s.lastHits = res.ids.length;
    s.comparisons = res.comparisons;
    s.ema = s.ema ? s.ema * 0.85 + res.comparisons * 0.15 : res.comparisons;
  },
  sample: (s) => ({ work: s.ema, all: s.mails.length }),
  charts: [{ title: 'Work per search', series: [{ key: 'work', label: 'Measured', role: 'measured' }, { key: 'all', label: 'Full scan', role: 'predicted' }] }],
  metrics(s) {
    const avgWords = s.index.entries / s.mails.length;
    return [
      { label: 'Work compared to a scan', value: fmtPct(s.ema / s.mails.length, 1), role: 'measured' },
      { label: 'Index entries', value: fmtCount(s.index.entries), role: 'measured' },
      { label: 'Distinct words', value: fmtCount(s.index.terms), role: 'measured' },
      { label: 'Index writes per mail', value: avgWords.toFixed(1), role: 'measured' },
      { label: 'Index size', value: fmtBytes(s.index.entries * 8), role: 'predicted' },
    ];
  },
  math(s) {
    return [
      { expr: `Full scan: all ${fmtInt(s.mails.length)} messages`, result: `${fmtInt(s.mails.length)} reads` },
      { expr: `Index for "${s.lastQuery}"`, result: `${fmtInt(s.comparisons)} comparisons` },
      { expr: `Each new mail adds ${(s.index.entries / s.mails.length).toFixed(1)} index entries`, result: 'writes get slower' },
    ];
  },
  View: SearchBox,
  views(s) {
    const freq = QUERIES.slice(0, 6).map((q) => ({ label: q, value: s.index.frequency(q) }));
    return [{ kind: 'bars', title: 'How common each word is, in messages', items: freq }];
  },
  trace: (s) => ({
    values: { q: s.lastQuery, cmp: fmtInt(s.comparisons), hits: fmtInt(s.lastHits) },
  }),
  experiments: [
    {
      title: 'Index or scan',
      set: { method: 'index', size: 20000, words: 2, mailsPerSec: 0 },
      ticks: 80,
      question: 'A search for two words over 20,000 messages, using an inverted index. How much work is it compared with reading every message?',
      options: ['About the same', 'Far less'],
      answer: 1,
      explain: 'The index jumps straight to messages containing each word, and intersects those lists. Only they are examined. The less common the word, the bigger the saving.',
      check: (_s, _p, h) => tailMean(h, 'work', 60) < 12000,
    },
    {
      title: 'Which word first?',
      set: { method: 'index', order: 'rarest', words: 3, size: 20000, mailsPerSec: 0 },
      ticks: 80,
      question: 'Your query has a common word and a rare one. Why start intersecting with the rarest list?',
      options: ['It doesn\'t matter', 'The result can\'t exceed the shortest list, so later steps have less to do'],
      answer: 1,
      explain: 'The answer can be no longer than the shortest list. Starting there makes every later step cheaper. Real search engines do this constantly, using stored word frequencies.',
      check: (s) => {
        const a = s.index.search(['please', 'budget', 'renewal'], true).comparisons;
        const b = s.index.search(['please', 'budget', 'renewal'], false).comparisons;
        return a <= b;
      },
    },
    {
      title: 'What indexing costs',
      set: { method: 'index', mailsPerSec: 50, size: 10000 },
      ticks: 40,
      question: 'What does an inverted index cost when new mail arrives?',
      options: ['Nothing, it\'s free', 'Each mail adds many index entries, one per distinct word', 'It must be fully rebuilt per mail'],
      answer: 1,
      explain: 'One email becomes roughly one write per distinct word. This write amplification is why indexing typically runs asynchronously, with new messages taking a moment to become searchable.',
      check: (s) => s.index.entries / s.mails.length > 4,
    },
  ],
};

const topic: Topic = {
  problem: [
    'An email service moves messages between you and the rest of the world over old, loosely reliable protocols, and keeps them for years. The hard parts are the sheer volume of data, delivering reliably when other mail servers fail or refuse you, and making years of mail searchable instantly.',
    'Search is an interesting case because each person\'s mailbox is mostly independent. You don\'t need one global index, and you can keep users\' data separate. The lab runs a real inverted index, the structure behind nearly all text search.',
  ],
  functional: [
    'Send and receive email',
    'Read mail organized in folders and threads',
    'Search within your own mail, and filter spam and viruses',
  ],
  nonFunctional: [
    'Never lose a message',
    'Available even when parts of the system fail',
    'Scales to billions of users, and years of retention',
  ],
  diagram: {
    nodes: [
      { id: 'a', label: 'Webmail client', col: 0, row: 0, kind: 'client', note: 'Talks over HTTP, with a WebSocket pushing new mail.' },
      { id: 'w', label: 'Web servers', col: 1, row: 0, note: 'Stateless. They handle API requests for reading and sending.' },
      { id: 'q', label: 'Outgoing queue', col: 2, row: 0, kind: 'queue', note: 'Validates and queues mail, then retries if the receiver is unavailable.' },
      { id: 's', label: 'SMTP workers', col: 3, row: 0, note: 'Send mail to other servers, with careful rate limits to protect your reputation.' },
      { id: 'x', label: 'Other mail servers', col: 3, row: 1, kind: 'external', note: 'Outside your control. They can reject or slow you down at any time.' },
      { id: 'm', label: 'Metadata store', col: 1, row: 1, kind: 'store', note: 'Partitioned by user. Reads are mostly recent, so most data is cold.' },
      { id: 'b', label: 'Attachment store', col: 2, row: 1, kind: 'store', note: 'Blob storage for attachments, separate from metadata.' },
      { id: 'i', label: 'Search index', col: 0, row: 1, kind: 'store', note: 'An inverted index per user, kept up to date from a stream of new mail.' },
    ],
    edges: [
      { from: 'a', to: 'w' },
      { from: 'w', to: 'q' },
      { from: 'q', to: 's' },
      { from: 's', to: 'x' },
      { from: 'w', to: 'm' },
      { from: 'w', to: 'b' },
      { from: 'm', to: 'i', dashed: true },
    ],
  },
  ideas: [
    { title: 'Inverted index', body: 'For each word, store a sorted list of messages containing it. A search intersects those lists, which is far faster than reading each message, and costs extra writes on new mail.' },
    { title: 'Partition by user', body: 'Almost every query is about one person\'s mail, so partition data by user ID. Each user\'s data stays together, and the system scales simply as users grow.' },
    { title: 'Delivery reliability', body: 'Mail is queued and retried, with increasing delays, for days. Senders also need a good reputation, using SPF, DKIM and DMARC, plus careful warming up of new IP addresses.' },
    { title: 'Threads', body: 'Message headers like `In-Reply-To` and `References` link replies together. Storing a thread ID at write time means reading a conversation doesn\'t require searching for it.' },
  ],
  estimator: {
    vars: [
      { key: 'users', label: 'Users', unit: 'count' },
      { key: 'sent', label: 'Mails sent per user per day', unit: 'plain', assume: 10 },
      { key: 'received', label: 'Mails received per user per day', unit: 'plain', assume: 40 },
      { key: 'metaBytes', label: 'Metadata bytes per mail', unit: 'plain', assume: 50000 },
      { key: 'attachShare', label: 'Share with attachments (0 to 1)', unit: 'plain', assume: 0.2 },
      { key: 'attachBytes', label: 'Bytes per attachment', unit: 'plain', assume: 500000 },
      { key: 'years', label: 'Years to keep', unit: 'plain', assume: 1 },
      { key: 'sendQps', label: 'Send rate', unit: 'qps' },
      { key: 'metaStorage', label: 'Metadata storage', unit: 'bytes' },
      { key: 'attachStorage', label: 'Attachment storage', unit: 'bytes' },
    ],
    eqs: [
      { out: 'sendQps', terms: [['users', 1], ['sent', 1], [86400, -1]] },
      { out: 'metaStorage', terms: [['users', 1], ['received', 1], ['metaBytes', 1], [365, 1], ['years', 1]] },
      { out: 'attachStorage', terms: [['users', 1], ['received', 1], ['attachShare', 1], ['attachBytes', 1], [365, 1], ['years', 1]] },
    ],
    starts: [
      { key: 'users', value: 1e9 },
      { key: 'sendQps', value: 100000 },
      { key: 'metaStorage', value: 700e15 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'on_new_mail(mail):' },
    { code: '  for each distinct word: postings[word].add(mail.id)' },
    { code: '' },
    { code: 'search(words):' },
    { code: '  query terms', id: 'q' },
    { code: '  lists = postings for each word, shortest first' },
    { code: '  result = intersect the lists', id: 'cmp' },
    { code: '  return matching mails', id: 'hits' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Search engine such as Elasticsearch', gain: 'Powerful and quick to adopt', cost: 'Another big system, and syncing data to it' },
    { choice: 'Custom search', gain: 'Fits email precisely, and saves money at huge scale', cost: 'Big engineering investment' },
    { choice: 'Sync indexing', gain: 'New mail is searchable at once', cost: 'Slower writes' },
    { choice: 'Key-value metadata', gain: 'Scales by user easily', cost: 'Harder to query across folders and threads' },
  ],
  interview: [
    { q: 'Why not use a relational database?', a: 'Mail bodies are large and a user can have millions of messages. Relational databases struggle at that scale. Custom key-value or wide-column stores partitioned by user are the common choice.' },
    { q: 'What\'s the hard part of consistency?', a: 'A message must never be lost or shown in two conflicting states. Mailboxes usually choose consistency over availability: if the primary replica for a mailbox is down, that user waits, rather than risk divergence.' },
    { q: 'How do you avoid being marked as spam?', a: 'Authenticate mail with SPF, DKIM and DMARC, warm up new IP addresses gradually, separate promotional from transactional mail, and remove addresses that bounce.' },
    { q: 'How do you handle huge attachments?', a: 'Store attachments in blob storage, referenced from metadata, and dedupe by hash. Beyond a size limit, most providers send a download link instead.' },
  ],
  mistakes: [
    'Storing attachments in the metadata database.',
    'Building one global search index, when each user\'s mail is independent.',
    'Assuming the receiving mail server is always available.',
  ],
};

export default topic;
