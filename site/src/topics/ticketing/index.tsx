import type { CustomViewProps, Lab, Topic } from '../../core/types';
import { fmtCount, fmtDuration, fmtInt, fmtPct } from '../../core/format';
import source from './engine.ts?raw';
import { Venue, WaitingRoom } from './engine';

type P = { fans: number; spikeSeconds: number; seats: number; dbCapacity: number; waitingRoom: boolean; admitPerSec: number; holdSeconds: number; checkoutSeconds: number; abandon: number };

const DT = 0.25;

interface Checkout {
  user: number;
  seat: number;
  payAt: number;
  willPay: boolean;
}

interface S {
  now: number;
  venue: Venue;
  room: WaitingRoom;
  arrived: number;
  errors: number;
  served: number;
  soldOut: number;
  checkouts: Checkout[];
  expiredWhilePaying: number;
  abandoned: number;
  maxWait: number;
  waitEma: number;
  soldOutAt: number;
  carry: number;
  nextUser: number;
  dbLoad: number;
}

function SeatMap({ state }: CustomViewProps<S, P>) {
  const seats = state.venue.seats;
  const shown = seats.slice(0, 1600);
  const cols = 50;
  const cell = 9;
  const paths: Record<string, string> = { free: '', held: '', sold: '' };
  shown.forEach((s, i) => {
    paths[s.state] += `M${(i % cols) * cell} ${Math.floor(i / cols) * cell}h7.5v7.5h-7.5z`;
  });
  return (
    <div className="lab-panel">
      <h4>Seats: empty, held in orange, sold in blue{seats.length > shown.length ? `. First ${fmtInt(shown.length)} shown` : ''}</h4>
      <svg viewBox={`0 0 ${cols * cell} ${Math.ceil(shown.length / cols) * cell}`} className="lab-svg" style={{ padding: 6 }} role="img" aria-label={`${state.venue.sold} seats sold, ${state.venue.heldCount} held, ${state.venue.freeCount} free.`}>
        <path d={paths.free} fill="var(--line)" />
        <path d={paths.held} fill="var(--predicted)" />
        <path d={paths.sold} fill="var(--measured)" />
      </svg>
    </div>
  );
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'fans', label: 'Fans trying to buy', kind: 'range', min: 1000, max: 100000, step: 1000, rebuild: true },
    { key: 'spikeSeconds', label: 'They all arrive within', kind: 'range', min: 5, max: 120, step: 5, unit: 's', rebuild: true },
    { key: 'seats', label: 'Seats', kind: 'range', min: 200, max: 5000, step: 100, rebuild: true },
    { key: 'dbCapacity', label: 'Database capacity', kind: 'range', min: 100, max: 5000, step: 100, unit: 'per s' },
    { key: 'waitingRoom', label: 'Use a waiting room', kind: 'toggle', rebuild: true },
    { key: 'admitPerSec', label: 'Let in from the waiting room', kind: 'range', min: 10, max: 3000, step: 10, unit: 'per s' },
    { key: 'holdSeconds', label: 'Seat hold time', kind: 'range', min: 10, max: 900, step: 10, unit: 's' },
    { key: 'checkoutSeconds', label: 'Time people take to pay', kind: 'range', min: 5, max: 300, step: 5, unit: 's' },
    { key: 'abandon', label: 'People who hold, then never pay', kind: 'range', min: 0, max: 0.8, step: 0.05, format: (v) => fmtPct(v) },
  ],
  defaults: { fans: 20000, spikeSeconds: 10, seats: 1000, dbCapacity: 1000, waitingRoom: false, admitPerSec: 500, holdSeconds: 300, checkoutSeconds: 60, abandon: 0.2 },
  create: (p, rng) => ({ now: 0, venue: new Venue(p.seats, (n) => rng.int(n)), room: new WaitingRoom(), arrived: 0, errors: 0, served: 0, soldOut: 0, checkouts: [], expiredWhilePaying: 0, abandoned: 0, maxWait: 0, waitEma: 0, soldOutAt: -1, carry: 0, nextUser: 1, dbLoad: 0 }),
  step(s, p, rng) {
    s.now += DT;
    s.venue.releaseExpired(s.now);

    let arriving = 0;
    if (s.arrived < p.fans) arriving = Math.min(p.fans - s.arrived, Math.ceil((p.fans / p.spikeSeconds) * DT));
    s.arrived += arriving;

    let requests: { user: number; joinedAt: number }[] = [];
    if (p.waitingRoom) {
      for (let i = 0; i < arriving; i++) s.room.join(s.nextUser++, s.now);
      s.carry += p.admitPerSec * DT;
      const whole = Math.floor(s.carry);
      s.carry -= whole;
      requests = s.room.admit(whole);
    } else {
      for (let i = 0; i < arriving; i++) requests.push({ user: s.nextUser++, joinedAt: s.now });
    }

    const budget = Math.floor(p.dbCapacity * DT);
    s.dbLoad = s.dbLoad * 0.8 + (requests.length / DT) * 0.2;
    requests.forEach((req, i) => {
      if (i >= budget) {
        s.errors++; // the database is overloaded, so this request fails
        return;
      }
      s.served++;
      const wait = s.now - req.joinedAt;
      s.maxWait = Math.max(s.maxWait, wait);
      s.waitEma = s.waitEma * 0.99 + wait * 0.01;
      const seat = s.venue.hold(req.user, s.now, p.holdSeconds);
      if (seat === null) {
        s.soldOut++;
        return;
      }
      s.checkouts.push({ user: req.user, seat, payAt: s.now + rng.range(0.5, 1.5) * p.checkoutSeconds, willPay: !rng.chance(p.abandon) });
    });

    s.checkouts = s.checkouts.filter((c) => {
      if (c.payAt > s.now) return true;
      if (!c.willPay) {
        s.abandoned++;
        return false;
      }
      if (!s.venue.pay(c.seat, c.user, s.now)) s.expiredWhilePaying++;
      return false;
    });
    if (s.soldOutAt < 0 && s.venue.sold >= p.seats) s.soldOutAt = s.now;
  },
  sample: (s, p) => ({ load: s.dbLoad, cap: p.dbCapacity, sold: s.venue.sold, held: s.venue.heldCount, seats: p.seats }),
  charts: [
    { title: 'Requests reaching the database', unit: 'per s', series: [{ key: 'load', label: 'Measured', role: 'measured' }, { key: 'cap', label: 'Capacity', role: 'predicted' }] },
    { title: 'Seats', series: [{ key: 'sold', label: 'Sold', role: 'measured' }, { key: 'held', label: 'Held', role: 'other' }, { key: 'seats', label: 'Total', role: 'predicted' }] },
  ],
  metrics(s, p) {
    const total = s.errors + s.served;
    return [
      { label: 'Longest wait in line', value: p.waitingRoom ? fmtDuration(p.fans / p.admitPerSec) : 'No line', role: 'predicted' },
      { label: 'Requests that errored', value: fmtPct(total ? s.errors / total : 0), role: 'measured', tone: s.errors ? 'bad' : 'good' },
      { label: 'Sold', value: `${fmtInt(s.venue.sold)} of ${fmtInt(p.seats)}`, role: 'measured' },
      { label: 'Held, unpaid', value: fmtInt(s.venue.heldCount), role: 'measured', tone: s.venue.heldCount > p.seats * 0.3 ? 'warn' : undefined },
      { label: 'Lost at checkout', value: fmtInt(s.expiredWhilePaying), role: 'measured', tone: s.expiredWhilePaying ? 'bad' : 'good' },
      { label: 'Sold twice', value: fmtInt(s.venue.doubleSold), role: 'measured', tone: s.venue.doubleSold ? 'bad' : 'good' },
    ];
  },
  math(_s, p) {
    const rate = p.fans / p.spikeSeconds;
    return [
      { expr: `Arrival rate: ${fmtInt(p.fans)} ÷ ${p.spikeSeconds} s`, result: `${fmtCount(rate)}/s`, tone: !p.waitingRoom && rate > p.dbCapacity ? 'bad' : 'good' },
      { expr: `Database can take`, result: `${fmtCount(p.dbCapacity)}/s` },
      { expr: `Line clears in: ${fmtInt(p.fans)} ÷ ${fmtInt(p.admitPerSec)}/s`, result: p.waitingRoom ? fmtDuration(p.fans / p.admitPerSec) : 'No waiting room', tone: p.waitingRoom && p.admitPerSec > p.dbCapacity ? 'bad' : undefined },
      { expr: `Hold ${p.holdSeconds} s vs checkout up to ${Math.round(p.checkoutSeconds * 1.5)} s`, result: p.holdSeconds < p.checkoutSeconds * 1.5 ? 'some will run out of time' : 'enough time', tone: p.holdSeconds < p.checkoutSeconds * 1.5 ? 'warn' : 'good' },
    ];
  },
  View: SeatMap,
  trace: (s) => ({
    values: { line: fmtCount(s.room.length), hold: `${fmtInt(s.venue.heldCount)} held`, pay: `${fmtInt(s.venue.sold)} sold`, exp: `${fmtInt(s.abandoned)} walked away` },
  }),
  experiments: [
    {
      title: 'Everyone at once',
      set: { fans: 50000, spikeSeconds: 10, dbCapacity: 1000, waitingRoom: false },
      ticks: 80,
      question: '50,000 fans arrive within 10 seconds, and the database handles 1,000 requests a second. With no waiting room, what share of requests fail?',
      options: ['A few', 'About half', 'Most of them'],
      answer: 2,
      explain: '5,000 a second hit a database that can take 1,000, so about 80% fail, and in real life those fans retry, making it even worse. Your site looks broken at its most-watched moment.',
      check: (s) => s.errors / (s.errors + s.served) > 0.7,
    },
    {
      title: 'Add a waiting room',
      set: { fans: 50000, spikeSeconds: 10, dbCapacity: 1000, waitingRoom: true, admitPerSec: 800 },
      ticks: 120,
      question: 'Fans now join a line, and you let in 800 a second, under the database\'s capacity. How many requests fail?',
      options: ['None', 'About the same'],
      answer: 0,
      explain: 'The database only ever sees what it can handle. The last fan waits about a minute, but gets a real answer, and a line feels fair. It turns a capacity problem into a waiting problem, which users accept far better than errors.',
      check: (s) => s.errors === 0 && s.served > 1000,
    },
    {
      title: 'Holds that never pay',
      set: { fans: 3000, spikeSeconds: 5, seats: 1000, holdSeconds: 600, checkoutSeconds: 30, abandon: 0.5, waitingRoom: true, admitPerSec: 500 },
      ticks: 500,
      question: 'Half of those who hold a seat never pay, and holds last 10 minutes. Two minutes in, can other fans buy those seats?',
      options: ['Yes, right away', 'No, they\'re stuck in holds until they expire'],
      answer: 1,
      explain: 'Those seats look gone, although nobody paid. Fans get told it\'s sold out while seats are actually unsold. Bots can exploit this too, by holding seats just to block others. Hold time is a real business decision.',
      check: (s) => s.venue.heldCount > 200 && s.venue.sold < 1000,
    },
    {
      title: 'A hold that\'s too short',
      set: { fans: 1000, spikeSeconds: 5, seats: 800, holdSeconds: 30, checkoutSeconds: 60, abandon: 0, waitingRoom: true, admitPerSec: 500 },
      ticks: 500,
      question: 'What if holds last 30 seconds, but people take around a minute to enter their card details?',
      options: ['No problem', 'People lose their seat in the middle of paying'],
      answer: 1,
      explain: 'The worst possible experience: they enter their card, and the seat is gone. The hold must comfortably exceed checkout time, which is why many sites show a countdown, and extend it once you start paying.',
      check: (s) => s.expiredWhilePaying > 100,
    },
    {
      title: 'Never sold twice',
      set: { fans: 30000, spikeSeconds: 10, seats: 500, waitingRoom: true, admitPerSec: 1000, dbCapacity: 2000, holdSeconds: 60, checkoutSeconds: 30, abandon: 0.3 },
      ticks: 500,
      question: 'With huge demand, seats held, expired, and held again, can one seat ever be sold to two people?',
      options: ['Yes, under this much load', 'No'],
      answer: 1,
      explain: 'A hold is an atomic update that only succeeds if the seat is free, and paying checks that you still hold it. Those two checks make it impossible, however much load there is. It\'s the same idea as in the hotel lesson.',
      check: (s) => s.venue.doubleSold === 0 && s.venue.sold > 100,
    },
  ],
};

