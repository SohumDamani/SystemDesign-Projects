import type { Lab, Topic } from '../../core/types';
import type { Rng } from '../../core/rng';
import { fmtCount, fmtDuration, fmtInt, fmtPct } from '../../core/format';
import source from './engine.ts?raw';
import { RowLock, commitOptimistic, commitUnsafe, commitWithConstraint, retryDelay, type Inventory, type Strategy, type Txn, type TxnResult } from './engine';

type P = { strategy: Strategy; arrivals: number; holdMs: number; rooms: number; doubleClick: number; idempotent: boolean };

const DT = 0.05;
const DAY_SECONDS = 6;
const MAX_ATTEMPTS = 5;

interface S {
  now: number;
  inv: Inventory;
  nextDayAt: number;
  active: Txn[];
  lock: RowLock;
  retrying: { t: Txn; at: number }[];
  nextTxn: number;
  nextReservation: number;
  seenReservations: Set<number>;
  booked: number;
  soldOut: number;
  overbooked: number;
  retries: number;
  gaveUp: number;
  doubleBookedUsers: number;
  duplicatesBlocked: number;
  latency: number;
  completed: number;
}

function start(s: S, t: Txn, p: P) {
  t.readReserved = s.inv.reserved;
  t.readVersion = s.inv.version;
  if (p.strategy === 'pessimistic') s.lock.acquire(t, s.now, p.holdMs / 1000);
  else {
    t.finishAt = s.now + p.holdMs / 1000;
    s.active.push(t);
  }
}

