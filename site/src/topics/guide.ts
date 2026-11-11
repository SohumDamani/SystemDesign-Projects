// Help for people at different levels: a plain-English way in, and what to read first.
export type Level = 'beginner' | 'intermediate' | 'advanced';

export interface GuideEntry {
  level: Level;
  /** An everyday comparison, for someone who has never heard of this. */
  plain: string;
  /** The one sentence to keep if you forget everything else. */
  remember: string;
  /** Lessons that make this one easier. */
  before: string[];
}

export const LEVEL_LABEL: Record<Level, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const GUIDE: Record<string, GuideEntry> = {
  scale: {
    level: 'beginner',
    plain: 'Think of a food stall that gets popular. First you hire more cooks, then you add a second counter, then you prepare popular dishes in advance. Each fix helps until the next thing becomes the problem.',
    remember: 'Scaling is a series of small fixes, and each fix moves the bottleneck somewhere else.',
    before: [],
  },
  estimation: {
    level: 'beginner',
    plain: 'It\'s like working out how much food a wedding needs. You don\'t need the exact guest list, just a sensible guess of people times portions, so you know whether to book a caterer or cook at home.',
    remember: 'Multiply users by actions, divide by 100,000 seconds a day, and you\'re most of the way there.',
    before: [],
  },
  framework: {
    level: 'beginner',
    plain: 'If someone asked you to plan a house, you\'d ask how big the family is before you drew any walls. A design interview works the same way: questions first, rough sketch next, details last.',
    remember: 'Understand, sketch, go deep, then wrap up, and talk through all of it out loud.',
    before: [],
  },
  'load-balancer': {
    level: 'beginner',
    plain: 'Picture the person at a supermarket who directs you to the next open checkout. A smart one sends you to the shortest line, not just the next one along.',
    remember: 'Average utilization can look fine while one server melts. Always check each server.',
    before: ['scale'],
  },
  cache: {
    level: 'beginner',
    plain: 'You keep your most-used pans on the stove rather than in the basement. A cache keeps popular data close, so you rarely make the slow trip.',
    remember: 'Caches work because a few items get most of the requests.',
    before: ['scale'],
  },
  queueing: {
    level: 'beginner',
    plain: 'A coffee shop with one barista feels fine when half busy, and awful when nearly full. Lines don\'t grow gradually: past a certain point they explode.',
    remember: 'Latency rises slowly with load, and then suddenly. Never plan to run near 100%.',
    before: ['scale'],
  },
  'bloom-filter': {
    level: 'beginner',
    plain: 'Imagine a bouncer with a very short memory aid. If it says you\'re not on the list, you definitely aren\'t. If it says you are, you probably are, so it\'s worth checking properly.',
    remember: '"No" is always right, "yes" is only probably right, and it uses almost no memory.',
    before: [],
  },
  sharding: {
    level: 'intermediate',
    plain: 'A library too big for one room gets split up: A to M upstairs, N to Z downstairs. It works well until everyone wants books from the same shelf.',
    remember: 'The shard key decides everything. Choosing it badly creates hot spots that more hardware can\'t fix.',
    before: ['scale', 'consistent-hashing'],
  },
  replication: {
    level: 'intermediate',
    plain: 'A teacher writes on the main board, and students copy it into their notebooks. Reading a notebook is easy, but it might be a few seconds behind the board.',
    remember: 'Copies help you read more and survive failures, but they can be out of date.',
    before: ['scale'],
  },
  consensus: {
    level: 'advanced',
    plain: 'A group of friends picking a restaurant over a bad phone connection. If most of them agree and write it down, the decision sticks, even if someone drops off the call.',
    remember: 'A majority must agree, so two groups can never both commit, even if an old leader still thinks it\'s in charge.',
    before: ['replication'],
  },
  'storage-engines': {
    level: 'advanced',
    plain: 'You can keep a perfectly sorted filing cabinet, which is slow to update, or toss new papers in a pile and tidy up later, which is quick to write but slower to search.',
    remember: 'Every storage engine trades off write speed, read speed and wasted space.',
    before: ['bloom-filter'],
  },
  resilience: {
    level: 'intermediate',
    plain: 'If a phone line is jammed and everyone keeps redialing, the jam never clears. Sometimes the kindest thing is to wait, or to stop calling for a while.',
    remember: 'Retries can turn a short blip into an outage that won\'t end. Back off, and add a circuit breaker.',
    before: ['queueing'],
  },
  gossip: {
    level: 'advanced',
    plain: 'Office gossip reaches everyone quickly, even though no one announces it. Each person just tells a few others, and the news spreads on its own.',
    remember: 'Telling a few random peers reaches everyone in about log N rounds.',
    before: ['key-value-store'],
  },
  'rate-limiter': {
    level: 'beginner',
    plain: 'A nightclub with a door policy of 20 people every 10 minutes. The bouncer needs to count fairly, and quickly, across several doors at once.',
    remember: 'Fixed windows let double the limit through at the edge. Sliding approaches fix that cheaply.',
    before: ['cache'],
  },
  'consistent-hashing': {
    level: 'intermediate',
    plain: 'Picture seats around a round table, where each guest gets the next waiter clockwise. If a waiter leaves, only their guests need someone new, and everyone else stays put.',
    remember: 'Adding a server moves about 1/N of the keys, not nearly all of them.',
    before: ['cache'],
  },
  'key-value-store': {
    level: 'advanced',
    plain: 'A giant dictionary too big for one book, so each page is copied into several books. When copies disagree, you need rules for which one to believe.',
    remember: 'If R + W > N, every read overlaps the latest write. Everything else is a tradeoff against speed.',
    before: ['consistent-hashing', 'replication'],
  },
  'unique-id': {
    level: 'intermediate',
    plain: 'Numbering tickets across many counters without talking to each other: each number includes the time, the counter number, and a running count, so two can never clash.',
    remember: 'A 64-bit ID is a budget you divide between time, machines and throughput.',
    before: [],
  },
  'url-shortener': {
    level: 'beginner',
    plain: 'Like a coat check: you hand in something long, get a short ticket, and swap the ticket back later. Almost all the work is at the swapping-back end.',
    remember: 'Reads vastly outnumber writes, so this is really a caching problem.',
    before: ['cache', 'estimation'],
  },
  'web-crawler': {
    level: 'intermediate',
    plain: 'Exploring a city by following every signpost, while keeping notes on where you\'ve been, not knocking on any one door too often, and avoiding streets that loop forever.',
    remember: 'Politeness, not hardware, usually sets your speed.',
    before: ['bloom-filter', 'url-shortener'],
  },
  notification: {
    level: 'intermediate',
    plain: 'A post office that uses several delivery companies. If one company goes on strike, its parcels should wait, without holding up the others.',
    remember: 'A timeout doesn\'t mean failure, so retry with a key that makes repeats harmless.',
    before: ['resilience'],
  },
  'news-feed': {
    level: 'intermediate',
    plain: 'You can deliver a newspaper to every subscriber when it\'s printed, or have people collect it when they want it. Neither works when one writer has 100 million readers.',
    remember: 'Precompute for most users, and special-case the celebrities.',
    before: ['cache', 'sharding'],
  },
  chat: {
    level: 'intermediate',
    plain: 'A switchboard holding an open line to everyone, numbering each message, so that anyone who was away can ask for everything after the last number they saw.',
    remember: 'The server picks the order, and devices sync from the last number they received.',
    before: ['replication'],
  },
  autocomplete: {
    level: 'intermediate',
    plain: 'Imagine a dictionary with a sticky note on every page listing the most popular words below it. Instead of searching, you flip to the page and read the note.',
    remember: 'Do the slow work ahead of time, so every keystroke is only a lookup.',
    before: ['cache'],
  },
  youtube: {
    level: 'intermediate',
    plain: 'A restaurant preparing each dish in several sizes, then sending out whichever one your table has room for, right now, based on how fast food is arriving.',
    remember: 'Bandwidth is the bill, and adaptive bitrate is what stops the spinner.',
    before: ['cache'],
  },
  'google-drive': {
    level: 'intermediate',
    plain: 'Instead of re-sending a whole book when you fix a typo, you send only the changed page, and everyone already knows which pages they have by their fingerprint.',
    remember: 'Name each block by its hash, and only upload what\'s new.',
    before: ['replication'],
  },
  proximity: {
    level: 'intermediate',
    plain: 'To find coffee nearby, you don\'t check every shop in the world. You check your neighborhood and the ones touching it.',
    remember: 'A geohash turns two dimensions into one, and you must always search the neighboring cells too.',
    before: ['sharding'],
  },
  'nearby-friends': {
    level: 'intermediate',
    plain: 'Everyone in a group keeps shouting out where they are, every 30 seconds, and only friends close enough care. Almost all the shouting gets ignored.',
    remember: 'The update interval is the dial that controls nearly every cost.',
    before: ['proximity', 'chat'],
  },
  'google-maps': {
    level: 'advanced',
    plain: 'Planning a road trip: you don\'t compare every street in the country. You head for the highway, and only look closely at the start and the end.',
    remember: 'Roads are a graph, and traffic just changes the numbers on its edges.',
    before: ['proximity'],
  },
  'message-queue': {
    level: 'intermediate',
    plain: 'A set of conveyor belts. Workers take items at their own pace from their own belt, and everything stays on the belt for a while, so a dropped item can be picked up again.',
    remember: 'Partitions cap your parallelism, and order only holds inside one partition.',
    before: ['replication', 'queueing'],
  },
  'metrics-monitoring': {
    level: 'intermediate',
    plain: 'A car dashboard for thousands of cars at once. The difficult part is a warning light that comes on for real problems, and not every time you hit a bump.',
    remember: 'Alert on sustained, user-visible symptoms, or people will stop listening.',
    before: ['message-queue'],
  },
  'ad-click': {
    level: 'advanced',
    plain: 'Counting votes when some envelopes arrive late. You have to decide how long to wait before announcing a result, knowing that any choice will miss a few.',
    remember: 'Waiting longer gives correct numbers. Waiting less gives fresh ones. Pick deliberately.',
    before: ['message-queue'],
  },
  hotel: {
    level: 'intermediate',
    plain: 'Two receptionists both see one room free, and both give it away. Checking and booking have to happen as one step, or someone arrives to no bed.',
    remember: 'Checking first doesn\'t prevent a race. Make the check and the write one atomic step.',
    before: ['replication'],
  },
  email: {
    level: 'intermediate',
    plain: 'The index at the back of a book. Instead of re-reading every page to find a word, you look it up, and go straight to the pages that mention it.',
    remember: 'Partition by user, since nearly every query is about one person\'s mail.',
    before: ['sharding'],
  },
  'object-storage': {
    level: 'advanced',
    plain: 'Like a clever puzzle where any 8 of 12 pieces can rebuild the whole picture. You can lose several pieces, and use far less space than keeping three full copies.',
    remember: 'Erasure coding gives better durability than replication, for much less disk.',
    before: ['replication'],
  },
  leaderboard: {
    level: 'intermediate',
    plain: 'Imagine a ladder with express lifts every few rungs. To find your rung, you ride the lifts and count as you go, rather than walking past everyone.',
    remember: 'Sorted sets make updates and exact rank take log n steps, which a table can\'t do.',
    before: ['cache'],
  },
  payment: {
    level: 'advanced',
    plain: 'You send money and the app freezes. Did it go through? If you press pay again, you may pay twice. Payment systems are built around exactly that moment.',
    remember: 'A timeout means "I don\'t know", so every retry needs an idempotency key.',
    before: ['resilience'],
  },
  wallet: {
    level: 'advanced',
    plain: 'Moving money between two banks: if one has taken it and the other hasn\'t received it when the power goes out, where did the money go?',
    remember: 'The total must never change, so you need a protocol, not two separate writes.',
    before: ['payment', 'sharding'],
  },
  'stock-exchange': {
    level: 'advanced',
    plain: 'An auction run by a very fair, very fast clerk, who serves whoever offers the best price, and whoever came first among those at the same price.',
    remember: 'Keep the core single-threaded, and make it deterministic, so a log can rebuild everything.',
    before: ['message-queue', 'consensus'],
  },
  'ride-sharing': {
    level: 'intermediate',
    plain: 'A dispatcher with a live map of taxis. Sending the closest taxi to each caller seems obvious, but waiting a few seconds to see all callers can suit everyone better.',
    remember: 'Keep driver locations in a fast geo index, and match in small batches.',
    before: ['proximity'],
  },
  pagination: {
    level: 'beginner',
    plain: 'Reading a long book by page number works until someone slips new pages in at the front. Then every page number moves, and you read the same lines twice. A bookmark that holds your place in the text doesn\'t have that problem.',
    remember: 'Page numbers are positions and shift when data changes. A cursor names a row and doesn\'t.',
    before: ['url-shortener'],
  },
  ticketing: {
    level: 'intermediate',
    plain: 'A concert goes on sale and a million people rush the door. A line outside lets the shop serve people in order, and a held seat is only held for a few minutes.',
    remember: 'A waiting room protects your database, and hold times decide how many seats go unsold.',
    before: ['hotel', 'rate-limiter'],
  },
  'job-scheduler': {
    level: 'intermediate',
    plain: 'A job board where workers take a card and promise to finish within 10 minutes. If they don\'t come back, the card goes back on the board for someone else.',
    remember: 'Leases mean jobs survive crashes, but they can run twice, so jobs must be idempotent.',
    before: ['message-queue'],
  },
  'collab-editor': {
    level: 'advanced',
    plain: 'Two people editing separate copies of a document on a train. When they reconnect, both copies must end up the same, with nobody\'s typing lost.',
    remember: 'Give every character its own permanent ID, and merges work out on their own.',
    before: ['google-drive'],
  },
};