const topic: Topic = {
  problem: [
    'A ticketing site is quiet most of the time. Then a huge concert goes on sale, and a million people arrive in the same minute, wanting a few thousand seats. It\'s the most extreme traffic spike in everyday systems.',
    'There are two main problems. The first is surviving the spike without falling over. The second is seat holds: when you pick a seat, it must be reserved while you pay, but people walk away, and bots try to hold seats they\'ll never buy.',
  ],
  functional: [
    'Browse events, and see available seats',
    'Hold a seat while paying',
    'Buy tickets, with no seat sold twice',
  ],
  nonFunctional: [
    'Survives enormous spikes at sale time',
    'Fair, with a first-come feel',
    'Strong consistency for seats, while browsing can be slightly stale',
  ],
  diagram: {
    nodes: [
      { id: 'u', label: 'Fans', col: 0, row: 1, kind: 'client', note: 'A spike of millions, all at the same second.' },
      { id: 'w', label: 'Waiting room', col: 1, row: 1, kind: 'queue', note: 'A queue at the edge, often served by a CDN, letting people in at a controlled rate.' },
      { id: 'b', label: 'Booking service', col: 2, row: 1, note: 'Holds seats atomically, and handles checkout.' },
      { id: 'c', label: 'Event cache', col: 2, row: 0, kind: 'store', note: 'Event pages barely change, and can absorb most browsing traffic.' },
      { id: 'd', label: 'Seat database', col: 3, row: 1, kind: 'store', note: 'One row per seat. The source of truth, protected by the waiting room.' },
      { id: 'p', label: 'Payment provider', col: 3, row: 2, kind: 'external', note: 'A slow outside dependency. Holds give people time to finish.' },
    ],
    edges: [
      { from: 'u', to: 'w' },
      { from: 'u', to: 'c', dashed: true },
      { from: 'w', to: 'b' },
      { from: 'b', to: 'd' },
      { from: 'b', to: 'p' },
    ],
  },
  ideas: [
    { title: 'Waiting room', body: 'A queue in front of the booking system admits people at the rate the database can handle. The spike becomes a line. Telling people their position makes the wait feel fair.' },
    { title: 'Seat holds', body: 'A seat moves from free to held to sold. A hold is an atomic update with an expiry, and when it expires, a background job, or the next read, frees the seat for someone else.' },
    { title: 'Read and write separately', body: 'Most traffic is people looking. Serve event pages and rough availability from a cache or CDN, and keep the database for the small part that really books seats.' },
    { title: 'Fighting bots', body: 'Bots buy out seats for resale. Common tools are per-account limits, CAPTCHAs, verified-fan pre-registration, and watching for unusually fast checkouts.' },
  ],
  estimator: {
    vars: [
      { key: 'fans', label: 'Fans at sale time', unit: 'count' },
      { key: 'window', label: 'Seconds they arrive within', unit: 'plain', assume: 60 },
      { key: 'admitRate', label: 'Admitted per second', unit: 'plain', assume: 1000 },
      { key: 'pageBytes', label: 'Bytes per waiting-room page', unit: 'plain', assume: 50000 },
      { key: 'arrivals', label: 'Arrival rate', unit: 'qps' },
      { key: 'waitSeconds', label: 'Longest wait in line', unit: 'seconds' },
      { key: 'edgeBandwidth', label: 'Bandwidth at the edge', unit: 'bytesPerSec' },
    ],
    eqs: [
      { out: 'arrivals', terms: [['fans', 1], ['window', -1]] },
      { out: 'waitSeconds', terms: [['fans', 1], ['admitRate', -1]] },
      { out: 'edgeBandwidth', terms: [['arrivals', 1], ['pageBytes', 1]] },
    ],
    starts: [
      { key: 'fans', value: 2_000_000 },
      { key: 'arrivals', value: 30000 },
      { key: 'waitSeconds', value: 1800 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'on_arrive(fan):' },
    { code: '  join the waiting room', id: 'line' },
    { code: '' },
    { code: 'every second: admit a fixed number of fans' },
    { code: '' },
    { code: 'on_select_seat(fan):' },
    { code: '  UPDATE seat SET held WHERE state = free', id: 'hold' },
    { code: '  if no row changed: choose another seat' },
    { code: '' },
    { code: 'on_pay(fan, seat):' },
    { code: '  sell only if this fan\'s hold is still valid', id: 'pay' },
    { code: 'people who held a seat and walked away', id: 'exp' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Waiting room', gain: 'Protects the database, and feels fair', cost: 'People wait, and it\'s another system to run' },
    { choice: 'Long hold', gain: 'Time to finish paying', cost: 'Abandoned seats stay locked for longer' },
    { choice: 'Short hold', gain: 'Unsold seats return quickly', cost: 'People lose seats while paying' },
    { choice: 'Choose your own seat', gain: 'People like it', cost: 'Lots of conflicts on the same seats. Assigning best available avoids this' },
  ],
  interview: [
    { q: 'How do you stop people losing their place by refreshing?', a: 'Give each person a signed token with their queue position, stored client-side or in the edge layer. Refreshing simply re-presents the same token.' },
    { q: 'Why not scale the database for the spike?', a: 'The spike is huge and short, and it comes down to many writes on a small set of rows. Hot-row contention can\'t be solved by adding machines, so limiting concurrency works much better.' },
    { q: 'How do you release expired holds?', a: 'Treat a hold as valid only if its expiry is in the future, so nothing has to happen at the exact moment. A background job then tidies up rows for availability counts.' },
    { q: 'What if the payment succeeds after the hold expires?', a: 'Avoid this by extending the hold when checkout starts. If it still happens, the seat might be gone, so you refund automatically. Handle it explicitly, and reconcile.' },
  ],
  mistakes: [
    'Designing for average traffic, in a system defined by its peak.',
    'Not protecting the database from the spike.',
    'Using one long-running database lock to hold a seat during payment.',
  ],
};

export default topic;
