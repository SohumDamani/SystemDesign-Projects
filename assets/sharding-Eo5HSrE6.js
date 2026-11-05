import{i as e,n as t,o as n,s as r}from"./index-ar0glIxf.js";import{n as i,t as a}from"./engine-DiFru7hp.js";var o=`// Three ways to decide which database a row lives on, and what each makes cheap or expensive.
import { HashRing, hash32 } from '../consistent-hashing/engine';

export const KEY_SPACE = 1_000_000;

export type Strategy = 'hash' | 'consistent' | 'range';

export interface Router {
  route(key: number): number;
  /** How many shards a query for keys from..to must ask. */
  shardsForRange(from: number, to: number): number;
  addShard(): void;
  readonly shards: number;
}

/** hash(key) % N. Even load, but scans must ask everyone, and resizing moves almost everything. */
export class HashRouter implements Router {
  constructor(public shards: number) {}

  route(key: number) {
    return hash32(\`k\${key}\`) % this.shards;
  }

  shardsForRange() {
    return this.shards;
  }

  addShard() {
    this.shards++;
  }
}

/** Like hash routing for even load and scans, but adding a shard moves only about 1/N of the keys. */
export class ConsistentRouter implements Router {
  private ring = new HashRing(100);
  shards = 0;

  constructor(shards: number) {
    for (let i = 0; i < shards; i++) this.addShard();
  }

  route(key: number) {
    return Number(this.ring.lookup(\`k\${key}\`).slice(1));
  }

  shardsForRange() {
    return this.shards;
  }

  addShard() {
    this.ring.add(\`s\${this.shards}\`);
    this.shards++;
  }
}

/** Contiguous key ranges. Scans touch few shards, but ordered keys all land in one place. */
export class RangeRouter implements Router {
  constructor(public shards: number) {}

  route(key: number) {
    return Math.min(this.shards - 1, Math.floor((key / KEY_SPACE) * this.shards));
  }

  shardsForRange(from: number, to: number) {
    return this.route(to) - this.route(from) + 1;
  }

  addShard() {
    this.shards++;
  }
}

export function makeRouter(strategy: Strategy, shards: number): Router {
  if (strategy === 'consistent') return new ConsistentRouter(shards);
  if (strategy === 'range') return new RangeRouter(shards);
  return new HashRouter(shards);
}

/** Replays a sample of keys through a resize, and reports the share that changed shard. */
export function movedShareOnResize(router: Router, sample: number[]): number {
  const before = sample.map((k) => router.route(k));
  router.addShard();
  let moved = 0;
  sample.forEach((k, i) => {
    if (router.route(k) !== before[i]) moved++;
  });
  return moved / sample.length;
}
`,s=1e6,c=class{shards;constructor(e){this.shards=e}route(e){return i(`k${e}`)%this.shards}shardsForRange(){return this.shards}addShard(){this.shards++}},l=class{ring=new a(100);shards=0;constructor(e){for(let t=0;t<e;t++)this.addShard()}route(e){return Number(this.ring.lookup(`k${e}`).slice(1))}shardsForRange(){return this.shards}addShard(){this.ring.add(`s${this.shards}`),this.shards++}},u=class{shards;constructor(e){this.shards=e}route(e){return Math.min(this.shards-1,Math.floor(e/s*this.shards))}shardsForRange(e,t){return this.route(t)-this.route(e)+1}addShard(){this.shards++}};function d(e,t){return e===`consistent`?new l(t):e===`range`?new u(t):new c(t)}function f(e,t){let n=t.map(t=>e.route(t));e.addShard();let r=0;return t.forEach((t,i)=>{e.route(t)!==n[i]&&r++}),r/t.length}var p=.1,m=e=>e.loads.reduce((e,t)=>e+t,0)/Math.max(1,e.loads.length),h=e=>Math.max(...e.loads),g=e=>m(e)?h(e)/m(e):1,_={problem:[`Sooner or later a single database runs out of room or can't keep up with writes. Replicas can't help with this, since every write still goes to one place. So you split the data across many databases. That's sharding, and it changes almost everything.`,`The most important decision is the shard key: the column that decides where a row lives. Pick well, and load spreads evenly while most queries touch one shard. Pick badly, and you'll have a very expensive system with one overloaded database and painful queries.`],functional:[`Route each row to the correct shard`,`Answer queries that span more than one shard`,`Add capacity without downtime`],nonFunctional:[`Load spreads evenly across shards`,`Common queries touch only one shard`,`Resizing moves as little data as possible`],diagram:{nodes:[{id:`a`,label:`Application`,col:0,row:1,note:`Knows only about rows, not where they live.`},{id:`r`,label:`Shard router`,col:1,row:1,note:`Works out the shard from the key. It can be a library, a proxy, or the database itself.`},{id:`m`,label:`Shard map`,col:1,row:0,kind:`store`,note:`Which key ranges or hash slots live where. Must be kept highly available.`},{id:`s1`,label:`Shard 1`,col:2,row:0,kind:`store`,note:`A normal database holding part of the data, usually with its own replicas.`},{id:`s2`,label:`Shard 2`,col:2,row:1,kind:`store`,note:`A normal database holding another part.`},{id:`s3`,label:`Shard 3`,col:2,row:2,kind:`store`,note:`Queries spanning shards have to be split up and their results merged.`}],edges:[{from:`a`,to:`r`},{from:`r`,to:`m`,dashed:!0},{from:`r`,to:`s1`},{from:`r`,to:`s2`},{from:`r`,to:`s3`}]},ideas:[{title:`Hash sharding`,body:`Spreads keys evenly, and is the safe default for random access. But related rows scatter, so range queries must ask every shard, and plain modulo makes resizing very expensive.`},{title:`Range sharding`,body:`Keeps neighboring keys together, so range queries are cheap. But popular or ever-growing keys all land in one place. Splitting ranges automatically helps, but doesn't solve timestamps.`},{title:`Choosing a shard key`,body:`Look at your most common query. For a chat app, shard by conversation. For a store, shard by customer. The goal is that most requests need exactly one shard.`},{title:`What you give up`,body:`Joins across shards, unique constraints across shards, and easy transactions. That's why you try caching and read replicas first, and shard only when you must.`}],estimator:{vars:[{key:`rows`,label:`Total rows`,unit:`count`},{key:`rowBytes`,label:`Bytes per row`,unit:`plain`,assume:500},{key:`shardBytes`,label:`Bytes per shard`,unit:`plain`,assume:2e12},{key:`writesPerRow`,label:`Writes per second per billion rows`,unit:`plain`,assume:2e3},{key:`total`,label:`Total data`,unit:`bytes`},{key:`shards`,label:`Shards for storage`,unit:`count`},{key:`writes`,label:`Total writes`,unit:`qps`},{key:`perShard`,label:`Writes per shard`,unit:`qps`}],eqs:[{out:`total`,terms:[[`rows`,1],[`rowBytes`,1]]},{out:`shards`,terms:[[`total`,1],[`shardBytes`,-1]]},{out:`writes`,terms:[[`rows`,1],[`writesPerRow`,1],[1e9,-1]]},{out:`perShard`,terms:[[`writes`,1],[`shards`,-1]]}],starts:[{key:`rows`,value:1e11},{key:`total`,value:0x5af3107a4000},{key:`shards`,value:50}]},lab:{secondsPerTick:p,params:[{key:`strategy`,label:`Shard by`,kind:`choice`,rebuild:!0,options:[{value:`hash`,label:`hash(key) % shards`},{value:`consistent`,label:`Consistent hashing`},{value:`range`,label:`Key ranges`}]},{key:`shards`,label:`Shards`,kind:`range`,min:2,max:16,step:1,rebuild:!0},{key:`pattern`,label:`Keys look like`,kind:`choice`,rebuild:!0,options:[{value:`random`,label:`Random user IDs`},{value:`ordered`,label:`Timestamps, always growing`},{value:`skewed`,label:`Some users far busier`}]},{key:`writesPerSec`,label:`Writes`,kind:`range`,min:100,max:2e4,step:100,unit:`per s`},{key:`capacity`,label:`Capacity per shard`,kind:`range`,min:100,max:5e3,step:100,unit:`per s`},{key:`scanWidth`,label:`Range query width`,kind:`range`,min:100,max:1e5,step:100,unit:`keys`}],defaults:{strategy:`hash`,shards:8,pattern:`random`,writesPerSec:4e3,capacity:1e3,scanWidth:1e3},create(e,n){let r=e.shards;return{router:d(e.strategy,r),loads:Array(r).fill(0),rows:Array(r).fill(0),sequence:Math.floor(s*.96),zipf:t(5e3,1),celebrity:!1,celebrityKey:424242,scansTouched:0,scans:0,moved:null,sampleKeys:Array.from({length:5e3},()=>n.int(s)),lastKey:0,lastShard:0}},step(e,t,n){let r=n.poisson(t.writesPerSec*p),i=Array(e.router.shards).fill(0);for(let a=0;a<r;a++){let r;r=e.celebrity&&n.chance(.4)?e.celebrityKey:t.pattern===`ordered`?Math.min(s-1,e.sequence++%s):t.pattern===`skewed`?e.zipf(n)*197%s:n.int(s);let a=e.router.route(r);i[a]++,e.rows[a]++,e.lastKey=r,e.lastShard=a}e.loads.length<i.length&&e.loads.push(...Array(i.length-e.loads.length).fill(0)),e.rows.length<i.length&&e.rows.push(...Array(i.length-e.rows.length).fill(0)),e.loads=e.loads.map((e,t)=>e*.8+i[t]/p*.2);let a=n.int(s-t.scanWidth);e.scansTouched+=e.router.shardsForRange(a,a+t.scanWidth),e.scans++},sample:(e,t)=>({peak:h(e),avg:m(e),cap:t.capacity}),charts:[{title:`Load on the busiest shard`,unit:`writes/s`,series:[{key:`peak`,label:`Busiest`,role:`measured`},{key:`cap`,label:`Capacity`,role:`predicted`},{key:`avg`,label:`Average`,role:`other`}]}],metrics(t,n){return[{label:`Even share per shard`,value:e(n.writesPerSec/t.router.shards),role:`predicted`},{label:`Busiest shard`,value:e(h(t)),role:`measured`,tone:h(t)>n.capacity?`bad`:`good`},{label:`Busiest over average`,value:`${g(t).toFixed(2)}×`,role:`measured`,tone:g(t)>1.5?`bad`:void 0},{label:`Shards per range query`,value:t.scans?(t.scansTouched/t.scans).toFixed(1):`0`,role:`measured`},{label:`Keys moved on last resize`,value:t.moved===null?`Not resized yet`:r(t.moved),role:`measured`}]},math(e,t){let i=e.router.shards;return[{expr:`Even share: ${n(t.writesPerSec)} ÷ ${i} shards`,result:`${n(t.writesPerSec/i)}/s`,tone:t.writesPerSec/i>t.capacity?`bad`:`good`},{expr:t.strategy===`hash`?`Resizing to ${i+1} shards moves ${i} ÷ ${i+1} of keys`:t.strategy===`consistent`?`Resizing to ${i+1} shards moves 1 ÷ ${i+1} of keys`:`Resizing means splitting a range and moving half of it`,result:t.strategy===`hash`?r(i/(i+1)):t.strategy===`consistent`?r(1/(i+1)):`one shard's data`,tone:t.strategy===`hash`?`bad`:`good`},{expr:`Range query of ${n(t.scanWidth)} keys touches`,result:t.strategy===`range`?`${Math.max(1,Math.ceil(t.scanWidth/s*i))} to ${Math.ceil(t.scanWidth/s*i)+1} shards`:`all ${i} shards`,tone:t.strategy===`range`?`good`:`warn`}]},views:(e,t)=>[{kind:`bars`,title:`Writes per second on each shard`,marker:{value:t.capacity,label:`Shard capacity`},items:e.loads.map((e,n)=>({label:`Shard ${n+1}`,value:e,tone:e>t.capacity?`bad`:`neutral`}))}],actions:[{key:`celebrity`,label:`One key goes viral, or stops`,run:e=>{e.celebrity=!e.celebrity}},{key:`add`,label:`Add a shard`,run:e=>{e.moved=f(e.router,e.sampleKeys)}}],trace:e=>({values:{key:n(e.lastKey),shard:`shard ${e.lastShard+1}`,moved:e.moved===null?``:r(e.moved)}}),experiments:[{title:`Timestamps and ranges`,set:{strategy:`range`,pattern:`ordered`,shards:8},ticks:100,question:`You shard by key range, and keys are timestamps that always grow. With 8 shards, how is the write load spread?`,options:[`Evenly`,`About double on some`,`All of it on one shard`],answer:2,explain:`Every new key is the largest so far, so it always falls in the last range. You have 8 databases, and one doing all the work. This is why teams avoid a plain timestamp or auto-increment as a range key.`,check:e=>g(e)>6},{title:`Hash those timestamps`,set:{strategy:`hash`,pattern:`ordered`,shards:8},ticks:100,question:`Same timestamps, but now shard by a hash of the key. How is the load spread?`,options:[`Still on one shard`,`Close to even`],answer:1,explain:`Hashing scatters neighboring keys across shards, so writes spread evenly. But you just gave up something: rows that were next to each other are now far apart.`,check:e=>g(e)<1.5},{title:`The price of hashing`,set:{strategy:`hash`,scanWidth:1e3,shards:8},ticks:60,question:`A query asks for 1,000 consecutive keys, such as one hour of events. How many of the 8 hashed shards must it ask?`,options:[`One or two`,`All 8`],answer:1,explain:`The keys could be anywhere, so it fans out to every shard and waits for the slowest. With range sharding, it would touch one or two. The shard key decides which queries are cheap, so choose it from your most common query.`,check:e=>e.scansTouched/e.scans===e.router.shards},{title:`One viral key`,set:{strategy:`hash`,shards:8,writesPerSec:4e3},act:[`celebrity`],actAt:10,ticks:80,question:`A hash spreads keys evenly. But one key suddenly gets 40% of all writes. What happens?`,options:[`Hashing still keeps it even`,`One shard overloads anyway`],answer:1,explain:`Hashing evens out keys, not traffic. One key always maps to one shard. To fix it, you must split that key across shards with a suffix, cache it, or give it dedicated hardware.`,check:(e,t)=>h(e)>t.capacity*1.3},{title:`Add a shard with modulo`,set:{strategy:`hash`,shards:8},act:[`add`],actAt:5,ticks:10,question:"Going from 8 shards to 9 with `hash % shards`, what share of data must move?",options:[`About 11%`,`About 50%`,`About 89%`],answer:2,explain:`Nearly every key computes a different remainder. That means copying almost your whole database, usually while serving traffic. It's the reason consistent hashing exists.`,check:e=>e.moved!==null&&e.moved>.8},{title:`Add one with a ring`,set:{strategy:`consistent`,shards:8},act:[`add`],actAt:5,ticks:10,question:`Same resize, using consistent hashing. What share of data moves?`,options:[`About 11%`,`About 50%`,`About 89%`],answer:0,explain:`Only the keys that the new shard takes over need to move, about 1 ÷ 9. An alternative that's common in practice is to start with many logical shards, and move whole logical shards between machines.`,check:e=>e.moved!==null&&e.moved<.22}]},pseudocode:[{code:`write(key, row):`},{code:`  key from the shard key column`,id:`key`},{code:`  shard = router.route(key)`,id:`shard`},{code:`  shard.insert(row)`},{code:``},{code:`query(from, to):`},{code:`  ask every shard whose keys could match`},{code:`  merge the results`},{code:`share of keys moved on the last resize`,id:`moved`}],sources:[{name:`engine.ts`,code:o,lang:`ts`}],tradeoffs:[{choice:`Hash sharding`,gain:`Even load`,cost:`Range queries hit every shard`},{choice:`Range sharding`,gain:`Efficient range queries`,cost:`Hot spots with ordered or popular keys`},{choice:`Consistent hashing`,gain:`Resizing moves little data`,cost:`A ring to maintain`},{choice:`Directory of keys`,gain:`Total control over placement`,cost:`The directory becomes a critical dependency`}],interview:[{q:`How do you reshard without downtime?`,a:`Copy data to the new shards while writing to both, then switch reads over once they've caught up, and finally stop writing to the old location. Starting with many logical shards makes this easier, since you only move whole units.`},{q:`How do you handle a query that needs all shards?`,a:`Scatter-gather: send it to each shard, then merge. It's slower, and limited by the slowest shard. If it's frequent, keep a separate index or a copy partitioned by that field.`},{q:`How do you get unique IDs across shards?`,a:`Auto-increment stops working. Use a Snowflake-style generator, or UUIDs. Including the shard ID inside the ID is a neat way to route later without a lookup.`},{q:`What about transactions across shards?`,a:`Try to design them away by choosing a shard key that keeps related data together. If you can't, use two-phase commit or a saga, and accept the added complexity.`}],mistakes:[`Sharding before trying caches and replicas.`,`Using a timestamp or auto-increment ID as a range key.`,`Assuming a hash solves hot keys.`]};export{_ as default};