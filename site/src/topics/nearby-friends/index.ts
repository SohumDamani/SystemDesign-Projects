import type { Lab, Topic } from '../../core/types';
import { fmtCount, fmtInt, fmtPct } from '../../core/format';
import { tailMean } from '../../core/stats';
import source from './engine.ts?raw';
import { FIELD_METERS, distance, move, publishLocation, type Person, type PublishStats } from './engine';

type P = { users: number; friends: number; onlineShare: number; interval: number; radiusKm: number; speed: number };

const DT = 1;

interface S {
  now: number;
  people: Person[];
  stats: PublishStats;
  published: number;
  delivered: number;
  forwarded: number;
  totals: PublishStats;
  error: number;
  errorEma: number;
  avgOnlineFriends: number;
  onlineCount: number;
}

function predictedPublish(s: S, p: P) {
  return s.onlineCount / p.interval;
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'users', label: 'Users', kind: 'range', min: 100, max: 2000, step: 100, rebuild: true },
    { key: 'friends', label: 'Friends per user', kind: 'range', min: 5, max: 100, step: 5, rebuild: true },
    { key: 'onlineShare', label: 'Share online', kind: 'range', min: 0.1, max: 1, step: 0.1, rebuild: true, format: (v) => fmtPct(v) },
    { key: 'interval', label: 'Update interval', kind: 'range', min: 5, max: 120, step: 5, unit: 's' },
    { key: 'radiusKm', label: 'Nearby radius', kind: 'range', min: 1, max: 10, step: 0.5, unit: 'km' },
    { key: 'speed', label: 'Movement speed', kind: 'range', min: 1, max: 30, step: 1, unit: 'm/s' },
  ],
  defaults: { users: 1000, friends: 40, onlineShare: 0.5, interval: 30, radiusKm: 2, speed: 5 },
  create(p, rng) {
    const people: Person[] = Array.from({ length: p.users }, (_, id) => ({
      id,
      x: rng.next() * FIELD_METERS,
      y: rng.next() * FIELD_METERS,
      heading: rng.next() * Math.PI * 2,
      online: rng.chance(p.onlineShare),
      friends: [],
      lastSent: -rng.next() * p.interval,
      known: new Map(),
    }));
    // Friendship is mutual.
    const edges = new Set<string>();
    const wanted = Math.round((p.users * p.friends) / 2);
    while (edges.size < wanted) {
      const a = rng.int(p.users);
      const b = rng.int(p.users);
      if (a === b) continue;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (edges.has(key)) continue;
      edges.add(key);
      people[a].friends.push(b);
      people[b].friends.push(a);
    }
    const online = people.filter((x) => x.online);
    const avgOnlineFriends = online.reduce((sum, x) => sum + x.friends.filter((f) => people[f].online).length, 0) / Math.max(1, online.length);
    return { now: 0, people, stats: { published: 0, delivered: 0, forwarded: 0 }, published: 0, delivered: 0, forwarded: 0, totals: { published: 0, delivered: 0, forwarded: 0 }, error: 0, errorEma: 0, avgOnlineFriends, onlineCount: online.length };
  },
  step(s, p, rng) {
    s.now += DT;
    const tick: PublishStats = { published: 0, delivered: 0, forwarded: 0 };
    for (const person of s.people) {
      if (!person.online) continue;
      move(person, p.speed, DT, 0.01, () => rng.next());
      if (s.now - person.lastSent >= p.interval) {
        person.lastSent = s.now;
        publishLocation(s.people, person, p.radiusKm * 1000, tick);
      }
    }
    s.stats = tick;
    s.totals.published += tick.published;
    s.totals.delivered += tick.delivered;
    s.totals.forwarded += tick.forwarded;
    s.published = s.published * 0.95 + tick.published * 0.05;
    s.delivered = s.delivered * 0.95 + tick.delivered * 0.05;
    s.forwarded = s.forwarded * 0.95 + tick.forwarded * 0.05;
    // How far off is what we're showing? Sample a few known positions and compare.
    let sum = 0;
    let n = 0;
    for (let i = 0; i < 40; i++) {
      const viewer = s.people[rng.int(s.people.length)];
      if (!viewer.online || !viewer.known.size) continue;
      for (const [friendId, last] of viewer.known) {
        sum += distance(last.x, last.y, s.people[friendId].x, s.people[friendId].y);
        n++;
        if (n > 200) break;
      }
    }
    if (n) {
      s.error = sum / n;
      s.errorEma = s.errorEma ? s.errorEma * 0.95 + s.error * 0.05 : s.error;
    }
  },
  sample: (s, p) => ({ delivered: s.delivered, deliveredMath: predictedPublish(s, p) * s.avgOnlineFriends, forwarded: s.forwarded, error: s.errorEma, errorMath: (p.speed * p.interval) / 2 }),
  charts: [
    { title: 'Pub/sub messages per second', series: [{ key: 'delivered', label: 'Measured', role: 'measured' }, { key: 'deliveredMath', label: 'Math', role: 'predicted' }, { key: 'forwarded', label: 'Useful', role: 'other' }] },
    { title: 'How far off a shown position is', unit: 'm', series: [{ key: 'error', label: 'Measured', role: 'measured' }, { key: 'errorMath', label: 'Math', role: 'predicted' }] },
  ],
  metrics(s, p) {
    const area = (Math.PI * (p.radiusKm * 1000) ** 2) / FIELD_METERS ** 2;
    return [
      { label: 'Messages per second', value: fmtCount(predictedPublish(s, p) * s.avgOnlineFriends), role: 'predicted' },
      { label: 'Messages per second', value: fmtCount(s.delivered), role: 'measured' },
      { label: 'Useful share', value: fmtPct(Math.min(1, area), 1), role: 'predicted' },
      { label: 'Useful share', value: fmtPct(s.totals.delivered ? s.totals.forwarded / s.totals.delivered : 0, 1), role: 'measured' },
      { label: 'Position error', value: `${fmtInt(s.errorEma)} m`, role: 'measured' },
    ];
  },
  math(s, p) {
    return [
      { expr: `Updates: ${fmtInt(s.onlineCount)} online ÷ ${p.interval} s`, result: `${fmtCount(predictedPublish(s, p))}/s` },
      { expr: `Fan-out: × ${s.avgOnlineFriends.toFixed(1)} online friends`, result: `${fmtCount(predictedPublish(s, p) * s.avgOnlineFriends)} messages/s` },
      { expr: `Average staleness: ${p.speed} m/s × ${p.interval} s ÷ 2`, result: `${fmtInt((p.speed * p.interval) / 2)} m` },
    ];
  },
  trace: (s) => ({ values: { pub: fmtInt(s.stats.published), del: fmtInt(s.stats.delivered), fwd: fmtInt(s.stats.forwarded) } }),
  experiments: [
    {
      title: 'Update twice as often',
      set: { interval: 15 },
      ticks: 300,
      question: 'Moving from a 30-second to a 15-second interval, what happens to pub/sub traffic?',
      options: ['It stays the same', 'It doubles', 'It quadruples'],
      answer: 1,
      explain: 'Twice the updates, each fanned out to the same friends, means twice the messages. The update interval is your most powerful dial here, and every other cost scales with it.',
      check: (s, p) => {
        const expected = predictedPublish(s, p) * s.avgOnlineFriends;
        return s.delivered > expected * 0.8 && s.delivered < expected * 1.2;
      },
    },
    {
      title: 'What staleness costs',
      set: { interval: 60, speed: 10 },
      ticks: 400,
      question: 'Updates arrive every 60 seconds, and people move at 10 m/s, about 36 km/h. How far off is a friend\'s shown position, on average?',
      options: ['About 30 meters', 'About 300 meters', 'About 3 km'],
      answer: 1,
      explain: 'A position is on average half an interval old, so the error is 10 × 60 ÷ 2 = 300 m. That\'s fine for "your friend is around here", though not for navigation. Requirements decide how much accuracy is worth paying for.',
      check: (_s, _p, h) => {
        const e = tailMean(h, 'error', 100);
        return e > 170 && e < 430;
      },
    },
    {
      title: 'How much is wasted?',
      set: { radiusKm: 1 },
      ticks: 200,
      question: 'Every update reaches each online friend, but only those within 1 km care. On a 10 km × 10 km map, what share is useful?',
      options: ['Nearly all', 'About half', 'About 3%'],
      answer: 2,
      explain: 'The circle covers π × 1² out of 100 km², about 3%. So most messages get dropped right after delivery. Geohash channels fix this, by only subscribing to your area, at the price of more complex subscribe logic.',
      check: (s) => s.totals.delivered > 100 && s.totals.forwarded / s.totals.delivered < 0.09,
    },
  ],
};