function finish(s: S, t: Txn, p: P, rng: Rng) {
  let result: TxnResult;
  if (p.idempotent && s.seenReservations.has(t.reservationId)) result = 'duplicate';
  else if (p.strategy === 'none') result = commitUnsafe(s.inv, t);
  else if (p.strategy === 'optimistic') result = commitOptimistic(s.inv, t);
  // Under a row lock nobody else can change the row, so the check and write can't interleave.
  else result = commitWithConstraint(s.inv);

  if (result === 'conflict') {
    t.attempts++;
    s.retries++;
    if (t.attempts >= MAX_ATTEMPTS) s.gaveUp++;
    else s.retrying.push({ t, at: s.now + retryDelay(t.attempts, rng) });
    return;
  }
  if (result === 'booked') {
    if (s.seenReservations.has(t.reservationId)) s.doubleBookedUsers++;
    s.seenReservations.add(t.reservationId);
    s.booked++;
    if (s.inv.reserved > s.inv.total) s.overbooked++;
  } else if (result === 'sold-out') s.soldOut++;
  else s.duplicatesBlocked++;
  s.completed++;
  s.latency = s.latency * 0.98 + (s.now - t.arrivedAt) * 0.02;
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'strategy', label: 'Concurrency control', kind: 'choice', rebuild: true, options: [{ value: 'none', label: 'None: check, then write' }, { value: 'pessimistic', label: 'Pessimistic row lock' }, { value: 'optimistic', label: 'Optimistic version check' }, { value: 'constraint', label: 'Atomic database constraint' }] },
    { key: 'arrivals', label: 'Booking attempts', kind: 'range', min: 5, max: 500, step: 5, unit: 'per s' },
    { key: 'holdMs', label: 'Transaction time', kind: 'range', min: 1, max: 200, step: 1, unit: 'ms' },
    { key: 'rooms', label: 'Rooms per day', kind: 'range', min: 10, max: 500, step: 10, rebuild: true },
    { key: 'doubleClick', label: 'Users who double-click', kind: 'range', min: 0, max: 0.5, step: 0.05, format: (v) => fmtPct(v) },
    { key: 'idempotent', label: 'Use a reservation ID as idempotency key', kind: 'toggle' },
  ],
  defaults: { strategy: 'none', arrivals: 100, holdMs: 50, rooms: 100, doubleClick: 0, idempotent: false },
  create: (p) => ({ now: 0, inv: { total: p.rooms, reserved: 0, version: 0 }, nextDayAt: DAY_SECONDS, active: [], lock: new RowLock(), retrying: [], nextTxn: 1, nextReservation: 1, seenReservations: new Set(), booked: 0, soldOut: 0, overbooked: 0, retries: 0, gaveUp: 0, doubleBookedUsers: 0, duplicatesBlocked: 0, latency: 0, completed: 0 }),
  step(s, p, rng) {
    s.now += DT;
    if (s.now >= s.nextDayAt) {
      // A new date goes on sale.
      s.inv = { total: p.rooms, reserved: 0, version: 0 };
      s.nextDayAt = s.now + DAY_SECONDS;
    }
    const newTxn = (reservationId: number): Txn => ({ id: s.nextTxn++, reservationId, arrivedAt: s.now, finishAt: 0, readReserved: 0, readVersion: 0, attempts: 0 });
    for (let i = rng.poisson(p.arrivals * DT); i > 0; i--) {
      const reservationId = s.nextReservation++;
      start(s, newTxn(reservationId), p);
      if (rng.chance(p.doubleClick)) start(s, newTxn(reservationId), p);
    }
    s.retrying = s.retrying.filter((r) => {
      if (r.at > s.now) return true;
      start(s, r.t, p);
      return false;
    });
    if (p.strategy === 'pessimistic') {
      while (s.lock.holder && s.lock.holder.finishAt <= s.now) {
        finish(s, s.lock.holder, p, rng);
        s.lock.release(s.now, p.holdMs / 1000);
      }
    } else {
      s.active = s.active.filter((t) => {
        if (t.finishAt > s.now) return true;
        finish(s, t, p, rng);
        return false;
      });
    }
  },
  sample: (s) => ({ over: s.overbooked, latency: s.latency * 1000, queue: s.lock.queue.length, reserved: s.inv.reserved, total: s.inv.total }),
  charts: [
    { title: 'Rooms reserved against rooms available today', series: [{ key: 'reserved', label: 'Reserved', role: 'measured' }, { key: 'total', label: 'Available', role: 'predicted' }] },
    { title: 'Booking latency', unit: 'ms', series: [{ key: 'latency', label: 'Measured', role: 'measured' }] },
  ],
  metrics(s, p) {
    const concurrency = (p.arrivals * p.holdMs) / 1000;
    return [
      { label: 'Average in flight', value: concurrency.toFixed(1), role: 'predicted' },
      { label: 'Booked', value: fmtCount(s.booked), role: 'measured' },
      { label: 'Overbooked', value: fmtInt(s.overbooked), role: 'measured', tone: s.overbooked ? 'bad' : 'good' },
      { label: 'Same user booked twice', value: fmtInt(s.doubleBookedUsers), role: 'measured', tone: s.doubleBookedUsers ? 'bad' : 'good' },
      { label: 'Retries', value: fmtCount(s.retries), role: 'measured', tone: s.retries > s.booked ? 'warn' : undefined },
      { label: 'Latency', value: fmtDuration(s.latency), role: 'measured' },
    ];
  },
  math(_s, p) {
    const hold = p.holdMs / 1000;
    const inFlight = p.arrivals * hold;
    return [
      { expr: `Bookings at once: ${p.arrivals}/s × ${p.holdMs} ms`, result: inFlight.toFixed(1) },
      { expr: `Most a row lock can do: 1 ÷ ${p.holdMs} ms`, result: `${fmtInt(1 / hold)}/s`, tone: p.strategy === 'pessimistic' && p.arrivals > 1 / hold ? 'bad' : undefined },
      { expr: 'Chance another booking overlaps yours: 1 − e^(−in flight)', result: fmtPct(1 - Math.exp(-inFlight)) },
    ];
  },
  views: (s) => [
    { kind: 'bars', title: 'Today\'s inventory', marker: { value: s.inv.total, label: 'Rooms available' }, items: [{ label: 'Reserved', value: s.inv.reserved, tone: s.inv.reserved > s.inv.total ? 'bad' : 'neutral' }] },
    { kind: 'cells', title: 'Outcomes', items: [{ label: 'Sold out', value: fmtCount(s.soldOut) }, { label: 'Gave up', value: fmtCount(s.gaveUp), tone: s.gaveUp ? 'warn' : 'neutral' }, { label: 'Dups blocked', value: fmtCount(s.duplicatesBlocked), tone: s.duplicatesBlocked ? 'good' : 'neutral' }, { label: 'Waiting on lock', value: fmtInt(s.lock.queue.length) }] },
  ],
  trace: (s, p) => ({
    values: { avail: `${s.inv.reserved} of ${s.inv.total}`, ver: `version ${fmtInt(s.inv.version)}`, strat: p.strategy, over: fmtInt(s.overbooked) },
  }),
  experiments: [
    {
      title: 'Check, then write',
      set: { strategy: 'none', arrivals: 200, holdMs: 50, rooms: 100 },
      ticks: 400,
      question: 'Code checks `reserved < total`, then writes. Hundreds of bookings a second arrive, each taking 50 ms. Will it ever overbook?',
      options: ['No, since it checks first', 'Yes, often'],
      answer: 1,
      explain: 'Ten bookings overlap at any moment. Near the end, several read "one room left" before any of them write, and all succeed. The check and the write must be one atomic step, or the check isn\'t really protecting you.',
      check: (s) => s.overbooked > 5,
    },
    {
      title: 'Lock the row',
      set: { strategy: 'pessimistic', arrivals: 15, holdMs: 50, rooms: 100 },
      ticks: 200,
      question: 'A row lock lets only one booking run at a time. Transactions take 50 ms, and 15 arrive each second. What happens?',
      options: ['No overbooking, with little waiting', 'Overbooking continues'],
      answer: 0,
      explain: 'The lock serializes them, so nothing overbooks, and 15 a second is below the limit of 1 ÷ 0.05 = 20 a second. That\'s the hidden limit: a lock caps throughput at one transaction at a time, per row.',
      check: (s) => s.overbooked === 0 && s.latency < 0.3,
    },
    {
      title: 'Too much for one lock',
      set: { strategy: 'pessimistic', arrivals: 100, holdMs: 50, rooms: 100 },
      ticks: 200,
      question: 'Same lock, now with 100 bookings a second. Its limit is 20 a second. What happens to latency?',
      options: ['It stays low', 'It keeps growing, since the queue never drains'],
      answer: 1,
      explain: 'Requests arrive five times faster than the lock can release, so the queue grows without limit. Long transactions holding locks are a classic way to bring a database to its knees.',
      check: (s) => s.lock.queue.length > 100,
    },
    {
      title: 'Optimistic under contention',
      set: { strategy: 'optimistic', arrivals: 200, holdMs: 50, rooms: 100 },
      ticks: 300,
      question: 'Optimistic locking checks a version at commit, and retries on conflict. Under heavy load, what happens?',
      options: ['No overbooking, but lots of wasted retries', 'Some overbooking', 'Everything works with no retries'],
      answer: 0,
      explain: 'It\'s always correct, but with 10 transactions overlapping, most lose the race and start again. Optimistic locking shines when conflicts are rare. For hotels, where most searches don\'t end in a booking, that\'s usually true outside of peak moments.',
      check: (s) => s.overbooked === 0 && s.retries > s.booked,
    },
    {
      title: 'Let the database do it',
      set: { strategy: 'constraint', arrivals: 200, holdMs: 50, rooms: 100 },
      ticks: 300,
      question: 'Use one atomic statement that only updates if `reserved < total`. Overbooking?',
      options: ['None', 'Some'],
      answer: 0,
      explain: 'The condition and the write are one operation that can\'t interleave, with no retries or long locks. It\'s often the simplest good answer for this problem, and one worth stating in an interview.',
      check: (s) => s.overbooked === 0 && s.booked > 50,
    },
    {
      title: 'The double click',
      set: { strategy: 'constraint', arrivals: 50, holdMs: 20, rooms: 500, doubleClick: 0.3, idempotent: true },
      ticks: 300,
      question: 'Some users double-click "Book". Each booking request has a reservation ID created when the form loads. How many users get charged twice?',
      options: ['None', 'About 30%'],
      answer: 0,
      explain: 'The second request has the same ID, so it\'s rejected. This is an idempotency key, and it solves a different problem from overbooking: the same user\'s retry, rather than two users racing.',
      check: (s) => s.doubleBookedUsers === 0 && s.duplicatesBlocked > 10,
    },
  ],
};

