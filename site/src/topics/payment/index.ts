import type { Lab, Topic } from '../../core/types';
import { fmtCount, fmtInt, fmtPct } from '../../core/format';
import source from './engine.ts?raw';
import { Ledger, Provider, pay, reconcile, type Reconciliation } from './engine';

type P = { paymentsPerSec: number; requestLoss: number; responseLoss: number; retries: number; useKey: boolean };

const DT = 0.2;
const AMOUNT = 20;

interface S {
  provider: Provider;
  ledger: Ledger;
  nextOrder: number;
  paid: number;
  unknown: number;
  orders: number;
  retried: number;
  lastEvent: string;
  recon?: Reconciliation;
  /** Share of recent orders that were charged twice, so it follows the current settings. */
  doubleEma: number;
  fixed: number;
}

const doubleCharged = (s: S) => s.provider.doubled;

const chargedDollars = (s: S) => s.provider.chargeCount * AMOUNT;

function predictedDoubleRate(p: P): number {
  if (p.useKey || p.retries === 0) return 0;
  // A lost response on some attempt, followed by any later charge.
  const charged = (1 - p.requestLoss) * p.responseLoss;
  const lost = p.requestLoss;
  let rate = 0;
  for (let first = 1; first <= p.retries; first++) rate += Math.pow(lost, first - 1) * charged * (1 - Math.pow(lost, p.retries + 1 - first));
  return Math.min(1, rate);
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'paymentsPerSec', label: 'Payments', kind: 'range', min: 10, max: 200, step: 10, unit: 'per s' },
    { key: 'responseLoss', label: 'Charged, but reply lost', kind: 'range', min: 0, max: 0.2, step: 0.01, format: (v) => fmtPct(v) },
    { key: 'requestLoss', label: 'Request lost, no charge', kind: 'range', min: 0, max: 0.2, step: 0.01, format: (v) => fmtPct(v) },
    { key: 'retries', label: 'Retries after a timeout', kind: 'range', min: 0, max: 5, step: 1 },
    { key: 'useKey', label: 'Send an idempotency key', kind: 'toggle' },
  ],
  defaults: { paymentsPerSec: 50, requestLoss: 0.02, responseLoss: 0.05, retries: 2, useKey: false },
  create: () => ({ doubleEma: 0, provider: new Provider(), ledger: new Ledger(), nextOrder: 1, paid: 0, unknown: 0, orders: 0, retried: 0, lastEvent: '', fixed: 0 }),
  step(s, p, rng) {
    for (let i = rng.poisson(p.paymentsPerSec * DT); i > 0; i--) {
      const orderId = s.nextOrder++;
      const res = pay(s.provider, s.ledger, orderId, AMOUNT, p.retries, p.useKey, { requestLoss: p.requestLoss, responseLoss: p.responseLoss }, rng);
      s.orders++;
      s.doubleEma = s.doubleEma * 0.99 + (s.provider.timesCharged(orderId) > 1 ? 1 : 0) * 0.01;
      if (res.attempts > 1) s.retried++;
      if (res.status === 'paid') s.paid++;
      else s.unknown++;
      s.lastEvent = `Order ${orderId}: ${res.status} after ${res.attempts} attempt${res.attempts > 1 ? 's' : ''}`;
    }
  },
  sample: (s, p) => ({ doubles: s.doubleEma * 100, math: predictedDoubleRate(p) * 100, unknown: s.orders ? (s.unknown / s.orders) * 100 : 0 }),
  charts: [{ title: 'Orders charged more than once', unit: '%', series: [{ key: 'doubles', label: 'Measured', role: 'measured' }, { key: 'math', label: 'Math', role: 'predicted' }, { key: 'unknown', label: 'Status unknown', role: 'other' }] }],
  metrics(s, p) {
    return [
      { label: 'Double-charge rate', value: fmtPct(predictedDoubleRate(p), 2), role: 'predicted' },
      { label: 'Double-charge rate', value: fmtPct(s.doubleEma, 2), role: 'measured', tone: s.doubleEma > 0.002 ? 'bad' : 'good' },
      { label: 'Orders', value: fmtCount(s.orders), role: 'measured' },
      { label: 'Unknown status', value: fmtInt(s.unknown), role: 'measured', tone: s.unknown ? 'warn' : undefined },
      { label: 'Provider charged', value: `$${fmtCount(chargedDollars(s))}`, role: 'measured' },
      { label: 'Ledger recorded', value: `$${fmtCount(s.ledger.totals.credit)}`, role: 'measured', tone: chargedDollars(s) !== s.ledger.totals.credit ? 'warn' : 'good' },
    ];
  },
  math(s, p) {
    const totals = s.ledger.totals;
    return [
      { expr: `Reply lost, then retried without a key: ≈ ${fmtPct(p.responseLoss)}`, result: p.useKey ? '0%, key blocks it' : p.retries ? fmtPct(predictedDoubleRate(p), 2) : '0%, no retry', tone: p.useKey || !p.retries ? 'good' : 'bad' },
      { expr: `All attempts time out: (${p.requestLoss + p.responseLoss - p.requestLoss * p.responseLoss < 1 ? (p.requestLoss + (1 - p.requestLoss) * p.responseLoss).toFixed(3) : '1'})^${p.retries + 1}`, result: fmtPct(Math.pow(p.requestLoss + (1 - p.requestLoss) * p.responseLoss, p.retries + 1), 3) },
      { expr: `Ledger: debits − credits`, result: `$${fmtInt(totals.debit - totals.credit)}`, tone: 'good' },
    ];
  },
  views: (s) => [
    {
      kind: 'table',
      title: 'Last reconciliation against the provider\'s statement',
      columns: ['Finding', 'Orders'],
      rows: s.recon ? [['Charged, but missing from our ledger', fmtInt(s.recon.chargedButNotRecorded.length)], ['Charged more than once', fmtInt(s.recon.chargedTwice.length)]] : [['Run a reconciliation to compare', '']],
    },
    { kind: 'log', title: 'Ledger, latest entries', lines: s.ledger.entries.slice(-4).reverse().map((e) => ({ text: `Order ${e.orderId}: ${e.account} ${e.debit ? 'debit' : 'credit'} $${e.debit || e.credit}` })) },
  ],
  actions: [
    {
      key: 'reconcile',
      label: 'Run reconciliation',
      run: (s) => {
        s.recon = reconcile(s.provider, s.ledger);
      },
    },
  ],
  trace: (s) => ({
    values: { order: s.lastEvent, ledger: `${fmtCount(s.ledger.entries.length)} entries` },
  }),
  experiments: [
    {
      title: 'Retry a timeout',
      set: { requestLoss: 0, responseLoss: 0.05, retries: 3, useKey: false },
      ticks: 200,
      question: 'Sometimes the provider charges the card but its reply gets lost, about 5% of the time. Your code retries on a timeout, with no idempotency key. What happens?',
      options: ['All is fine, since retries make it reliable', 'About 5% of customers are charged twice'],
      answer: 1,
      explain: 'A timeout means "I don\'t know", not "it failed". So you\'ve charged the card again for something that worked. It\'s the single most important fact about payment systems.',
      check: (s) => {
        const rate = doubleCharged(s) / s.orders;
        return rate > 0.03 && rate < 0.075;
      },
    },
    {
      title: 'Add an idempotency key',
      set: { requestLoss: 0, responseLoss: 0.05, retries: 3, useKey: true },
      ticks: 200,
      question: 'Same failure, but each retry carries the same key, and the provider charges a key only once. How many double charges?',
      options: ['None', 'About half as many'],
      answer: 0,
      explain: 'The provider sees a repeat, and just returns the earlier result. So you can retry as much as you like. Generate the key once per order, and store it before making the first call.',
      check: (s) => doubleCharged(s) === 0 && s.orders > 100,
    },
    {
      title: 'Lost requests are harmless',
      set: { requestLoss: 0.1, responseLoss: 0, retries: 3, useKey: false },
      ticks: 200,
      question: 'If instead the request itself gets lost, 10% of the time, and you retry with no key. Any double charges?',
      options: ['None, since those never reached the provider', 'About 10%'],
      answer: 0,
      explain: 'Nothing was charged, so a retry is the first real charge. The trouble is that from your side both failures look like the same timeout. You can\'t tell which one it was, so you must always assume the dangerous one.',
      check: (s) => doubleCharged(s) === 0 && s.retried > 10,
    },
    {
      title: 'Never retry?',
      set: { requestLoss: 0, responseLoss: 0.05, retries: 0, useKey: false },
      act: ['reconcile'],
      actAt: 199,
      ticks: 200,
      question: 'What if you never retry? Double charges can\'t happen, but what about the 5% with a lost reply?',
      options: ['Those orders just fail cleanly', 'Customers are charged, but your books say they weren\'t, until reconciliation finds it'],
      answer: 1,
      explain: 'You tell the customer it failed while their card was charged, and they\'ll probably try again. Comparing against the provider\'s statement catches this. It\'s why nightly reconciliation is non-negotiable, even in a well-built system.',
      check: (s) => Boolean(s.recon && s.recon.chargedButNotRecorded.length > 5 && doubleCharged(s) === 0),
    },
  ],
};

