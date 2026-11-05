import type { Lab, Topic } from '../../core/types';
import { fmtCount, fmtInt, fmtPct } from '../../core/format';
import { tailMean } from '../../core/stats';
import source from './engine.ts?raw';
import { BloomFilter, Frontier, TRAP_HOST, bloomFalsePositiveRate, linksOn, type Link } from './engine';

type P = { hosts: number; workers: number; fetchMs: number; delaySec: number; dedupe: 'exact' | 'bloom'; bitsPerItem: number; trap: boolean; maxDepth: number };

const DT = 0.1;
const EXPECTED_ITEMS = 100000;
const MAX_FRONTIER = 200000;

interface S {
  now: number;
  frontier: Frontier;
  seen: Set<string>;
  bloom?: BloomFilter;
  inFlight: { page: Link; doneAt: number }[];
  fetched: number;
  fetchedTick: number;
  rate: number;
  duplicates: number;
  missed: number;
  checks: number;
  trapPages: number;
  last?: Link;
  lastAction: string;
}

const optimalK = (bits: number) => Math.max(1, Math.round(bits * Math.LN2));

function predictedRate(p: P): { rate: number; limit: string } {
  const byWorkers = p.workers / (p.fetchMs / 1000);
  const byPoliteness = p.delaySec > 0 ? p.hosts / p.delaySec : Infinity;
  return byWorkers <= byPoliteness ? { rate: byWorkers, limit: 'workers' } : { rate: byPoliteness, limit: 'politeness' };
}