export interface Track {
  id: string;
  title: string;
  who: string;
  description: string;
  lessons: string[];
}

export const TRACKS: Track[] = [
  {
    id: 'beginner',
    title: 'New to system design',
    who: 'You can code, but "shard" and "QPS" are new words',
    description: 'Start from one server, and build up the vocabulary one lab at a time. No prior distributed systems knowledge needed, though the last few lessons are a step up.',
    lessons: ['scale', 'load-balancer', 'cache', 'estimation', 'framework', 'queueing', 'url-shortener', 'rate-limiter', 'bloom-filter', 'replication', 'consistent-hashing', 'sharding'],
  },
  {
    id: 'interview',
    title: 'Interview in two weeks',
    who: 'You know the basics, and need the classic questions',
    description: 'The structure, the math, and the questions asked most often. Do one or two a day, and predict each experiment before you run it.',
    lessons: ['framework', 'estimation', 'url-shortener', 'pagination', 'rate-limiter', 'consistent-hashing', 'key-value-store', 'unique-id', 'news-feed', 'chat', 'notification', 'youtube', 'google-drive', 'proximity', 'ticketing', 'ride-sharing'],
  },
  {
    id: 'experienced',
    title: 'Already experienced',
    who: 'You build these systems, and want to test your intuition',
    description: 'Skip the basics. Go straight to failure modes, tradeoffs under load, and reading the real code. Try to predict every result correctly.',
    lessons: ['consensus', 'storage-engines', 'resilience', 'message-queue', 'payment', 'wallet', 'stock-exchange', 'object-storage', 'ad-click', 'collab-editor', 'gossip', 'google-maps'],
  },
];
