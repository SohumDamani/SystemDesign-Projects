import { useState } from 'react';
import type { CustomViewProps, Lab, Topic } from '../../core/types';
import { fmtBytes, fmtCount, fmtInt, fmtPct } from '../../core/format';
import source from './engine.ts?raw';
import { BloomFilter, bestHashCount, falsePositiveRate } from './engine';

type P = { items: number; bitsPerItem: number; hashes: number };

const DT = 0.1;
const FILL_TICKS = 100; // reaches the planned item count after this many ticks
const MAX_FILL = 3; // then keeps going, to show what overfilling does
const BYTES_PER_STORED_ITEM = 50;

interface S {
  filter: BloomFilter;
  next: number;
  checkId: number;
  fpEma: number;
  falsePositives: number;
  checks: number;
  missed: number;
  lastItem: string;
  lastPositions: number[];
  lastAnswer: string;
}

function ToolView({ state, rerender }: CustomViewProps<S, P>) {
  const [text, setText] = useState('hello');
  const [answer, setAnswer] = useState('');
  const check = () => {
    const f = state.filter;
    if (!text.trim()) return setAnswer('Type something first.');
    return setAnswer(f.mightContain(text) ? `"${text}" is probably in the set` : `"${text}" is definitely not in the set`);
  };
  const add = () => {
    if (!text.trim()) return setAnswer('Type something first.');
    state.filter.add(text);
    setAnswer(`Added "${text}"`);
    rerender();
    return undefined;
  };
  const cols = 48;
  const shown = 240;
  const f = state.filter;
  const cells = [];
  for (let i = 0; i < Math.min(shown, f.size); i++) {
    cells.push(<rect key={i} x={(i % cols) * 11} y={Math.floor(i / cols) * 11} width="9.5" height="9.5" rx="1" fill={f.isSet(i) ? 'var(--measured)' : 'var(--line)'} />);
  }
  return (
    <div className="lab-panel">
      <h4>
        Try the real filter. {fmtPct(f.setBits / f.size)} of its {fmtCount(f.size)} bits are set. First {shown} shown.
      </h4>
      <div className="lab-input">
        <input value={text} onChange={(e) => {
            setText(e.target.value);
            setAnswer('');
          }} aria-label="Word to add or check" placeholder="hello" />
        <button onClick={add}>Add</button>
        <button onClick={check}>Check</button>
      </div>
      {answer && <p className="small">{answer}</p>}
      <svg viewBox={`0 0 ${cols * 11} ${Math.ceil(shown / cols) * 11}`} className="lab-svg" style={{ padding: 6 }} role="img" aria-label={`${fmtPct(f.setBits / f.size)} of the filter's bits are set.`}>
        {cells}
      </svg>
    </div>
  );
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'items', label: 'Items you plan to store', kind: 'range', min: 1000, max: 100000, step: 1000, rebuild: true },
    { key: 'bitsPerItem', label: 'Bits per item', kind: 'range', min: 1, max: 24, step: 1, rebuild: true },
    { key: 'hashes', label: 'Hash functions', kind: 'range', min: 1, max: 20, step: 1, rebuild: true },
  ],
  defaults: { items: 20000, bitsPerItem: 10, hashes: 7 },
  create: (p) => ({ filter: new BloomFilter(p.items * p.bitsPerItem, p.hashes), next: 0, checkId: 0, fpEma: 0, falsePositives: 0, checks: 0, missed: 0, lastItem: '', lastPositions: [], lastAnswer: '' }),
  step(s, p, rng) {
    const batch = Math.ceil(p.items / FILL_TICKS);
    if (s.next < p.items * MAX_FILL) {
      for (let i = 0; i < batch; i++) s.filter.add(`user-${s.next++}`);
    }
    let hits = 0;
    const probes = 300;
    for (let i = 0; i < probes; i++) if (s.filter.mightContain(`never-added-${s.checkId++}`)) hits++;
    s.falsePositives += hits;
    s.checks += probes;
    s.fpEma = s.fpEma ? s.fpEma * 0.9 + (hits / probes) * 0.1 : hits / probes;
    // Everything added must always be found. This is the filter's core promise.
    for (let i = 0; i < 50; i++) {
      const id = rng.int(Math.max(1, s.next));
      if (s.next && !s.filter.mightContain(`user-${id}`)) s.missed++;
    }
    s.lastItem = `user-${s.next - 1}`;
    s.lastPositions = s.filter.positions(s.lastItem);
    s.lastAnswer = s.filter.mightContain(`never-added-${s.checkId}`) ? 'probably yes' : 'definitely no';
  },
  sample: (s) => ({ fp: s.fpEma * 100, math: falsePositiveRate(s.filter.size, s.filter.hashes, s.filter.inserted) * 100, fill: (s.filter.setBits / s.filter.size) * 100 }),
  charts: [
    { title: 'False positive rate', unit: '%', series: [{ key: 'fp', label: 'Measured', role: 'measured' }, { key: 'math', label: 'Math', role: 'predicted' }] },
    { title: 'Bits set', unit: '%', series: [{ key: 'fill', label: 'Measured', role: 'measured' }] },
  ],
  metrics(s, p) {
    const fp = falsePositiveRate(s.filter.size, s.filter.hashes, s.filter.inserted);
    return [
      { label: 'False positives', value: fmtPct(fp, 2), role: 'predicted' },
      { label: 'False positives', value: fmtPct(s.fpEma, 2), role: 'measured' },
      { label: 'Missed items', value: fmtInt(s.missed), role: 'measured', tone: s.missed ? 'bad' : 'good' },
      { label: 'Filter size', value: fmtBytes(s.filter.size / 8), role: 'predicted' },
      { label: 'Storing every item', value: fmtBytes(p.items * BYTES_PER_STORED_ITEM), role: 'predicted' },
    ];
  },
  math(s, p) {
    return [
      { expr: `Bits: ${fmtInt(p.items)} items × ${p.bitsPerItem}`, result: fmtBytes(s.filter.size / 8) },
      { expr: `Best number of hashes: ${p.bitsPerItem} × ln 2`, result: String(bestHashCount(p.bitsPerItem)), tone: p.hashes === bestHashCount(p.bitsPerItem) ? 'good' : 'warn' },
      { expr: `False positives: (1 − e^(−${p.hashes} × ${fmtCount(s.filter.inserted)} ÷ ${fmtCount(s.filter.size)}))^${p.hashes}`, result: fmtPct(falsePositiveRate(s.filter.size, s.filter.hashes, s.filter.inserted), 2) },
    ];
  },
  View: ToolView,
  trace: (s) => ({
    values: { item: s.lastItem, pos: s.lastPositions.slice(0, 3).join(', ') + '…', ans: s.lastAnswer },
  }),
  experiments: [
    {
      title: 'A well-sized filter',
      ticks: 100,
      question: 'A filter has 10 bits per item, and 7 hash functions. When it\'s full to its planned size, how often does it wrongly say "probably yes"?',
      options: ['About 1%', 'About 10%', 'About 50%'],
      answer: 0,
      explain: 'About 0.8%, from (1 − e^(−0.7))^7. You get 99% accuracy for just over a byte per item, compared with maybe 50 bytes to store each item. That size difference is why Bloom filters are everywhere.',
      check: (s) => s.fpEma > 0.002 && s.fpEma < 0.018,
    },
    {
      title: 'Too few hashes',
      set: { hashes: 1 },
      ticks: 100,
      question: 'What if you use only one hash function, to save work? Same size filter.',
      options: ['About the same accuracy', 'About 10 times more false positives'],
      answer: 1,
      explain: 'With a single bit per item, one collision is enough to fool it. The rate jumps to about 9.5%. More hashes require more bits to all line up by chance.',
      check: (s) => s.fpEma > 0.06 && s.fpEma < 0.14,
    },
    {
      title: 'Too many hashes',
      set: { hashes: 20 },
      ticks: 100,
      question: 'If more hashes help, what about 20?',
      options: ['Even better', 'Worse than 7'],
      answer: 1,
      explain: 'Each item now sets too many bits, so the array fills up and everything starts to look present. The best count is about bits per item × 0.69. There\'s a real optimum, and the formula tells you where it is.',
      check: (s) => s.fpEma > 0.015,
    },
    {
      title: 'Overfill it',
      ticks: 300,
      question: 'A filter sized for 20,000 items ends up holding 60,000. What happens?',
      options: ['It stops working with an error', 'It quietly gets far less accurate'],
      answer: 1,
      explain: 'Nothing fails. It simply returns "probably yes" for more and more things, here around 40%. You can\'t delete from or grow a plain Bloom filter, so you must plan its size, or rebuild it.',
      check: (s) => s.fpEma > 0.2,
    },
    {
      title: 'Never a false "no"',
      ticks: 200,
      question: 'Can a Bloom filter ever say "definitely not" for something you really added?',
      options: ['Yes, sometimes', 'Never'],
      answer: 1,
      explain: 'Bits only go from 0 to 1, so everything set when you added an item stays set. That one-sided guarantee is the useful property: a "no" lets you skip a slow database or disk read with total confidence.',
      check: (s) => s.missed === 0 && s.next > 0,
    },
  ],
};

