import { useState } from 'react';
import type { CustomViewProps, Lab, Topic } from '../../core/types';
import { fmtCount, fmtInt, fmtPct } from '../../core/format';
import { zipfSampler } from '../../core/rng';
import { tailMean, zipfTopShare } from '../../core/stats';
import source from './engine.ts?raw';
import { LruCache, Shortener, type Method, type Shortened } from './engine';

type P = { method: Method; length: number; writesPerSec: number; readsPerWrite: number; cacheSize: number };

const DT = 0.1;
const CATALOG_SIZE = 10000;
const ZIPF_S = 1;

interface S {
  store: Shortener;
  cache: LruCache;
  zipf: ReturnType<typeof zipfSampler>;
  written: number;
  expectedCollisions: number;
  carry: number;
  hitRate: number;
  dbReads: number;
  mine: Shortened[];
  last?: Shortened;
}

function ShortenTool({ state, params, rerender }: CustomViewProps<S, P>) {
  const [url, setUrl] = useState('https://example.com/a/very/long/path?with=parameters');
  const [error, setError] = useState('');
  const [resolved, setResolved] = useState('');

  const submit = () => {
    const clean = url.trim();
    if (!/^https?:\/\/\S+\.\S+/.test(clean)) {
      setError('Enter a full URL, like https://example.com/page.');
      return;
    }
    setError('');
    const out = state.store.shorten(clean, params.method, params.length);
    state.last = out;
    state.mine = [out, ...state.mine.filter((m) => m.code !== out.code)].slice(0, 4);
    setResolved('');
    rerender();
  };

  return (
    <div className="lab-panel">
      <h4>Shorten a real URL</h4>
      <div className="lab-input">
        <input value={url} onChange={(e) => setUrl(e.target.value)} aria-label="URL to shorten" aria-invalid={Boolean(error)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <button onClick={submit}>Shorten</button>
      </div>
      {error && <p className="field-error">{error}</p>}
      {state.mine.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Short code</th>
                <th>Collisions</th>
                <th>Look it up</th>
              </tr>
            </thead>
            <tbody>
              {state.mine.map((m) => (
                <tr key={m.code}>
                  <td>
                    <code>sho.rt/{m.code}</code>
                  </td>
                  <td>{m.collisions}</td>
                  <td>
                    <button onClick={() => setResolved(`${m.code} redirects to ${state.store.resolve(m.code)}`)}>Resolve</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {resolved && (
        <p className="small" style={{ marginTop: 8, overflowWrap: 'anywhere' }}>
          {resolved}
        </p>
      )}
    </div>
  );
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'method', label: 'Code generation', kind: 'choice', rebuild: true, options: [{ value: 'hash', label: 'Hash, then retry on collision' }, { value: 'counter', label: 'Base62 of a unique ID' }] },
    { key: 'length', label: 'Hash code length', kind: 'range', min: 3, max: 7, step: 1, rebuild: true, unit: 'chars' },
    { key: 'writesPerSec', label: 'New URLs', kind: 'range', min: 0, max: 2000, step: 10, unit: 'per s' },
    { key: 'readsPerWrite', label: 'Reads per write', kind: 'range', min: 1, max: 200, step: 1 },
    { key: 'cacheSize', label: 'Cache size', kind: 'range', min: 100, max: 8000, step: 100, unit: 'URLs', rebuild: true },
  ],
  defaults: { method: 'hash', length: 3, writesPerSec: 500, readsPerWrite: 10, cacheSize: 2000 },
  create: (p) => ({ store: new Shortener(), cache: new LruCache(p.cacheSize), zipf: zipfSampler(CATALOG_SIZE, ZIPF_S), written: 0, expectedCollisions: 0, carry: 0, hitRate: 0, dbReads: 0, mine: [] }),
  step(s, p, rng) {
    const space = 62 ** p.length;
    s.carry += p.writesPerSec * DT;
    const writes = Math.floor(s.carry);
    s.carry -= writes;
    for (let i = 0; i < writes; i++) {
      if (p.method === 'hash' && s.store.size >= space - 1) break;
      if (p.method === 'hash') s.expectedCollisions += s.store.size / (space - s.store.size);
      s.last = s.store.shorten(`https://example.com/page/${s.written}`, p.method, p.length);
      s.written++;
    }
    // Reads come from a fixed catalog of popular links, so the cache has a steady target.
    const reads = Math.min(3000, Math.round(Math.max(writes, 1) * p.readsPerWrite));
    let hits = 0;
    for (let i = 0; i < reads; i++) if (s.cache.access(s.zipf(rng))) hits++;
    s.dbReads += reads - hits;
    s.hitRate = s.hitRate * 0.97 + (reads ? hits / reads : 0) * 0.03;
  },
  sample: (s, p) => ({ collisions: s.store.collisions, expected: s.expectedCollisions, hit: s.hitRate * 100, bestHit: zipfTopShare(p.cacheSize, CATALOG_SIZE, ZIPF_S) * 100 }),
  charts: [
    { title: 'Total collisions', series: [{ key: 'collisions', label: 'Measured', role: 'measured' }, { key: 'expected', label: 'Math', role: 'predicted' }] },
    { title: 'Cache hit rate', unit: '%', series: [{ key: 'hit', label: 'Measured', role: 'measured' }, { key: 'bestHit', label: 'Best possible', role: 'predicted' }] },
  ],
  metrics(s, p) {
    const space = 62 ** p.length;
    return [
      { label: 'URLs stored', value: fmtCount(s.store.size), role: 'measured' },
      { label: 'Possible codes', value: fmtCount(space), role: 'predicted' },
      { label: 'Next write collides', value: p.method === 'hash' ? fmtPct(s.store.size / space, 2) : '0%', role: 'predicted' },
      { label: 'Collisions', value: fmtInt(s.store.collisions), role: 'measured', tone: s.store.collisions ? 'warn' : 'good' },
      { label: 'Cache hit rate', value: fmtPct(s.hitRate), role: 'measured' },
    ];
  },
  math(s, p) {
    const space = 62 ** p.length;
    const n = s.store.size;
    return [
      { expr: `Code space: 62^${p.length}`, result: fmtCount(space) },
      { expr: `Collisions by birthday math: n² ÷ 2S, with n = ${fmtCount(n)}`, result: p.method === 'hash' ? `≈ ${fmtCount((n * n) / (2 * space))}` : '0, IDs are unique', tone: p.method === 'hash' ? undefined : 'good' },
      { expr: `Cache holds ${fmtPct(p.cacheSize / CATALOG_SIZE)} of popular links`, result: `up to ${fmtPct(zipfTopShare(p.cacheSize, CATALOG_SIZE, ZIPF_S))} of reads` },
    ];
  },
  View: ShortenTool,
  trace: (s) => ({
    values: {
      url: s.last ? s.last.url.slice(0, 30) : '',
      code: s.last?.code ?? '',
      retry: s.last ? `${s.last.collisions} retries` : '',
    },
    active: s.last ? ['code'] : [],
  }),
  experiments: [
    {
      title: 'Birthday math',
      set: { method: 'hash', length: 3, writesPerSec: 500 },
      ticks: 100,
      question: 'Three-character codes give 238,328 options. After creating 5,000 URLs, only 2% of the space is used. About how many hash collisions have happened?',
      options: ['Almost none', 'About 50', 'About 2,500'],
      answer: 1,
      explain: 'Each new URL can collide with any earlier one, so collisions grow with the square of the count: 5,000² ÷ (2 × 238,328) ≈ 52. This is the birthday paradox. That\'s why 7 characters are used in practice, with a check on each insert.',
      check: (s) => s.store.collisions >= 25 && s.store.collisions <= 85 && s.store.size >= 4900,
    },
    {
      title: 'Use a counter instead',
      set: { method: 'counter', writesPerSec: 500 },
      ticks: 100,
      question: 'Instead of hashing, each URL gets a unique number from an ID generator, encoded in base62. How many collisions after 5,000 URLs?',
      options: ['Zero', 'About 50', 'It depends on the URLs'],
      answer: 0,
      explain: 'Different numbers always give different codes, so collisions are impossible and no database check is needed. The tradeoff is that codes are predictable, so anyone can walk through your URLs, and you need a distributed ID generator.',
      check: (s) => s.store.collisions === 0 && s.store.size >= 4900,
    },
    {
      title: 'Cache 20%',
      set: { cacheSize: 2000, writesPerSec: 100, readsPerWrite: 50 },
      ticks: 500,
      question: 'Cache 2,000 of the 10,000 most-read links. Reads are skewed, as real links are. What hit rate should you expect?',
      options: ['About 20%', 'About 80%', 'About 100%'],
      answer: 1,
      explain: 'A small set of links gets most of the clicks, so caching 20% of them catches about 80% of reads. It\'s the familiar 80/20 rule, here coming straight out of the Zipf formula.',
      check: (_s, _p, h) => {
        const hit = tailMean(h, 'hit', 100);
        return hit > 62 && hit < 90;
      },
    },
  ],
};

const topic: Topic = {
  problem: [
    'A URL shortener turns a long address into a short one, and redirects anyone who visits it. It looks like a beginner question, yet it covers ID generation, read-heavy scaling, caching and collision math in a very small space.',
    'Two facts drive the design. Reads vastly outnumber writes, perhaps 100 to 1, so this is mostly a caching problem. And a short code means a small space of possible codes, so you need a deliberate way to avoid collisions.',
  ],
  functional: [
    'Given a long URL, return a short one',
    'Redirect a short URL to its original',
    'Track click counts for analytics',
  ],
  nonFunctional: [
    'Very fast redirects',
    'Highly available, since a dead link breaks forever',
    'Short codes that are hard to guess, if required',
  ],
  diagram: {
    nodes: [
      { id: 'u', label: 'Browser', col: 0, row: 1, kind: 'client', note: 'Sends GET /abc123 and follows the redirect.' },
      { id: 'lb', label: 'Load balancer', col: 1, row: 1, note: 'Spreads traffic across stateless API servers.' },
      { id: 'w', label: 'API servers', col: 2, row: 1, note: 'POST creates a code. GET looks it up and responds with a 301 or 302.' },
      { id: 'c', label: 'Cache', col: 3, row: 0, kind: 'store', note: 'Holds popular code-to-URL pairs. Most redirects end here.' },
      { id: 'd', label: 'Database', col: 3, row: 1, kind: 'store', note: 'A code-to-URL table. It needs no joins, so a key-value store fits well.' },
      { id: 'i', label: 'ID generator', col: 3, row: 2, note: 'Gives each new URL a unique number, which becomes its base62 code.' },
    ],
    edges: [
      { from: 'u', to: 'lb' },
      { from: 'lb', to: 'w' },
      { from: 'w', to: 'c' },
      { from: 'w', to: 'd' },
      { from: 'w', to: 'i' },
    ],
  },
  ideas: [
    { title: 'Hash and check', body: 'Hash the URL, take the first few characters, and check the database. On a collision, add a salt and try again. It needs no ID service, but every write requires a lookup, which a Bloom filter can speed up.' },
    { title: 'Base62 of an ID', body: 'Take a unique number from an ID generator and write it in base 62. It can\'t collide and needs no check, but codes are sequential and guessable, and their length grows over time.' },
    { title: '301 or 302', body: 'A 301 permanent redirect lets browsers cache it, cutting your load but hiding repeat clicks. A 302 temporary redirect sends every click through you, which analytics needs.' },
    { title: 'Why seven characters', body: '62^7 is about 3.5 trillion codes. At 100 million new URLs a day, that lasts about 95 years. Do this math out loud in the interview.' },
  ],
  estimator: {
    vars: [
      { key: 'newPerDay', label: 'New URLs per day', unit: 'count' },
      { key: 'readRatio', label: 'Reads per write', unit: 'plain', assume: 10 },
      { key: 'recordBytes', label: 'Bytes per record', unit: 'plain', assume: 500 },
      { key: 'years', label: 'Years to keep', unit: 'plain', assume: 10 },
      { key: 'writeQps', label: 'Write load', unit: 'qps' },
      { key: 'readQps', label: 'Read load', unit: 'qps' },
      { key: 'totalUrls', label: 'Total URLs', unit: 'count' },
      { key: 'storage', label: 'Total storage', unit: 'bytes' },
    ],
    eqs: [
      { out: 'writeQps', terms: [['newPerDay', 1], [86400, -1]] },
      { out: 'readQps', terms: [['writeQps', 1], ['readRatio', 1]] },
      { out: 'totalUrls', terms: [['newPerDay', 1], [365, 1], ['years', 1]] },
      { out: 'storage', terms: [['totalUrls', 1], ['recordBytes', 1]] },
    ],
    starts: [
      { key: 'newPerDay', value: 100_000_000 },
      { key: 'storage', value: 100e12 },
      { key: 'readQps', value: 10000 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'shorten(url):' },
    { code: '  if url already stored: return its code', id: 'url' },
    { code: '  code = hash(url) or base62(next_id())', id: 'code' },
    { code: '  while code is taken: re-salt and hash again', id: 'retry' },
    { code: '  save code -> url' },
    { code: '' },
    { code: 'redirect(code):' },
    { code: '  url = cache.get(code) or database.get(code)' },
    { code: '  respond 301 or 302 with url' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Hash with collision check', gain: 'No ID service, and codes aren\'t guessable', cost: 'A lookup on every write, and retries as the space fills' },
    { choice: 'Base62 of a counter', gain: 'No collisions and no lookup', cost: 'Guessable codes, and needs an ID generator' },
    { choice: '301 redirect', gain: 'Less load, since browsers cache it', cost: 'You lose repeat-click analytics' },
    { choice: '302 redirect', gain: 'Every click is visible', cost: 'All traffic reaches your servers' },
  ],
  interview: [
    { q: 'How do you stop people guessing URLs from a counter?', a: 'Scramble the ID with a reversible function, such as a format-preserving cipher, before encoding. You keep uniqueness without having sequential codes.' },
    { q: 'What about custom aliases and expiry?', a: 'Custom aliases are just a uniqueness check on the requested code. Store an expiry date and check it on read, then clean up expired rows lazily or in a background job.' },
    { q: 'How do you count clicks without slowing down redirects?', a: 'Write click events to a queue and aggregate them asynchronously. The redirect path should never wait on analytics.' },
    { q: 'SQL or NoSQL?', a: 'Either works, since there are no joins. A key-value store scales simply for this one lookup pattern. A relational database is a fine start, and easier to reason about at low scale.' },
  ],
  mistakes: [
    'Skipping the math on how long your code length lasts.',
    'Forgetting that the read-to-write ratio makes this a caching problem.',
    'Doing analytics synchronously on the redirect path.',
  ],
};

export default topic;
