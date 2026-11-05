export type Group = 'foundations' | 'concepts' | 'vol1' | 'vol2' | 'more';

export interface CatalogEntry {
  id: string;
  title: string;
  group: Group;
  /** Where the topic appears in the book's public chapter list. */
  book: string;
  tagline: string;
  /** What genuinely executes, and what is modeled, so a lab never overstates itself. */
  real: string;
  modeled: string;
}

export const GROUPS: { id: Group; title: string; blurb: string }[] = [
  { id: 'foundations', title: 'Foundations', blurb: 'The vocabulary, the math, and the building blocks every question reuses.' },
  { id: 'concepts', title: 'Core concepts', blurb: 'The ideas underneath everything else, each one small enough to master in a sitting.' },
  { id: 'vol1', title: 'Classic design questions', blurb: 'The questions interviewers ask most often.' },
  { id: 'vol2', title: 'Advanced design questions', blurb: 'Geospatial, streaming, storage, and money.' },
  { id: 'more', title: 'More design questions', blurb: 'Popular interview questions from beyond the book.' },
];

export const CATALOG: CatalogEntry[] = [
  { id: 'scale', title: 'Scale from zero to millions', group: 'foundations', book: 'Vol. 1, ch. 1', tagline: 'Add one component at a time and watch the bottleneck move.', real: 'Request routing and capacity math', modeled: 'Servers, database, cache and CDN' },
  { id: 'estimation', title: 'Back-of-the-envelope estimation', group: 'foundations', book: 'Vol. 1, ch. 2', tagline: 'Turn vague numbers into QPS and storage, in either direction.', real: 'Every formula solves live', modeled: 'Nothing, this lesson is pure math' },
  { id: 'framework', title: 'A framework for the interview', group: 'foundations', book: 'Vol. 1, ch. 3', tagline: 'Rehearse the four steps against a timer.', real: 'A timed mock interview', modeled: 'The interviewer, through a checklist' },
  { id: 'load-balancer', title: 'Load balancing', group: 'foundations', book: 'Vol. 1, ch. 1', tagline: 'See why 68% average utilization can still melt one server.', real: 'Round robin and least connections code', modeled: 'Servers, traffic and failures' },
  { id: 'cache', title: 'Caching', group: 'foundations', book: 'Vol. 1, ch. 1', tagline: 'Eviction policies, skewed traffic, and the stampede when a hot key expires.', real: 'LRU, LFU and FIFO caches', modeled: 'The database and request traffic' },

  { id: 'queueing', title: 'Latency, queues and percentiles', group: 'concepts', book: 'Beyond the book', tagline: 'See why a system at 95% load feels ten times slower than one at 50%.', real: 'A first-come queue, computed request by request', modeled: 'Request arrivals and service times' },
  { id: 'bloom-filter', title: 'Bloom filters', group: 'concepts', book: 'Beyond the book', tagline: 'Remember millions of items in almost no memory, and get a useful answer.', real: 'A real bit array and hash functions', modeled: 'Nothing, this is the data structure itself' },
  { id: 'sharding', title: 'Database sharding', group: 'concepts', book: 'Beyond the book', tagline: 'Pick a shard key, and watch one bad choice melt a single database.', real: 'Hash, range and consistent routing', modeled: 'The database servers' },
  { id: 'replication', title: 'Replication and failover', group: 'concepts', book: 'Beyond the book', tagline: 'Read your own write, or lose it when the leader dies.', real: 'Leader, followers, logs and failover', modeled: 'Network delay' },
  { id: 'consensus', title: 'Consensus with Raft', group: 'concepts', book: 'Beyond the book', tagline: 'Kill the leader, split the network, and try to make two leaders agree.', real: 'Leader election and log replication', modeled: 'The network between nodes' },
  { id: 'storage-engines', title: 'Storage engines: LSM and B-tree', group: 'concepts', book: 'Beyond the book', tagline: 'Measure write amplification on two real storage structures.', real: 'An LSM tree and a paged B-tree index', modeled: 'The disk, counted in pages and bytes' },
  { id: 'resilience', title: 'Retries and circuit breakers', group: 'concepts', book: 'Beyond the book', tagline: 'Watch retries turn a ten-second blip into an outage that never ends.', real: 'Retry, backoff and circuit breaker logic', modeled: 'The overloaded service' },
  { id: 'gossip', title: 'Gossip and anti-entropy', group: 'concepts', book: 'Beyond the book', tagline: 'Spread news to 10,000 nodes in a few rounds, with no one in charge.', real: 'Gossip rounds and a real Merkle tree', modeled: 'Nodes and packet loss' },

  { id: 'rate-limiter', title: 'Design a rate limiter', group: 'vol1', book: 'Vol. 1, ch. 4', tagline: 'A real Redis Lua script against bursts at the window edge.', real: 'rate_limit.lua, unmodified, on a Lua VM', modeled: 'Redis commands and client traffic' },
  { id: 'consistent-hashing', title: 'Design consistent hashing', group: 'vol1', book: 'Vol. 1, ch. 5', tagline: 'Add a server and count the keys that move.', real: 'The hash ring and key placement', modeled: 'The servers themselves' },
  { id: 'key-value-store', title: 'Design a key-value store', group: 'vol1', book: 'Vol. 1, ch. 6', tagline: 'Tune N, R and W, kill replicas, and catch stale reads.', real: 'Quorum reads, writes and versioning', modeled: 'Network delay and node failures' },
  { id: 'unique-id', title: 'Design a unique ID generator', group: 'vol1', book: 'Vol. 1, ch. 7', tagline: 'Build 64-bit IDs and find when the sequence bits run out.', real: 'Bit-level Snowflake ID generation', modeled: 'Machines and clock drift' },
  { id: 'url-shortener', title: 'Design a URL shortener', group: 'vol1', book: 'Vol. 1, ch. 8', tagline: 'Shorten real URLs, then test collisions and cache size.', real: 'Base62, hashing and the LRU cache', modeled: 'The database and traffic' },
  { id: 'web-crawler', title: 'Design a web crawler', group: 'vol1', book: 'Vol. 1, ch. 9', tagline: 'Crawl a synthetic web with politeness, dedup and traps.', real: 'Frontier, politeness queues and Bloom filter', modeled: 'The web and fetch latency' },
  { id: 'notification', title: 'Design a notification system', group: 'vol1', book: 'Vol. 1, ch. 10', tagline: 'Retries, provider outages, and the duplicate you never intended.', real: 'Queues, retry and dedup logic', modeled: 'Third-party push providers' },
  { id: 'news-feed', title: 'Design a news feed', group: 'vol1', book: 'Vol. 1, ch. 11', tagline: 'Fan-out on write against fan-out on read, then add a celebrity.', real: 'Feed caches and all three fan-out strategies', modeled: 'Users and their activity' },
  { id: 'chat', title: 'Design a chat system', group: 'vol1', book: 'Vol. 1, ch. 12', tagline: 'Presence, message ordering, and a server dying mid-conversation.', real: 'Sequence IDs, sync cursors and heartbeats', modeled: 'Connections and network flaps' },
  { id: 'autocomplete', title: 'Design search autocomplete', group: 'vol1', book: 'Vol. 1, ch. 13', tagline: 'Type into a real trie and count every node it visits.', real: 'A trie with cached top results', modeled: 'Query volume' },
  { id: 'youtube', title: 'Design YouTube', group: 'vol1', book: 'Vol. 1, ch. 14', tagline: 'Adaptive bitrate, CDN cost, and what really causes buffering.', real: 'The bitrate algorithm and CDN cache', modeled: 'Network bandwidth and viewers' },
  { id: 'google-drive', title: 'Design Google Drive', group: 'vol1', book: 'Vol. 1, ch. 15', tagline: 'Sync a file by blocks and see what actually uploads.', real: 'Block splitting, hashing and dedup on real bytes', modeled: 'Cloud storage and clients' },

  { id: 'proximity', title: 'Design a proximity service', group: 'vol2', book: 'Vol. 2, ch. 1', tagline: 'Search by geohash and see how many records it skips.', real: 'Geohash encoding and cell search', modeled: 'Businesses on a map' },
  { id: 'nearby-friends', title: 'Design nearby friends', group: 'vol2', book: 'Vol. 2, ch. 2', tagline: 'Location fan-out, and what a shorter update interval costs.', real: 'Pub/sub fan-out and distance filtering', modeled: 'Moving users' },
  { id: 'google-maps', title: 'Design Google Maps', group: 'vol2', book: 'Vol. 2, ch. 3', tagline: 'Race Dijkstra against A* and watch traffic reroute you.', real: 'Dijkstra and A* on a road graph', modeled: 'The road network and traffic' },
  { id: 'message-queue', title: 'Design a distributed message queue', group: 'vol2', book: 'Vol. 2, ch. 4', tagline: 'Partitions, consumer lag, and which ack mode loses messages.', real: 'Partitions, offsets and replication logic', modeled: 'Brokers and failures' },
  { id: 'metrics-monitoring', title: 'Design metrics monitoring', group: 'vol2', book: 'Vol. 2, ch. 5', tagline: 'Alert rules that page too much, too late, or just right.', real: 'Alert evaluation and downsampling', modeled: 'The metric stream' },
  { id: 'ad-click', title: 'Design ad click aggregation', group: 'vol2', book: 'Vol. 2, ch. 6', tagline: 'Watermarks: the tradeoff between fresh numbers and correct ones.', real: 'Windowed aggregation with watermarks', modeled: 'Click events and delays' },
  { id: 'hotel', title: 'Design a hotel reservation system', group: 'vol2', book: 'Vol. 2, ch. 7', tagline: 'Run concurrent bookings until someone gets double-booked.', real: 'Pessimistic, optimistic and constraint logic', modeled: 'Database transactions and timing' },
  { id: 'email', title: 'Design a distributed email service', group: 'vol2', book: 'Vol. 2, ch. 8', tagline: 'Search a mailbox with a real inverted index.', real: 'An inverted index over generated mail', modeled: 'The mail servers' },
  { id: 'object-storage', title: 'Design S3-like object storage', group: 'vol2', book: 'Vol. 2, ch. 9', tagline: 'Destroy disks and rebuild real bytes with erasure coding.', real: 'Reed-Solomon encoding on real bytes', modeled: 'Disks and failure rates' },
  { id: 'leaderboard', title: 'Design a gaming leaderboard', group: 'vol2', book: 'Vol. 2, ch. 10', tagline: 'Race a real skip list against a sorted table.', real: 'A skip list, the structure behind sorted sets', modeled: 'Players and score updates' },
  { id: 'payment', title: 'Design a payment system', group: 'vol2', book: 'Vol. 2, ch. 11', tagline: 'Retry a timed-out payment and try not to charge twice.', real: 'Idempotency keys and the ledger', modeled: 'The payment provider' },
  { id: 'wallet', title: 'Design a digital wallet', group: 'vol2', book: 'Vol. 2, ch. 12', tagline: 'Crash mid-transfer and see whether money disappears.', real: 'Two-phase commit, saga and event replay', modeled: 'Shards and crashes' },
  { id: 'stock-exchange', title: 'Design a stock exchange', group: 'vol2', book: 'Vol. 2, ch. 13', tagline: 'Place orders into a real matching engine.', real: 'A price-time priority order book', modeled: 'Other traders' },

  { id: 'ride-sharing', title: 'Design a ride-sharing service', group: 'more', book: 'Beyond the book', tagline: 'Match riders with drivers, and see why waiting a few seconds helps.', real: 'A geo grid index, and greedy and batched matching', modeled: 'The city, drivers and riders' },
  { id: 'ticketing', title: 'Design a ticketing system', group: 'more', book: 'Beyond the book', tagline: 'Survive a million fans hitting "buy" at the same moment.', real: 'Seat holds, expiry and a waiting room', modeled: 'Fans and the database' },
  { id: 'job-scheduler', title: 'Design a job scheduler', group: 'more', book: 'Beyond the book', tagline: 'Crash workers mid-job, and see whether anything is lost or runs twice.', real: 'Leases, heartbeats and retries', modeled: 'Workers and job durations' },
  { id: 'collab-editor', title: 'Design a collaborative editor', group: 'more', book: 'Beyond the book', tagline: 'Edit the same document offline, and merge without losing a letter.', real: 'A sequence CRDT, on real text', modeled: 'Network delay between editors' },
];

export function entryFor(id: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.id === id);
}

export function neighbors(id: string): { prev?: CatalogEntry; next?: CatalogEntry } {
  const i = CATALOG.findIndex((e) => e.id === id);
  return { prev: CATALOG[i - 1], next: CATALOG[i + 1] };
}
