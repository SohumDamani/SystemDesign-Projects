import type { Lab, Topic } from '../../core/types';
import { fmtCount, fmtDuration, fmtInt } from '../../core/format';
import { tailMean } from '../../core/stats';
import source from './engine.ts?raw';
import { applyFanout, buildNetwork, isCelebrity, publish, readFeed, type FanoutJob, type Network, type Strategy } from './engine';

type P = { strategy: Strategy; postsPerSec: number; opensPerSec: number; threshold: number; capacity: number };

const DT = 0.1;
const USERS = 2000;
const AVG_FOLLOWS = 30;

interface S {
  now: number;
  net: Network;
  queue: FanoutJob[];
  head: number;
  nextPost: number;
  writesNow: number;
  readsPerOpen: number;
  writeRate: number;
  backlog: number;
  peakBacklog: number;
  lastPost: string;
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'strategy', label: 'Fan-out strategy', kind: 'choice', rebuild: true, options: [{ value: 'write', label: 'Fan-out on write (push)' }, { value: 'read', label: 'Fan-out on read (pull)' }, { value: 'hybrid', label: 'Hybrid, pull for celebrities' }] },
    { key: 'postsPerSec', label: 'Posts', kind: 'range', min: 0, max: 100, step: 1, unit: 'per s' },
    { key: 'opensPerSec', label: 'Feed opens', kind: 'range', min: 10, max: 500, step: 10, unit: 'per s' },
    { key: 'threshold', label: 'Celebrity threshold', kind: 'range', min: 100, max: 1900, step: 50, unit: 'followers' },
    { key: 'capacity', label: 'Fan-out capacity', kind: 'range', min: 500, max: 20000, step: 500, unit: 'writes/s' },
  ],
  defaults: { strategy: 'write', postsPerSec: 5, opensPerSec: 100, threshold: 1000, capacity: 2000 },
  create(p, rng) {
    return { now: 0, net: buildNetwork(USERS, AVG_FOLLOWS, rng), queue: [], head: 0, nextPost: 1, writesNow: 0, readsPerOpen: 0, writeRate: 0, backlog: 0, peakBacklog: 0, lastPost: '' };
  },
  step(s, p, rng) {
    s.now += DT;
    for (let i = rng.poisson(p.postsPerSec * DT); i > 0; i--) {
      // Only ordinary users post at random. Use the action to make the celebrity post.
      const author = 20 + rng.int(USERS - 20);
      s.queue.push(...publish(s.net, { id: s.nextPost++, author, at: s.now }, p.strategy, p.threshold));
    }
    const budget = Math.floor(p.capacity * DT);
    let writes = 0;
    while (writes < budget && s.head < s.queue.length) {
      applyFanout(s.net, s.queue[s.head++]);
      writes++;
    }
    if (s.head > 4096) {
      s.queue = s.queue.slice(s.head);
      s.head = 0;
    }
    s.writesNow = writes;
    s.writeRate = s.writeRate * 0.9 + (writes / DT) * 0.1;
    s.backlog = s.queue.length - s.head;
    s.peakBacklog = Math.max(s.peakBacklog, s.backlog);
    const opens = Math.max(1, Math.min(200, rng.poisson(p.opensPerSec * DT)));
    let reads = 0;
    for (let i = 0; i < opens; i++) reads += readFeed(s.net, rng.int(USERS), p.strategy, p.threshold).reads;
    s.readsPerOpen = s.readsPerOpen * 0.9 + (reads / opens) * 0.1;
  },
  sample: (s, p) => ({ backlog: s.backlog, writes: s.writeRate, cap: p.capacity, reads: s.readsPerOpen }),
  charts: [
    { title: 'Feed writes waiting', series: [{ key: 'backlog', label: 'Measured', role: 'measured' }] },
    { title: 'Reads per feed open', series: [{ key: 'reads', label: 'Measured', role: 'measured' }] },
  ],
  metrics(s, p) {
    const celebFollowers = s.net.followers[0].length;
    return [
      { label: 'Feed writes per second', value: p.strategy === 'read' ? '0' : fmtCount(p.postsPerSec * AVG_FOLLOWS), role: 'predicted' },
      { label: 'Feed writes per second', value: fmtCount(s.writeRate), role: 'measured' },
      { label: 'Reads per feed open', value: s.readsPerOpen.toFixed(1), role: 'measured' },
      { label: 'Delay before posts appear', value: fmtDuration(s.backlog / p.capacity), role: 'measured', tone: s.backlog / p.capacity > 1 ? 'bad' : undefined },
      { label: 'Celebrity\'s followers', value: fmtInt(celebFollowers), role: 'measured' },
    ];
  },
  math(s, p) {
    const celeb = s.net.followers[0].length;
    const celebCount = s.net.followers.filter((_, i) => isCelebrity(s.net, i, p.threshold)).length;
    return [
      { expr: `Fan-out writes: ${p.postsPerSec} posts/s × ${AVG_FOLLOWS} followers`, result: `${fmtInt(p.postsPerSec * AVG_FOLLOWS)} writes/s` },
      { expr: `One celebrity post: ${fmtInt(celeb)} writes ÷ ${fmtInt(p.capacity)}/s`, result: p.strategy === 'write' ? fmtDuration(celeb / p.capacity) : 'no fan-out', tone: p.strategy === 'write' ? 'warn' : 'good' },
      { expr: `Users above the celebrity threshold`, result: fmtInt(celebCount) },
    ];
  },
  views: (s) => {
    const counts = [...s.net.followers.map((f) => f.length)].sort((a, b) => b - a);
    return [
      {
        kind: 'bars',
        title: 'Followers by rank: a few have most of them',
        items: [0, 1, 4, 19, 99, 499, 1999].map((r) => ({ label: `Rank ${r + 1}`, value: counts[r] })),
      },
    ];
  },
  actions: [
    {
      key: 'celebrity',
      label: 'The top celebrity posts',
      run: (s, p) => {
        s.queue.push(...publish(s.net, { id: s.nextPost++, author: 0, at: s.now }, p.strategy, p.threshold));
        s.lastPost = `Post #${s.nextPost - 1} by the celebrity`;
      },
    },
  ],
  trace: (s, p) => ({
    values: { backlog: fmtCount(s.backlog), reads: s.readsPerOpen.toFixed(1), strategy: p.strategy },
    active: [p.strategy === 'read' ? 'reads' : 'backlog'],
  }),
  experiments: [
    {
      title: 'A celebrity posts',
      set: { strategy: 'write', capacity: 2000 },
      act: ['celebrity'],
      actAt: 20,
      ticks: 60,
      question: 'With fan-out on write, each post is copied into every follower\'s feed. The top celebrity, followed by almost everyone, posts once. What does that one post cost?',
      options: ['One write', 'About 30 writes, the average', 'Nearly 2,000 writes, and a visible delay'],
      answer: 2,
      explain: 'One post becomes one write per follower. With capacity for 2,000 writes a second, it takes about a second to drain here, and everyone else\'s posts wait behind it. At real scale, with 100 million followers, this is the hot key problem at its worst.',
      check: (s) => s.peakBacklog > 1000,
    },
    {
      title: 'Pull instead',
      set: { strategy: 'read' },
      act: ['celebrity'],
      actAt: 20,
      ticks: 100,
      question: 'With fan-out on read, nothing is precomputed, and each feed is built when opened. What does opening a feed cost now?',
      options: ['One read, as before', 'About one read per person followed', 'Zero reads'],
      answer: 1,
      explain: 'Posting is now free, but each open reads every followee\'s timeline, about 30 reads here. Since reads vastly outnumber writes in a news feed, this usually moves the pain somewhere worse.',
      check: (s, _p, h) => s.peakBacklog === 0 && tailMean(h, 'reads', 30) > 15,
    },
    {
      title: 'The hybrid',
      set: { strategy: 'hybrid', threshold: 1000 },
      act: ['celebrity'],
      actAt: 20,
      ticks: 100,
      question: 'Now push posts from ordinary users, and pull only from celebrities with 1,000+ followers. What happens to the celebrity post and to reads?',
      options: ['No backlog, and only a few extra reads per open', 'Same backlog as push', 'Same reads as pull'],
      answer: 0,
      explain: 'A handful of celebrities cause almost all of the fan-out cost, so special-casing just them removes the spike. Each feed open reads the precomputed feed plus a few celebrity timelines. It\'s the approach large social networks actually use.',
      check: (s, _p, h) => s.peakBacklog < 800 && tailMean(h, 'reads', 30) < 10,
    },
  ],
};

