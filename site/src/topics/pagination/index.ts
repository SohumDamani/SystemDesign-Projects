import type { Lab, Topic } from '../../core/types';
import { fmtCount, fmtInt, fmtPct } from '../../core/format';
import source from './engine.ts?raw';
import { Feed, type Mode } from './engine';

type P = { mode: Mode; rows: number; pageSize: number; insertsPerTick: number; deletesPerTick: number };

const DT = 0.1;

interface S {
  feed: Feed;
  offset: number;
  cursor: number;
  seen: Set<number>;
  atStart: Set<number>;
  duplicates: number;
  missed: number;
  passes: number;
  fetched: number;
  scannedEma: number;
  scannedSum: number;
  pagesRead: number;
  dupEma: number;
  lastScanned: number;
}

function startPass(s: S) {
  s.offset = 0;
  s.cursor = Infinity;
  s.seen = new Set();
  s.atStart = new Set(s.feed.rows);
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'mode', label: 'Paging method', kind: 'choice', rebuild: true, options: [{ value: 'offset', label: 'Page numbers (OFFSET)' }, { value: 'cursor', label: 'Cursor (id of the last row seen)' }] },
    { key: 'rows', label: 'Rows in the table', kind: 'range', min: 500, max: 20000, step: 500, rebuild: true },
    { key: 'pageSize', label: 'Rows per page', kind: 'range', min: 5, max: 200, step: 5, rebuild: true },
    { key: 'insertsPerTick', label: 'New rows added per page', kind: 'range', min: 0, max: 10, step: 1 },
    { key: 'deletesPerTick', label: 'Rows deleted per page', kind: 'range', min: 0, max: 10, step: 1 },
  ],
  defaults: { mode: 'offset', rows: 5000, pageSize: 50, insertsPerTick: 0, deletesPerTick: 0 },
  create(p) {
    const s = { feed: new Feed(p.rows), duplicates: 0, missed: 0, passes: 0, fetched: 0, scannedEma: 0, scannedSum: 0, pagesRead: 0, dupEma: 0, lastScanned: 0 } as S;
    startPass(s);
    return s;
  },
  step(s, p, rng) {
    for (let i = 0; i < p.insertsPerTick; i++) s.feed.insert();
    for (let i = 0; i < p.deletesPerTick && s.feed.rows.length > 100; i++) s.feed.remove(rng.int(s.feed.rows.length));
    const page = p.mode === 'offset' ? s.feed.pageByOffset(s.offset, p.pageSize) : s.feed.pageByCursor(s.cursor, p.pageSize);
    // A page of rows we've all seen already means we've caught up with the end.
    if (!page.ids.length || page.ids.every((id) => s.seen.has(id))) {
      // Reached the end. Anything that existed all along but was never returned was skipped.
      for (const id of s.atStart) if (s.feed.has(id) && !s.seen.has(id)) s.missed++;
      s.passes++;
      startPass(s);
      return;
    }
    let dupes = 0;
    for (const id of page.ids) {
      if (s.seen.has(id)) dupes++;
      s.seen.add(id);
    }
    s.duplicates += dupes;
    s.fetched += page.ids.length;
    s.offset += page.ids.length;
    s.cursor = page.ids[page.ids.length - 1];
    s.lastScanned = page.scanned;
    // A whole-pass average: an offset reader's cost swings from tiny to huge as it goes deeper.
    s.scannedSum += page.scanned;
    s.pagesRead++;
    s.scannedEma = s.scannedSum / s.pagesRead;
    s.dupEma = s.dupEma * 0.95 + (dupes / page.ids.length) * 0.05;
  },
  sample: (s, p) => ({ scanned: s.scannedEma, math: p.mode === 'offset' ? s.feed.rows.length / 2 + p.pageSize : p.pageSize + Math.log2(Math.max(2, s.feed.rows.length)), dups: s.dupEma * 100, dupMath: p.mode === 'offset' ? Math.min(100, (p.insertsPerTick / p.pageSize) * 100) : 0 }),
  charts: [
    { title: 'Rows the database reads per page', series: [{ key: 'scanned', label: 'Measured', role: 'measured' }, { key: 'math', label: 'Math', role: 'predicted' }] },
    { title: 'Rows on a page you already saw', unit: '%', series: [{ key: 'dups', label: 'Measured', role: 'measured' }, { key: 'dupMath', label: 'Math', role: 'predicted' }] },
  ],
  metrics(s, p) {
    return [
      { label: 'Average rows read per page', value: fmtCount(s.scannedEma), role: 'measured' },
      { label: 'Repeated rows', value: fmtPct(s.dupEma, 1), role: 'measured', tone: s.duplicates ? 'warn' : 'good' },
      { label: 'Rows never shown', value: fmtInt(s.missed), role: 'measured', tone: s.missed ? 'bad' : 'good' },
      { label: 'Full passes finished', value: fmtInt(s.passes), role: 'measured' },
      { label: 'Rows in the table', value: fmtInt(s.feed.rows.length), role: 'measured', tone: p.rows ? undefined : undefined },
    ];
  },
  math(s, p) {
    const n = s.feed.rows.length;
    return [
      { expr: p.mode === 'offset' ? `Offset reads on average: ${fmtInt(n)} ÷ 2 + ${p.pageSize}` : `Cursor reads: ${p.pageSize} rows + about ${Math.ceil(Math.log2(Math.max(2, n)))} index steps`, result: p.mode === 'offset' ? `${fmtCount(n / 2 + p.pageSize)} rows` : `${fmtCount(p.pageSize + Math.log2(Math.max(2, n)))} rows`, tone: p.mode === 'offset' ? 'warn' : 'good' },
      { expr: `New rows shift everything down: ${p.insertsPerTick} ÷ ${p.pageSize} per page`, result: p.mode === 'offset' ? fmtPct(Math.min(1, p.insertsPerTick / p.pageSize), 1) + ' repeats' : 'none, a cursor names a row', tone: p.mode === 'offset' && p.insertsPerTick ? 'bad' : 'good' },
      { expr: `Last page of the table, by offset: rows read`, result: fmtInt(n), tone: p.mode === 'offset' ? 'bad' : 'good' },
    ];
  },
  trace: (s, p) => ({ values: { scanned: `${fmtInt(s.lastScanned)} rows read`, dups: `${fmtInt(s.duplicates)} repeats so far`, mode: p.mode } }),
  experiments: [
    {
      title: 'The price of a deep page',
      set: { mode: 'offset', rows: 5000, pageSize: 50 },
      ticks: 400,
      question: 'A table has 5,000 rows, and a reader pages through it 50 at a time using page numbers (OFFSET). On average, how many rows does the database read to return one page?',
      options: ['About 50, the page size', 'About 2,500', 'About 5,000, always'],
      answer: 1,
      explain: 'To return rows 2,000 to 2,050 the database must walk past the first 2,000. Early pages are cheap and late ones are expensive, so the average is about half the table, and the last page reads all of it. With millions of rows, deep pages become slow queries.',
      check: (s) => s.scannedEma > 1500 && s.scannedEma < 3500,
    },
    {
      title: 'A cursor',
      set: { mode: 'cursor', rows: 5000, pageSize: 50 },
      ticks: 400,
      question: 'Now each request says "give me 50 rows after id X", which an index can jump straight to. How many rows are read per page?',
      options: ['Still about 2,500', 'About 60, whichever page it is', 'It depends on how deep you are'],
      answer: 1,
      explain: 'A binary search on the index finds the spot in about 12 steps, then the database reads exactly one page. Page 1 and page 100 cost the same. The price is that you can\'t jump to "page 37", only go to the next one.',
      check: (s) => s.scannedEma < 80,
    },
    {
      title: 'New rows while you read',
      set: { mode: 'offset', rows: 5000, pageSize: 50, insertsPerTick: 3 },
      ticks: 400,
      question: 'Using page numbers, 3 new rows are added at the top between each page. What does the reader see?',
      options: ['Nothing unusual', 'About 6% of each page is rows they already saw', 'The pages stop working'],
      answer: 1,
      explain: 'Each new row pushes everything down by one, so the start of "page 2" is the end of page 1 again. 3 ÷ 50 is 6% repeats. On a busy feed the same posts keep reappearing as you scroll.',
      check: (s) => s.dupEma > 0.04 && s.dupEma < 0.08,
    },
    {
      title: 'Cursor with new rows',
      set: { mode: 'cursor', rows: 5000, pageSize: 50, insertsPerTick: 3 },
      ticks: 400,
      question: 'Same new rows, but using a cursor. How many repeated rows does the reader see?',
      options: ['About 6%, as before', 'None'],
      answer: 1,
      explain: 'A cursor names a row, not a position, so rows added above it can\'t shift anything. This is why feeds and timelines use cursors.',
      check: (s) => s.duplicates === 0 && s.passes >= 1,
    },
    {
      title: 'Rows deleted while you read',
      set: { mode: 'offset', rows: 5000, pageSize: 50, deletesPerTick: 3 },
      ticks: 300,
      question: 'Page numbers again, but now 3 random rows are deleted between pages. Deleting a row you already read pulls the unread rows up by one. What happens?',
      options: ['Nothing, deleted rows are gone anyway', 'Some rows that still exist are never shown'],
      answer: 1,
      explain: 'Deleting an already-read row shifts the next unread row into a position that was already passed, so it\'s skipped. It\'s the mirror image of the duplicate problem, and harder to notice, because a missing row looks like nothing.',
      check: (s) => s.missed > 5,
    },
  ],
};

