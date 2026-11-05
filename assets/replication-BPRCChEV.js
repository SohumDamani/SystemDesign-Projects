import{a as e,i as t,o as n,s as r}from"./index-ar0glIxf.js";import{a as i,r as a}from"./stats-SinZlVt1.js";var o=`// A leader with followers: how a write gets acknowledged, and what's lost if the leader dies.
export type Mode = 'async' | 'semi-sync' | 'sync';
export type Routing = 'leader' | 'follower' | 'token';

export interface Follower {
  name: string;
  alive: boolean;
  applied: number; // highest log position this follower has applied
  /** Writes on their way, in log order. */
  incoming: { position: number; at: number }[];
  lastArrival: number;
}

export interface Cluster {
  now: number;
  log: number; // highest position the leader has written
  acknowledged: number; // highest position a client was told succeeded
  followers: Follower[];
  pendingAcks: { position: number; at: number }[];
}

export function createCluster(followers: number): Cluster {
  return {
    now: 0,
    log: 0,
    acknowledged: 0,
    followers: Array.from({ length: followers }, (_, i) => ({ name: \`F\${i + 1}\`, alive: true, applied: 0, incoming: [], lastArrival: 0 })),
    pendingAcks: [],
  };
}

/**
 * Appends a write, and ships it to followers. They apply the log in order, so a slow
 * delivery holds up everything behind it. Returns the latency the client sees, or null
 * if the write can't complete.
 */
export function write(c: Cluster, mode: Mode, randomDelay: () => number): { latency: number; position: number } | null {
  const alive = c.followers.filter((f) => f.alive);
  if (mode === 'sync' && alive.length < c.followers.length) return null; // sync needs every follower
  if (mode === 'semi-sync' && alive.length === 0) return null; // semi-sync needs at least one
  c.log++;
  const position = c.log;
  const arrivals: number[] = [];
  for (const f of alive) {
    const at = Math.max(f.lastArrival, c.now + randomDelay());
    f.lastArrival = at;
    f.incoming.push({ position, at });
    arrivals.push(at - c.now);
  }
  arrivals.sort((a, b) => a - b);
  const latency = mode === 'async' ? 0 : mode === 'semi-sync' ? arrivals[0] : arrivals[arrivals.length - 1];
  c.pendingAcks.push({ position, at: c.now + latency });
  return { latency, position };
}

export function advance(c: Cluster, dt: number) {
  c.now += dt;
  for (const f of c.followers) {
    if (!f.alive) continue;
    while (f.incoming.length && f.incoming[0].at <= c.now) f.applied = f.incoming.shift()!.position;
  }
  c.pendingAcks = c.pendingAcks.filter((a) => {
    if (a.at > c.now) return true;
    c.acknowledged = Math.max(c.acknowledged, a.position);
    return false;
  });
}

/** Read your own write. Returns true if the answer is missing it. */
export function readOwnWrite(c: Cluster, position: number, routing: Routing, pick: (n: number) => number): boolean {
  if (routing === 'leader') return false;
  const alive = c.followers.filter((f) => f.alive);
  if (!alive.length) return false;
  const follower = alive[pick(alive.length)];
  // With a token, the client says what it last wrote, and a lagging follower defers to the leader.
  if (routing === 'token' && follower.applied < position) return false;
  return follower.applied < position;
}

/**
 * The leader dies. The most caught-up follower takes over, and whatever it never
 * received is gone. If clients were told those writes succeeded, that's data loss.
 */
export function failover(c: Cluster): number {
  const alive = c.followers.filter((f) => f.alive);
  if (!alive.length) return 0;
  const successor = alive.reduce((best, f) => (f.applied > best.applied ? f : best));
  const lost = Math.max(0, c.acknowledged - successor.applied);
  c.log = successor.applied;
  c.acknowledged = Math.min(c.acknowledged, successor.applied);
  c.pendingAcks = [];
  for (const f of c.followers) {
    f.incoming = [];
    f.applied = Math.min(f.applied, successor.applied);
    f.lastArrival = c.now;
  }
  return lost;
}
`;function s(e){return{now:0,log:0,acknowledged:0,followers:Array.from({length:e},(e,t)=>({name:`F${t+1}`,alive:!0,applied:0,incoming:[],lastArrival:0})),pendingAcks:[]}}function c(e,t,n){let r=e.followers.filter(e=>e.alive);if(t===`sync`&&r.length<e.followers.length||t===`semi-sync`&&r.length===0)return null;e.log++;let i=e.log,a=[];for(let t of r){let r=Math.max(t.lastArrival,e.now+n());t.lastArrival=r,t.incoming.push({position:i,at:r}),a.push(r-e.now)}a.sort((e,t)=>e-t);let o=t===`async`?0:t===`semi-sync`?a[0]:a[a.length-1];return e.pendingAcks.push({position:i,at:e.now+o}),{latency:o,position:i}}function l(e,t){e.now+=t;for(let t of e.followers)if(t.alive)for(;t.incoming.length&&t.incoming[0].at<=e.now;)t.applied=t.incoming.shift().position;e.pendingAcks=e.pendingAcks.filter(t=>t.at>e.now||(e.acknowledged=Math.max(e.acknowledged,t.position),!1))}function u(e,t,n,r){if(n===`leader`)return!1;let i=e.followers.filter(e=>e.alive);if(!i.length)return!1;let a=i[r(i.length)];return n===`token`&&a.applied<t?!1:a.applied<t}function d(e){let t=e.followers.filter(e=>e.alive);if(!t.length)return 0;let n=t.reduce((e,t)=>t.applied>e.applied?t:e),r=Math.max(0,e.acknowledged-n.applied);e.log=n.applied,e.acknowledged=Math.min(e.acknowledged,n.applied),e.pendingAcks=[];for(let t of e.followers)t.incoming=[],t.applied=Math.min(t.applied,n.applied),t.lastArrival=e.now;return r}var f=.05,p=e=>{let t=e.c.followers.filter(e=>e.alive);return t.length?Math.max(...t.map(t=>e.c.log-t.applied)):0},m=e=>{let t=e.delayMs/1e3;return e.mode===`async`?0:e.mode===`semi-sync`?t/e.followers:t*a(e.followers)},h={problem:[`Replication means keeping the same data on several machines. You do it to survive failures, and to serve more reads than one machine can handle. In the most common setup, one leader takes all the writes and followers copy from it.`,`The difficult part is the delay between the leader having data and the followers having it. That gap causes your own comment to vanish on refresh, and acknowledged writes to disappear in a failover. The lab lets you trigger both and then fix them.`],functional:[`Copy every write from the leader to its followers`,`Serve reads from followers`,`Promote a follower when the leader fails`],nonFunctional:[`Writes stay fast`,`Acknowledged writes are not lost, to an agreed degree`,`Failover is quick and doesn't need a human`],diagram:{nodes:[{id:`c`,label:`Clients`,col:0,row:1,kind:`client`,note:`Send writes to the leader, and most reads to followers.`},{id:`l`,label:`Leader`,col:1,row:1,kind:`store`,note:`Accepts all writes, and records them in a replication log.`},{id:`f1`,label:`Follower 1`,col:2,row:0,kind:`store`,note:`Applies the log in order. Always slightly behind.`},{id:`f2`,label:`Follower 2`,col:2,row:2,kind:`store`,note:`Can be promoted to leader if the current one fails.`}],edges:[{from:`c`,to:`l`,label:`writes`},{from:`l`,to:`f1`,label:`log`},{from:`l`,to:`f2`,label:`log`},{from:`c`,to:`f1`,dashed:!0,label:`reads`},{from:`c`,to:`f2`,dashed:!0}]},ideas:[{title:`Sync or async`,body:`Async acknowledges right away, so it's fast, but recent writes can be lost if the leader dies. Sync waits for followers, so it's safe, but slow and fragile. Semi-sync waits for one follower, which is a popular middle ground.`},{title:`Replication lag`,body:`Followers are always a bit behind. It's usually milliseconds, but can stretch to minutes under load. Any read from a follower might be stale, so your design has to account for that.`},{title:`Read-your-writes`,body:`Users expect to see their own changes. Read from the leader just after writing, or send a position token that a follower must have reached before answering.`},{title:`Failover risks`,body:`Detecting a dead leader, picking a successor and redirecting traffic all take time. Beware split brain, where two nodes both think they're leader. That's what consensus is for.`}],estimator:{vars:[{key:`writes`,label:`Writes`,unit:`qps`},{key:`reads`,label:`Reads per write`,unit:`plain`,assume:10},{key:`nodeReads`,label:`Reads per second per replica`,unit:`plain`,assume:5e3},{key:`lagSeconds`,label:`Replication lag in seconds`,unit:`plain`,assume:.5},{key:`readQps`,label:`Read load`,unit:`qps`},{key:`replicas`,label:`Read replicas needed`,unit:`count`},{key:`atRisk`,label:`Writes at risk in a failover`,unit:`count`}],eqs:[{out:`readQps`,terms:[[`writes`,1],[`reads`,1]]},{out:`replicas`,terms:[[`readQps`,1],[`nodeReads`,-1]]},{out:`atRisk`,terms:[[`writes`,1],[`lagSeconds`,1]]}],starts:[{key:`writes`,value:2e3},{key:`replicas`,value:10}]},lab:{secondsPerTick:f,params:[{key:`mode`,label:`Replication`,kind:`choice`,rebuild:!0,options:[{value:`async`,label:`Asynchronous`},{value:`semi-sync`,label:`Semi-synchronous, one follower`},{value:`sync`,label:`Synchronous, all followers`}]},{key:`routing`,label:`Reads go to`,kind:`choice`,options:[{value:`follower`,label:`Any follower`},{value:`leader`,label:`The leader`},{value:`token`,label:`Follower, if caught up to my write`}]},{key:`followers`,label:`Followers`,kind:`range`,min:1,max:5,step:1,rebuild:!0},{key:`delayMs`,label:`Replication delay`,kind:`range`,min:1,max:2e3,step:1,unit:`ms`},{key:`writesPerSec`,label:`Writes`,kind:`range`,min:1,max:500,step:1,unit:`per s`},{key:`gapMs`,label:`Read your write after`,kind:`range`,min:0,max:2e3,step:10,unit:`ms`}],defaults:{mode:`async`,routing:`follower`,followers:2,delayMs:300,writesPerSec:50,gapMs:100},create:e=>({c:s(e.followers),pendingReads:[],reads:0,stale:0,staleRate:0,writeLatency:0,blocked:0,writes:0,lost:0,failovers:0,lastLag:0}),step(e,t,n){l(e.c,f);let r=()=>n.exponential(t.delayMs/1e3);for(let i=n.poisson(t.writesPerSec*f);i>0;i--){e.writes++;let n=c(e.c,t.mode,r);n?(e.writeLatency=e.writeLatency*.98+n.latency*.02,e.pendingReads.push({position:n.position,at:e.c.now+t.gapMs/1e3})):e.blocked++}let i=0,a=0;e.pendingReads=e.pendingReads.filter(r=>r.at>e.c.now||(i++,u(e.c,r.position,t.routing,e=>n.int(e))&&a++,!1)),e.reads+=i,e.stale+=a,i&&(e.staleRate=e.staleRate*.95+a/i*.05),e.lastLag=p(e)},sample:(e,t)=>({stale:e.staleRate*100,lag:e.lastLag,latency:e.writeLatency*1e3,latencyMath:m(t)*1e3}),charts:[{title:`Reads missing your own write`,unit:`%`,series:[{key:`stale`,label:`Measured`,role:`measured`}]},{title:`Write latency`,unit:`ms`,series:[{key:`latency`,label:`Measured`,role:`measured`},{key:`latencyMath`,label:`Math`,role:`predicted`}]},{title:`Writes the slowest follower is behind`,series:[{key:`lag`,label:`Measured`,role:`measured`}]}],metrics(i,a){return[{label:`Write latency`,value:e(m(a)),role:`predicted`},{label:`Write latency`,value:e(i.writeLatency),role:`measured`},{label:`Own write missing, recently`,value:r(i.staleRate,1),role:`measured`,tone:i.staleRate>.002?`warn`:`good`},{label:`Acknowledged writes lost`,value:n(i.lost),role:`measured`,tone:i.lost?`bad`:`good`},{label:`Writes blocked`,value:t(i.blocked),role:`measured`,tone:i.blocked?`bad`:`good`}]},math(e,t){let r=t.mode===`async`?t.writesPerSec*t.delayMs/1e3:0;return[{expr:`A follower is behind by: ${t.writesPerSec}/s × ${t.delayMs} ms`,result:`${n(t.writesPerSec*t.delayMs/1e3)} writes`},{expr:`Lost if the leader dies now, with ${t.mode}`,result:t.mode===`async`?`≈ ${n(r)} acknowledged writes`:`none`,tone:t.mode===`async`?`warn`:`good`},{expr:`A write waits for`,result:t.mode===`async`?`nobody`:t.mode===`semi-sync`?`the fastest follower`:`the slowest follower`,tone:t.mode===`sync`?`warn`:void 0}]},views:e=>[{kind:`cells`,title:`The cluster`,items:[{label:`Leader log`,value:n(e.c.log),tone:`good`},...e.c.followers.map(e=>({label:e.name,value:e.alive?n(e.applied):`Down`,tone:e.alive?`neutral`:`bad`}))]}],actions:[{key:`failover`,label:`Kill the leader, and fail over`,run:e=>{e.lost+=d(e.c),e.failovers++}},{key:`kill-follower`,label:`Kill a follower`,run:e=>{let t=e.c.followers.find(e=>e.alive);t&&(t.alive=!1)}},{key:`restore`,label:`Restore all followers`,run:e=>{for(let t of e.c.followers)t.alive||(t.alive=!0,t.applied=e.c.log,t.lastArrival=e.c.now)}}],trace:(e,t)=>({values:{pos:n(e.c.log),mode:t.mode,ack:n(e.c.acknowledged),route:t.routing,lag:n(e.lastLag)}}),experiments:[{title:`Read your own write`,set:{mode:`async`,routing:`follower`,delayMs:500,gapMs:100},ticks:300,question:`You post a comment, then the page reloads 100 ms later, reading from a follower that's around 500 ms behind. How often does your own comment seem to be missing?`,options:[`Almost never`,`Very often`],answer:1,explain:`The write hasn't reached that follower yet. To you, it looks like the site lost your comment. It's the most common user-visible replication bug, and is especially confusing because a refresh later fixes it.`,check:e=>e.reads>50&&e.stale/e.reads>.3},{title:`Bring a token`,set:{mode:`async`,routing:`token`,delayMs:500,gapMs:100},ticks:300,question:`Now the client sends the position of its last write, and a follower that hasn't reached it passes the read to the leader. How often is your write missing?`,options:[`Never`,`About the same`],answer:0,explain:`Read-your-writes consistency, with most reads still served by followers. A simpler version is to read from the leader for a few seconds after writing.`,check:e=>e.stale===0&&e.reads>50},{title:`Failover with async`,set:{mode:`async`,delayMs:1e3,writesPerSec:100,followers:2},act:[`failover`],actAt:60,ticks:70,question:`Clients get acknowledged as soon as the leader writes, and followers are about a second behind. The leader dies. What happens to the most recent writes?`,options:[`They're safe`,`They're gone, even though clients were told they succeeded`],answer:1,explain:`The new leader never received them. This is the price of async replication's speed, and with 100 writes a second and a second of lag, that's up to about 100 writes. Banks can't accept this. A social feed often can.`,check:e=>e.lost>10},{title:`Wait for one follower`,set:{mode:`semi-sync`,delayMs:1e3,writesPerSec:100,followers:2},act:[`failover`],actAt:60,ticks:70,question:`A write now waits until at least one follower has it, and the most caught-up follower takes over. How many acknowledged writes are lost?`,options:[`None`,`About the same`],answer:0,explain:`Every acknowledged write exists on at least one follower, and that one becomes leader. You pay for this in latency, as each write now waits for the fastest follower.`,check:e=>e.lost===0},{title:`Wait for everyone`,set:{mode:`sync`,delayMs:100,followers:3,writesPerSec:20},ticks:600,question:`With 3 followers, each with an average 100 ms delay, a write waits for all of them. What's the average write latency?`,options:[`About 100 ms`,`About 180 ms`,`About 300 ms`],answer:2,explain:`You wait for the slowest of three random delays: 100 × (1 + 1/2 + 1/3) ≈ 183 ms for a single write on its own. But followers apply writes in order, so one slow delivery holds up the writes behind it, and the average you will see is closer to 275 ms.`,check:(e,t,n)=>{let r=i(n,`latency`,300);return r>215&&r<350}},{title:`Lose one follower under sync`,set:{mode:`sync`,delayMs:50,followers:3,writesPerSec:50},act:[`kill-follower`],actAt:20,ticks:80,question:`Fully synchronous replication, and one follower dies. What happens to writes?`,options:[`They carry on with the others`,`They all stop`],answer:1,explain:`Every write needs every follower, so one failure stops all writes. More replicas made you less available. That's why fully synchronous replication is rare, and quorums or semi-sync are used instead.`,check:e=>e.blocked>20}]},pseudocode:[{code:`write(data):`},{code:`  append to the leader's log`,id:`pos`},{code:`  ship to followers`},{code:`  wait according to mode`,id:`mode`},{code:`  acknowledge the client`,id:`ack`},{code:``},{code:`read:`},{code:`  send to`,id:`route`},{code:`how far behind the slowest follower is`,id:`lag`}],sources:[{name:`engine.ts`,code:o,lang:`ts`}],tradeoffs:[{choice:`Asynchronous`,gain:`Fastest writes`,cost:`Can lose acknowledged writes in a failover`},{choice:`Semi-synchronous`,gain:`No acknowledged writes lost, with one follower down still fine`,cost:`Each write waits for a follower`},{choice:`Fully synchronous`,gain:`Every copy is current`,cost:`Slow, and one failure stops all writes`},{choice:`Reads from followers`,gain:`Scales reads`,cost:`Stale reads, unless you handle them`}],interview:[{q:`How do you choose between them?`,a:`Ask what a lost write costs. For money, you need sync or a quorum. For likes on a post, async is fine. Many systems use different settings for different data.`},{q:`What is split brain?`,a:`Two nodes both believe they're the leader, usually after a network partition, and accept conflicting writes. Consensus with majority votes prevents it, as only one side can have a majority.`},{q:`How can users see data go backwards?`,a:`If two reads go to followers with different lag, the second can show older data. Monotonic reads fix this, by pinning a user to one replica, or by using position tokens.`},{q:`How do you add a new follower?`,a:`Take a consistent snapshot of the leader, copy it over, then replay the log from that point until it's caught up. Then it can start serving reads.`}],mistakes:[`Assuming replicas help with write load.`,`Reading from followers right after a write, with no plan for staleness.`,`Promising no data loss with async replication.`]};export{h as default};