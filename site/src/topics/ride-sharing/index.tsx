import type { CustomViewProps, Lab, Topic } from '../../core/types';
import type { Rng } from '../../core/rng';
import { fmtCount, fmtDuration, fmtInt, fmtPct } from '../../core/format';
import source from './engine.ts?raw';
import { CITY_METERS, GridIndex, SPEED, matchBatch, type Driver, type Rider } from './engine';

type P = { drivers: number; ridersPerMin: number; tripMinutes: number; batchSeconds: number; updateSeconds: number };

const DT = 1;
const CANCEL_AFTER = 180;

interface City {
  drivers: Driver[];
  index: GridIndex;
  waiting: Rider[];
  pickupSum: number;
  pickupEma: number;
  matched: number;
  cancelled: number;
  errorSum: number;
  batchTimer: number;
}

interface S {
  now: number;
  greedy: City;
  batched: City;
  nextRider: number;
  requested: number;
  lastMatch: string;
  searches: number;
}

function makeCity(start: { x: number; y: number }[]): City {
  const drivers: Driver[] = start.map(({ x, y }, id) => ({ id, x, y, knownX: x, knownY: y, busyUntil: 0 }));
  const index = new GridIndex();
  for (const d of drivers) index.add(d);
  return { drivers, index, waiting: [], pickupSum: 0, pickupEma: 0, matched: 0, cancelled: 0, errorSum: 0, batchTimer: 0 };
}

function assign(c: City, s: S, p: P, r: Rider, d: Driver, rng: Rng) {
  const estimate = Math.hypot(d.knownX - r.x, d.knownY - r.y);
  const actual = Math.hypot(d.x - r.x, d.y - r.y);
  const pickup = actual / SPEED;
  c.index.remove(d);
  c.pickupSum += pickup;
  c.pickupEma = c.pickupEma ? c.pickupEma * 0.97 + pickup * 0.03 : pickup;
  c.errorSum += Math.abs(actual - estimate);
  c.matched++;
  d.busyUntil = s.now + pickup + rng.exponential(p.tripMinutes * 60);
  // The trip ends at a new random place.
  d.x = rng.next() * CITY_METERS;
  d.y = rng.next() * CITY_METERS;
  s.lastMatch = `Rider ${r.id} gets driver ${d.id}, ${fmtDuration(pickup)} away`;
}

function updateDrivers(c: City, s: S, p: P, rng: Rng) {
  for (const d of c.drivers) {
    if (d.busyUntil > s.now) continue;
    if (d.busyUntil > s.now - DT && d.busyUntil > 0) {
      // Just became free, at the end of a trip.
      d.knownX = d.x;
      d.knownY = d.y;
      c.index.add(d);
      continue;
    }
    // Idle drivers cruise around, and report in at each update interval.
    d.x = Math.min(CITY_METERS, Math.max(0, d.x + rng.gaussian(0, 8)));
    d.y = Math.min(CITY_METERS, Math.max(0, d.y + rng.gaussian(0, 8)));
    if ((s.now + d.id) % p.updateSeconds < DT) {
      c.index.remove(d);
      d.knownX = d.x;
      d.knownY = d.y;
      c.index.add(d);
    }
  }
}

const idle = (c: City, now: number) => c.drivers.filter((d) => d.busyUntil <= now);
const avgPickup = (c: City) => (c.matched ? c.pickupSum / c.matched : 0);