const topic: Topic = {
  problem: [
    'Suppose you want to know whether you\'ve seen something before, across billions of items. Keeping them all in memory is too expensive. Asking a database each time is too slow, especially when the answer is usually no.',
    'A Bloom filter is the classic answer. It uses a tiny bit array to give a one-sided answer: "definitely not" or "probably yes". Databases use them to skip disk reads, and crawlers use them to avoid revisiting pages.',
  ],
  functional: [
    'Add items',
    'Ask whether an item might have been added',
    'Never wrongly say an added item is absent',
  ],
  nonFunctional: [
    'Uses a small, fixed amount of memory',
    'Very fast, with constant time per operation',
    'False positive rate is known and tunable',
  ],
  ideas: [
    { title: 'How it works', body: 'Hash an item k times, and set those k bits. To check an item, hash it the same way. If any bit is 0, it was never added. If all are 1, it probably was, or other items set those bits by chance.' },
    { title: 'The math', body: 'The false positive rate is about (1 − e^(−kn/m))^k, for n items in m bits with k hashes. Around 10 bits per item gives 1%, and each extra 5 bits or so gives you another factor of 10.' },
    { title: 'Why "no" is so useful', body: 'Most lookups in an LSM database are for keys not in a given file. A Bloom filter answers those in nanoseconds, so a disk read happens only when it\'s likely to pay off.' },
    { title: 'Variants', body: 'A plain filter can\'t delete, because clearing a bit could affect other items. Counting Bloom filters and cuckoo filters support deletion, using a bit more space.' },
  ],
  estimator: {
    vars: [
      { key: 'items', label: 'Items', unit: 'count' },
      { key: 'bitsPerItem', label: 'Bits per item', unit: 'plain', assume: 10 },
      { key: 'exactBytes', label: 'Bytes to store each item', unit: 'plain', assume: 50 },
      { key: 'filterBytes', label: 'Filter memory', unit: 'bytes' },
      { key: 'exactMemory', label: 'Memory to store them all', unit: 'bytes' },
    ],
    eqs: [
      { out: 'filterBytes', terms: [['items', 1], ['bitsPerItem', 1], [8, -1]] },
      { out: 'exactMemory', terms: [['items', 1], ['exactBytes', 1]] },
    ],
    starts: [
      { key: 'items', value: 1e9 },
      { key: 'filterBytes', value: 1e9 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'add(item):' },
    { code: '  for i in 1..k: set bit hash_i(item) % m', id: 'pos' },
    { code: '' },
    { code: 'might_contain(item):' },
    { code: '  if any of those k bits is 0: definitely no' },
    { code: '  else: probably yes', id: 'ans' },
    { code: 'latest item added', id: 'item' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'More bits per item', gain: 'Fewer false positives', cost: 'More memory' },
    { choice: 'More hash functions', gain: 'Fewer false positives, up to a point', cost: 'More work per operation, and worse past the optimum' },
    { choice: 'Bloom filter over a hash set', gain: 'Tiny and fixed memory', cost: 'False positives, and no deletion or listing' },
    { choice: 'Cuckoo filter', gain: 'Supports deletion, and is often smaller', cost: 'More complex, and inserts can fail when full' },
  ],
  interview: [
    { q: 'Where would you use one?', a: 'Anywhere a "no" saves expensive work: avoiding disk reads for missing keys, avoiding cache lookups for items never cached, checking URLs already crawled, or weak-password checks on the client.' },
    { q: 'What happens as it fills up?', a: 'Accuracy degrades silently. Monitor the share of bits set. When it gets too high, rebuild a larger filter, which is one reason to keep the source data around.' },
    { q: 'How do you support deletes?', a: 'A counting Bloom filter stores small counters rather than bits, so you can decrement. That costs about 4 times the memory, so a cuckoo filter is often a better choice.' },
    { q: 'Could you use one to check that a username is free?', a: 'As a first step, yes. "Definitely not taken" lets you skip the database, while "probably taken" still needs a real check, as false positives would wrongly reject names.' },
  ],
  mistakes: [
    'Using it where false positives have real consequences, with no verification step.',
    'Forgetting you can\'t remove items from a plain filter.',
    'Not planning the size, so it quietly overfills.',
  ],
};

export default topic;
