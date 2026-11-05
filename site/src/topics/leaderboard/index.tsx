import type { CustomViewProps, Lab, Topic } from '../../core/types';
import { fmtBytes, fmtCount, fmtInt } from '../../core/format';
import { tailMean } from '../../core/stats';
import source from './engine.ts?raw';
import { SkipList, SortedTable, type Ranked } from './engine';

type P = { structure: 'skiplist' | 'table'; players: number; updatesPerSec: number; topN: number };

const DT = 0.2;
const YOU = 'you';

interface S {
  board: Ranked;
  scores: Map<string, number>;
  names: string[];
  stepsPerOp: number;
  lastOpSteps: number;
  rankOfYou: number;
  topStepsLast: number;
  top: { member: string; score: number }[];
  ops: number;
}

function setScore(s: S, p: P, member: string, score: number) {
  const previous = s.scores.get(member);
  s.scores.set(member, score);
  if (p.structure === 'skiplist') (s.board as SkipList).update(member, score, previous);
  else s.board.update(member, score);
}

function BoardView({ state }: CustomViewProps<S, P>) {
  return (
    <div className="lab-panel">
      <h4>Live top 10. You are ranked {fmtInt(state.rankOfYou)}.</h4>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {state.top.slice(0, 10).map((row, i) => (
              <tr key={row.member}>
                <td>{i + 1}</td>
                <td>{row.member === YOU ? 'You' : row.member}</td>
                <td>{fmtInt(row.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'structure', label: 'Data structure', kind: 'choice', rebuild: true, options: [{ value: 'skiplist', label: 'Skip list (sorted set)' }, { value: 'table', label: 'SQL table, no usable index' }] },
    { key: 'players', label: 'Players', kind: 'range', min: 1000, max: 100000, step: 1000, rebuild: true },
    { key: 'updatesPerSec', label: 'Score updates', kind: 'range', min: 5, max: 100, step: 5, unit: 'per s' },
    { key: 'topN', label: 'Leaderboard length', kind: 'range', min: 10, max: 100, step: 10 },
  ],
  defaults: { structure: 'skiplist', players: 50000, updatesPerSec: 50, topN: 10 },
  create(p, rng) {
    const board: Ranked = p.structure === 'skiplist' ? new SkipList(() => rng.next()) : new SortedTable();
    const s: S = { board, scores: new Map(), names: [], stepsPerOp: 0, lastOpSteps: 0, rankOfYou: 0, topStepsLast: 0, top: [], ops: 0 };
    s.names = Array.from({ length: p.players }, (_, i) => `player${i}`);
    for (const name of s.names) setScore(s, p, name, rng.int(100000));
    setScore(s, p, YOU, 1000);
    board.steps = 0;
    return s;
  },
  step(s, p, rng) {
    const n = Math.min(40, rng.poisson(p.updatesPerSec * DT));
    for (let i = 0; i < n; i++) {
      const name = s.names[rng.int(s.names.length)];
      const before = s.board.steps;
      setScore(s, p, name, (s.scores.get(name) ?? 0) + rng.int(500));
      s.board.rank(name, s.scores.get(name)!);
      s.lastOpSteps = s.board.steps - before;
      s.stepsPerOp = s.stepsPerOp ? s.stepsPerOp * 0.97 + s.lastOpSteps * 0.03 : s.lastOpSteps;
      s.ops++;
    }
    const before = s.board.steps;
    s.top = s.board.top(p.topN);
    s.topStepsLast = s.board.steps - before;
    s.rankOfYou = s.board.rank(YOU, s.scores.get(YOU)!);
  },
  sample: (s, p) => ({ steps: s.stepsPerOp, math: p.structure === 'skiplist' ? 2.5 * Math.log2(p.players) : p.players, top: s.topStepsLast }),
  charts: [{ title: 'Nodes touched per score update and rank lookup', series: [{ key: 'steps', label: 'Measured', role: 'measured' }, { key: 'math', label: 'Math', role: 'predicted' }] }],
  metrics(s, p) {
    return [
      { label: 'Work per update', value: fmtCount(p.structure === 'skiplist' ? 2.5 * Math.log2(p.players) : p.players), role: 'predicted' },
      { label: 'Work per update', value: fmtCount(s.stepsPerOp), role: 'measured' },
      { label: 'Work to read the top list', value: fmtCount(s.topStepsLast), role: 'measured' },
      { label: 'Your rank', value: fmtInt(s.rankOfYou), role: 'measured' },
      { label: 'Memory at about 100 bytes each', value: fmtBytes(s.scores.size * 100), role: 'predicted' },
    ];
  },
  math(s, p) {
    return [
      { expr: `Skip list: about log2(${fmtInt(p.players)}) × a small constant`, result: `${fmtInt(2.5 * Math.log2(p.players))} steps` },
      { expr: `Table scan: count every row above you`, result: `${fmtInt(p.players)} steps`, tone: 'bad' },
      { expr: `Scale it: ${fmtInt(s.scores.size)} players × 100 bytes`, result: fmtBytes(s.scores.size * 100) },
    ];
  },
  View: BoardView,
  actions: [
    { key: 'small', label: 'You win a match: +500', run: (s, p) => setScore(s, p, YOU, (s.scores.get(YOU) ?? 0) + 500) },
    { key: 'big', label: 'You go on a huge streak: +1,000,000', run: (s, p) => setScore(s, p, YOU, (s.scores.get(YOU) ?? 0) + 1_000_000) },
  ],
  trace: (s) => ({
    values: { steps: fmtCount(s.lastOpSteps), rank: fmtInt(s.rankOfYou), top: fmtCount(s.topStepsLast) },
  }),
  experiments: [
    {
      title: 'Rank in a sorted set',
      set: { structure: 'skiplist', players: 50000 },
      ticks: 60,
      question: 'You have 50,000 players in a skip list. How many nodes does it touch to update a score and find the new rank?',
      options: ['A few dozen', 'About 25,000', 'All 50,000'],
      answer: 0,
      explain: 'Express lanes skip over large parts of the list, so it takes about log n steps down. Spans along the way add up to the rank. Double the players and it costs only a couple of extra steps. This is why Redis uses this for sorted sets.',
      check: (_s, _p, h) => tailMean(h, 'steps', 40) < 200,
    },
    {
      title: 'Rank in a table',
      set: { structure: 'table', players: 50000 },
      ticks: 40,
      question: 'A table with `SELECT COUNT(*) WHERE score > mine`. How many rows does it read per lookup?',
      options: ['A few dozen', 'All 50,000'],
      answer: 1,
      explain: 'With scores changing constantly, every rank lookup needs a count across the table. That\'s fine for 1,000 players, and terrible for 50 million playing at once. An index helps reads, but it\'s costly to maintain under this update rate.',
      check: (_s, _p, h) => tailMean(h, 'steps', 20) > 30000,
    },
    {
      title: 'Read the top 10',
      set: { structure: 'skiplist', topN: 10, players: 50000 },
      ticks: 20,
      question: 'How much work is it to read the top 10 from a skip list?',
      options: ['About 10 steps', 'About log n steps', 'All the players'],
      answer: 0,
      explain: 'The best scores are already at the front, so you simply walk 10 nodes. That\'s why the most-viewed part of the leaderboard is also the cheapest.',
      check: (s) => s.topStepsLast <= 11,
    },
    {
      title: 'Jump to the top',
      set: { structure: 'skiplist', players: 20000 },
      act: ['big'],
      actAt: 10,
      ticks: 15,
      question: 'You jump a million points. What does the skip list do?',
      options: ['Removes and re-inserts you, in about log n steps, and you\'re first', 'Re-sorts everything'],
      answer: 0,
      explain: 'Only your node moves, so nobody else gets touched. That\'s why it can handle tens of thousands of updates per second, on just one in-memory node.',
      check: (s) => s.rankOfYou === 1,
    },
  ],
};

const topic: Topic = {
  problem: [
    'A gaming leaderboard ranks players, updates as they score, and shows the top 10 and your own position. The top 10 is easy. It\'s "what\'s my exact rank out of 25 million players, right now" that breaks a normal database.',
    'A database has to count how many rows are above you, and with scores changing constantly, indexes can\'t save it. The trick is a data structure that makes both updating and ranking take logarithmic time: the sorted set, built on a skip list.',
  ],
  functional: [
    'Show the top 10 players',
    'Show a player\'s own rank',
    'Update scores in real time, when a player wins',
  ],
  nonFunctional: [
    'Real-time updates to scores and ranks',
    'Scales to millions of players',
    'Scores can\'t be cheated from the client',
  ],
  diagram: {
    nodes: [
      { id: 'c', label: 'Game client', col: 0, row: 0, kind: 'client', note: 'Never reports its own score, or players would cheat.' },
      { id: 'g', label: 'Game service', col: 1, row: 0, note: 'Decides who won, then reports that to the leaderboard service.' },
      { id: 'l', label: 'Leaderboard service', col: 2, row: 0, note: 'Updates scores and answers rank queries.' },
      { id: 'r', label: 'Redis sorted sets', col: 3, row: 0, kind: 'store', note: 'One sorted set per leaderboard, kept in memory with a skip list.' },
      { id: 'd', label: 'Database', col: 3, row: 1, kind: 'store', note: 'Keeps score history and user profiles. Redis can be rebuilt from here after a failure.' },
      { id: 'q', label: 'Queue', col: 2, row: 1, kind: 'queue', note: 'Optionally decouples game results from leaderboard writes, if other services want them too.' },
    ],
    edges: [
      { from: 'c', to: 'g' },
      { from: 'g', to: 'l' },
      { from: 'l', to: 'r' },
      { from: 'l', to: 'd', dashed: true },
      { from: 'g', to: 'q', dashed: true },
      { from: 'q', to: 'l', dashed: true },
    ],
  },
  ideas: [
    { title: 'Skip list', body: 'A sorted linked list with extra express lanes on top. Search starts on the fastest lane and drops down, for about log n steps. It\'s simpler than a balanced tree, and easy to keep balanced using randomness.' },
    { title: 'Getting a rank', body: 'Each pointer stores how many nodes it skips. Adding those up as you walk gives you the exact rank, without counting anyone.' },
    { title: 'Why not a database?', body: 'A rank query has to count rows above you, and scores change constantly. Caching doesn\'t help, since everyone\'s rank shifts. In-memory sorted sets fit this pattern exactly.' },
    { title: 'Sharding', body: 'Past one Redis node, fixed score ranges let you find rank by adding up higher shards. Hash partitioning spreads load evenly, but makes top-N and exact rank much harder.' },
  ],
  estimator: {
    vars: [
      { key: 'mau', label: 'Monthly active users', unit: 'count' },
      { key: 'dauShare', label: 'Daily share (0 to 1)', unit: 'plain', assume: 0.2 },
      { key: 'gamesPerDay', label: 'Games per user per day', unit: 'plain', assume: 10 },
      { key: 'peakFactor', label: 'Peak over average', unit: 'plain', assume: 5 },
      { key: 'entryBytes', label: 'Bytes per player', unit: 'plain', assume: 26 },
      { key: 'overheadFactor', label: 'Memory overhead multiple', unit: 'plain', assume: 2 },
      { key: 'dau', label: 'Daily active users', unit: 'count' },
      { key: 'updates', label: 'Average score updates', unit: 'qps' },
      { key: 'peak', label: 'Peak score updates', unit: 'qps' },
      { key: 'memory', label: 'Redis memory', unit: 'bytes' },
    ],
    eqs: [
      { out: 'dau', terms: [['mau', 1], ['dauShare', 1]] },
      { out: 'updates', terms: [['dau', 1], ['gamesPerDay', 1], [86400, -1]] },
      { out: 'peak', terms: [['updates', 1], ['peakFactor', 1]] },
      { out: 'memory', terms: [['mau', 1], ['entryBytes', 1], ['overheadFactor', 1]] },
    ],
    starts: [
      { key: 'mau', value: 25_000_000 },
      { key: 'peak', value: 3000 },
      { key: 'memory', value: 1.3e9 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'update(player, new_score):' },
    { code: '  remove player\'s old node, in about log n steps' },
    { code: '  insert with new score, in about log n steps', id: 'steps' },
    { code: '' },
    { code: 'rank(player):' },
    { code: '  walk down from the top lane, adding spans', id: 'rank' },
    { code: '' },
    { code: 'top(n): walk n nodes from the head', id: 'top' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Redis sorted set', gain: 'Fast updates and rank, with simple commands', cost: 'Memory cost, and durability needs care' },
    { choice: 'SQL table', gain: 'Familiar and durable', cost: 'Rank queries scan far too many rows' },
    { choice: 'Shard by score range', gain: 'Exact global rank stays possible', cost: 'Uneven shards, and players move between them' },
    { choice: 'Approximate rank', gain: 'Scales much further', cost: '"Top 1%" rather than an exact position' },
  ],
  interview: [
    { q: 'What if Redis fails?', a: 'Use a replica for failover, and keep scores in a durable database too. In the worst case, you can rebuild the sorted set from that data, since it\'s derived.' },
    { q: 'How do you break ties?', a: 'Use a secondary sort, such as earliest to reach the score. With a sorted set, you can encode the timestamp into the low bits of the score, or keep a separate lookup.' },
    { q: 'How do you scale to 500 million players?', a: 'Shard the sorted set. With fixed score ranges, exact rank is the count in higher shards plus your rank in yours. At that scale, many products show a percentile rather than an exact rank.' },
    { q: 'How do you stop cheating?', a: 'The server decides scores, from game outcomes. Clients never submit them directly. Add an idempotency key so a game result can\'t be counted twice, plus anomaly detection on the results.' },
  ],
  mistakes: [
    'Using `ORDER BY` on a huge table for rank.',
    'Letting the client submit its own score.',
    'Sharding by hash, then trying to find a global rank.',
  ],
};

export default topic;