const topic: Topic = {
  problem: [
    'A payment system moves money between customers and merchants, through outside providers such as Stripe or card networks. In most systems, a bug means a bad page. Here it means a wrong charge, a missing payout, or a compliance problem.',
    'The defining challenge is that the most important calls go over a network to someone else\'s system, and networks fail in ambiguous ways. When a request times out, you don\'t know whether the money moved. Everything in the design comes back to handling that uncertainty.',
  ],
  functional: [
    'Accept payments from customers (pay-in)',
    'Pay out to merchants (pay-out)',
    'Keep an accurate record of all money movement',
  ],
  nonFunctional: [
    'Correctness over everything: never lose or invent money',
    'Reliable through provider failures',
    'Auditable, with records that can be reconciled and never silently change',
  ],
  diagram: {
    nodes: [
      { id: 'c', label: 'Checkout', col: 0, row: 1, kind: 'client', note: 'Creates a payment order, with a key to prevent duplicates.' },
      { id: 'p', label: 'Payment service', col: 1, row: 1, note: 'Orchestrates: records the payment, runs risk checks, and calls the executor.' },
      { id: 'e', label: 'Payment executor', col: 2, row: 1, note: 'Calls the provider with an idempotency key.' },
      { id: 's', label: 'Payment provider', col: 3, row: 1, kind: 'external', note: 'Stripe or a card network. Holds card details, so you don\'t have to.' },
      { id: 'l', label: 'Ledger', col: 2, row: 0, kind: 'store', note: 'Immutable double-entry records. Never updated, only added to.' },
      { id: 'w', label: 'Wallet', col: 1, row: 0, kind: 'store', note: 'The merchant\'s balance.' },
      { id: 'r', label: 'Reconciliation', col: 3, row: 2, note: 'Compares provider statements with the ledger each night, and flags mismatches.' },
    ],
    edges: [
      { from: 'c', to: 'p' },
      { from: 'p', to: 'e' },
      { from: 'e', to: 's' },
      { from: 'p', to: 'l' },
      { from: 'p', to: 'w' },
      { from: 's', to: 'r', dashed: true, label: 'statement' },
      { from: 'l', to: 'r', dashed: true },
    ],
  },
  ideas: [
    { title: 'Idempotency', body: 'Each order gets a unique key, sent on every attempt. The provider charges a key only once. This makes retries safe, and it\'s also how you survive a double-click.' },
    { title: 'Double-entry ledger', body: 'Each transaction writes two entries, a debit and a credit, that must balance. Mistakes show up straight away, and the entries are never changed, only added to.' },
    { title: 'Reconciliation', body: 'Each night, compare the provider\'s settlement file with your ledger. It\'s your last line of defense, because it catches whatever every other part of the system got wrong.' },
    { title: 'Don\'t touch card numbers', body: 'Use a hosted payment page from the provider. Card details never reach your servers, which removes most of the PCI compliance burden.' },
  ],
  estimator: {
    vars: [
      { key: 'perDay', label: 'Transactions per day', unit: 'count' },
      { key: 'peakFactor', label: 'Peak over average', unit: 'plain', assume: 10 },
      { key: 'entries', label: 'Ledger entries per transaction', unit: 'plain', assume: 2 },
      { key: 'entryBytes', label: 'Bytes per entry', unit: 'plain', assume: 200 },
      { key: 'years', label: 'Years to keep', unit: 'plain', assume: 7 },
      { key: 'avg', label: 'Average rate', unit: 'qps' },
      { key: 'peak', label: 'Peak rate', unit: 'qps' },
      { key: 'ledger', label: 'Ledger storage', unit: 'bytes' },
    ],
    eqs: [
      { out: 'avg', terms: [['perDay', 1], [86400, -1]] },
      { out: 'peak', terms: [['avg', 1], ['peakFactor', 1]] },
      { out: 'ledger', terms: [['perDay', 1], ['entries', 1], ['entryBytes', 1], [365, 1], ['years', 1]] },
    ],
    starts: [
      { key: 'perDay', value: 1_000_000 },
      { key: 'peak', value: 100 },
      { key: 'ledger', value: 1e12 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'pay(order):' },
    { code: '  key = order.idempotency_key' },
    { code: '  repeat up to max_retries:' },
    { code: '    reply = provider.charge(order, key)' },
    { code: '    if reply is ok:' },
    { code: '      ledger: debit customer, credit merchant', id: 'ledger' },
    { code: '      return paid' },
    { code: '  return unknown  -- never assume it failed', id: 'order' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Retry on timeout', gain: 'Fewer failed payments', cost: 'Double charges, unless every retry is idempotent' },
    { choice: 'Synchronous provider call', gain: 'Simple, with instant results', cost: 'Your request waits on someone else\'s slowness' },
    { choice: 'Asynchronous with a queue', gain: 'Survives provider outages', cost: 'The customer doesn\'t get an answer right away' },
    { choice: 'Hosted payment page', gain: 'Avoids most PCI compliance work', cost: 'Less control over checkout' },
  ],
  interview: [
    { q: 'How do you get exactly-once payment?', a: 'At-least-once delivery through retries, plus at-most-once effect through idempotency keys. Together they behave like exactly-once. Store the key and payment state before calling out, so a crash can resume safely.' },
    { q: 'What if a payment is stuck in an unknown state?', a: 'Don\'t guess. Query the provider\'s API for that key, and act on the result. Webhooks help too, since providers can tell you asynchronously.' },
    { q: 'How do you pay out to a merchant safely?', a: 'Treat it the same way: idempotent, recorded in the ledger, and reconciled. Pay-outs are usually batched, and often held back for a while to cover refunds and fraud.' },
    { q: 'Why is the ledger append-only?', a: 'An auditor needs to see what happened, including mistakes. Corrections are new entries that reverse the old ones, rather than edits. The history can always explain the current balance.' },
  ],
  mistakes: [
    'Treating a timeout as a failure.',
    'Using floating point for money. Use integers in the smallest currency unit.',
    'Skipping reconciliation because the code "can\'t be wrong".',
  ],
};

export default topic;
