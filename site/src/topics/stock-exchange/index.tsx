import { useState } from 'react';
import type { CustomViewProps, Lab, Topic } from '../../core/types';
import { fmtCount, fmtInt } from '../../core/format';
import { tailMean } from '../../core/stats';
import source from './engine.ts?raw';
import { MatchingEngine, replay, type Side, type Trade } from './engine';

type P = { ordersPerSec: number; marketShare: number; cancelShare: number; spreadCents: number; maxQty: number };

const DT = 0.1;
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

interface S {
  engine: MatchingEngine;
  mid: number;
  nextId: number;
  open: number[];
  tradesEma: number;
  spreadEma: number;
  depthEma: number;
  fifoWinner: string;
  sweep?: { best: number; average: number; levels: number; filled: number };
  replayMatch: boolean | null;
  mine: { text: string }[];
  lastTrade?: Trade;
}

function BookView({ state, rerender }: CustomViewProps<S, P>) {
  const [side, setSide] = useState<Side>('buy');
  const [price, setPrice] = useState('100.00');
  const [qty, setQty] = useState('100');
  const [error, setError] = useState('');
  const { bids, asks } = state.engine;
  const asksShown = asks.levels.slice(0, 7).reverse();
  const bidsShown = bids.levels.slice(0, 7);
  const size = (l: { queue: { quantity: number }[] }) => l.queue.reduce((a, o) => a + o.quantity, 0);
  const peak = Math.max(1, ...asksShown.map(size), ...bidsShown.map(size));

  const submit = () => {
    const cents = Math.round(parseFloat(price) * 100);
    const quantity = parseInt(qty, 10);
    if (!(cents > 0) || !(quantity > 0)) {
      setError('Enter a price and a quantity above 0.');
      return;
    }
    setError('');
    const id = state.nextId++;
    const fills = state.engine.handle({ kind: 'new', order: { id, owner: 'you', side, type: 'limit', price: cents, quantity } });
    const filled = fills.reduce((a, t) => a + t.quantity, 0);
    const text = filled ? `${side === 'buy' ? 'Bought' : 'Sold'} ${filled} at ${money(fills[0].price)}${filled < quantity ? `, with ${quantity - filled} resting in the book` : ''}` : `${quantity} resting at ${money(cents)}`;
    state.mine = [{ text }, ...state.mine].slice(0, 4);
    rerender();
  };

  const row = (l: { price: number; queue: { quantity: number; owner: string }[] }, tone: string) => (
    <div className="bar-row" key={`${tone}${l.price}`} style={{ gridTemplateColumns: '70px minmax(0, 1fr) 64px' }}>
      <span className="bar-label" style={{ color: tone === 'ask' ? 'var(--bad)' : 'var(--good)' }}>
        {money(l.price)}
      </span>
      <div className="bar-track">
        <div className={'bar-fill tone-bg-' + (tone === 'ask' ? 'bad' : 'good')} style={{ width: `${(size(l) / peak) * 100}%` }} />
      </div>
      <span className="bar-value">{fmtInt(size(l))}</span>
    </div>
  );

  return (
    <div className="lab-panel">
      <h4>The live order book. Place your own order.</h4>
      <div className="ref-grid">
        <div className="bars">
          {asksShown.map((l) => row(l, 'ask'))}
          <div className="small muted" style={{ textAlign: 'center' }}>
            {bids.best() && asks.best() ? `Spread ${money(asks.best()!.price - bids.best()!.price)}` : 'No spread yet'}
          </div>
          {bidsShown.map((l) => row(l, 'bid'))}
        </div>
        <div>
          <div className="seg" role="group" aria-label="Order side" style={{ marginBottom: 8 }}>
            <button aria-pressed={side === 'buy'} onClick={() => setSide('buy')}>
              Buy
            </button>
            <button aria-pressed={side === 'sell'} onClick={() => setSide('sell')}>
              Sell
            </button>
          </div>
          <div className="est-assumptions" style={{ marginBottom: 8 }}>
            <label className="est-field">
              <span>Limit price ($)</span>
              <input value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={Boolean(error)} />
            </label>
            <label className="est-field">
              <span>Quantity</span>
              <input value={qty} onChange={(e) => setQty(e.target.value)} aria-invalid={Boolean(error)} />
            </label>
          </div>
          <button onClick={submit}>Send order</button>
          {error && <p className="field-error">{error}</p>}
          <div className="log" style={{ marginTop: 8 }} role="log">
            {state.mine.length === 0 && <div className="muted">Your fills appear here</div>}
            {state.mine.map((m, i) => (
              <div key={i}>{m.text}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'ordersPerSec', label: 'Orders', kind: 'range', min: 10, max: 2000, step: 10, unit: 'per s' },
    { key: 'marketShare', label: 'Market orders', kind: 'range', min: 0, max: 0.9, step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
    { key: 'cancelShare', label: 'Cancels', kind: 'range', min: 0, max: 0.6, step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
    { key: 'spreadCents', label: 'Where traders quote, around the mid', kind: 'range', min: 1, max: 50, step: 1, unit: 'cents' },
    { key: 'maxQty', label: 'Largest order', kind: 'range', min: 10, max: 1000, step: 10, unit: 'shares' },
  ],
  defaults: { ordersPerSec: 200, marketShare: 0.2, cancelShare: 0.2, spreadCents: 10, maxQty: 200 },
  create(p, rng) {
    const engine = new MatchingEngine();
    const s: S = { engine, mid: 10000, nextId: 1, open: [], tradesEma: 0, spreadEma: 0, depthEma: 0, fifoWinner: '', replayMatch: null, mine: [] };
    for (let i = 0; i < 100; i++) {
      const side: Side = i % 2 ? 'buy' : 'sell';
      const offset = 1 + rng.int(p.spreadCents * 3);
      engine.handle({ kind: 'new', order: { id: s.nextId, owner: 'trader', side, type: 'limit', price: side === 'buy' ? s.mid - offset : s.mid + offset, quantity: 10 + rng.int(p.maxQty) } });
      s.open.push(s.nextId++);
    }
    return s;
  },
  step(s, p, rng) {
    s.mid += rng.int(3) - 1;
    const before = s.engine.trades.length;
    for (let i = rng.poisson(p.ordersPerSec * DT); i > 0; i--) {
      const r = rng.next();
      if (r < p.cancelShare && s.open.length) {
        const at = rng.int(s.open.length);
        s.engine.handle({ kind: 'cancel', orderId: s.open[at] });
        s.open[at] = s.open[s.open.length - 1];
        s.open.pop();
        continue;
      }
      const side: Side = rng.chance(0.5) ? 'buy' : 'sell';
      const isMarket = rng.chance(p.marketShare);
      const offset = 1 + rng.int(p.spreadCents * 3);
      const id = s.nextId++;
      s.engine.handle({ kind: 'new', order: { id, owner: 'trader', side, type: isMarket ? 'market' : 'limit', price: side === 'buy' ? s.mid - offset : s.mid + offset, quantity: 10 + rng.int(p.maxQty) } });
      if (!isMarket) s.open.push(id);
    }
    if (s.open.length > 5000) s.open = s.open.slice(-2500);
    const done = s.engine.trades.length - before;
    s.lastTrade = s.engine.trades[s.engine.trades.length - 1];
    s.tradesEma = s.tradesEma * 0.9 + (done / DT) * 0.1;
    const { bids, asks } = s.engine;
    const spread = bids.best() && asks.best() ? asks.best()!.price - bids.best()!.price : p.spreadCents * 4;
    s.spreadEma = s.spreadEma * 0.95 + Math.max(0, spread) * 0.05;
    s.depthEma = s.depthEma * 0.9 + (bids.depth + asks.depth) * 0.1;
  },
  sample: (s) => ({ trades: s.tradesEma, spread: s.spreadEma, depth: s.depthEma }),
  charts: [
    { title: 'Shares resting in the book', series: [{ key: 'depth', label: 'Measured', role: 'measured' }] },
    { title: 'Bid-ask spread', unit: 'cents', series: [{ key: 'spread', label: 'Measured', role: 'measured' }] },
  ],
  metrics(s) {
    const { bids, asks } = s.engine;
    return [
      { label: 'Best bid', value: bids.best() ? money(bids.best()!.price) : 'None', role: 'measured' },
      { label: 'Best ask', value: asks.best() ? money(asks.best()!.price) : 'None', role: 'measured' },
      { label: 'Trades per second', value: fmtCount(s.tradesEma), role: 'measured' },
      { label: 'Orders in log', value: fmtCount(s.engine.log.length), role: 'measured' },
    ];
  },
  math(_s, p) {
    const limitRate = p.ordersPerSec * (1 - p.cancelShare) * (1 - p.marketShare);
    const marketRate = p.ordersPerSec * (1 - p.cancelShare) * p.marketShare;
    const avgQty = 10 + p.maxQty / 2;
    return [
      { expr: `Liquidity added: ${fmtInt(limitRate)} limit orders/s × ${fmtInt(avgQty)} shares`, result: `${fmtCount(limitRate * avgQty)} shares/s` },
      { expr: `Liquidity taken: ${fmtInt(marketRate)} market orders/s × ${fmtInt(avgQty)} shares`, result: `${fmtCount(marketRate * avgQty)} shares/s`, tone: marketRate > limitRate ? 'bad' : undefined },
      { expr: `Matching budget at ${fmtInt(p.ordersPerSec)} orders/s`, result: `${fmtInt(1e6 / p.ordersPerSec)} µs per order` },
    ];
  },
  View: BookView,
  views: (s) => [
    { kind: 'log', title: 'Latest trades', lines: s.engine.trades.slice(-5).reverse().map((t) => ({ text: `${t.quantity} at ${money(t.price)}` })) },
    { kind: 'note', title: 'Determinism check', text: s.replayMatch === null ? 'Replay the input log on a brand new engine and compare.' : s.replayMatch ? 'The replayed engine is identical to the live one, in every order and every trade.' : 'The replayed engine differs from the live one.' },
  ],
  actions: [
    {
      key: 'fifo',
      label: 'Time priority test: two sellers at one price',
      run: (s) => {
        const e = new MatchingEngine();
        e.handle({ kind: 'new', order: { id: 1, owner: 'Seller A, first', side: 'sell', type: 'limit', price: 10000, quantity: 100 } });
        e.handle({ kind: 'new', order: { id: 2, owner: 'Seller B, second', side: 'sell', type: 'limit', price: 10000, quantity: 100 } });
        const fills = e.handle({ kind: 'new', order: { id: 3, owner: 'Buyer', side: 'buy', type: 'market', price: 0, quantity: 50 } });
        s.fifoWinner = fills[0].sellOwner;
      },
    },
    {
      key: 'sweep',
      label: 'Send a huge market buy',
      run: (s) => {
        const best = s.engine.asks.best()?.price ?? 0;
        const fills = s.engine.handle({ kind: 'new', order: { id: s.nextId++, owner: 'whale', side: 'buy', type: 'market', price: 0, quantity: 5000 } });
        const filled = fills.reduce((a, t) => a + t.quantity, 0);
        const cost = fills.reduce((a, t) => a + t.quantity * t.price, 0);
        s.sweep = { best, average: filled ? cost / filled : 0, levels: new Set(fills.map((t) => t.price)).size, filled };
      },
    },
    {
      key: 'replay',
      label: 'Replay the input log',
      run: (s) => {
        s.replayMatch = replay(s.engine.log).fingerprint() === s.engine.fingerprint();
      },
    },
  ],
  trace: (s) => ({
    values: {
      seq: fmtCount(s.engine.log.length),
      best: s.engine.asks.best() ? money(s.engine.asks.best()!.price) : '',
      fill: s.lastTrade ? `${s.lastTrade.quantity} at ${money(s.lastTrade.price)}` : '',
    },
  }),
  experiments: [
    {
      title: 'Who gets filled first?',
      act: ['fifo'],
      actAt: 1,
      ticks: 3,
      question: 'Two sellers offer at the same price, A first and then B. A market buy for 50 shares arrives. Who sells?',
      options: ['Seller A, who was first', 'Seller B', 'They split it evenly'],
      answer: 0,
      explain: 'At each price, orders queue in the order they arrived. It\'s called price-time priority, and it\'s why trading firms spend fortunes to be microseconds earlier. Being first in line at the best price is worth real money.',
      check: (s) => s.fifoWinner.startsWith('Seller A'),
    },
    {
      title: 'A huge market order',
      set: { ordersPerSec: 200, marketShare: 0.1, cancelShare: 0.1 },
      act: ['sweep'],
      actAt: 100,
      ticks: 102,
      question: 'A market buy for 5,000 shares arrives, far more than is available at the best price. What price does it pay?',
      options: ['The best ask for all of it', 'Worse and worse, as it eats through price levels'],
      answer: 1,
      explain: 'It fills everything at the best price, then moves up to the next level, and so on. That\'s slippage. It\'s why large traders split their orders, and it\'s why a market order doesn\'t guarantee a price.',
      check: (s) => Boolean(s.sweep && s.sweep.levels > 1 && s.sweep.average > s.sweep.best),
    },
    {
      title: 'Too many takers',
      set: { marketShare: 0.85, cancelShare: 0.1, ordersPerSec: 500 },
      ticks: 300,
      question: 'If 85% of orders are market orders that take liquidity, and only 15% add it, what happens to the book?',
      options: ['It stays deep', 'It drains, and the spread gets wider'],
      answer: 1,
      explain: 'Limit orders supply liquidity, and market orders consume it. With far more being taken than added, the book empties. Exchanges pay rebates to liquidity providers to avoid exactly this.',
      check: (_s, _p, h) => tailMean(h, 'depth', 60) < 1500,
    },
    {
      title: 'Plenty of makers',
      set: { marketShare: 0.1, cancelShare: 0.1, ordersPerSec: 500 },
      ticks: 300,
      question: 'If only 10% of orders are market orders, what happens to the book?',
      options: ['It stays thin', 'It builds up, with a tight spread'],
      answer: 1,
      explain: 'More liquidity is added than taken, so the book gets deep and spreads stay narrow. A tight spread means trading is cheap, which attracts more traders. That\'s the virtuous cycle every exchange wants.',
      check: (_s, _p, h) => tailMean(h, 'depth', 60) > 5000,
    },
    {
      title: 'Replay the day',
      set: { ordersPerSec: 500 },
      act: ['replay'],
      actAt: 99,
      ticks: 100,
      question: 'You feed the exact input log into a brand-new matching engine. Does it end up the same?',
      options: ['Yes, identical to the last order', 'Close, but not exact'],
      answer: 0,
      explain: 'The engine is deterministic: same inputs in the same order, same output. So a hot standby can follow the log and take over instantly, and any day can be replayed for audit. That\'s why the sequencer sits in front of everything.',
      check: (s) => s.replayMatch === true,
    },
  ],
};

const topic: Topic = {
  problem: [
    'A stock exchange matches buyers and sellers. The rules are simple and strict, and the engineering is remarkable: orders go through in microseconds, in a provably fair sequence, and the system must never lose an order or disagree about what happened.',
    'That pushes the design far from typical web systems. Everything critical runs on one thread on one machine, in memory, with no network hops in the fast path. Reliability comes from a sequenced log, and a hot standby replaying it. You can place orders into the real matching engine below.',
  ],
  functional: [
    'Accept limit and market orders, and cancellations',
    'Match orders by price, then by time',
    'Publish market data in real time',
  ],
  nonFunctional: [
    'Very low latency, measured in microseconds at the high percentiles',
    'Fair and deterministic',
    'Availability and fault tolerance, with fast failover',
  ],
  diagram: {
    nodes: [
      { id: 'b', label: 'Brokers', col: 0, row: 1, kind: 'client', note: 'Send orders on behalf of traders, through a dedicated gateway.' },
      { id: 'g', label: 'Order gateway', col: 1, row: 1, note: 'Validates, and applies rate limits and risk checks.' },
      { id: 's', label: 'Sequencer', col: 2, row: 1, kind: 'queue', note: 'Gives each input a number, and logs it. This sequence is the source of truth.' },
      { id: 'm', label: 'Matching engine', col: 3, row: 1, note: 'One thread, in memory, with no locks. Deterministic, so it can be replayed.' },
      { id: 'h', label: 'Hot standby', col: 3, row: 2, note: 'Replays the same log, so it can take over quickly with an identical state.' },
      { id: 'd', label: 'Market data', col: 3, row: 0, note: 'Builds order book views and candlestick charts from the stream of trades.' },
      { id: 'r', label: 'Reporting', col: 2, row: 2, kind: 'store', note: 'Records trades for settlement and regulators, away from the fast path.' },
    ],
    edges: [
      { from: 'b', to: 'g' },
      { from: 'g', to: 's' },
      { from: 's', to: 'm' },
      { from: 'm', to: 'd' },
      { from: 's', to: 'h', dashed: true },
      { from: 'm', to: 'r', dashed: true },
    ],
  },
  ideas: [
    { title: 'Order book', body: 'Buy and sell orders are sorted by price, and within a price, by time. A new order matches against the best opposite price, and anything left over rests in the book.' },
    { title: 'Sequencer', body: 'Everything gets a number before it runs. The sequence is the single fair ordering of events, and the input log lets you rebuild any state.' },
    { title: 'Single-threaded core', body: 'Locks and context switches are too slow and unpredictable. One pinned thread, on a ring buffer, avoids them. It also gives you determinism for free.' },
    { title: 'Fault tolerance', body: 'Hot standbys process the same log. If the primary dies, one takes over within milliseconds. Consensus protocols like Raft can decide who\'s in charge.' },
  ],
  estimator: {
    vars: [
      { key: 'ordersDay', label: 'Orders per day', unit: 'count' },
      { key: 'tradingHours', label: 'Trading hours per day', unit: 'plain', assume: 6.5 },
      { key: 'peakFactor', label: 'Peak over average', unit: 'plain', assume: 5 },
      { key: 'eventBytes', label: 'Bytes per input event', unit: 'plain', assume: 100 },
      { key: 'avg', label: 'Average order rate', unit: 'qps' },
      { key: 'peak', label: 'Peak order rate', unit: 'qps' },
      { key: 'logDay', label: 'Log per day', unit: 'bytes' },
    ],
    eqs: [
      { out: 'avg', terms: [['ordersDay', 1], ['tradingHours', -1], [3600, -1]] },
      { out: 'peak', terms: [['avg', 1], ['peakFactor', 1]] },
      { out: 'logDay', terms: [['ordersDay', 1], ['eventBytes', 1]] },
    ],
    starts: [
      { key: 'ordersDay', value: 1e9 },
      { key: 'peak', value: 200000 },
      { key: 'logDay', value: 100e9 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'handle(input):' },
    { code: '  number it and write it to the log', id: 'seq' },
    { code: '  while order has quantity left:' },
    { code: '    level = best opposite price', id: 'best' },
    { code: '    if order\'s price doesn\'t reach level: stop' },
    { code: '    maker = oldest order at that level' },
    { code: '    trade min(order, maker) at the maker\'s price', id: 'fill' },
    { code: '  rest what\'s left in the book, if it\'s a limit order' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Single-threaded matching', gain: 'Fast and deterministic, with no locks', cost: 'Limited to one core, so you shard by symbol' },
    { choice: 'All in memory', gain: 'Microsecond latency', cost: 'Reliability has to come from the log and standbys' },
    { choice: 'Multicast market data', gain: 'Everyone receives it at the same moment', cost: 'Unreliable delivery, so clients handle gaps' },
    { choice: 'Colocation', gain: 'Lowest latency for traders', cost: 'Fairness concerns, which exchanges address carefully' },
  ],
  interview: [
    { q: 'How do you keep latency this low?', a: 'Remove everything between you and the work. Put critical parts on one machine, communicate through shared memory, pin threads to CPU cores, avoid garbage collection, and pre-allocate memory.' },
    { q: 'How is it fault tolerant with a single thread?', a: 'The log is the state. Standbys replay it, and one takes over on failure. Because matching is deterministic, all replicas are guaranteed to be identical.' },
    { q: 'How do you ensure fairness in market data?', a: 'Reliable multicast delivers to all subscribers at once. Exchanges sometimes equalize cable lengths in colocation, so that no one gets data sooner because of their rack position.' },
    { q: 'How do you scale past one core?', a: 'Shard by symbol: each stock gets its own matching engine and order book. Since orders for different stocks don\'t interact, this splits the load cleanly.' },
  ],
  mistakes: [
    'Designing it like a normal web service, with many network hops.',
    'Using locks across threads in the matching path.',
    'Using floating point for prices.',
  ],
};

export default topic;
