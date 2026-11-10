import { advance, createSim, fireAction } from '../core/sim';
import { tailMean, type Row } from '../core/stats';
import type { Lab, Params } from '../core/types';

export interface Challenge {
  title: string;
  task: string;
  setup?: Params;
  baseline: { label: string; params: Params };
  alternative: { label: string; params: Params };
  ticks: number;
  action?: { key: string; at: number; count?: number };
  metric: string;
  unit?: string;
  measure(rows: Row[]): number;
  higherIsBetter?: boolean;
  explanation: string;
}

const average = (key: string, count: number) => (rows: Row[]) => tailMean(rows, key, count);

export const CHALLENGES: Readonly<Partial<Record<string, Challenge>>> = {
  cache: {
    title: 'Protect the database when a popular key expires',
    task: 'Reduce database reads for the expired key without making the cache bigger.',
    baseline: { label: 'Fetch separately on every miss', params: { coalesce: false } },
    alternative: { label: 'Share one fetch across concurrent misses', params: { coalesce: true } },
    ticks: 115,
    action: { key: 'expire-hot', at: 100 },
    metric: 'Database reads for the expired key',
    measure: average('hotReads', 1),
    explanation: 'When requests share one fetch, the first miss goes to the database and the others wait for its result.',
  },
  queueing: {
    title: 'Bring down response time',
    task: 'Reduce average response time while keeping traffic at 95 requests per second.',
    setup: { rate: 95, serviceMs: 10 },
    baseline: { label: 'Keep one server', params: { servers: 1 } },
    alternative: { label: 'Add a second server', params: { servers: 2 } },
    ticks: 1500,
    metric: 'Average response time',
    unit: 'ms',
    measure: average('mean', 1),
    explanation: 'With spare capacity, incoming requests spend less time waiting in line. The second server adds infrastructure cost.',
  },
  'bloom-filter': {
    title: 'Reduce false positives on the same memory budget',
    task: 'Change the number of hash functions while keeping the filter at 10 bits per item.',
    setup: { bitsPerItem: 10 },
    baseline: { label: 'Use one hash function', params: { hashes: 1 } },
    alternative: { label: 'Use seven hash functions', params: { hashes: 7 } },
    ticks: 100,
    metric: 'Measured false positives',
    unit: '%',
    measure: average('fp', 30),
    explanation: 'With this filter size, requiring several bits to match reduces accidental matches. Each extra hash costs work.',
  },
  sharding: {
    title: 'Spread writes across eight shards',
    task: 'Lower the busiest shard’s write rate when keys arrive in increasing order.',
    setup: { pattern: 'ordered', shards: 8 },
    baseline: { label: 'Route by key range', params: { strategy: 'range' } },
    alternative: { label: 'Route by hash', params: { strategy: 'hash' } },
    ticks: 100,
    metric: 'Writes per second on the busiest shard',
    measure: average('peak', 30),
    explanation: 'Hashing spreads nearby keys across shards. Range queries can then need to contact more shards.',
  },
  replication: {
    title: 'Let users read their own writes',
    task: 'Reduce stale reads while keeping replication asynchronous.',
    setup: { mode: 'async', delayMs: 500, gapMs: 100 },
    baseline: { label: 'Read from any follower', params: { routing: 'follower' } },
    alternative: { label: 'Use a follower only if it has caught up', params: { routing: 'token' } },
    ticks: 300,
    metric: 'Reads missing the user’s own write',
    unit: '%',
    measure: average('stale', 50),
    explanation: 'A write token tells the router how far a follower must have applied the log. If it is behind, the read goes to the leader.',
  },
  consensus: {
    title: 'Keep committing after two nodes fail',
    task: 'Choose a cluster size that lets Raft keep committing when two nodes fail.',
    baseline: { label: 'Use three nodes', params: { nodes: 3 } },
    alternative: { label: 'Use five nodes', params: { nodes: 5 } },
    ticks: 300,
    action: { key: 'kill-leader', at: 100, count: 2 },
    metric: 'New commits in the final 80 ticks',
    measure: (rows) => rows.at(-1)!.committed - rows.at(-81)!.committed,
    higherIsBetter: true,
    explanation: 'Five nodes leave three survivors, enough for a majority. Three nodes leave only one survivor after two failures.',
  },
  'storage-engines': {
    title: 'Skip unnecessary file reads',
    task: 'Make lookups touch fewer files in an LSM tree with compaction disabled.',
    setup: { engine: 'lsm', maxFiles: 40, memtable: 100 }, // 40 is the lab's "Never compact" setting.
    baseline: { label: 'Read without Bloom filters', params: { bloom: false } },
    alternative: { label: 'Enable a Bloom filter on each file', params: { bloom: true } },
    ticks: 400,
    metric: 'Average file reads per lookup',
    measure: average('read', 30),
    explanation: 'A Bloom filter can rule out files before the lookup reads them. It uses extra memory and sometimes reports a possible match.',
  },
  resilience: {
    title: 'Recover after a slowdown',
    task: 'Restore successful throughput after a temporary service slowdown without adding capacity.',
    baseline: { label: 'Allow three immediate retries', params: { retries: 3 } },
    alternative: { label: 'Turn off immediate retries', params: { retries: 0 } },
    ticks: 1100,
    action: { key: 'slow', at: 40 },
    metric: 'Successful requests per second near the end',
    measure: average('goodput', 80),
    higherIsBetter: true,
    explanation: 'Immediate retries can keep the queue overloaded after the service recovers. Turning them off lets the queue drain, but clients see temporary failures.',
  },
  gossip: {
    title: 'Spread news faster despite packet loss',
    task: 'Reach all 1,000 nodes in fewer rounds when half the messages are lost.',
    setup: { nodes: 1000, loss: 0.5 },
    baseline: { label: 'Tell two peers per round', params: { fanout: 2 } },
    alternative: { label: 'Tell four peers per round', params: { fanout: 4 } },
    ticks: 80,
    metric: 'Rounds until all nodes know',
    measure: (rows) => rows.findIndex((row) => row.informed === 1000) + 1 || Infinity,
    explanation: 'Telling more peers gives the news more routes around lost messages. It also sends more messages per round.',
  },
};

export function compareChallenge(lab: Lab, challenge: Challenge, useAlternative: boolean) {
  function run(overrides: Params) {
    const params = { ...lab.defaults, ...challenge.setup, ...overrides };
    const sim = createSim(lab, params, 1);
    for (let i = 0; i < challenge.ticks; i++) {
      const action = challenge.action;
      if (action?.at === i) {
        for (let j = 0; j < (action.count ?? 1); j++) fireAction(sim, lab, params, action.key);
      }
      advance(sim, lab, params);
    }
    return challenge.measure(sim.history);
  }
  const baseline = run(challenge.baseline.params);
  const choice = useAlternative ? run(challenge.alternative.params) : baseline;
  const improved = challenge.higherIsBetter ? choice > baseline : choice < baseline;
  return { baseline, choice, improved };
}
