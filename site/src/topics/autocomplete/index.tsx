import { useState } from 'react';
import type { CustomViewProps, Lab, Topic } from '../../core/types';
import { fmtBytes, fmtCount, fmtInt } from '../../core/format';
import { tailMean } from '../../core/stats';
import source from './engine.ts?raw';
import { Trie, buildQueries, type Mode, type Suggestion } from './engine';

type P = { mode: Mode; k: number; vocabulary: number; refreshSec: number };

const DT = 0.1;
const TREND_TERM = 'world cup final tonight';

interface S {
  now: number;
  trie: Trie;
  queries: Suggestion[];
  pendingTrend: boolean;
  trendInTrie: boolean;
  nextRebuild: number;
  visited: number;
  avgPrefix: number;
  lastPrefix: string;
  lastVisited: number;
  rebuilds: number;
}

function build(queries: Suggestion[], k: number): Trie {
  const trie = new Trie();
  for (const q of queries) trie.insert(q.term, q.freq);
  trie.cacheTopResults(k);
  return trie;
}

function SearchBox({ state, params }: CustomViewProps<S, P>) {
  const [text, setText] = useState('sys');
  const prefix = text.toLowerCase();
  const results = prefix ? state.trie.search(prefix, params.mode, params.k) : { results: [], visited: 0 };
  const cost = (m: Mode) => (prefix ? state.trie.search(prefix, m, params.k).visited : 0);
  return (
    <div className="lab-panel">
      <h4>Type into the real trie</h4>
      <div className="lab-input">
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Search prefix" placeholder="Start typing, like py or sys" />
      </div>
      <div className="ref-grid">
        <div>
          {results.results.length === 0 && <p className="muted small">{prefix ? 'No suggestions for that prefix.' : 'Type something to see suggestions.'}</p>}
          <ol className="small" style={{ margin: 0 }}>
            {results.results.map((r) => (
              <li key={r.term}>{r.term}</li>
            ))}
          </ol>
        </div>
        <div className="bars">
          <p className="small" style={{ margin: 0 }}>
            Work for this prefix:
          </p>
          {(['cached', 'walk', 'scan'] as Mode[]).map((m) => (
            <div className="bar-row" key={m}>
              <span className="bar-label">{m === 'cached' ? 'Cached trie' : m === 'walk' ? 'Plain trie' : 'Table scan'}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.max(2, (cost(m) / Math.max(cost('scan'), cost('walk'), 1)) * 100)}%` }} />
              </div>
              <span className="bar-value">{fmtInt(cost(m))}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'mode', label: 'Search method', kind: 'choice', options: [{ value: 'cached', label: 'Trie with cached top results' }, { value: 'walk', label: 'Trie, searching the subtree' }, { value: 'scan', label: 'Scan the whole table' }] },
    { key: 'k', label: 'Suggestions cached per node', kind: 'range', min: 1, max: 20, step: 1, rebuild: true },
    { key: 'vocabulary', label: 'Distinct queries', kind: 'range', min: 100, max: 1200, step: 100, rebuild: true },
    { key: 'refreshSec', label: 'Trie rebuild interval', kind: 'range', min: 5, max: 120, step: 5, unit: 's', rebuild: true },
  ],
  defaults: { mode: 'cached', k: 5, vocabulary: 1200, refreshSec: 30 },
  create(p, rng) {
    const queries = buildQueries(p.vocabulary, (n) => rng.int(n));
    return { now: 0, trie: build(queries, p.k), queries, pendingTrend: false, trendInTrie: false, nextRebuild: p.refreshSec, visited: 0, avgPrefix: 3, lastPrefix: '', lastVisited: 0, rebuilds: 0 };
  },
  step(s, p, rng) {
    s.now += DT;
    if (s.now >= s.nextRebuild) {
      s.nextRebuild = s.now + p.refreshSec;
      if (s.pendingTrend) {
        s.queries = [...s.queries, { term: TREND_TERM, freq: 5_000_000 }];
        s.pendingTrend = false;
        s.trendInTrie = true;
      }
      s.trie = build(s.queries, p.k);
      s.rebuilds++;
    }
    const query = s.queries[Math.min(s.queries.length - 1, Math.floor(rng.next() ** 3 * s.queries.length))];
    const length = 1 + rng.int(Math.min(6, query.term.length));
    s.lastPrefix = query.term.slice(0, length);
    const res = s.trie.search(s.lastPrefix, p.mode, p.k);
    s.lastVisited = res.visited;
    s.visited = s.visited * 0.9 + res.visited * 0.1;
    s.avgPrefix = s.avgPrefix * 0.9 + length * 0.1;
  },
  sample: (s, p) => ({ visited: s.visited, math: p.mode === 'cached' ? s.avgPrefix + 1 : p.mode === 'scan' ? s.queries.length : s.visited }),
  charts: [{ title: 'Nodes or rows examined per keystroke', series: [{ key: 'visited', label: 'Measured', role: 'measured' }, { key: 'math', label: 'Math', role: 'predicted' }] }],
  metrics(s, p) {
    const visible = s.trie.search('world', 'cached', p.k).results.some((r) => r.term === TREND_TERM);
    return [
      { label: 'Examined per keystroke', value: fmtCount(s.visited), role: 'measured' },
      { label: 'Trie nodes', value: fmtCount(s.trie.nodeCount), role: 'measured' },
      { label: 'Memory for cached results', value: fmtBytes(s.trie.nodeCount * p.k * 8), role: 'predicted' },
      { label: 'Next rebuild in', value: `${Math.max(0, Math.round(s.nextRebuild - s.now))} s` },
      { label: 'Trending term suggested', value: visible ? 'Yes' : s.pendingTrend ? 'Waiting for rebuild' : 'Not trending yet', tone: visible ? 'good' : s.pendingTrend ? 'warn' : undefined },
    ];
  },
  math(s, p) {
    return [
      { expr: `Cached lookup: root + ${s.avgPrefix.toFixed(1)} letters`, result: `${(s.avgPrefix + 1).toFixed(1)} nodes` },
      { expr: `Table scan: every one of ${fmtInt(s.queries.length)} queries`, result: `${fmtInt(s.queries.length)} rows` },
      { expr: `Cache: ${fmtCount(s.trie.nodeCount)} nodes × ${p.k} × 8 bytes`, result: fmtBytes(s.trie.nodeCount * p.k * 8) },
    ];
  },
  View: SearchBox,
  actions: [
    {
      key: 'trend',
      label: 'Make a new query go viral',
      run: (s) => {
        if (!s.trendInTrie) s.pendingTrend = true;
      },
    },
  ],
  trace: (s, p) => ({
    values: { prefix: s.lastPrefix, nodes: fmtInt(s.lastVisited), k: `top ${p.k}` },
    active: ['nodes'],
  }),
  experiments: [
    {
      title: 'The cached lookup',
      set: { mode: 'cached' },
      ticks: 200,
      question: 'Each trie node stores its top 5 suggestions. How much work does a lookup do, with thousands of nodes in the trie?',
      options: ['Only one node per letter typed', 'About half the nodes', 'All of them'],
      answer: 0,
      explain: 'You walk down one node per letter, and the answer is already sitting there. Lookup cost depends on prefix length, not on how many queries exist. Trading memory and rebuild time for this is what makes it fast enough to run on every keystroke.',
      check: (s) => s.lastVisited === s.lastPrefix.length + 1,
    },
    {
      title: 'No cached results',
      set: { mode: 'walk' },
      ticks: 200,
      question: 'Without cached results, the subtree under a prefix has to be searched to find the most popular. How much work is that per keystroke?',
      options: ['About the same', 'Far more, especially for short prefixes'],
      answer: 1,
      explain: 'A one-letter prefix can have most of the trie beneath it, and at tens of thousands of keystrokes per second that\'s not affordable. Short prefixes are also the most common, which makes this worse.',
      check: (_s, _p, h) => tailMean(h, 'visited', 150) > 30,
    },
    {
      title: 'A term goes viral',
      set: { refreshSec: 30 },
      act: ['trend'],
      actAt: 10,
      ticks: 100,
      question: 'A new query goes viral at second 1, and the trie is rebuilt every 30 seconds. Will it be suggested 10 seconds in?',
      options: ['Yes, immediately', 'No, not until the next rebuild'],
      answer: 1,
      explain: 'Reads use a prebuilt trie, so new data has to wait for a rebuild. It\'s the price of fast reads. Real systems rebuild weekly or daily, and handle breaking trends with a small fast-updating layer on top.',
      check: (s, p) => !s.trie.search('world', 'cached', p.k).results.some((r) => r.term === TREND_TERM),
    },
    {
      title: 'Rebuild more often',
      set: { refreshSec: 5 },
      act: ['trend'],
      actAt: 10,
      ticks: 100,
      question: 'Same viral term, but now the trie is rebuilt every 5 seconds. Is it suggested 10 seconds in?',
      options: ['Yes', 'No'],
      answer: 0,
      explain: 'Fresher suggestions, at the cost of rebuilding far more often. The rebuild interval is a direct dial between freshness and compute cost, and rebuilding a real trie for billions of queries is expensive.',
      check: (s, p) => s.trie.search('world', 'cached', p.k).results.some((r) => r.term === TREND_TERM),
    },
  ],
};

const topic: Topic = {
  problem: [
    'As you type into a search box, the top suggestions for what you\'ve typed so far appear. To feel instant, that lookup must finish in around 100 milliseconds, on every keystroke, for huge numbers of users. Any approach that searches the data on each keystroke is too slow.',
    'So the system splits in two. A slow offline pipeline counts queries and builds a data structure. A fast online path only reads the precomputed answers. The lab lets you try the real data structure and see what each choice costs.',
  ],
  functional: [
    'Return the top 5 suggestions for a prefix',
    'Rank by popularity',
    'Update as query patterns change',
  ],
  nonFunctional: [
    'Respond in about 100 ms',
    'Handle very high read rates',
    'Suggestions are relevant, and filter out harmful terms',
  ],
  diagram: {
    nodes: [
      { id: 'u', label: 'Browser', col: 0, row: 0, kind: 'client', note: 'Sends a request per keystroke, debounced, and caches results for a while.' },
      { id: 'a', label: 'Query service', col: 1, row: 0, note: 'Looks up the prefix and returns cached top results.' },
      { id: 'c', label: 'Trie cache', col: 2, row: 0, kind: 'store', note: 'The trie in memory, sharded by prefix, so reads are fast.' },
      { id: 'd', label: 'Trie store', col: 3, row: 0, kind: 'store', note: 'A durable snapshot of the trie, loaded into cache.' },
      { id: 'l', label: 'Query logs', col: 0, row: 1, kind: 'queue', note: 'Every search is logged, often sampled, to count popularity.' },
      { id: 'g', label: 'Aggregators', col: 1, row: 1, note: 'Count query frequency over time, typically in a batch job.' },
      { id: 'w', label: 'Trie builders', col: 2, row: 1, note: 'Rebuild the trie from frequencies, usually weekly or daily.' },
    ],
    edges: [
      { from: 'u', to: 'a' },
      { from: 'a', to: 'c' },
      { from: 'c', to: 'd', dashed: true },
      { from: 'a', to: 'l', dashed: true },
      { from: 'l', to: 'g' },
      { from: 'g', to: 'w' },
      { from: 'w', to: 'd' },
    ],
  },
  ideas: [
    { title: 'Trie', body: 'A tree where each path spells a prefix. Finding a prefix takes one step per letter, regardless of how many queries you have.' },
    { title: 'Cache top K at each node', body: 'Store the top results at every node, so a lookup needs no further search. This uses much more memory but makes reads constant-time.' },
    { title: 'Offline updates', body: 'Rebuild from logs on a schedule rather than updating live. Reads stay simple and fast, at the cost of slightly stale suggestions.' },
    { title: 'Client tricks', body: 'Debounce keystrokes, and let the browser cache results for an hour or so. These two tricks remove a large share of requests before they reach you.' },
  ],
  estimator: {
    vars: [
      { key: 'dau', label: 'Daily active users', unit: 'count' },
      { key: 'searches', label: 'Searches per user per day', unit: 'plain', assume: 10 },
      { key: 'chars', label: 'Characters per search', unit: 'plain', assume: 20 },
      { key: 'peakFactor', label: 'Peak over average', unit: 'plain', assume: 2 },
      { key: 'newShare', label: 'Share of new queries (0 to 1)', unit: 'plain', assume: 0.2 },
      { key: 'queryBytes', label: 'Bytes per query', unit: 'plain', assume: 20 },
      { key: 'avg', label: 'Average lookups', unit: 'qps' },
      { key: 'peak', label: 'Peak lookups', unit: 'qps' },
      { key: 'newDaily', label: 'New data per day', unit: 'bytes' },
    ],
    eqs: [
      { out: 'avg', terms: [['dau', 1], ['searches', 1], ['chars', 1], [86400, -1]] },
      { out: 'peak', terms: [['avg', 1], ['peakFactor', 1]] },
      { out: 'newDaily', terms: [['dau', 1], ['searches', 1], ['queryBytes', 1], ['newShare', 1]] },
    ],
    starts: [
      { key: 'dau', value: 10_000_000 },
      { key: 'peak', value: 50000 },
      { key: 'newDaily', value: 1e9 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'suggest(prefix):' },
    { code: '  node = root', id: 'prefix' },
    { code: '  for each letter in prefix: node = node.child(letter)', id: 'nodes' },
    { code: '  return node.top_results', id: 'k' },
    { code: '' },
    { code: 'rebuild (offline):' },
    { code: '  count query frequency from logs' },
    { code: '  insert each query into a new trie' },
    { code: '  from the leaves up: top = best K of children' },
    { code: '  swap the new trie in' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Cache top K in nodes', gain: 'Constant-time reads', cost: 'Much more memory, and a slower rebuild' },
    { choice: 'Rebuild more often', gain: 'Fresher suggestions', cost: 'More compute' },
    { choice: 'Sample the logs', gain: 'Far less data to process', cost: 'Rare queries are less accurate' },
    { choice: 'Shard by first letter', gain: 'Simple', cost: 'Uneven load, since some letters are far more common' },
  ],
  interview: [
    { q: 'How do you shard when letters aren\'t evenly used?', a: 'Measure traffic per prefix and split shards by load, not alphabetically. A small lookup service maps prefixes to shards, so `s` could get several shards while `x` shares one.' },
    { q: 'How do you remove a harmful suggestion immediately?', a: 'Put a filter layer between the cache and the client that removes blocked terms, and then purge the term properly at the next rebuild.' },
    { q: 'How do you handle other languages?', a: 'Store Unicode in the trie nodes. Separate tries per language or country also make the suggestions much more relevant locally.' },
    { q: 'How would you do real-time trending?', a: 'Reduce batch intervals, weight recent searches more heavily, and keep a small fast-updating layer that you merge with the main trie at read time.' },
  ],
  mistakes: [
    'Running a database query with `LIKE` on each keystroke.',
    'Updating the trie live on each search, which turns reads into writes.',
    'Forgetting that the client can debounce and cache.',
  ],
};

export default topic;