const topic: Topic = {
  problem: [
    'A news feed shows you recent posts from people you follow. Doing that from scratch on each open means reading from hundreds of accounts in milliseconds. So the central question is when to do the work: when a post is written, or when a feed is read.',
    'The answer depends on a fact about social graphs: followers follow a power law. Most people have a few hundred, and a tiny number have tens of millions. A design that works for the average user can fall over the moment a celebrity posts.',
  ],
  functional: [
    'Publish a post',
    'See a feed of posts from people you follow, newest first',
    'Include text, images and video',
  ],
  nonFunctional: [
    'Feed loads in under a few hundred milliseconds',
    'A new post appears within seconds',
    'Celebrity posts don\'t overload the system',
  ],
  diagram: {
    nodes: [
      { id: 'u', label: 'Users', col: 0, row: 1, kind: 'client', note: 'Publish posts and open feeds, through a load balancer.' },
      { id: 'p', label: 'Post service', col: 1, row: 0, note: 'Saves the post, then hands off to fan-out.' },
      { id: 'f', label: 'Fan-out service', col: 2, row: 0, note: 'Looks up followers and queues feed updates, skipping celebrities in the hybrid.' },
      { id: 'q', label: 'Message queue', col: 3, row: 0, kind: 'queue', note: 'Smooths out large fan-outs, so a big post doesn\'t need instant work.' },
      { id: 'n', label: 'Feed service', col: 1, row: 2, note: 'Reads the precomputed feed, merges in celebrity posts, and attaches content.' },
      { id: 'c', label: 'Feed cache', col: 3, row: 2, kind: 'store', note: 'Stores post IDs per user, not whole posts, to save memory.' },
      { id: 'g', label: 'Graph store', col: 2, row: 1, kind: 'store', note: 'Who follows whom. The fan-out service reads this constantly.' },
    ],
    edges: [
      { from: 'u', to: 'p' },
      { from: 'u', to: 'n' },
      { from: 'p', to: 'f' },
      { from: 'f', to: 'g' },
      { from: 'f', to: 'q' },
      { from: 'q', to: 'c' },
      { from: 'n', to: 'c' },
    ],
  },
  ideas: [
    { title: 'Fan-out on write', body: 'Push each post into every follower\'s feed cache at write time. Reads become a single cache lookup, but writing gets expensive for popular authors, and you do work for inactive users.' },
    { title: 'Fan-out on read', body: 'Build the feed when it\'s opened, by reading from each followee. Posting is cheap and celebrities are no problem, but reads get slow, and reads are the common case.' },
    { title: 'The hybrid', body: 'Push for most users, and pull for the few with huge followings. This gives fast reads without a fan-out storm, at the cost of two code paths.' },
    { title: 'Store IDs, not posts', body: 'A feed cache holds lists of post IDs, with post content cached separately. It saves a great deal of memory, since one post can appear in millions of feeds.' },
  ],
  estimator: {
    vars: [
      { key: 'dau', label: 'Daily active users', unit: 'count' },
      { key: 'postsPerUser', label: 'Posts per user per day', unit: 'plain', assume: 0.5 },
      { key: 'avgFollowers', label: 'Average followers', unit: 'plain', assume: 300 },
      { key: 'opensPerUser', label: 'Feed opens per user per day', unit: 'plain', assume: 10 },
      { key: 'idBytes', label: 'Bytes per feed entry', unit: 'plain', assume: 8 },
      { key: 'feedLength', label: 'Entries kept per feed', unit: 'plain', assume: 800 },
      { key: 'postQps', label: 'Post rate', unit: 'qps' },
      { key: 'fanoutQps', label: 'Fan-out write rate', unit: 'qps' },
      { key: 'readQps', label: 'Feed read rate', unit: 'qps' },
      { key: 'cache', label: 'Feed cache memory', unit: 'bytes' },
    ],
    eqs: [
      { out: 'postQps', terms: [['dau', 1], ['postsPerUser', 1], [86400, -1]] },
      { out: 'fanoutQps', terms: [['postQps', 1], ['avgFollowers', 1]] },
      { out: 'readQps', terms: [['dau', 1], ['opensPerUser', 1], [86400, -1]] },
      { out: 'cache', terms: [['dau', 1], ['feedLength', 1], ['idBytes', 1]] },
    ],
    starts: [
      { key: 'dau', value: 100_000_000 },
      { key: 'fanoutQps', value: 200000 },
      { key: 'cache', value: 1e12 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'publish(post):' },
    { code: '  save to the author\'s timeline' },
    { code: '  if author is not a celebrity:' },
    { code: '    for each follower: queue a feed update', id: 'backlog' },
    { code: '' },
    { code: 'open_feed(user):' },
    { code: '  posts = precomputed feed for user' },
    { code: '  for each celebrity followed: read their timeline', id: 'reads' },
    { code: '  return posts merged by time' },
    { code: 'strategy in use', id: 'strategy' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Fan-out on write', gain: 'Very fast reads', cost: 'Huge write bursts, and wasted work for inactive users' },
    { choice: 'Fan-out on read', gain: 'Cheap writes and no celebrity problem', cost: 'Slow reads, and reads are the common case' },
    { choice: 'Hybrid', gain: 'Fast reads without fan-out storms', cost: 'Two paths to build and keep correct' },
    { choice: 'Skip inactive users', gain: 'Saves a lot of writes', cost: 'Slow first load when they return' },
  ],
  interview: [
    { q: 'How do you rank a feed instead of sorting by time?', a: 'Generate candidates with fan-out, then score them with a model at read time. Fan-out decides what could be shown, and ranking decides the order.' },
    { q: 'What about someone who follows 5,000 people?', a: 'The same power law applies on the following side. Cap merges at a reasonable number of sources, and rely on precomputed feeds for the rest.' },
    { q: 'How do you handle deleted posts?', a: 'Don\'t try to remove them from millions of feeds. Check at read time: when hydrating IDs into posts, drop any that are deleted or that the viewer shouldn\'t see.' },
    { q: 'What do you cache?', a: 'Feed ID lists, post content, user profiles and social counts, all in separate layers. Post content is especially cache-friendly, as a small number of posts get most of the views.' },
  ],
  mistakes: [
    'Designing only for the average user, and forgetting the celebrity.',
    'Storing full posts in every feed.',
    'Doing fan-out synchronously in the publish request.',
  ],
};

export default topic;
