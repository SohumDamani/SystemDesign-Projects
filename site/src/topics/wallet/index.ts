import type { Lab, Topic } from '../../core/types';
import { fmtCount, fmtInt } from '../../core/format';
import source from './engine.ts?raw';
import { createWallets, pickAccount, recoverCoordinator, replay, runCompensations, transferNaive, transferSaga, transferTwoPhase, type Mode, type Wallets } from './engine';

type P = { mode: Mode; tps: number; crashChance: number; recoverySec: number };

const DT = 0.1;
const ACCOUNTS = 500;
const START = 1000;

interface S {
  now: number;
  w: Wallets;
  done: number;
  crashed: number;
  blocked: number;
  noFunds: number;
  compensated: number;
  replayOk: boolean | null;
  lastEvent: string;
}

const initial = ACCOUNTS * START;
const total = (w: Wallets) => w.balances.reduce((a, b) => a + b, 0);
const pendingCompensation = (w: Wallets) => w.compensations.reduce((a, c) => a + c.amount, 0);

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'mode', label: 'Transfer protocol', kind: 'choice', rebuild: true, options: [{ value: 'naive', label: 'Two plain writes' }, { value: 'two-phase', label: 'Two-phase commit' }, { value: 'saga', label: 'Saga with compensation' }] },
    { key: 'tps', label: 'Transfers', kind: 'range', min: 10, max: 1000, step: 10, unit: 'per s' },
    { key: 'crashChance', label: 'Crash chance per transfer', kind: 'range', min: 0, max: 0.05, step: 0.001, format: (v) => `${(v * 100).toFixed(1)}%` },
    { key: 'recoverySec', label: 'Time to recover from a crash', kind: 'range', min: 1, max: 30, step: 1, unit: 's' },
  ],
  defaults: { mode: 'naive', tps: 200, crashChance: 0.01, recoverySec: 5 },
  create: () => ({ now: 0, w: createWallets(ACCOUNTS, START), done: 0, crashed: 0, blocked: 0, noFunds: 0, compensated: 0, replayOk: null, lastEvent: '' }),
  step(s, p, rng) {
    s.now += DT;
    recoverCoordinator(s.w, s.now);
    s.compensated += runCompensations(s.w, s.now);
    for (let i = rng.poisson(p.tps * DT); i > 0; i--) {
      const from = pickAccount(ACCOUNTS, rng);
      let to = pickAccount(ACCOUNTS, rng);
      if (to === from) to = (to + 1) % ACCOUNTS;
      const amount = 1 + rng.int(50);
      const crash = rng.chance(p.crashChance);
      const outcome = p.mode === 'naive' ? transferNaive(s.w, from, to, amount, crash) : p.mode === 'two-phase' ? transferTwoPhase(s.w, from, to, amount, crash, s.now, p.recoverySec) : transferSaga(s.w, from, to, amount, crash, s.now, p.recoverySec);
      if (outcome === 'done') s.done++;
      else if (outcome === 'crashed') s.crashed++;
      else if (outcome === 'blocked') s.blocked++;
      else s.noFunds++;
      s.lastEvent = `$${amount} from ${from} to ${to}: ${outcome}`;
    }
  },
  sample: (s) => ({ total: total(s.w), initial, locked: s.w.locked.size, drift: total(s.w) - initial }),
  charts: [
    { title: 'Total money in the system', series: [{ key: 'total', label: 'Measured', role: 'measured' }, { key: 'initial', label: 'Must stay at', role: 'predicted' }] },
    { title: 'Accounts locked and waiting', series: [{ key: 'locked', label: 'Measured', role: 'measured' }] },
  ],
  metrics(s) {
    const drift = total(s.w) - initial;
    return [
      { label: 'Money that should exist', value: `$${fmtCount(initial)}`, role: 'predicted' },
      { label: 'Money that exists', value: `$${fmtCount(total(s.w))}`, role: 'measured', tone: drift ? 'bad' : 'good' },
      { label: 'Currently missing', value: `$${fmtInt(-drift)}`, role: 'measured', tone: drift ? 'bad' : 'good' },
      { label: 'Blocked by locks', value: fmtCount(s.blocked), role: 'measured', tone: s.blocked ? 'warn' : undefined },
      { label: 'Compensations run', value: fmtCount(s.compensated), role: 'measured' },
    ];
  },
  math(s, p) {
    const crashes = p.tps * p.crashChance;
    return [
      { expr: `Crashes: ${p.tps}/s × ${(p.crashChance * 100).toFixed(1)}%`, result: `${crashes.toFixed(1)}/s` },
      { expr: p.mode === 'two-phase' ? `Locked at any moment: ${crashes.toFixed(1)}/s × ${p.recoverySec} s × 2 accounts` : p.mode === 'saga' ? `Money in limbo: ${crashes.toFixed(1)}/s × ${p.recoverySec} s × $25.50 avg` : `Money gone forever: ${crashes.toFixed(1)}/s × $25.50 avg`, result: p.mode === 'two-phase' ? `≈ ${fmtInt(crashes * p.recoverySec * 2)} accounts` : p.mode === 'saga' ? `≈ $${fmtInt(crashes * p.recoverySec * 25.5)}` : `$${fmtInt(crashes * 25.5)}/s`, tone: p.mode === 'naive' ? 'bad' : 'warn' },
      { expr: `Event log entries`, result: fmtCount(s.w.log.length) },
    ];
  },
  views: (s) => [
    { kind: 'note', title: 'Replay from the event log', text: s.replayOk === null ? 'Rebuild every balance from the event log, and compare with the live state.' : s.replayOk ? 'Rebuilt balances match the live state exactly, across every account.' : 'Rebuilt balances do not match the live state.' },
    { kind: 'cells', title: 'Outcomes', items: [{ label: 'Completed', value: fmtCount(s.done), tone: 'good' }, { label: 'Crashed', value: fmtCount(s.crashed), tone: s.crashed ? 'warn' : 'neutral' }, { label: 'Not enough funds', value: fmtCount(s.noFunds) }] },
  ],
  actions: [
    {
      key: 'replay',
      label: 'Replay the event log',
      run: (s) => {
        const rebuilt = replay(s.w.log, ACCOUNTS, START);
        s.replayOk = rebuilt.every((b, i) => b === s.w.balances[i]);
      },
    },
  ],
  trace: (s, p) => ({
    values: { last: s.lastEvent, mode: p.mode, locks: fmtInt(s.w.locked.size), pending: `$${fmtInt(pendingCompensation(s.w))}` },
  }),
  experiments: [
    {
      title: 'Two plain writes',
      set: { mode: 'naive', crashChance: 0.01, tps: 200 },
      ticks: 200,
      question: 'A transfer subtracts from one account, then adds to another, on a different database. Sometimes the process crashes between the two. What happens to the total money?',
      options: ['It stays the same', 'It slowly drains away, and never comes back'],
      answer: 1,
      explain: 'The debit committed, and the credit never happened. Your customers are out real money, with no record of why. Across shards, you can\'t get atomicity from two independent writes. You need a protocol.',
      check: (s) => total(s.w) < initial,
    },
    {
      title: 'Two-phase commit',
      set: { mode: 'two-phase', crashChance: 0.01, tps: 200, recoverySec: 5 },
      ticks: 300,
      question: 'A coordinator asks both sides to prepare, then tells them to commit. Crashes still happen. What goes wrong now?',
      options: ['Money still disappears', 'No money is lost, but accounts stay locked and transfers get blocked'],
      answer: 1,
      explain: 'Atomicity holds, so no money disappears. But prepared accounts stay locked until the coordinator comes back. A crashed coordinator blocks unrelated transfers, which is the well-known weakness of 2PC.',
      check: (s) => s.blocked > 0 && total(s.w) === initial,
    },
    {
      title: 'A saga',
      set: { mode: 'saga', crashChance: 0.01, tps: 200, recoverySec: 5 },
      ticks: 300,
      question: 'A saga commits each step separately, and runs a compensating refund if a later step fails. Does money disappear?',
      options: ['Never, even for a moment', 'Temporarily, then a compensation restores it'],
      answer: 1,
      explain: 'For a few seconds the money is debited but not credited, and that window is visible to other reads. Then the compensation runs. No locks and better availability, at the cost of weaker isolation. Compensations must be idempotent.',
      check: (s) => s.compensated > 0 && total(s.w) + pendingCompensation(s.w) === initial,
    },
    {
      title: 'Replay history',
      set: { mode: 'saga', crashChance: 0.01, tps: 200 },
      act: ['replay'],
      actAt: 199,
      ticks: 200,
      question: 'Every balance change is an immutable event. If you throw away all balances and replay the log from the start, what do you get?',
      options: ['Something close to it', 'Exactly the current state, down to the cent'],
      answer: 1,
      explain: 'State is just a fold over the events. This is event sourcing, and it gives you a perfect audit trail, recovery after a bug, and the ability to rebuild any past balance. Snapshots keep replays from taking forever.',
      check: (s) => s.replayOk === true,
    },
  ],
};