const topic: Topic = {
  problem: [
    'Almost every API that returns a list has to return it in pages. The obvious way, "page 3, 50 per page", looks harmless, but it hides two problems that only appear at scale or while the data is changing.',
    'The database has to count past every earlier row to find the start of a page, so deep pages are slow. And because pages are defined by position, rows added or deleted between requests make the reader see repeats or miss rows entirely. A cursor fixes both.',
  ],
  functional: [
    'Return a long list a page at a time',
    'Let the client ask for the next page',
    'Keep the order stable while people read',
  ],
  nonFunctional: [
    'Every page costs about the same, however deep',
    'No repeated or skipped rows when data changes',
    'Simple for clients to use',
  ],
  ideas: [
    { title: 'Offset pagination', body: 'The client asks for page N. The database skips N × size rows and returns the next ones. It\'s simple, and lets you jump to any page, but cost grows with depth and positions shift when data changes.' },
    { title: 'Cursor pagination', body: 'The client sends the id of the last row it saw, and asks for the rows after it. An index jumps straight there, so every page costs the same, and the reader\'s place can\'t be shifted by inserts.' },
    { title: 'The index matters', body: 'A cursor is only fast if the sort column has an index. Sorting by something unindexed makes every page a full scan, whatever the method.' },
    { title: 'Opaque cursors', body: 'Real APIs return the cursor as an encoded token, not a raw id. That lets you change how paging works later, and hides internals. Ties in the sort column need a second column, such as the id, to break them.' },
  ],
  lab,
  pseudocode: [
    { code: 'offset page (N, size):' },
    { code: '  skip N rows, return the next size', id: 'scanned' },
    { code: 'cursor page (last_id, size):' },
    { code: '  find the first row after last_id using the index' },
    { code: '  return the next size rows' },
    { code: 'rows a reader saw twice so far', id: 'dups' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Offset', gain: 'Simple, and you can jump to any page', cost: 'Slow for deep pages, and rows shift as data changes' },
    { choice: 'Cursor', gain: 'Constant cost, and stable under changes', cost: 'No jumping to page 37, and needs an indexed sort key' },
    { choice: 'Keep a total count', gain: 'Nice "page 3 of 120" display', cost: 'Counting a huge table is itself slow, so many APIs drop it' },
    { choice: 'Snapshot the list', gain: 'A perfectly consistent view', cost: 'Needs storage and expiry for each reader' },
  ],
  interview: [
    { q: 'When is offset pagination fine?', a: 'For small tables, admin screens, or data that rarely changes, where jumping to a page number matters more than cost. Most public feeds and large lists should use cursors.' },
    { q: 'What if the list is sorted by a column with ties?', a: 'Sort by the column and the id together, and make the cursor carry both. Otherwise rows with the same value can be skipped or repeated across pages.' },
    { q: 'How would you page through search results?', a: 'Search engines make deep paging costly too, since each shard must return its top N. Most limit how deep you can go, or use a cursor-like search-after token.' },
    { q: 'How do you show the total number of pages?', a: 'An exact count of a large table is slow. Use an approximate count, cache it, or show only "next" and "previous".' },
  ],
  mistakes: [
    'Using page numbers for an endless feed that changes constantly.',
    'Sorting by a column that has no index.',
    'Forgetting that a cursor on a non-unique column needs a tiebreaker.',
  ],
};

export default topic;
