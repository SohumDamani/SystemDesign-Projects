import{a as e,o as t,s as n}from"./index-ar0glIxf.js";import{a as r,r as i}from"./stats-SinZlVt1.js";var a=`// A Dynamo-style replicated store: quorum reads and writes, and vector clocks for conflicts.
import type { Rng } from '../../core/rng';

export interface Replica {
  name: string;
  alive: boolean;
  versions: Map<number, number>; // key -> newest version this replica has applied
}

interface PendingApply {
  replica: Replica;
  key: number;
  version: number;
  at: number;
}

export interface Store {
  replicas: Replica[];
  acknowledged: Map<number, number>; // key -> newest version a client was told succeeded
  pending: PendingApply[];
  pendingAcks: { key: number; version: number; at: number }[];
  nextVersion: number;
  now: number;
}

export interface OpResult {
  ok: boolean;
  latency: number;
  stale?: boolean;
}

export function createStore(n: number): Store {
  const replicas = Array.from({ length: n }, (_, i) => ({ name: \`R\${i + 1}\`, alive: true, versions: new Map() }));
  return { replicas, acknowledged: new Map(), pending: [], pendingAcks: [], nextVersion: 1, now: 0 };
}

/** Sends the write to all live replicas. It succeeds once the W fastest have applied it. */
export function write(store: Store, key: number, w: number, meanDelay: number, rng: Rng): OpResult {
  const alive = store.replicas.filter((r) => r.alive);
  if (alive.length < w) return { ok: false, latency: 0 };
  const version = store.nextVersion++;
  const delays = alive.map((replica) => {
    const delay = rng.exponential(meanDelay);
    store.pending.push({ replica, key, version, at: store.now + delay });
    return delay;
  });
  delays.sort((a, b) => a - b);
  const latency = delays[w - 1];
  store.pendingAcks.push({ key, version, at: store.now + latency });
  return { ok: true, latency };
}

/** Asks all live replicas and takes the newest version among the R fastest replies. */
export function read(store: Store, key: number, r: number, meanDelay: number, rng: Rng): OpResult {
  const alive = store.replicas.filter((x) => x.alive);
  if (alive.length < r) return { ok: false, latency: 0 };
  const replies = alive
    .map((replica) => ({ delay: rng.exponential(meanDelay), version: replica.versions.get(key) ?? 0 }))
    .sort((a, b) => a.delay - b.delay)
    .slice(0, r);
  const newest = Math.max(...replies.map((x) => x.version));
  return { ok: true, latency: replies[r - 1].delay, stale: newest < (store.acknowledged.get(key) ?? 0) };
}

/** Moves time forward, applying any replication and acknowledgements that are now due. */
export function advance(store: Store, dt: number) {
  store.now += dt;
  store.pending = store.pending.filter((p) => {
    if (p.at > store.now) return true;
    if (p.replica.alive && (p.replica.versions.get(p.key) ?? 0) < p.version) p.replica.versions.set(p.key, p.version);
    return false;
  });
  store.pendingAcks = store.pendingAcks.filter((a) => {
    if (a.at > store.now) return true;
    if ((store.acknowledged.get(a.key) ?? 0) < a.version) store.acknowledged.set(a.key, a.version);
    return false;
  });
}

// Vector clocks tell "newer" apart from "written at the same time, with no knowledge of each other".
export type VectorClock = Record<string, number>;

export function increment(clock: VectorClock, node: string): VectorClock {
  return { ...clock, [node]: (clock[node] ?? 0) + 1 };
}

/** True if a has seen everything b has seen. */
export function descends(a: VectorClock, b: VectorClock): boolean {
  return Object.keys(b).every((node) => (a[node] ?? 0) >= b[node]);
}

export function merge(a: VectorClock, b: VectorClock): VectorClock {
  const out: VectorClock = { ...a };
  for (const [node, count] of Object.entries(b)) out[node] = Math.max(out[node] ?? 0, count);
  return out;
}

export function compare(a: VectorClock, b: VectorClock): 'same' | 'newer' | 'older' | 'conflict' {
  const ab = descends(a, b);
  const ba = descends(b, a);
  if (ab && ba) return 'same';
  if (ab) return 'newer';
  if (ba) return 'older';
  return 'conflict';
}

const show = (c: VectorClock) =>
  '[' +
  Object.entries(c)
    .map(([n, v]) => \`\${n}:\${v}\`)
    .join(' ') +
  ']';

/** Walks through two clients writing the same key on each side of a network split. */
export function conflictDemo(): string[] {
  const base = increment({}, 'A');
  const left = increment(base, 'A');
  const right = increment(base, 'B');
  const relation = compare(left, right);
  const resolved = increment(merge(left, right), 'A');
  return [
    \`Write through node A: \${show(base)}\`,
    'Network splits. Each side keeps accepting writes.',
    \`Client 1 writes through A: \${show(left)}\`,
    \`Client 2 writes through B: \${show(right)}\`,
    \`Comparing the two: \${relation}, since neither has seen the other\`,
    \`A client reads both, merges them, and writes: \${show(resolved)}\`,
    \`Compared with both earlier versions: \${compare(resolved, left)} and \${compare(resolved, right)}\`,
  ];
}
`;function o(e){return{replicas:Array.from({length:e},(e,t)=>({name:`R${t+1}`,alive:!0,versions:new Map})),acknowledged:new Map,pending:[],pendingAcks:[],nextVersion:1,now:0}}function s(e,t,n,r,i){let a=e.replicas.filter(e=>e.alive);if(a.length<n)return{ok:!1,latency:0};let o=e.nextVersion++,s=a.map(n=>{let a=i.exponential(r);return e.pending.push({replica:n,key:t,version:o,at:e.now+a}),a});s.sort((e,t)=>e-t);let c=s[n-1];return e.pendingAcks.push({key:t,version:o,at:e.now+c}),{ok:!0,latency:c}}function c(e,t,n,r,i){let a=e.replicas.filter(e=>e.alive);if(a.length<n)return{ok:!1,latency:0};let o=a.map(e=>({delay:i.exponential(r),version:e.versions.get(t)??0})).sort((e,t)=>e.delay-t.delay).slice(0,n),s=Math.max(...o.map(e=>e.version));return{ok:!0,latency:o[n-1].delay,stale:s<(e.acknowledged.get(t)??0)}}function l(e,t){e.now+=t,e.pending=e.pending.filter(t=>t.at>e.now||(t.replica.alive&&(t.replica.versions.get(t.key)??0)<t.version&&t.replica.versions.set(t.key,t.version),!1)),e.pendingAcks=e.pendingAcks.filter(t=>t.at>e.now||((e.acknowledged.get(t.key)??0)<t.version&&e.acknowledged.set(t.key,t.version),!1))}function u(e,t){return{...e,[t]:(e[t]??0)+1}}function d(e,t){return Object.keys(t).every(n=>(e[n]??0)>=t[n])}function f(e,t){let n={...e};for(let[e,r]of Object.entries(t))n[e]=Math.max(n[e]??0,r);return n}function p(e,t){let n=d(e,t),r=d(t,e);return n&&r?`same`:n?`newer`:r?`older`:`conflict`}var m=e=>`[`+Object.entries(e).map(([e,t])=>`${e}:${t}`).join(` `)+`]`;function h(){let e=u({},`A`),t=u(e,`A`),n=u(e,`B`),r=p(t,n),i=u(f(t,n),`A`);return[`Write through node A: ${m(e)}`,`Network splits. Each side keeps accepting writes.`,`Client 1 writes through A: ${m(t)}`,`Client 2 writes through B: ${m(n)}`,`Comparing the two: ${r}, since neither has seen the other`,`A client reads both, merges them, and writes: ${m(i)}`,`Compared with both earlier versions: ${p(i,t)} and ${p(i,n)}`]}var g=.05,_=20,v=(e,t)=>Math.min(e,t),y=(e,t,n)=>n*(i(t)-i(t-e)),b={problem:["A key-value store is a giant distributed dictionary: `put(key, value)` and `get(key)`. It sounds trivial until the data won't fit on one machine and machines keep failing. Then you need to partition data, replicate it, and decide what happens when replicas disagree.",`The central tradeoff is the CAP theorem. When the network splits, you can either refuse some requests to stay consistent, or keep answering and risk conflicting data. Quorum settings let you choose where on that line to sit, per request.`],functional:["`put(key, value)` and `get(key)`",`Store data across many machines`,`Keep working when machines fail`],nonFunctional:[`Scales by adding machines`,`Tunable consistency`,`Low latency, even at high percentiles`],diagram:{nodes:[{id:`c`,label:`Client`,col:0,row:1,kind:`client`,note:`Talks to any node. That node acts as the coordinator for this request.`},{id:`co`,label:`Coordinator`,col:1,row:1,note:`Finds the N replicas on the hash ring, sends to all, and waits for W or R replies.`},{id:`a`,label:`Replica 1`,col:2,row:0,kind:`store`,note:`Writes to a commit log and memtable, then flushes to sorted files on disk.`},{id:`b`,label:`Replica 2`,col:2,row:1,kind:`store`,note:`If this node is down, another can hold its writes and pass them on later. That's hinted handoff.`},{id:`d`,label:`Replica 3`,col:2,row:2,kind:`store`,note:`Replicas compare Merkle trees in the background to find and repair differences cheaply.`}],edges:[{from:`c`,to:`co`},{from:`co`,to:`a`},{from:`co`,to:`b`},{from:`co`,to:`d`}]},ideas:[{title:`Quorum: R + W > N`,body:`Store N copies, wait for W on writes and R on reads. If R + W > N, every read overlaps the latest write. Lower values are faster and more available, but can return old data.`},{title:`Vector clocks`,body:`A version number can't tell you if two writes happened at the same time on different sides of a partition. A vector clock can, so the conflict can be kept and resolved instead of silently lost.`},{title:`Handling failure`,body:`Nodes spot failures through gossip, sharing heartbeats with random peers. Hinted handoff covers short outages. Merkle trees find differences after long ones with little data transfer.`},{title:`The storage engine`,body:`Writes append to a commit log and an in-memory table, later flushed as sorted files. Reads check memory, then a Bloom filter tells them which files might hold the key.`}],estimator:{vars:[{key:`users`,label:`Users`,unit:`count`},{key:`keysPerUser`,label:`Keys per user`,unit:`plain`,assume:100},{key:`valueBytes`,label:`Bytes per value`,unit:`plain`,assume:1e3},{key:`replicas`,label:`Copies, N`,unit:`plain`,assume:3},{key:`opsPerUser`,label:`Operations per user per day`,unit:`plain`,assume:50},{key:`nodeBytes`,label:`Bytes per node`,unit:`plain`,assume:2e12},{key:`keys`,label:`Total keys`,unit:`count`},{key:`storage`,label:`Total storage`,unit:`bytes`},{key:`nodes`,label:`Nodes`,unit:`count`},{key:`qps`,label:`Average load`,unit:`qps`}],eqs:[{out:`keys`,terms:[[`users`,1],[`keysPerUser`,1]]},{out:`storage`,terms:[[`keys`,1],[`valueBytes`,1],[`replicas`,1]]},{out:`nodes`,terms:[[`storage`,1],[`nodeBytes`,-1]]},{out:`qps`,terms:[[`users`,1],[`opsPerUser`,1],[86400,-1]]}],starts:[{key:`users`,value:1e8},{key:`storage`,value:0x38d7ea4c68000},{key:`nodes`,value:100}]},lab:{secondsPerTick:g,params:[{key:`n`,label:`N, copies of each key`,kind:`range`,min:1,max:5,step:1,rebuild:!0},{key:`r`,label:`R, replies a read waits for`,kind:`range`,min:1,max:5,step:1},{key:`w`,label:`W, acks a write waits for`,kind:`range`,min:1,max:5,step:1},{key:`delayMs`,label:`Average replica delay`,kind:`range`,min:1,max:200,step:1,unit:`ms`},{key:`writesPerSec`,label:`Writes`,kind:`range`,min:1,max:200,step:1,unit:`per s`},{key:`readsPerSec`,label:`Reads`,kind:`range`,min:1,max:500,step:1,unit:`per s`}],defaults:{n:3,r:1,w:1,delayMs:50,writesPerSec:100,readsPerSec:200},create:e=>({store:o(e.n),reads:0,stale:0,writes:0,failedWrites:0,failedReads:0,staleRate:0,failRate:0,writeLatency:0,readLatency:0,log:[]}),step(e,t,n){let r=v(t.r,t.n),i=v(t.w,t.n),a=t.delayMs/1e3;l(e.store,g);let o=0,u=0,d=0,f=0;for(let r=n.poisson(t.writesPerSec*g);r>0;r--){let t=s(e.store,n.int(_),i,a,n);e.writes++,f++,t.ok?e.writeLatency=e.writeLatency*.98+t.latency*.02:(e.failedWrites++,d++)}for(let i=n.poisson(t.readsPerSec*g);i>0;i--){let t=c(e.store,n.int(_),r,a,n);e.reads++,u++,t.ok?(e.readLatency=e.readLatency*.98+t.latency*.02,t.stale&&(e.stale++,o++)):e.failedReads++}u&&(e.staleRate=e.staleRate*.97+o/u*.03),f&&(e.failRate=e.failRate*.9+d/f*.1)},sample:(e,t)=>({stale:e.staleRate*100,strongLine:0,latency:e.writeLatency*1e3,latencyMath:y(v(t.w,t.n),e.store.replicas.filter(e=>e.alive).length||1,t.delayMs/1e3)*1e3,failed:e.failRate*100}),charts:[{title:`Reads returning stale data`,unit:`%`,series:[{key:`stale`,label:`Measured`,role:`measured`},{key:`failed`,label:`Writes failing`,role:`other`}]},{title:`Write latency`,unit:`ms`,series:[{key:`latency`,label:`Measured`,role:`measured`},{key:`latencyMath`,label:`Math`,role:`predicted`}]}],metrics(e,r){let i=v(r.r,r.n)+v(r.w,r.n)>r.n;return[{label:`Consistency`,value:i?`Strong`:`Eventual`,role:`predicted`,tone:i?`good`:`warn`},{label:`Stale reads, recently`,value:n(e.staleRate,2),role:`measured`,tone:e.staleRate>5e-4?`warn`:`good`},{label:`Failed writes`,value:t(e.failedWrites),role:`measured`,tone:e.failedWrites?`bad`:void 0},{label:`Failed reads`,value:t(e.failedReads),role:`measured`,tone:e.failedReads?`bad`:void 0}]},math(t,n){let r=v(n.r,n.n),i=v(n.w,n.n),a=t.store.replicas.filter(e=>e.alive).length;return[{expr:`R + W > N: ${r} + ${i} vs ${n.n}`,result:r+i>n.n?`reads always overlap writes`:`a read can miss a write`,tone:r+i>n.n?`good`:`warn`},{expr:`Write waits for fastest ${i} of ${a||0} replicas`,result:a>=i?e(y(i,a,n.delayMs/1e3)):`cannot succeed`,tone:a>=i?void 0:`bad`},{expr:`Read waits for fastest ${r} of ${a||0} replicas`,result:a>=r?e(y(r,a,n.delayMs/1e3)):`cannot succeed`,tone:a>=r?void 0:`bad`}]},views:e=>[{kind:`cells`,title:`Replicas`,items:e.store.replicas.map(e=>({label:e.name,value:e.alive?`Up`:`Down`,tone:e.alive?`good`:`bad`}))},{kind:`log`,title:`Vector clock conflict walkthrough`,lines:e.log.map(e=>({text:e}))}],actions:[{key:`kill`,label:`Kill a replica`,run:e=>{let t=e.store.replicas.find(e=>e.alive);t&&(t.alive=!1)}},{key:`restore`,label:`Restore all replicas`,run:e=>{e.store.replicas.forEach(e=>e.alive=!0)}},{key:`conflict`,label:`Show a write conflict`,run:e=>e.log=h()}],trace(t,r){let i=v(r.r,r.n);return{values:{w:`W = ${v(r.w,r.n)}`,wl:e(t.writeLatency),r:`R = ${i}`,rl:e(t.readLatency),stale:n(t.reads?t.stale/t.reads:0,2)}}},experiments:[{title:`Fast and loose`,set:{n:3,r:1,w:1},ticks:300,question:`With N = 3, R = 1 and W = 1, a read can return before it has heard from the replica that got the latest write. How often do reads look stale?`,options:[`Never`,`A noticeable share of reads`,`Almost all of them`],answer:1,explain:`R + W = 2 isn't greater than N = 3, so the replica you read from may not be the one you wrote to. This is eventual consistency: very fast and highly available, but reads can go back in time.`,check:e=>e.reads>100&&e.stale/e.reads>.02},{title:`Quorum`,set:{n:3,r:2,w:2},ticks:300,question:`Now R = 2 and W = 2. How many reads can return stale data?`,options:[`None`,`A few, under 1%`,`The same as before`],answer:0,explain:`R + W = 4 > 3, so any 2 replicas you read must include at least one of the 2 you wrote to. It's pure counting, not luck. You pay in latency, since every operation now waits for a slower replica.`,check:e=>e.stale===0&&e.reads>100},{title:`Lose two replicas`,set:{n:3,r:2,w:2},act:[`kill`,`kill`],actAt:20,ticks:120,question:`With R = W = 2, two of the three replicas die. What happens to writes?`,options:[`They keep working on the one remaining replica`,`They all fail`,`About half fail`],answer:1,explain:`A write needs 2 acknowledgements, and only one replica can answer, so nothing succeeds. That's the CAP tradeoff made concrete: you chose consistency, so you lost availability. Sloppy quorums and hinted handoff exist to relax this.`,check:(e,t,n)=>r(n,`failed`,20)>90},{title:`What W costs`,set:{n:3,r:1,w:3},ticks:600,question:`Replica delay averages 50 ms. With W = 3, a write waits for the slowest of three replicas. What is the average write latency?`,options:[`About 50 ms`,`About 90 ms`,`About 150 ms`],answer:1,explain:`Waiting for the slowest of 3 random delays takes 50 × (1 + 1/2 + 1/3) ≈ 92 ms, whereas the fastest of 3 takes only about 17 ms. The higher your W, the more you depend on your slowest machine. That's why tail latency matters so much here.`,check:(e,t,n)=>{let i=r(n,`latency`,200);return i>70&&i<115}}]},pseudocode:[{code:`put(key, value):`},{code:`  send to all N replicas for this key`},{code:`  wait for W acknowledgements`,id:`w`},{code:`  return success`,id:`wl`},{code:``},{code:`get(key):`},{code:`  ask all N replicas`},{code:`  wait for R replies`,id:`r`},{code:`  return the newest version among them`,id:`rl`},{code:`  share of reads that were stale`,id:`stale`}],sources:[{name:`engine.ts`,code:a,lang:`ts`}],tradeoffs:[{choice:`W = N, R = 1`,gain:`Fast reads`,cost:`Slow writes, and one dead node blocks all writes`},{choice:`W = 1, R = N`,gain:`Fast writes`,cost:`Slow reads, and one dead node blocks all reads`},{choice:`W = R = quorum`,gain:`Consistent, and survives a minority of failures`,cost:`Every operation waits on more replicas`},{choice:`Vector clocks`,gain:`Detects real conflicts`,cost:`Metadata grows, and clients must resolve conflicts`},{choice:`Last write wins`,gain:`Simple`,cost:`Silently drops one of two concurrent writes, and depends on clocks`}],interview:[{q:`What does CAP really mean in practice?`,a:`Networks will partition, so the real choice is what to do when they do. CP systems refuse some requests to stay correct. AP systems keep answering and clean up later. Banks lean CP, while shopping carts lean AP.`},{q:`How do you detect that a node has failed?`,a:`Gossip. Each node keeps a list of heartbeat counters, regularly exchanges it with random peers, and considers a node down if its counter hasn't moved for a while. It needs no central monitor and spreads quickly.`},{q:`How do replicas catch up after an outage?`,a:`Hinted handoff covers short outages: another node holds the writes and replays them. For longer gaps, replicas compare Merkle trees, which pinpoint differing ranges while transferring very little data.`},{q:`Why LSM trees rather than B-trees?`,a:`Appending to a log and flushing sorted files gives very fast writes, ideal for high-volume stores. The cost is read and space amplification, handled with Bloom filters and background compaction.`}],mistakes:[`Stating CAP as "pick two", when partitions aren't optional.`,`Using last-write-wins without noticing it loses data.`,`Assuming R + W > N also protects you during node failures with sloppy quorums. It doesn't.`]};export{b as default};