const topic: Topic = {
  problem: [
    'A digital wallet holds balances and moves money between users. Within one database that\'s a simple transaction. But at this scale, accounts live on different shards, so one transfer needs to change two independent databases, and that\'s no longer atomic.',
    'If the system crashes halfway through, money can vanish. The design question is which protocol keeps your total correct: two-phase commit, sagas, or event sourcing, each with a different failure mode. The lab has a single invariant that matters: the total must never change.',
  ],
  functional: [
    'Transfer money between wallets',
    'Check a balance',
    'See the full history of every transaction',
  ],
  nonFunctional: [
    'Strong correctness: money is never created or destroyed',
    'High throughput, across many shards',
    'A complete audit trail, and the ability to reproduce any balance',
  ],
  diagram: {
    nodes: [
      { id: 'c', label: 'Client', col: 0, row: 1, kind: 'client', note: 'Sends a transfer with a unique ID, so retries are safe.' },
      { id: 'w', label: 'Wallet service', col: 1, row: 1, note: 'Validates, and coordinates the transaction.' },
      { id: 't', label: 'Transaction coordinator', col: 2, row: 1, note: 'Tracks transfer state, so it can resume or compensate after a crash.' },
      { id: 'a', label: 'Shard A', col: 3, row: 0, kind: 'store', note: 'Holds the source account.' },
      { id: 'b', label: 'Shard B', col: 3, row: 2, kind: 'store', note: 'Holds the destination account.' },
      { id: 'e', label: 'Event log', col: 2, row: 2, kind: 'queue', note: 'Immutable record of each balance change, from which state can be rebuilt.' },
    ],
    edges: [
      { from: 'c', to: 'w' },
      { from: 'w', to: 't' },
      { from: 't', to: 'a' },
      { from: 't', to: 'b' },
      { from: 't', to: 'e', dashed: true },
    ],
  },
  ideas: [
    { title: 'Two-phase commit', body: 'A coordinator asks all participants to prepare and lock, then tells them to commit. It\'s atomic, but locks are held across a network round trip, and a coordinator crash blocks everyone.' },
    { title: 'Try-Confirm/Cancel', body: 'A version of 2PC at the application level: first hold the funds, then confirm or release them. No database locks are held in between, but each service must implement all three operations.' },
    { title: 'Saga', body: 'A chain of local transactions, each with a compensating action to undo it. There are no distributed locks, and availability is good, but other requests can see intermediate states.' },
    { title: 'Event sourcing', body: 'Store changes rather than state. The balance is computed by replaying events. You can reproduce any past balance and answer any audit question, and the log is what you can trust.' },
  ],
  estimator: {
    vars: [
      { key: 'tps', label: 'Transfers', unit: 'qps' },
      { key: 'opsPerTransfer', label: 'Writes per transfer', unit: 'plain', assume: 2 },
      { key: 'nodeTps', label: 'Writes per second per database node', unit: 'plain', assume: 1000 },
      { key: 'eventBytes', label: 'Bytes per event', unit: 'plain', assume: 100 },
      { key: 'days', label: 'Days of log to keep', unit: 'plain', assume: 365 },
      { key: 'opsPerSec', label: 'Database writes', unit: 'qps' },
      { key: 'nodes', label: 'Database nodes', unit: 'count' },
      { key: 'log', label: 'Event log size', unit: 'bytes' },
    ],
    eqs: [
      { out: 'opsPerSec', terms: [['tps', 1], ['opsPerTransfer', 1]] },
      { out: 'nodes', terms: [['opsPerSec', 1], ['nodeTps', -1]] },
      { out: 'log', terms: [['opsPerSec', 1], ['eventBytes', 1], [86400, 1], ['days', 1]] },
    ],
    starts: [
      { key: 'tps', value: 1_000_000 },
      { key: 'nodes', value: 100 },
      { key: 'log', value: 1e15 },
    ],
  },
  lab,
  pseudocode: (p: P) =>
    p?.mode === 'two-phase'
      ? [
          { code: 'prepare: lock both accounts, and check funds', id: 'locks' },
          { code: 'if the coordinator crashes here: everyone waits' },
          { code: 'commit: debit, credit, and release locks' },
          { code: 'latest', id: 'last' },
        ]
      : p?.mode === 'saga'
        ? [
            { code: 'step 1: debit source, and commit' },
            { code: 'step 2: credit destination, and commit' },
            { code: 'if step 2 fails: refund source later', id: 'pending' },
            { code: 'latest', id: 'last' },
          ]
        : [
            { code: 'debit source  -- committed on shard A' },
            { code: 'crash here = money gone forever' },
            { code: 'credit destination  -- committed on shard B' },
            { code: 'latest', id: 'last' },
          ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Two-phase commit', gain: 'Strong atomicity', cost: 'Blocking, with slow locks across the network' },
    { choice: 'Try-Confirm/Cancel', gain: 'No long database locks', cost: 'More application logic, and funds held temporarily' },
    { choice: 'Saga', gain: 'Available and scalable', cost: 'Other requests can see in-between states' },
    { choice: 'Event sourcing', gain: 'Perfect audit trail, and reproducible state', cost: 'A new way of building, and replay needs snapshots' },
  ],
  interview: [
    { q: 'Why not one big database?', a: 'At high throughput, a single relational database can only do a few thousand transactions a second. You must shard, and shards don\'t share a transaction. That\'s the entire reason for this problem.' },
    { q: 'How do you avoid a double spend?', a: 'Each account\'s balance is checked and changed atomically on its shard. Idempotency keys on transfers stop retries from applying twice.' },
    { q: 'How can you make event sourcing reliable and fast?', a: 'Replicate the log with a consensus algorithm like Raft, so no event is lost. Save snapshots regularly, so replay starts from a recent state rather than the beginning.' },
    { q: 'How do you verify nothing went wrong?', a: 'Continuously check the invariant: the sum of all balances should be constant. This is a simple and powerful monitor that catches whole classes of bugs.' },
  ],
  mistakes: [
    'Performing a cross-shard transfer as two independent updates.',
    'Forgetting that compensating transactions must be idempotent too.',
    'Saying "use a distributed transaction" without naming its failure mode.',
  ],
};

export default topic;