function discover(s: S, p: P, link: Link) {
  if (p.maxDepth > 0 && link.depth > p.maxDepth) return;
  const truly = s.seen.has(link.url);
  if (s.bloom) {
    s.checks++;
    if (s.bloom.mightContain(link.url)) {
      // The filter says "seen". If we haven't, a page is now lost for good.
      if (truly) s.duplicates++;
      else {
        s.missed++;
        s.seen.add(link.url);
      }
      return;
    }
    s.bloom.add(link.url);
  } else if (truly) {
    s.duplicates++;
    return;
  }
  s.seen.add(link.url);
  if (s.frontier.size < MAX_FRONTIER) s.frontier.push(link);
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'hosts', label: 'Websites', kind: 'range', min: 5, max: 200, step: 5, rebuild: true },
    { key: 'workers', label: 'Fetch workers', kind: 'range', min: 1, max: 200, step: 1 },
    { key: 'fetchMs', label: 'Time per fetch', kind: 'range', min: 100, max: 2000, step: 100, unit: 'ms' },
    { key: 'delaySec', label: 'Politeness delay per site', kind: 'range', min: 0, max: 5, step: 0.1, unit: 's' },
    { key: 'dedupe', label: 'Duplicate detection', kind: 'choice', rebuild: true, options: [{ value: 'exact', label: 'Exact set of URLs' }, { value: 'bloom', label: 'Bloom filter' }] },
    { key: 'bitsPerItem', label: 'Bloom bits per URL', kind: 'range', min: 1, max: 16, step: 1, rebuild: true },
    { key: 'maxDepth', label: 'Depth limit', kind: 'range', min: 0, max: 50, step: 1, format: (v) => (v === 0 ? 'None' : String(v)) },
    { key: 'trap', label: 'Include a spider trap', kind: 'toggle', rebuild: true },
  ],
  defaults: { hosts: 50, workers: 40, fetchMs: 500, delaySec: 1, dedupe: 'exact', bitsPerItem: 10, trap: false, maxDepth: 0 },
  create(p) {
    const s: S = {
      now: 0,
      frontier: new Frontier(),
      seen: new Set(),
      bloom: p.dedupe === 'bloom' ? new BloomFilter(EXPECTED_ITEMS * p.bitsPerItem, optimalK(p.bitsPerItem)) : undefined,
      inFlight: [],
      fetched: 0,
      fetchedTick: 0,
      rate: 0,
      duplicates: 0,
      missed: 0,
      checks: 0,
      trapPages: 0,
      lastAction: '',
    };
    for (let h = 0; h < p.hosts; h++) discover(s, p, { url: `h${h}/p0`, host: h, depth: 0 });
    if (p.trap) discover(s, p, { url: 'trap.example/cal', host: TRAP_HOST, depth: 0 });
    return s;
  },
  step(s, p) {
    s.now += DT;
    let done = 0;
    s.inFlight = s.inFlight.filter((job) => {
      if (job.doneAt > s.now + 1e-9) return true;
      done++;
      s.fetched++;
      s.last = job.page;
      if (job.page.host === TRAP_HOST) s.trapPages++;
      for (const link of linksOn(job.page, p.hosts)) discover(s, p, link);
      return false;
    });
    while (s.inFlight.length < p.workers) {
      const page = s.frontier.pop(s.now, p.delaySec);
      if (!page) break;
      s.inFlight.push({ page, doneAt: s.now + p.fetchMs / 1000 });
    }
    s.fetchedTick = done;
    s.rate = s.rate * 0.95 + (done / DT) * 0.05;
  },
  sample: (s, p) => ({ rate: s.rate, math: predictedRate(p).rate, frontier: s.frontier.size }),
  charts: [
    { title: 'Pages fetched', unit: 'per s', series: [{ key: 'rate', label: 'Measured', role: 'measured' }, { key: 'math', label: 'Math', role: 'predicted' }] },
    { title: 'URLs waiting in the frontier', series: [{ key: 'frontier', label: 'Measured', role: 'measured' }] },
  ],
  metrics(s, p) {
    const pred = predictedRate(p);
    const fp = s.bloom ? bloomFalsePositiveRate(p.bitsPerItem, s.bloom.k, s.bloom.inserted / EXPECTED_ITEMS) : 0;
    return [
      { label: 'Pages per second', value: fmtCount(pred.rate), role: 'predicted' },
      { label: 'Pages per second', value: fmtCount(s.rate), role: 'measured' },
      { label: 'Duplicates skipped', value: fmtCount(s.duplicates), role: 'measured' },
      { label: 'Pages wrongly skipped', value: fmtInt(s.missed), role: 'measured', tone: s.missed ? 'warn' : undefined },
      { label: 'False positive rate', value: s.bloom ? fmtPct(fp, 2) : '0%', role: 'predicted' },
      { label: 'Trap pages crawled', value: fmtCount(s.trapPages), role: 'measured', tone: s.trapPages > 500 ? 'bad' : undefined },
    ];
  },
  math(s, p) {
    const byWorkers = p.workers / (p.fetchMs / 1000);
    const byPoliteness = p.delaySec > 0 ? p.hosts / p.delaySec : Infinity;
    return [
      { expr: `Workers: ${p.workers} ÷ ${p.fetchMs / 1000} s per fetch`, result: `${fmtCount(byWorkers)} pages/s` },
      { expr: `Politeness: ${p.hosts} sites ÷ ${p.delaySec} s delay`, result: p.delaySec > 0 ? `${fmtCount(byPoliteness)} pages/s` : 'no limit' },
      { expr: `Throughput is the smaller of the two, limited by`, result: predictedRate(p).limit, tone: 'warn' },
    ];
  },
  views: (s, p) => [
    { kind: 'note', title: 'Memory for duplicate detection', text: s.bloom ? `Bloom filter: ${fmtCount((EXPECTED_ITEMS * p.bitsPerItem) / 8)} bytes, fixed. An exact set of the same URLs would take about ${fmtCount(s.seen.size * 50)} bytes.` : `Exact set: about ${fmtCount(s.seen.size * 50)} bytes so far, growing with every URL.` },
  ],
  trace: (s) => ({
    values: {
      page: s.last?.url.slice(0, 26) ?? '',
      depth: s.last ? String(s.last.depth) : '',
      frontier: fmtCount(s.frontier.size),
      seen: fmtCount(s.seen.size),
    },
  }),
  experiments: [
    {
      title: 'Politeness sets the speed',
      set: { hosts: 20, workers: 100, fetchMs: 500, delaySec: 1 },
      ticks: 200,
      question: 'You have 100 workers that can fetch 200 pages a second between them, but only 20 sites, and may hit each one once per second. What throughput do you get?',
      options: ['About 200 pages/s', 'About 20 pages/s', 'About 100 pages/s'],
      answer: 1,
      explain: 'Politeness caps you at 20 sites × 1 page per second, so most of those workers sit idle. More machines can\'t help, and the fix is to crawl more sites at once. That\'s why a crawler\'s queue is organized per host rather than as one big list.',
      check: (_s, _p, h) => {
        const r = tailMean(h, 'rate', 60);
        return r > 13 && r < 23;
      },
    },
    {
      title: 'Walk into a trap',
      set: { hosts: 5, workers: 50, fetchMs: 200, delaySec: 0, trap: true, maxDepth: 0 },
      ticks: 600,
      question: 'One site generates endless new links, like a calendar with a "next month" button. With no depth limit, where does the crawl\'s effort end up?',
      options: ['The crawl finishes normally', 'Mostly inside the trap', 'It skips the trap automatically'],
      answer: 1,
      explain: 'Every URL there is new, so duplicate detection can\'t help. Once the normal sites are exhausted, the crawler keeps feeding on the trap forever. Real crawlers cap URL length and depth, and they spot sites producing suspicious numbers of pages.',
      check: (s) => s.trapPages > s.fetched * 0.5,
    },
    {
      title: 'Set a depth limit',
      set: { hosts: 5, workers: 50, fetchMs: 200, delaySec: 0, trap: true, maxDepth: 6 },
      ticks: 600,
      question: 'Same trap, but with a maximum depth of 6, and each trap page links to 2 more. What\'s the most trap pages you could crawl?',
      options: ['127', '1,000', 'Unlimited'],
      answer: 0,
      explain: 'A depth limit of 6 with 2 links per page gives 2^7 − 1 = 127 pages at most. The trap is reduced from infinite to a rounding error. The cost is that you might miss genuinely deep pages.',
      check: (s) => s.trapPages <= 127,
    },
    {
      title: 'A Bloom filter too small',
      set: { hosts: 100, workers: 200, fetchMs: 200, delaySec: 0.2, dedupe: 'bloom', bitsPerItem: 2 },
      ticks: 400,
      question: 'You use a Bloom filter with only 2 bits per URL to save memory. It never misses a seen URL, but can wrongly say a new one was seen. What\'s the effect?',
      options: ['Nothing, it\'s still accurate', 'Some new pages get skipped forever', 'It re-crawls the same pages'],
      answer: 1,
      explain: 'When the filter wrongly says "seen", that page is never crawled. Too few bits per item means a high false positive rate. The formula is (1 − e^(−kn/m))^k, which falls fast as you add bits.',
      check: (s) => s.missed > 20,
    },
    {
      title: 'Give it ten bits',
      set: { hosts: 100, workers: 200, fetchMs: 200, delaySec: 0.2, dedupe: 'bloom', bitsPerItem: 10 },
      ticks: 400,
      question: 'Now use 10 bits per URL. What share of checks wrongly report "seen"?',
      options: ['About 1% or less', 'About 10%', 'About 50%'],
      answer: 0,
      explain: 'With 10 bits and 7 hash functions, the false positive rate is under 1%. That\'s still far less memory than storing billions of URLs, which is why crawlers use Bloom filters for this job.',
      check: (s) => s.checks > 100 && s.missed / s.checks < 0.02,
    },
  ],
};

