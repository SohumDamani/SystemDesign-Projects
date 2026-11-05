// Plain definitions for the words that scare people off system design.
export interface Term {
  id: string;
  term: string;
  /** Exact words in lesson text that should link here. */
  match: string[];
  definition: string;
  /** Where to see it in action. */
  lesson?: string;
}

export const GLOSSARY: Term[] = [
  { id: 'qps', term: 'QPS', match: ['QPS'], definition: 'Queries per second. How many requests a system handles each second. It\'s the most common way to describe load.', lesson: 'estimation' },
  { id: 'latency', term: 'Latency', match: ['latency', 'Latency'], definition: 'How long one request takes, from asking to getting an answer. Usually measured in milliseconds.', lesson: 'queueing' },
  { id: 'throughput', term: 'Throughput', match: ['throughput', 'Throughput'], definition: 'How much work gets done per second. A highway\'s throughput is cars per hour, while latency is how long your own trip takes.', lesson: 'queueing' },
  { id: 'bottleneck', term: 'Bottleneck', match: ['bottleneck', 'Bottleneck'], definition: 'The slowest part of a system, which limits everything else. Speeding up anything other than the bottleneck doesn\'t help.', lesson: 'scale' },
  { id: 'percentile', term: 'Percentile (p99)', match: ['p99', 'percentiles', 'tail latency'], definition: 'p99 latency means 99% of requests are faster than this number. It shows what your unluckiest users experience, which an average hides.', lesson: 'queueing' },
  { id: 'load-balancer', term: 'Load balancer', match: ['load balancer', 'Load balancer'], definition: 'A component that sits in front of many servers, and hands each request to one of them.', lesson: 'load-balancer' },
  { id: 'stateless', term: 'Stateless', match: ['stateless', 'Stateless'], definition: 'A server is stateless if it keeps nothing about a user between requests. Any server can then handle any request, so you can add or remove servers freely.', lesson: 'scale' },
  { id: 'cache', term: 'Cache', match: ['cache', 'caches', 'Cache'], definition: 'A small, fast store holding copies of frequently used data, so you don\'t need to fetch it from somewhere slow.', lesson: 'cache' },
  { id: 'hit-rate', term: 'Hit rate', match: ['hit rate', 'Hit rate'], definition: 'The share of requests a cache can answer without going to the database.', lesson: 'cache' },
  { id: 'cdn', term: 'CDN', match: ['CDN'], definition: 'Content delivery network. Servers around the world that keep copies of files such as images and video, close to users.', lesson: 'youtube' },
  { id: 'ttl', term: 'TTL', match: ['TTL'], definition: 'Time to live. How long a piece of data stays valid before it\'s removed or refreshed.', lesson: 'cache' },
  { id: 'lru', term: 'LRU', match: ['LRU'], definition: 'Least recently used. A cache rule that, when full, throws out whatever hasn\'t been used for the longest time.', lesson: 'cache' },
  { id: 'replication', term: 'Replication', match: ['replication', 'Replication', 'replicated', 'replicate'], definition: 'Keeping copies of the same data on several machines, so you can survive a failure and serve more reads.', lesson: 'replication' },
  { id: 'replica', term: 'Replica', match: ['replica', 'replicas', 'Replicas'], definition: 'A machine holding a copy of the data.', lesson: 'replication' },
  { id: 'primary', term: 'Leader (primary)', match: ['primary', 'leader'], definition: 'The one copy that accepts writes. Other copies, called followers, follow what it does.', lesson: 'replication' },
  { id: 'shard', term: 'Sharding', match: ['sharding', 'Sharding', 'shard', 'shards', 'sharded'], definition: 'Splitting data across several databases, so that each holds only part of it. It\'s how you scale writes and storage.', lesson: 'sharding' },
  { id: 'partition', term: 'Partition', match: ['partition', 'partitions', 'Partitions', 'partitioned'], definition: 'One slice of a larger dataset or topic. "Network partition" is different: it means machines can\'t reach each other.', lesson: 'message-queue' },
  { id: 'hot-key', term: 'Hot key', match: ['hot key', 'Hot key', 'hot keys', 'hot spots'], definition: 'One piece of data that gets far more traffic than the rest, like a celebrity\'s profile. It can overload whichever machine holds it.', lesson: 'sharding' },
  { id: 'consistency', term: 'Consistency', match: ['consistency', 'Consistency', 'consistent'], definition: 'Whether every reader sees the latest write. Strong consistency means always. Eventual consistency means copies catch up after a while.', lesson: 'key-value-store' },
  { id: 'availability', term: 'Availability', match: ['availability', 'Availability'], definition: 'The share of time a system is working and answering requests, often given in nines, like 99.9%.', lesson: 'estimation' },
  { id: 'durability', term: 'Durability', match: ['durability', 'Durability', 'durable'], definition: 'The promise that data, once saved, won\'t be lost.', lesson: 'object-storage' },
  { id: 'cap', term: 'CAP theorem', match: ['CAP'], definition: 'When the network splits, a system must choose between staying consistent, by refusing some requests, and staying available, by risking conflicting data.', lesson: 'key-value-store' },
  { id: 'quorum', term: 'Quorum', match: ['quorum', 'Quorum'], definition: 'A minimum number of copies that must respond before an operation counts. It\'s usually a majority.', lesson: 'key-value-store' },
  { id: 'consensus', term: 'Consensus', match: ['consensus', 'Consensus'], definition: 'A way for a group of machines to agree on a value or an order of events, even when some fail. Raft and Paxos are well-known algorithms.', lesson: 'consensus' },
  { id: 'idempotent', term: 'Idempotent', match: ['idempotent', 'idempotency', 'Idempotency', 'Idempotent'], definition: 'Doing it twice has the same effect as doing it once. It\'s what makes retries safe.', lesson: 'payment' },
  { id: 'atomic', term: 'Atomic', match: ['atomic', 'atomically', 'Atomic', 'atomicity'], definition: 'All of it happens, or none of it does, with nothing in between visible to anyone else.', lesson: 'hotel' },
  { id: 'race', term: 'Race condition', match: ['race condition', 'races', 'race'], definition: 'A bug where the result depends on the timing of two things happening at once.', lesson: 'hotel' },
  { id: 'queue', term: 'Message queue', match: ['message queue', 'Message queue', 'Queues', 'queues'], definition: 'A holding area between services. One side adds work, and the other takes it at its own pace, so a spike waits rather than breaks things.', lesson: 'message-queue' },
  { id: 'fan-out', term: 'Fan-out', match: ['fan-out', 'Fan-out', 'fan out'], definition: 'One event turning into many pieces of work, like one post being copied into a million feeds.', lesson: 'news-feed' },
  { id: 'backoff', term: 'Exponential backoff', match: ['backoff', 'Backoff'], definition: 'Waiting longer after each failed attempt: 1 second, then 2, then 4. It gives a struggling system time to recover.', lesson: 'resilience' },
  { id: 'jitter', term: 'Jitter', match: ['jitter', 'Jitter'], definition: 'A bit of randomness added to timers, so that lots of clients don\'t all retry at the same instant.', lesson: 'resilience' },
  { id: 'circuit-breaker', term: 'Circuit breaker', match: ['circuit breaker', 'Circuit breaker', 'circuit breakers'], definition: 'Stops calling a service that keeps failing, for a while, like a fuse in your house. This gives it a chance to recover.', lesson: 'resilience' },
  { id: 'hash', term: 'Hash', match: ['hash', 'hashes', 'hashing', 'Hash', 'Hashing'], definition: 'A function that turns any input into a fixed-size number, the same every time. Similar inputs give very different outputs.', lesson: 'consistent-hashing' },
  { id: 'bloom', term: 'Bloom filter', match: ['Bloom filter', 'Bloom filters', 'bloom filter'], definition: 'A tiny data structure that says "definitely not seen" or "probably seen".', lesson: 'bloom-filter' },
  { id: 'trie', term: 'Trie', match: ['trie', 'Trie'], definition: 'A tree where each step down is one letter, so all words with the same prefix share a path.', lesson: 'autocomplete' },
  { id: 'geohash', term: 'Geohash', match: ['geohash', 'Geohash'], definition: 'A short string encoding a location. Nearby places usually share a prefix, so ordinary indexes can search by area.', lesson: 'proximity' },
  { id: 'websocket', term: 'WebSocket', match: ['WebSocket', 'WebSockets'], definition: 'A connection that stays open, so the server can send data to the client at any moment.', lesson: 'chat' },
  { id: 'heartbeat', term: 'Heartbeat', match: ['heartbeat', 'heartbeats', 'Heartbeat', 'Heartbeats'], definition: 'A small regular "I\'m alive" message. If they stop arriving, something is probably wrong.', lesson: 'chat' },
  { id: 'lsm', term: 'LSM tree', match: ['LSM'], definition: 'A storage structure that writes to memory and appends sorted files, merging them later. Very fast for writes.', lesson: 'storage-engines' },
  { id: 'erasure', term: 'Erasure coding', match: ['erasure coding', 'Erasure coding', 'Erasure'], definition: 'Splitting data into pieces with extra math-based parity pieces, so that any large enough subset can rebuild the original.', lesson: 'object-storage' },
  { id: 'watermark', term: 'Watermark', match: ['watermark', 'watermarks', 'Watermarks'], definition: 'In stream processing, a guess that says: "I\'ve probably seen everything up to this time."', lesson: 'ad-click' },
  { id: 'saga', term: 'Saga', match: ['saga', 'sagas', 'Saga'], definition: 'A series of steps, each with an undo action, used instead of one big transaction across services.', lesson: 'wallet' },
  { id: 'two-phase', term: 'Two-phase commit', match: ['two-phase commit', 'Two-phase commit', '2PC'], definition: 'A coordinator asks everyone to prepare, then tells them all to commit. It\'s atomic across machines, but blocks if the coordinator fails.', lesson: 'wallet' },
  { id: 'event-sourcing', term: 'Event sourcing', match: ['event sourcing', 'Event sourcing'], definition: 'Storing every change instead of the current state. You can rebuild any past state by replaying the changes.', lesson: 'wallet' },
  { id: 'gossip', term: 'Gossip', match: ['gossip', 'Gossip'], definition: 'Machines share information by telling a few random others, who tell a few more. It spreads fast, with no central coordinator.', lesson: 'gossip' },
  { id: 'crdt', term: 'CRDT', match: ['CRDT', 'CRDTs'], definition: 'A data type that can be edited independently in many places and still merge automatically to the same result.', lesson: 'collab-editor' },
  { id: 'lease', term: 'Lease', match: ['lease', 'leases', 'Lease', 'Leases'], definition: 'A lock with an expiry time. If the holder dies, the lease runs out, and someone else can take over.', lesson: 'job-scheduler' },
  { id: 'single-point', term: 'Single point of failure', match: ['single point of failure', 'single points of failure'], definition: 'One part whose failure brings down the whole system.', lesson: 'scale' },
  { id: 'horizontal', term: 'Horizontal scaling', match: ['horizontal scaling', 'Horizontal scaling'], definition: 'Adding more machines. Vertical scaling, by contrast, means making one machine bigger.', lesson: 'scale' },
  { id: 'dead-letter', term: 'Dead letter queue', match: ['dead letter queue', 'dead letters', 'Dead letters'], definition: 'A place for messages that keep failing, so that a person can look at them later.', lesson: 'notification' },
];

const SORTED_MATCHES = GLOSSARY.flatMap((t) => t.match.map((m) => ({ word: m, term: t }))).sort((a, b) => b.word.length - a.word.length);

export const TERM_PATTERN = new RegExp(`\\b(${SORTED_MATCHES.map((m) => m.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g');

export const termForWord = (word: string): Term | undefined => SORTED_MATCHES.find((m) => m.word === word)?.term;