const topic: Topic = {
  problem: [
    'Nearby friends shows which of your friends are close, updating as everyone moves. Unlike finding restaurants, where the data barely changes, every user here is a moving data source, sending a fresh location every few seconds.',
    'So the problem is overwhelmingly about write traffic and fan-out. A location must reach every online friend, and most of those friends are too far away to care. The design question is how to do this without melting everything.',
  ],
  functional: [
    'See friends within a chosen radius, with distance and last-updated time',
    'The list updates every few seconds',
    'Optionally keep location history',
  ],
  nonFunctional: [
    'Low latency for location updates',
    'Some lost updates are fine',
    'Eventual consistency is fine, and a few seconds of delay is acceptable',
  ],
  diagram: {
    nodes: [
      { id: 'a', label: 'Mobile app', col: 0, row: 1, kind: 'client', note: 'Sends location over a WebSocket, every 30 seconds or so.' },
      { id: 'w', label: 'WebSocket servers', col: 1, row: 1, note: 'Stateful. Each has one handler per user, which subscribes to all their friends\' channels.' },
      { id: 'r', label: 'Redis pub/sub', col: 2, row: 0, kind: 'queue', note: 'One lightweight channel per user. Messages aren\'t stored: offline means you miss them, which is fine here.' },
      { id: 'c', label: 'Location cache', col: 2, row: 1, kind: 'store', note: 'Latest location per user, with a TTL, so inactive users disappear automatically.' },
      { id: 'h', label: 'Location history', col: 2, row: 2, kind: 'store', note: 'Write-heavy log of past locations, well suited to Cassandra.' },
      { id: 'u', label: 'Friend database', col: 1, row: 2, kind: 'store', note: 'The social graph, read when a user comes online to know which channels to join.' },
    ],
    edges: [
      { from: 'a', to: 'w', label: 'WebSocket' },
      { from: 'w', to: 'r' },
      { from: 'r', to: 'w', dashed: true },
      { from: 'w', to: 'c' },
      { from: 'w', to: 'h', dashed: true },
      { from: 'w', to: 'u' },
    ],
  },
  ideas: [
    { title: 'One channel per user', body: 'Each user publishes to their own channel, and their online friends subscribe. Redis pub/sub channels are cheap, so you can have millions, even when inactive.' },
    { title: 'Filter at the handler', body: 'The WebSocket handler receives every friend\'s update and checks the distance before forwarding. Most stop there, so CPU becomes the bottleneck rather than bandwidth.' },
    { title: 'Scaling stateful pub/sub', body: 'Use a consistent hash ring to map channels to Redis servers. Resizing reshuffles subscriptions, so do it in quiet hours and never run this tier close to capacity.' },
    { title: 'Geohash channels', body: 'Subscribe to a channel per area rather than per friend. It suits features involving strangers, and it naturally skips far-away updates, but it needs care at cell edges.' },
  ],
  estimator: {
    vars: [
      { key: 'dau', label: 'Daily active users', unit: 'count' },
      { key: 'concurrentShare', label: 'Share online at once (0 to 1)', unit: 'plain', assume: 0.1 },
      { key: 'interval', label: 'Seconds between updates', unit: 'plain', assume: 30 },
      { key: 'friendsOnline', label: 'Friends online per user', unit: 'plain', assume: 40 },
      { key: 'serverPushes', label: 'Pushes per second per Redis server', unit: 'plain', assume: 100000 },
      { key: 'concurrent', label: 'Concurrent users', unit: 'count' },
      { key: 'updates', label: 'Location updates', unit: 'qps' },
      { key: 'pushes', label: 'Pub/sub pushes', unit: 'qps' },
      { key: 'servers', label: 'Redis servers', unit: 'count' },
    ],
    eqs: [
      { out: 'concurrent', terms: [['dau', 1], ['concurrentShare', 1]] },
      { out: 'updates', terms: [['concurrent', 1], ['interval', -1]] },
      { out: 'pushes', terms: [['updates', 1], ['friendsOnline', 1]] },
      { out: 'servers', terms: [['pushes', 1], ['serverPushes', -1]] },
    ],
    starts: [
      { key: 'dau', value: 100_000_000 },
      { key: 'updates', value: 300000 },
      { key: 'servers', value: 100 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'on_location_update(user, position):' },
    { code: '  save to cache with a TTL' },
    { code: '  publish to user\'s channel', id: 'pub' },
    { code: '' },
    { code: 'on_message(handler for a friend, position):' },
    { code: '  messages this tick', id: 'del' },
    { code: '  if distance(friend, position) <= radius:' },
    { code: '    send over the friend\'s WebSocket', id: 'fwd' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Shorter interval', gain: 'Fresher locations', cost: 'Directly proportional load and battery drain' },
    { choice: 'Channel per user', gain: 'Simple, and maps well to friends', cost: 'Lots of wasted messages for far-away friends' },
    { choice: 'Channel per geohash', gain: 'Skips far-away traffic', cost: 'More complex, with cell boundary handling' },
    { choice: 'Redis pub/sub', gain: 'Very lightweight channels', cost: 'No durability, which suits this case' },
  ],
  interview: [
    { q: 'Why not poll the database for nearby friends?', a: 'At hundreds of thousands of writes a second and constantly changing data, an index wouldn\'t keep up. Pushing through pub/sub only does work when something actually changes.' },
    { q: 'What happens when a WebSocket server is restarted?', a: 'Its connections drop and clients reconnect elsewhere. Drain servers gradually during deploys, so users don\'t all reconnect at once.' },
    { q: 'How do you handle users with many friends?', a: 'Cap the friend count. For a hard limit like 5,000, the load on a single handler is bounded, and it spreads across servers since friends live on different ones.' },
    { q: 'Could you avoid pub/sub entirely?', a: 'Yes. Erlang-style systems route messages directly between connection processes. It\'s elegant at huge scale, but it usually means building in a very different ecosystem.' },
  ],
  mistakes: [
    'Treating it like a static proximity search.',
    'Keeping Redis pub/sub servers near capacity, when resizing is disruptive.',
    'Requiring strong consistency for data that\'s out of date within seconds anyway.',
  ],
};

export default topic;