const topic: Topic = {
  problem: [
    'A web crawler starts from some URLs, downloads each page, finds the links on it, and repeats. A few lines of code can do it for 100 pages. Doing it for billions, while staying polite to every site and not wasting effort, is a very different problem.',
    'Three things make it hard: you must not overload any site, the web is full of duplicates and traps, and the frontier of URLs to visit grows far faster than you can fetch them.',
  ],
  functional: [
    'Start from seed URLs and follow links',
    'Download and store HTML pages',
    'Avoid crawling the same page twice',
  ],
  nonFunctional: [
    'Scale to billions of pages per month',
    'Stay polite, by respecting robots.txt and rate limits per site',
    'Survive bad HTML, unresponsive servers and malicious pages',
  ],
  diagram: {
    nodes: [
      { id: 'seed', label: 'Seed URLs', col: 0, row: 0, kind: 'client', note: 'Where the crawl starts, often chosen by country or topic.' },
      { id: 'f', label: 'URL frontier', col: 1, row: 0, kind: 'queue', note: 'Separate queues per host for politeness, and priority queues so important pages go first.' },
      { id: 'dl', label: 'HTML downloader', col: 2, row: 0, note: 'Fetches pages, checks robots.txt, and retries with timeouts.' },
      { id: 'dns', label: 'DNS resolver', col: 3, row: 0, kind: 'external', note: 'Often a bottleneck, so results are cached locally.' },
      { id: 'parse', label: 'Parser and content check', col: 2, row: 1, note: 'Parses HTML and drops pages whose content has already been seen, using a hash.' },
      { id: 'store', label: 'Content store', col: 3, row: 1, kind: 'store', note: 'Stores the page content, mostly on disk.' },
      { id: 'ext', label: 'Link extractor', col: 1, row: 1, note: 'Finds links in the page and normalizes them.' },
      { id: 'seen', label: 'URL seen filter', col: 0, row: 1, kind: 'store', note: 'A Bloom filter that quickly rejects URLs already visited.' },
    ],
    edges: [
      { from: 'seed', to: 'f' },
      { from: 'f', to: 'dl' },
      { from: 'dl', to: 'dns', dashed: true },
      { from: 'dl', to: 'parse' },
      { from: 'parse', to: 'store' },
      { from: 'parse', to: 'ext' },
      { from: 'ext', to: 'seen' },
      { from: 'seen', to: 'f' },
    ],
  },
  ideas: [
    { title: 'BFS over DFS', body: 'The web is too deep for depth-first search. Breadth-first is the norm, with the frontier adding priority and politeness on top of a plain FIFO queue.' },
    { title: 'Politeness', body: 'A queue per host means each host has one worker at a time, with a delay between requests. Without this, a crawler is effectively a denial of service attack.' },
    { title: 'Duplicate detection', body: 'A Bloom filter checks URLs cheaply, with a small chance of wrongly skipping a page. Content hashes then catch different URLs with the same page, which is roughly 30% of the web.' },
    { title: 'Spider traps', body: 'Some sites generate endless URLs, by accident or on purpose. Limit depth and URL length, and watch for sites with abnormal page counts.' },
  ],
  estimator: {
    vars: [
      { key: 'pagesMonth', label: 'Pages per month', unit: 'count' },
      { key: 'pageBytes', label: 'Bytes per page', unit: 'plain', assume: 500000 },
      { key: 'months', label: 'Months to keep', unit: 'plain', assume: 60 },
      { key: 'peakFactor', label: 'Peak over average', unit: 'plain', assume: 2 },
      { key: 'avg', label: 'Average fetch rate', unit: 'qps' },
      { key: 'peak', label: 'Peak fetch rate', unit: 'qps' },
      { key: 'monthly', label: 'Storage per month', unit: 'bytes' },
      { key: 'total', label: 'Total storage', unit: 'bytes' },
    ],
    eqs: [
      { out: 'avg', terms: [['pagesMonth', 1], [2592000, -1]] },
      { out: 'peak', terms: [['avg', 1], ['peakFactor', 1]] },
      { out: 'monthly', terms: [['pagesMonth', 1], ['pageBytes', 1]] },
      { out: 'total', terms: [['monthly', 1], ['months', 1]] },
    ],
    starts: [
      { key: 'pagesMonth', value: 1e9 },
      { key: 'total', value: 30e15 },
      { key: 'peak', value: 1000 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'while frontier has URLs:' },
    { code: '  page = next URL from a host we may contact', id: 'page' },
    { code: '  wait out the politeness delay for that host' },
    { code: '  html = fetch(page)' },
    { code: '  for link in extract_links(html):' },
    { code: '    if depth > limit: skip', id: 'depth' },
    { code: '    if link in seen: skip', id: 'seen' },
    { code: '    add link to seen, then to frontier', id: 'frontier' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Bloom filter', gain: 'Fixed, tiny memory', cost: 'A small share of pages get skipped forever' },
    { choice: 'Exact URL set', gain: 'No pages lost', cost: 'Memory for billions of URLs' },
    { choice: 'Longer politeness delay', gain: 'Friendlier to sites, fewer bans', cost: 'Slower crawl' },
    { choice: 'Depth limit', gain: 'Immune to infinite traps', cost: 'May miss deep content' },
  ],
  interview: [
    { q: 'How do you decide what to crawl first?', a: 'Rank URLs by usefulness, using PageRank, traffic and update frequency, and put them into priority queues. A selector then favors high-priority queues, without starving low-priority ones.' },
    { q: 'How do you keep content fresh?', a: 'Re-crawl pages according to how often they change and how important they are, not on one schedule. Sitemaps and last-modified headers help you avoid wasted fetches.' },
    { q: 'How do you scale across many machines?', a: 'Partition the frontier by host, so one machine owns each host\'s queue. That keeps politeness simple. Keep DNS caches local, and place crawlers near the sites they fetch.' },
    { q: 'What makes a crawler robust?', a: 'Consistent hashing to spread work, saving crawl state so you can resume after a crash, timeouts on everything, and never trusting the input, since malformed and hostile HTML is routine.' },
  ],
  mistakes: [
    'Ignoring politeness and treating the frontier as one simple queue.',
    'Only deduplicating URLs and not content.',
    'Forgetting about spider traps.',
  ],
};

export default topic;