function MapView({ state }: CustomViewProps<S, P>) {
  const c = state.batched;
  const size = 420;
  const scale = size / CITY_METERS;
  return (
    <div className="lab-panel">
      <h4>The city: idle drivers in green, busy in gray, waiting riders in orange</h4>
      <svg viewBox={`0 0 ${size} ${size}`} className="lab-svg" style={{ maxWidth: 440 }} role="img" aria-label={`${idle(c, state.now).length} idle drivers and ${c.waiting.length} waiting riders.`}>
        {c.drivers.map((d) => (
          <circle key={d.id} cx={d.x * scale} cy={d.y * scale} r="2.4" fill={d.busyUntil > state.now ? 'var(--line-strong)' : '#4cc98a'} />
        ))}
        {c.waiting.map((r) => (
          <rect key={r.id} x={r.x * scale - 3} y={r.y * scale - 3} width="6" height="6" fill="var(--predicted)" />
        ))}
      </svg>
    </div>
  );
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'drivers', label: 'Drivers', kind: 'range', min: 50, max: 1000, step: 50, rebuild: true },
    { key: 'ridersPerMin', label: 'Ride requests', kind: 'range', min: 5, max: 300, step: 5, unit: 'per min' },
    { key: 'tripMinutes', label: 'Average trip', kind: 'range', min: 2, max: 40, step: 1, unit: 'min' },
    { key: 'batchSeconds', label: 'Batch window, for batched matching', kind: 'range', min: 1, max: 30, step: 1, unit: 's' },
    { key: 'updateSeconds', label: 'Driver location update interval', kind: 'range', min: 1, max: 120, step: 1, unit: 's' },
  ],
  defaults: { drivers: 300, ridersPerMin: 25, tripMinutes: 5, batchSeconds: 5, updateSeconds: 4 },
  create(p, rng) {
    const start = Array.from({ length: p.drivers }, () => ({ x: rng.next() * CITY_METERS, y: rng.next() * CITY_METERS }));
    return { now: 0, greedy: makeCity(start), batched: makeCity(start), nextRider: 1, requested: 0, lastMatch: '', searches: 0 };
  },
  step(s, p, rng) {
    s.now += DT;
    updateDrivers(s.greedy, s, p, rng);
    updateDrivers(s.batched, s, p, rng);
    // The same riders arrive in both cities, so the comparison is fair.
    for (let i = rng.poisson((p.ridersPerMin / 60) * DT); i > 0; i--) {
      const rider: Rider = { id: s.nextRider++, x: rng.next() * CITY_METERS, y: rng.next() * CITY_METERS, requestedAt: s.now };
      s.requested++;
      s.greedy.waiting.push({ ...rider });
      s.batched.waiting.push({ ...rider });
    }
    // Greedy: each rider immediately takes the nearest idle driver.
    s.greedy.waiting = s.greedy.waiting.filter((r) => {
      const d = s.greedy.index.nearest(r.x, r.y);
      s.searches++;
      if (d) {
        assign(s.greedy, s, p, r, d, rng);
        return false;
      }
      return true;
    });
    // Batched: wait, then choose the best pairs across all waiting riders.
    s.batched.batchTimer += DT;
    if (s.batched.batchTimer >= p.batchSeconds) {
      s.batched.batchTimer = 0;
      for (const { rider, driver } of matchBatch(s.batched.waiting, idle(s.batched, s.now))) {
        assign(s.batched, s, p, rider, driver, rng);
        s.batched.waiting = s.batched.waiting.filter((r) => r.id !== rider.id);
      }
    }
    for (const c of [s.greedy, s.batched]) {
      c.waiting = c.waiting.filter((r) => {
        if (s.now - r.requestedAt < CANCEL_AFTER) return true;
        c.cancelled++;
        return false;
      });
    }
  },
  sample: (s, p) => {
    const load = (p.ridersPerMin / 60) * (p.tripMinutes * 60 + avgPickup(s.greedy));
    return { greedy: s.greedy.pickupEma, batched: s.batched.pickupEma, busy: s.greedy.drivers.length - idle(s.greedy, s.now).length, busyMath: Math.min(p.drivers, load) };
  },
  charts: [
    { title: 'Pickup time for the same riders', unit: 's', series: [{ key: 'greedy', label: 'Nearest driver now', role: 'measured' }, { key: 'batched', label: 'Batched', role: 'other' }] },
    { title: 'Drivers on a trip', series: [{ key: 'busy', label: 'Measured', role: 'measured' }, { key: 'busyMath', label: 'Math', role: 'predicted' }] },
  ],
  metrics(s, p) {
    const max = p.drivers / (p.tripMinutes * 60);
    const demand = p.ridersPerMin / 60;
    return [
      { label: 'Driver utilization', value: fmtPct(Math.min(1, demand / max)), role: 'predicted', tone: demand >= max ? 'bad' : demand / max > 0.8 ? 'warn' : 'good' },
      { label: 'Pickup, nearest now', value: fmtDuration(avgPickup(s.greedy)), role: 'measured' },
      { label: 'Pickup, batched', value: fmtDuration(avgPickup(s.batched)), role: 'measured' },
      { label: 'Drivers checked per match', value: s.searches ? (s.greedy.index.visited / s.searches).toFixed(1) : '0', role: 'measured' },
      { label: 'Rides cancelled', value: fmtInt(s.greedy.cancelled), role: 'measured', tone: s.greedy.cancelled ? 'bad' : 'good' },
      { label: 'Location error at match', value: `${fmtInt(s.greedy.matched ? s.greedy.errorSum / s.greedy.matched : 0)} m`, role: 'measured' },
    ];
  },
  math(_s, p) {
    const trip = p.tripMinutes * 60;
    return [
      { expr: `Most rides per minute: ${p.drivers} drivers ÷ ${p.tripMinutes} min`, result: `${fmtInt(p.drivers / p.tripMinutes)}/min`, tone: p.ridersPerMin < p.drivers / p.tripMinutes ? 'good' : 'bad' },
      { expr: `Drivers busy: ${(p.ridersPerMin / 60).toFixed(2)} rides/s × ${trip} s`, result: `${fmtInt((p.ridersPerMin / 60) * trip)} of ${p.drivers}` },
      { expr: `Location writes: ${p.drivers} drivers ÷ ${p.updateSeconds} s`, result: `${fmtCount(p.drivers / p.updateSeconds)}/s` },
    ];
  },
  View: MapView,
  trace: (s) => ({
    values: { checked: s.searches ? `${(s.greedy.index.visited / s.searches).toFixed(1)} drivers per search` : '', match: s.lastMatch, wait: `${s.batched.waiting.length} waiting` },
  }),
  experiments: [
    {
      title: 'Use a geo index',
      set: { drivers: 800, ridersPerMin: 60 },
      ticks: 120,
      question: 'A rider requests a car, with 800 drivers in the city. Using a grid index that searches outward from the rider, how many drivers get looked at?',
      options: ['A few dozen or fewer', 'About half', 'All 800'],
      answer: 0,
      explain: 'Only cells near the rider are checked, and the search stops once nothing closer can exist. That\'s what makes matching fast at city scale, where a real system may have millions of drivers worldwide.',
      check: (s) => s.greedy.index.visited / s.searches < 40,
    },
    {
      title: 'Not enough drivers',
      set: { drivers: 100, ridersPerMin: 60, tripMinutes: 5 },
      ticks: 600,
      question: 'There are 100 drivers, trips last 5 minutes, and 60 rides are requested per minute. Can they keep up?',
      options: ['Yes', 'No, at most 20 rides a minute are possible, so riders give up'],
      answer: 1,
      explain: 'Each driver finishes 1 trip every 5 minutes, so 100 drivers handle 20 a minute. No matching algorithm can fix a capacity shortage. That\'s why surge pricing exists: to attract drivers and reduce demand.',
      check: (s) => s.greedy.cancelled > 20,
    },
    {
      title: 'Wait, and match better',
      set: { drivers: 200, ridersPerMin: 38, tripMinutes: 5, batchSeconds: 15 },
      ticks: 900,
      question: 'Drivers are nearly all busy. Compare taking the nearest driver immediately, with waiting 15 seconds and matching everyone together. Which gives shorter pickups?',
      options: ['Immediately, since it doesn\'t wait', 'Batched, as it can avoid wasting scarce drivers'],
      answer: 1,
      explain: 'When drivers are scarce, greedy matching can send a far-away driver to one rider, when another rider was right next to them. A small batch window sees both, and pairs them better. When drivers are plentiful, the two are nearly equal.',
      check: (s) => avgPickup(s.batched) < avgPickup(s.greedy) && s.batched.matched > 50,
    },
    {
      title: 'Stale locations',
      set: { drivers: 300, ridersPerMin: 60, updateSeconds: 120 },
      ticks: 300,
      question: 'If drivers only report their location every 2 minutes, what happens to the distance the system thinks a driver is away?',
      options: ['It\'s still accurate', 'It\'s off by a noticeable amount, so matches get worse'],
      answer: 1,
      explain: 'You\'re matching against where drivers were, not where they are. Real systems send updates every few seconds, and that\'s why location writes dominate a ride-sharing system\'s traffic, far exceeding the ride requests themselves.',
      check: (s) => s.greedy.errorSum / s.greedy.matched > 20,
    },
  ],
};