const topic: Topic = {
  problem: [
    'A hotel booking system sounds easy, until two people try to book the last room at once. Everything here turns on correctness under concurrency, because overbooking means a real person arriving to no bed.',
    'Oddly, the scale isn\'t the hard part. Do the math and even a huge hotel chain has only a few bookings a second. That lets you use a relational database and get its strong guarantees, rather than reaching for something more exotic.',
  ],
  functional: [
    'Search for hotels and available rooms',
    'Reserve a room, and pay',
    'Manage hotel and room information, and cancel bookings',
  ],
  nonFunctional: [
    'Never double-book',
    'Handle high concurrency during events and promotions',
    'Search stays fast even during booking peaks',
  ],
  diagram: {
    nodes: [
      { id: 'u', label: 'Users', col: 0, row: 1, kind: 'client', note: 'Search far more often than they book. The form includes an idempotency key.' },
      { id: 'g', label: 'API gateway', col: 1, row: 1, note: 'Handles routing, auth and rate limiting.' },
      { id: 'h', label: 'Hotel service', col: 2, row: 0, note: 'Static hotel and room details, heavily cached.' },
      { id: 'r', label: 'Reservation service', col: 2, row: 1, note: 'Reserves inventory in a transaction, which is the sensitive part.' },
      { id: 'p', label: 'Payment service', col: 2, row: 2, note: 'Handles payments, and updates reservation status.' },
      { id: 'c', label: 'Hotel cache', col: 3, row: 0, kind: 'store', note: 'Hotel data barely changes, so it caches very well.' },
      { id: 'd', label: 'Inventory database', col: 3, row: 1, kind: 'store', note: 'A row per hotel, room type and date, with total and reserved counts.' },
    ],
    edges: [
      { from: 'u', to: 'g' },
      { from: 'g', to: 'h' },
      { from: 'g', to: 'r' },
      { from: 'g', to: 'p' },
      { from: 'h', to: 'c' },
      { from: 'r', to: 'd' },
      { from: 'r', to: 'p', dashed: true },
    ],
  },
  ideas: [
    { title: 'Inventory per date', body: 'Store a row per hotel, room type and date, with total and reserved counts. You book a room type, not a specific room, which makes the data simple and availability cheap to compute.' },
    { title: 'Three ways to stop races', body: 'Pessimistic locks block others but limit throughput. Optimistic locking retries on conflict, which is fine when conflicts are rare. A database constraint does the check atomically.' },
    { title: 'Idempotency', body: 'Generate a reservation ID when the form loads and make it a unique key. A double-click or a network retry then can\'t create a second booking.' },
    { title: 'Do the math first', body: 'Even a chain of 5,000 hotels and a million rooms only sees a few bookings per second. That justifies a relational database with ACID, rather than something more exotic.' },
  ],
  estimator: {
    vars: [
      { key: 'rooms', label: 'Rooms in total', unit: 'count' },
      { key: 'occupancy', label: 'Occupancy (0 to 1)', unit: 'plain', assume: 0.7 },
      { key: 'stay', label: 'Average stay in nights', unit: 'plain', assume: 3 },
      { key: 'searchFunnel', label: 'Searches per booking', unit: 'plain', assume: 100 },
      { key: 'horizon', label: 'Days bookable ahead', unit: 'plain', assume: 730 },
      { key: 'rowBytes', label: 'Bytes per inventory row', unit: 'plain', assume: 100 },
      { key: 'roomTypes', label: 'Rooms per room type', unit: 'plain', assume: 40 },
      { key: 'bookingsDay', label: 'Bookings per day', unit: 'count' },
      { key: 'tps', label: 'Booking rate', unit: 'qps' },
      { key: 'searchQps', label: 'Search rate', unit: 'qps' },
      { key: 'inventoryBytes', label: 'Inventory data', unit: 'bytes' },
    ],
    eqs: [
      { out: 'bookingsDay', terms: [['rooms', 1], ['occupancy', 1], ['stay', -1]] },
      { out: 'tps', terms: [['bookingsDay', 1], [86400, -1]] },
      { out: 'searchQps', terms: [['tps', 1], ['searchFunnel', 1]] },
      { out: 'inventoryBytes', terms: [['rooms', 1], ['roomTypes', -1], ['horizon', 1], ['rowBytes', 1]] },
    ],
    starts: [
      { key: 'rooms', value: 1_000_000 },
      { key: 'tps', value: 5 },
      { key: 'searchQps', value: 300 },
    ],
  },
  lab,
  pseudocode: (p: P) =>
    p?.strategy === 'pessimistic'
      ? [
          { code: 'BEGIN' },
          { code: 'SELECT reserved, total ... FOR UPDATE  -- blocks others', id: 'avail' },
          { code: 'if reserved < total: reserved += 1' },
          { code: 'COMMIT' },
          { code: 'overbooked', id: 'over' },
        ]
      : p?.strategy === 'optimistic'
        ? [
            { code: 'read reserved, total, version', id: 'avail' },
            { code: 'if reserved >= total: sold out' },
            { code: 'UPDATE ... SET reserved = reserved + 1, version = version + 1' },
            { code: '  WHERE version = version_i_read', id: 'ver' },
            { code: 'if no row changed: someone beat you, so retry' },
            { code: 'overbooked', id: 'over' },
          ]
        : p?.strategy === 'constraint'
          ? [
              { code: 'UPDATE ... SET reserved = reserved + 1' },
              { code: '  WHERE reserved < total', id: 'avail' },
              { code: 'if no row changed: sold out' },
              { code: 'overbooked', id: 'over' },
            ]
          : [
              { code: 'read reserved, total', id: 'avail' },
              { code: 'if reserved < total:   -- others can read this too' },
              { code: '  reserved = reserved + 1' },
              { code: 'overbooked', id: 'over' },
            ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Pessimistic lock', gain: 'Simple, and always correct', cost: 'Caps throughput per row, and risks deadlocks' },
    { choice: 'Optimistic lock', gain: 'No waiting when conflicts are rare', cost: 'Retries pile up under contention' },
    { choice: 'Database constraint', gain: 'Simple and atomic', cost: 'Logic lives in the database, and it\'s harder to extend' },
    { choice: 'Allow slight overbooking', gain: 'Fuller hotels, since people cancel', cost: 'Sometimes you must rebook a guest' },
  ],
  interview: [
    { q: 'How would you handle extreme booking spikes?', a: 'Sharding by hotel ID works well, as most queries are within one hotel. A Redis counter in front can reject requests when clearly sold out, without touching the database.' },
    { q: 'How do you keep the cache and database consistent on inventory?', a: 'Use the cache only for fast "probably available" checks, and always have the database make the final decision. A stale cache then only causes a failed booking attempt, not an overbooking.' },
    { q: 'What about a booking that spans several services?', a: 'If reservation and payment live in separate databases, you need a saga or two-phase commit. A saga reserves first, then pays, and undoes the reservation if payment fails.' },
    { q: 'How do you handle someone holding a room but never paying?', a: 'Reservations get a short expiry. A background job releases unpaid ones, returning the inventory for others to book.' },
  ],
  mistakes: [
    'Reaching for NoSQL at scale that doesn\'t need it.',
    'Thinking that checking first prevents races.',
    'Confusing a double-click problem with an overbooking problem.',
  ],
};

export default topic;
