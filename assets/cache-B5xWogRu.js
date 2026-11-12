import{a as e,c as t,f as n,o as r,p as i}from"./index-n79SFkCo.js";var a=`// Three real eviction policies behind one interface, plus a read path that can stampede.
export interface Cache {
  get(key: number, now: number): boolean;
  put(key: number, now: number): void;
  remove(key: number): void;
  readonly size: number;
}

interface Entry {
  expiresAt: number;
}

/** A JS Map keeps insertion order, so the first key is always the oldest. */
class OrderedCache implements Cache {
  protected map = new Map<number, Entry>();
  constructor(protected capacity: number, protected ttl: number, private touchOnRead: boolean) {}

  get size() {
    return this.map.size;
  }

  get(key: number, now: number): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= now) {
      this.map.delete(key);
      return false;
    }
    if (this.touchOnRead) {
      this.map.delete(key);
      this.map.set(key, entry);
    }
    return true;
  }

  put(key: number, now: number) {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.capacity) this.map.delete(this.map.keys().next().value!);
    this.map.set(key, { expiresAt: this.ttl > 0 ? now + this.ttl : Infinity });
  }

  remove(key: number) {
    this.map.delete(key);
  }
}

/** Evicts whatever was used longest ago. Each read moves the key to the back. */
export class LruCache extends OrderedCache {
  constructor(capacity: number, ttl: number) {
    super(capacity, ttl, true);
  }
}

/** Evicts whatever was inserted first, no matter how often it's read. */
export class FifoCache extends OrderedCache {
  constructor(capacity: number, ttl: number) {
    super(capacity, ttl, false);
  }
}

/** Evicts the least frequently used key. Buckets by frequency keep every operation O(1). */
export class LfuCache implements Cache {
  private entries = new Map<number, { freq: number; expiresAt: number }>();
  private buckets = new Map<number, Set<number>>();
  private minFreq = 1;
  constructor(private capacity: number, private ttl: number) {}

  get size() {
    return this.entries.size;
  }

  private bump(key: number, entry: { freq: number }) {
    const bucket = this.buckets.get(entry.freq)!;
    bucket.delete(key);
    if (!bucket.size) {
      this.buckets.delete(entry.freq);
      if (this.minFreq === entry.freq) this.minFreq++;
    }
    entry.freq++;
    if (!this.buckets.has(entry.freq)) this.buckets.set(entry.freq, new Set());
    this.buckets.get(entry.freq)!.add(key);
  }

  get(key: number, now: number): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= now) {
      this.remove(key);
      return false;
    }
    this.bump(key, entry);
    return true;
  }

  put(key: number, now: number) {
    const expiresAt = this.ttl > 0 ? now + this.ttl : Infinity;
    const existing = this.entries.get(key);
    if (existing) {
      existing.expiresAt = expiresAt;
      this.bump(key, existing);
      return;
    }
    if (this.entries.size >= this.capacity) {
      while (!this.buckets.get(this.minFreq)?.size) this.minFreq++;
      const victim = this.buckets.get(this.minFreq)!.values().next().value!;
      this.remove(victim);
    }
    this.entries.set(key, { freq: 1, expiresAt });
    if (!this.buckets.has(1)) this.buckets.set(1, new Set());
    this.buckets.get(1)!.add(key);
    this.minFreq = 1;
  }

  remove(key: number) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.buckets.get(entry.freq)?.delete(key);
    this.entries.delete(key);
  }
}

export interface ReadStats {
  hits: number;
  dbReads: number;
  coalesced: number;
  hotDbReads: number;
}

export const HOT_KEY = 0;

/**
 * The cache-aside read path. On a miss the value is fetched from the database and cached
 * when it returns. Without request coalescing, everyone who misses while that fetch is
 * running also goes to the database. That's a cache stampede.
 */
export function read(cache: Cache, key: number, now: number, fillSeconds: number, coalesce: boolean, inFlight: Map<number, number>, stats: ReadStats) {
  if (cache.get(key, now)) {
    stats.hits++;
    return;
  }
  if (coalesce && inFlight.has(key)) {
    stats.coalesced++;
    return;
  }
  stats.dbReads++;
  if (key === HOT_KEY) stats.hotDbReads++;
  if (!inFlight.has(key)) inFlight.set(key, now + fillSeconds);
}

/** Puts finished database fetches into the cache. */
export function finishFills(cache: Cache, now: number, inFlight: Map<number, number>) {
  for (const [key, readyAt] of inFlight) {
    if (readyAt <= now) {
      cache.put(key, now);
      inFlight.delete(key);
    }
  }
}
`,o=class{capacity;ttl;touchOnRead;map=new Map;constructor(e,t,n){this.capacity=e,this.ttl=t,this.touchOnRead=n}get size(){return this.map.size}get(e,t){let n=this.map.get(e);return n?n.expiresAt<=t?(this.map.delete(e),!1):(this.touchOnRead&&(this.map.delete(e),this.map.set(e,n)),!0):!1}put(e,t){this.map.has(e)?this.map.delete(e):this.map.size>=this.capacity&&this.map.delete(this.map.keys().next().value),this.map.set(e,{expiresAt:this.ttl>0?t+this.ttl:1/0})}remove(e){this.map.delete(e)}},s=class extends o{constructor(e,t){super(e,t,!0)}},c=class extends o{constructor(e,t){super(e,t,!1)}},l=class{capacity;ttl;entries=new Map;buckets=new Map;minFreq=1;constructor(e,t){this.capacity=e,this.ttl=t}get size(){return this.entries.size}bump(e,t){let n=this.buckets.get(t.freq);n.delete(e),n.size||(this.buckets.delete(t.freq),this.minFreq===t.freq&&this.minFreq++),t.freq++,this.buckets.has(t.freq)||this.buckets.set(t.freq,new Set),this.buckets.get(t.freq).add(e)}get(e,t){let n=this.entries.get(e);return n?n.expiresAt<=t?(this.remove(e),!1):(this.bump(e,n),!0):!1}put(e,t){let n=this.ttl>0?t+this.ttl:1/0,r=this.entries.get(e);if(r)r.expiresAt=n,this.bump(e,r);else{if(this.entries.size>=this.capacity){for(;!this.buckets.get(this.minFreq)?.size;)this.minFreq++;let e=this.buckets.get(this.minFreq).values().next().value;this.remove(e)}this.entries.set(e,{freq:1,expiresAt:n}),this.buckets.has(1)||this.buckets.set(1,new Set),this.buckets.get(1).add(e),this.minFreq=1}}remove(e){let t=this.entries.get(e);t&&(this.buckets.get(t.freq)?.delete(e),this.entries.delete(e))}};function u(e,t,n,r,i,a,o){e.get(t,n)?o.hits++:i&&a.has(t)?o.coalesced++:(o.dbReads++,t===0&&o.hotDbReads++,a.has(t)||a.set(t,n+r))}function d(e,t,n){for(let[r,i]of n)i<=t&&(e.put(r,t),n.delete(r))}var f=.1,p=5e3,m=.2,h=()=>({hits:0,dbReads:0,coalesced:0,hotDbReads:0});function g(e){return e.policy===`lfu`?new l(e.capacity,e.ttl):e.policy===`fifo`?new c(e.capacity,e.ttl):new s(e.capacity,e.ttl)}var _={problem:[`Databases are slow and memory is fast. A cache keeps recently used data in memory so most reads never reach the database. That cuts latency and, more importantly, protects the database from load it can't handle.`,`A cache is smaller than the data behind it, so it must choose what to throw away, and it can return stale data. The design questions are about those two facts: which eviction policy, and how fresh the data needs to be.`],functional:[`Serve reads from memory when the data is present`,`Evict entries when full, and expire them when stale`,`Fall through to the database on a miss`],nonFunctional:[`Sub-millisecond reads`,`A cache failure slows the system down but doesn't take it down`,`A popular key expiring doesn't overload the database`],diagram:{nodes:[{id:`a`,label:`App server`,col:0,row:0,note:`Checks the cache first. On a miss it reads the database, then fills the cache.`},{id:`c`,label:`Cache`,col:1,row:0,kind:`store`,note:`In-memory store such as Redis or Memcached, smaller than the data behind it.`},{id:`d`,label:`Database`,col:1,row:1,kind:`store`,note:`The source of truth. Slower, and much harder to scale for reads.`}],edges:[{from:`a`,to:`c`},{from:`a`,to:`d`}],scenarios:[{title:`Cache hit`,steps:[{edge:0,caption:`The app asks the cache for the key.`},{edge:0,reverse:!0,caption:`The cache has the value. The app returns it without querying the database.`}]},{title:`Cache miss`,steps:[{edge:0,caption:`The app asks the cache for the key.`},{edge:0,reverse:!0,caption:`The cache reports that the key is missing or expired.`},{edge:1,caption:`The app queries the database for the value.`},{edge:1,reverse:!0,caption:`The database returns the value to the app.`},{edge:0,caption:`The app stores the value in the cache and serves the caller. The next read can be a hit.`}]}]},ideas:[{title:`Cache-aside`,body:`The application reads the cache and fills it after a miss. It's the most common pattern, and only data someone asked for gets cached. The first read of anything is always slow.`},{title:`Write-through and write-back`,body:`Write-through updates cache and database together, keeping them consistent at the cost of slower writes. Write-back updates the cache and flushes later, which is fast but can lose data in a crash.`},{title:`Why skew matters`,body:`Real traffic follows a power law: a few keys get most of the reads. That's why a cache holding a tiny share of keys can absorb most traffic.`},{title:`Stampede`,body:`When a hot key expires, every in-flight request misses at once and hits the database. Coalescing misses, locking the refill, or refreshing early all prevent it.`}],estimator:{vars:[{key:`dau`,label:`Daily active users`,unit:`count`},{key:`reads`,label:`Reads per user per day`,unit:`plain`,assume:40},{key:`keysPerUser`,label:`Keys per user`,unit:`plain`,assume:5},{key:`hotShare`,label:`Hot share of keys (0 to 1)`,unit:`plain`,assume:.2},{key:`valueBytes`,label:`Bytes per value`,unit:`plain`,assume:1e3},{key:`missRate`,label:`Miss rate (0 to 1)`,unit:`plain`,assume:.1},{key:`readQps`,label:`Read load`,unit:`qps`},{key:`dbQps`,label:`Database load`,unit:`qps`},{key:`keys`,label:`Total keys`,unit:`count`},{key:`memory`,label:`Cache memory`,unit:`bytes`}],eqs:[{out:`readQps`,terms:[[`dau`,1],[`reads`,1],[86400,-1]]},{out:`dbQps`,terms:[[`readQps`,1],[`missRate`,1]]},{out:`keys`,terms:[[`dau`,1],[`keysPerUser`,1]]},{out:`memory`,terms:[[`keys`,1],[`hotShare`,1],[`valueBytes`,1]]}],starts:[{key:`dau`,value:1e7},{key:`memory`,value:1e10},{key:`readQps`,value:5e3}]},lab:{secondsPerTick:f,params:[{key:`policy`,label:`Eviction policy`,kind:`choice`,rebuild:!0,options:[{value:`lru`,label:`LRU, least recently used`},{value:`lfu`,label:`LFU, least frequently used`},{value:`fifo`,label:`FIFO, first in first out`}]},{key:`capacity`,label:`Cache size`,kind:`range`,min:50,max:5e3,step:50,unit:`keys`,rebuild:!0},{key:`skew`,label:`Traffic skew (Zipf s)`,kind:`range`,min:0,max:1.5,step:.1,rebuild:!0},{key:`traffic`,label:`Read traffic`,kind:`range`,min:100,max:5e3,step:100,unit:`req/s`},{key:`ttl`,label:`Time to live`,kind:`range`,min:0,max:60,step:1,rebuild:!0,format:e=>e===0?`Never expires`:`${e} s`},{key:`dbCapacity`,label:`Database capacity`,kind:`range`,min:100,max:3e3,step:100,unit:`req/s`},{key:`coalesce`,label:`Coalesce concurrent misses`,kind:`toggle`}],defaults:{policy:`lru`,capacity:500,skew:1,traffic:2e3,ttl:0,coalesce:!1,dbCapacity:1e3},create:e=>({now:0,cache:g(e),zipf:t(p,e.skew),inFlight:new Map,stats:h(),tick:h(),hitRate:0,dbLoad:0,lastHot:0}),step(e,t,n){e.now+=f,e.tick=h();let r=n.poisson(t.traffic*f);for(let i=0;i<r;i++)u(e.cache,e.zipf(n),e.now,m,t.coalesce,e.inFlight,e.tick);d(e.cache,e.now,e.inFlight),e.stats.hits+=e.tick.hits,e.stats.dbReads+=e.tick.dbReads,e.stats.coalesced+=e.tick.coalesced,e.stats.hotDbReads+=e.tick.hotDbReads,e.lastHot+=e.tick.hotDbReads;let i=e.tick.hits+e.tick.dbReads+e.tick.coalesced;e.hitRate=e.hitRate*.97+(i?e.tick.hits/i:0)*.03,e.dbLoad=e.dbLoad*.9+e.tick.dbReads/f*.1},sample:(e,t)=>({hit:e.hitRate*100,bestHit:r(t.capacity,p,t.skew)*100,db:e.dbLoad,dbCap:t.dbCapacity,hotReads:e.lastHot}),charts:[{title:`Hit rate`,unit:`%`,series:[{key:`hit`,label:`Measured`,role:`measured`},{key:`bestHit`,label:`Best possible`,role:`predicted`}]},{title:`Database load`,unit:`req/s`,series:[{key:`db`,label:`Measured`,role:`measured`},{key:`dbCap`,label:`Capacity`,role:`predicted`}]}],metrics(e,t){let a=r(t.capacity,p,t.skew);return[{label:`Best possible hit rate`,value:i(a),role:`predicted`},{label:`Hit rate`,value:i(e.hitRate),role:`measured`},{label:`Database load`,value:`${n(e.dbLoad)} req/s`,role:`measured`,tone:e.dbLoad>t.dbCapacity?`bad`:void 0},{label:`Hot key database reads`,value:n(e.lastHot),role:`measured`}]},math(e,t){let a=r(t.capacity,p,t.skew),o=r(1,p,t.skew),s=t.traffic*o*m;return[{expr:`Cache holds ${n(t.capacity)} of ${n(p)} keys, or ${i(t.capacity/p)}`,result:`up to ${i(a)} of reads`},{expr:`Database load: ${n(t.traffic)} × (1 − ${i(a)})`,result:`${n(t.traffic*(1-a))} req/s`,tone:t.traffic*(1-a)>t.dbCapacity?`bad`:`good`},{expr:`Stampede: hot key gets ${n(t.traffic*o)} req/s × ${m} s refill`,result:t.coalesce?`1 read when coalesced`:`≈ ${n(s)} reads`}]},actions:[{key:`expire-hot`,label:`Expire the hottest key`,run:e=>{e.cache.remove(0),e.lastHot=0}}],trace(e,t){return{values:{hit:n(e.tick.hits),miss:n(e.tick.dbReads),wait:t.coalesce?n(e.tick.coalesced):`off`,size:`${n(e.cache.size)} of ${n(t.capacity)}`},active:e.tick.dbReads?[`miss`]:[`hit`]}},experiments:[{title:`A small cache goes far`,ticks:600,question:`The cache holds only 10% of all keys, and traffic is skewed the way real traffic usually is (Zipf, s = 1). What hit rate should you expect?`,options:[`About 10%, the share of keys it holds`,`About 70%`,`Close to 100%`],answer:1,explain:`Popular keys get most of the reads, so holding the top 10% catches most traffic. The formula gives an upper bound of 75%, LRU reaches roughly 60 to 65%, and LFU gets closer without knowing which keys are popular. This skew is why caches pay off so well.`,check:(t,n,r)=>{let i=e(r,`hit`,100);return i>55&&i<80}},{title:`No skew, no magic`,set:{skew:0},ticks:600,question:`Same cache, but now every key is equally popular. What happens to the hit rate?`,options:[`Stays about the same`,`Falls to about 10%`,`Falls to 0%`],answer:1,explain:`With uniform traffic the hit rate is simply the share of keys the cache holds: 500 of 5,000. Before you size a cache, ask how skewed the traffic is, since that decides whether it's worth having.`,check:(t,n,r)=>e(r,`hit`,100)<15},{title:`The stampede`,act:[`expire-hot`],actAt:100,ticks:115,question:`The hottest key expires while it's receiving about 220 req/s, and refilling it takes 0.2 s. How many reads hit the database for that one key?`,options:[`Exactly 1`,`A few dozen`,`Thousands`],answer:1,explain:`Every request that misses during the refill also goes to the database: about 220 × 0.2 = 44 reads for one value. With a truly hot key on a fragile database, that spike alone can cause an outage.`,check:e=>e.lastHot>=15&&e.lastHot<=90},{title:`Coalesce the misses`,set:{coalesce:!0},act:[`expire-hot`],actAt:100,ticks:115,question:`Same expiry, now with concurrent misses coalesced, so only the first request fetches and others wait for it. How many database reads?`,options:[`Exactly 1`,`About 22`,`About 44`],answer:0,explain:`Only one request reaches the database, and everyone else shares its answer. A lock around the refill does the same job. Adding random jitter to TTLs also helps, by stopping many keys from expiring at once.`,check:e=>e.lastHot<=2}]},pseudocode:[{code:`read(key):`},{code:`  if key in cache: return it`,id:`hit`},{code:`  if a fetch for key is running: wait for it`,id:`wait`},{code:`  value = database.read(key)`,id:`miss`},{code:`  if cache is full: evict by policy`,id:`size`},{code:`  cache.put(key, value, ttl)`},{code:`  return value`}],sources:[{name:`engine.ts`,code:a,lang:`ts`}],tradeoffs:[{choice:`LRU`,gain:`Simple, adapts to changing popularity`,cost:`One bulk scan can flush useful keys`},{choice:`LFU`,gain:`Keeps steadily popular keys`,cost:`Slow to forget keys that used to be popular`},{choice:`Long TTL`,gain:`Higher hit rate, less database load`,cost:`Users see stale data for longer`},{choice:`Write-through`,gain:`Cache is always fresh`,cost:`Every write gets slower`}],interview:[{q:`How do you keep the cache consistent with the database?`,a:`Commonly you write to the database and then delete the cache key, so the next read refills it. A short TTL bounds how stale things can get if that delete fails. Perfect consistency between two systems needs much heavier machinery.`},{q:`What happens when the cache goes down?`,a:`All its traffic lands on the database, which was sized assuming a cache. Plan for it with cache replicas, a local in-process cache, and load shedding or circuit breakers so the database survives.`},{q:`How would you handle a very hot key?`,a:`Keep a small in-process copy on each application server for a second or two, or split it across several cache keys with a random suffix to spread the load across shards.`}],mistakes:[`Sizing a cache by share of keys, when it's traffic skew that matters.`,`Giving every key the same TTL, so large groups expire together.`,`Treating the cache as durable storage.`]};export{_ as default};