const topic: Topic = {
  problem: [
    'A ride-sharing service has to match a rider with a nearby driver within seconds, using locations that change constantly. Millions of drivers send GPS updates every few seconds, so writes vastly outnumber actual ride requests.',
    'There are two core problems. The first is finding nearby drivers quickly, which is a geo index problem. The second is assigning them well: the closest driver for one rider may be a bad choice for the system as a whole.',
  ],
  functional: [
    'Riders request a ride, and see an estimated pickup time',
    'Drivers report location, and accept rides',
    'Match riders to nearby drivers, and track the trip',
  ],
  nonFunctional: [
    'Matching takes only a few seconds',
    'Handles a huge rate of location writes',
    'A driver is never matched to two riders at once',
  ],
  diagram: {
    nodes: [
      { id: 'r', label: 'Rider app', col: 0, row: 0, kind: 'client', note: 'Requests a ride, and sees the driver approaching on the map.' },
      { id: 'd', label: 'Driver app', col: 0, row: 2, kind: 'client', note: 'Sends location every few seconds, over a persistent connection.' },
      { id: 'm', label: 'Matching service', col: 1, row: 0, note: 'Finds candidates, and assigns riders in small batches.' },
      { id: 'l', label: 'Location service', col: 1, row: 2, note: 'Handles a huge stream of location updates.' },
      { id: 'g', label: 'Geo index', col: 2, row: 1, kind: 'store', note: 'An in-memory grid of driver locations, sharded by city or cell. Losing it is fine, as updates rebuild it in seconds.' },
      { id: 't', label: 'Trip database', col: 2, row: 0, kind: 'store', note: 'Durable trip records. Assigning a driver has to be atomic, so that they can\'t be double-booked.' },
      { id: 'k', label: 'Kafka', col: 2, row: 2, kind: 'queue', note: 'Streams locations to analytics, pricing, and ETA models.' },
    ],
    edges: [
      { from: 'r', to: 'm' },
      { from: 'd', to: 'l' },
      { from: 'l', to: 'g' },
      { from: 'm', to: 'g' },
      { from: 'm', to: 't' },
      { from: 'l', to: 'k', dashed: true },
    ],
  },
  ideas: [
    { title: 'A geo index in memory', body: 'Locations change too fast for a normal database index. Keep them in memory, in a grid or geohash, sharded by area. If you lose it, the next round of updates rebuilds it within seconds.' },
    { title: 'Batched matching', body: 'Rather than assigning each rider instantly, gather requests for a few seconds, and optimize across all of them. Riders barely notice the wait, and overall pickup time falls.' },
    { title: 'Avoiding double booking', body: 'Two riders mustn\'t get the same driver. Use an atomic state change on the driver, and treat offers as leases with an expiry, so that a driver who doesn\'t answer becomes available again.' },
    { title: 'Surge pricing', body: 'When demand exceeds supply, no algorithm helps. Raising prices reduces demand and attracts drivers, and it requires estimating supply and demand per area in near real time.' },
  ],
  estimator: {
    vars: [
      { key: 'drivers', label: 'Active drivers', unit: 'count' },
      { key: 'interval', label: 'Seconds between location updates', unit: 'plain', assume: 4 },
      { key: 'updateBytes', label: 'Bytes per update', unit: 'plain', assume: 100 },
      { key: 'trips', label: 'Trips per driver per day', unit: 'plain', assume: 15 },
      { key: 'locationQps', label: 'Location updates', unit: 'qps' },
      { key: 'ingest', label: 'Location bandwidth', unit: 'bytesPerSec' },
      { key: 'matchQps', label: 'Ride requests', unit: 'qps' },
    ],
    eqs: [
      { out: 'locationQps', terms: [['drivers', 1], ['interval', -1]] },
      { out: 'ingest', terms: [['locationQps', 1], ['updateBytes', 1]] },
      { out: 'matchQps', terms: [['drivers', 1], ['trips', 1], [86400, -1]] },
    ],
    starts: [
      { key: 'drivers', value: 1_000_000 },
      { key: 'locationQps', value: 500000 },
      { key: 'matchQps', value: 200 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'every few seconds:' },
    { code: '  riders = everyone waiting', id: 'wait' },
    { code: '  drivers = idle drivers near them', id: 'checked' },
    { code: '  sort all rider-driver pairs by distance' },
    { code: '  take pairs in order, skipping anyone already used' },
    { code: '  atomically mark each driver as assigned', id: 'match' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Nearest driver now', gain: 'Simple and instant', cost: 'Wastes drivers when they\'re scarce' },
    { choice: 'Batched matching', gain: 'Shorter pickups overall', cost: 'A few seconds of extra wait, and more compute' },
    { choice: 'Frequent location updates', gain: 'Accurate matching and ETAs', cost: 'Heavy write load and more phone battery' },
    { choice: 'Grid index', gain: 'Simple and fast', cost: 'Uneven cell density, which S2 or H3 cells handle better' },
  ],
  interview: [
    { q: 'How do you shard the geo index?', a: 'By city or by geographic cell, since matches are local. Busy cities need many shards while quiet ones share. Trips crossing a boundary mean querying neighboring cells.' },
    { q: 'What if a driver doesn\'t respond to an offer?', a: 'Offers are leases with a short expiry, around 10 to 15 seconds. When one expires, the driver is free again, and the rider goes back into the next batch.' },
    { q: 'Do location updates need to be durable?', a: 'Not for matching, since the next update replaces them within seconds. Write them to memory for matching, and stream them to cheap storage for analysis and for records of the trip.' },
    { q: 'How do you estimate arrival time?', a: 'Route on a road graph, using live and historical speeds. Machine learning corrects for local patterns, as covered in the maps lesson.' },
  ],
  mistakes: [
    'Writing every GPS update to a transactional database.',
    'Using straight-line distance as if it were travel time.',
    'Letting one driver be offered to two riders at once.',
  ],
};

export default topic;
