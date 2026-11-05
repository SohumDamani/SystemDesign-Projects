import{a as e,i as t,l as n,o as r,s as i}from"./index-ar0glIxf.js";var a=`// The routing decisions a load balancer makes, plus a small queueing model of each server.
import type { Rng } from '../../core/rng';

export interface Server {
  name: string;
  capacity: number; // requests per second this server can finish
  up: boolean; // actually alive
  routable: boolean; // what the load balancer believes, from health checks
  downAt: number;
  queue: number; // requests waiting or in progress
  fluidQueue: number; // same server with all randomness removed: the math's answer
  arrivals: number;
  rate: number;
  lost: number;
}

export type Strategy = 'round-robin' | 'least-connections';

/** Round robin ignores load entirely. Each server gets the same share, fast or slow. */
export function roundRobin(live: Server[], counter: number): Server {
  return live[counter % live.length];
}

/**
 * Least connections sends each request to whichever server has the shortest queue.
 * Starting the scan at \`counter\` keeps ties from always landing on the first server.
 */
export function leastConnections(live: Server[], counter: number, queueOf: (s: Server) => number): Server {
  let best = live[counter % live.length];
  for (let i = 0; i < live.length; i++) {
    const candidate = live[(counter + i) % live.length];
    if (queueOf(candidate) < queueOf(best)) best = candidate;
  }
  return best;
}

export function route(strategy: Strategy, live: Server[], counter: number, queueOf: (s: Server) => number): Server {
  return strategy === 'round-robin' ? roundRobin(live, counter) : leastConnections(live, counter, queueOf);
}

export interface Balancer {
  servers: Server[];
  counter: number;
  fluidCounter: number;
  carry: number;
  now: number;
  wait: number;
  failed: number;
  lastPick: string;
}

const SLICE = 0.01; // simulate in 10 ms slices so requests and work interleave

/** Advances the pool by \`seconds\`, with random arrivals and service times. */
export function advancePool(b: Balancer, strategy: Strategy, trafficPerSec: number, healthCheckSec: number, seconds: number, rng: Rng) {
  const slices = Math.round(seconds / SLICE);
  let waitSum = 0;
  let waitCount = 0;
  for (const s of b.servers) s.arrivals = 0;

  for (let i = 0; i < slices; i++) {
    b.now += SLICE;
    // A dead server keeps receiving traffic until a health check notices.
    for (const s of b.servers) {
      if (!s.up && s.routable && b.now - s.downAt >= healthCheckSec) s.routable = false;
      if (s.up) s.routable = true;
    }
    const routable = b.servers.filter((s) => s.routable);
    const alive = b.servers.filter((s) => s.up);

    let arrivals = rng.poisson(trafficPerSec * SLICE);
    for (; arrivals > 0; arrivals--) {
      if (!routable.length) {
        b.failed++;
        continue;
      }
      const server = route(strategy, routable, b.counter++, (s) => s.queue);
      b.lastPick = server.name;
      if (!server.up) {
        server.lost++;
        b.failed++;
        continue;
      }
      waitSum += server.queue / server.capacity;
      waitCount++;
      server.queue++;
      server.arrivals++;
    }

    // The math's version: the exact average rate, no randomness, same routing rule.
    b.carry += trafficPerSec * SLICE;
    let whole = Math.floor(b.carry);
    b.carry -= whole;
    if (alive.length) {
      for (; whole > 0; whole--) route(strategy, alive, b.fluidCounter++, (s) => s.fluidQueue).fluidQueue++;
    }

    for (const s of alive) {
      s.queue = Math.max(0, s.queue - rng.poisson(s.capacity * SLICE));
      s.fluidQueue = Math.max(0, s.fluidQueue - s.capacity * SLICE);
    }
  }
  for (const s of b.servers) s.rate = s.rate * 0.85 + (s.arrivals / seconds) * 0.15;
  if (waitCount) b.wait = b.wait * 0.8 + (waitSum / waitCount) * 0.2;
}

export function kill(b: Balancer, s: Server) {
  s.up = false;
  s.downAt = b.now;
  s.lost += s.queue;
  b.failed += s.queue;
  s.queue = 0;
  s.fluidQueue = 0;
  s.rate = 0;
}
`;function o(e,t){return e[t%e.length]}function s(e,t,n){let r=e[t%e.length];for(let i=0;i<e.length;i++){let a=e[(t+i)%e.length];n(a)<n(r)&&(r=a)}return r}function c(e,t,n,r){return e===`round-robin`?o(t,n):s(t,n,r)}var l=.01;function u(e,t,n,r,i,a){let o=Math.round(i/l),s=0,u=0;for(let t of e.servers)t.arrivals=0;for(let i=0;i<o;i++){e.now+=l;for(let t of e.servers)!t.up&&t.routable&&e.now-t.downAt>=r&&(t.routable=!1),t.up&&(t.routable=!0);let i=e.servers.filter(e=>e.routable),o=e.servers.filter(e=>e.up),d=a.poisson(n*l);for(;d>0;d--){if(!i.length){e.failed++;continue}let n=c(t,i,e.counter++,e=>e.queue);e.lastPick=n.name,n.up?(s+=n.queue/n.capacity,u++,n.queue++,n.arrivals++):(n.lost++,e.failed++)}e.carry+=n*l;let f=Math.floor(e.carry);if(e.carry-=f,o.length)for(;f>0;f--)c(t,o,e.fluidCounter++,e=>e.fluidQueue).fluidQueue++;for(let e of o)e.queue=Math.max(0,e.queue-a.poisson(e.capacity*l)),e.fluidQueue=Math.max(0,e.fluidQueue-e.capacity*l)}for(let t of e.servers)t.rate=t.rate*.85+t.arrivals/i*.15;u&&(e.wait=e.wait*.8+s/u*.2)}function d(e,t){t.up=!1,t.downAt=e.now,t.lost+=t.queue,e.failed+=t.queue,t.queue=0,t.fluidQueue=0,t.rate=0}var f=.2;function p(e,t){return{name:e,capacity:t,up:!0,routable:!0,downAt:0,queue:0,fluidQueue:0,arrivals:0,rate:0,lost:0}}var m=e=>e.servers.reduce((e,t)=>e+t.queue,0),h=e=>e.servers.reduce((e,t)=>e+t.fluidQueue,0);function g(e,t){let n=e.servers.filter(e=>e.up);if(!n.length)return 0;if(t.strategy===`round-robin`){let e=t.traffic/n.length;return n.reduce((t,n)=>t+Math.max(0,e-n.capacity),0)}return Math.max(0,t.traffic-n.reduce((e,t)=>e+t.capacity,0))}function _(e,t){let n=e.servers[t];n.up?d(e,n):n.up=!0}var v={problem:[`One server has a hard ceiling on how many requests it can finish per second, and if it dies your whole product dies with it. A load balancer sits in front of a pool of servers and hands each request to one of them, so you can add capacity by adding machines and survive losing one.`,`The interesting question is how it decides. A balancer that ignores load treats a struggling server exactly like a healthy one, and that's how a system with plenty of spare capacity still falls over.`],functional:[`Spread incoming requests across a pool of servers`,`Stop sending traffic to servers that fail health checks`,`Allow servers to be added or removed without downtime`],nonFunctional:[`Adds very little latency to each request`,`Is not itself a single point of failure`,`Copes with servers of different speeds`],diagram:{nodes:[{id:`c`,label:`Clients`,col:0,row:1,kind:`client`,note:`Know only one address: the load balancer's.`},{id:`lb`,label:`Load balancer`,col:1,row:1,note:`Picks a server for each request and runs health checks against the pool.`},{id:`a`,label:`Server A`,col:2,row:0,note:`Stateless, so any server can handle any request.`},{id:`b`,label:`Server B`,col:2,row:1,note:`Stateless, so any server can handle any request.`},{id:`d`,label:`Server C`,col:2,row:2,note:`Often slower: an older machine, a noisy neighbor, or a long garbage-collection pause.`},{id:`s`,label:`Shared state`,col:3,row:1,kind:`store`,note:`Sessions live in a shared store, not on the server, so any server can pick up any user.`}],edges:[{from:`c`,to:`lb`},{from:`lb`,to:`a`},{from:`lb`,to:`b`},{from:`lb`,to:`d`},{from:`a`,to:`s`},{from:`b`,to:`s`},{from:`d`,to:`s`}]},ideas:[{title:`Round robin`,body:`Hand requests to each server in turn. It's simple and needs no state, and it works well when servers and requests are all alike. It fails when they aren't.`},{title:`Least connections`,body:`Send each request to the server with the fewest in progress. Slow servers naturally get less work, at the cost of tracking connection counts.`},{title:`Layer 4 or layer 7`,body:`A layer 4 balancer routes on IP and port and is very fast. A layer 7 balancer reads the HTTP request, so it can route by path or header, but does more work per request.`},{title:`Health checks`,body:`The balancer probes each server regularly and removes those that stop answering. A shorter interval finds failures sooner but sends more probes and can react to brief blips.`}],estimator:{vars:[{key:`dau`,label:`Daily active users`,unit:`count`},{key:`requests`,label:`Requests per user per day`,unit:`plain`,assume:50},{key:`peakFactor`,label:`Peak over average`,unit:`plain`,assume:3},{key:`capacity`,label:`Capacity per server (req/s)`,unit:`plain`,assume:1e3},{key:`target`,label:`Target utilization (0 to 1)`,unit:`plain`,assume:.65},{key:`avg`,label:`Average load`,unit:`qps`},{key:`peak`,label:`Peak load`,unit:`qps`},{key:`servers`,label:`Servers needed`,unit:`count`}],eqs:[{out:`avg`,terms:[[`dau`,1],[`requests`,1],[86400,-1]]},{out:`peak`,terms:[[`avg`,1],[`peakFactor`,1]]},{out:`servers`,terms:[[`peak`,1],[`capacity`,-1],[`target`,-1]]}],starts:[{key:`dau`,value:1e7},{key:`peak`,value:2e4},{key:`servers`,value:50}]},lab:{secondsPerTick:f,params:[{key:`traffic`,label:`Incoming traffic`,kind:`range`,min:0,max:3e3,step:50,unit:`req/s`},{key:`strategy`,label:`Routing strategy`,kind:`choice`,options:[{value:`round-robin`,label:`Round robin`},{value:`least-connections`,label:`Least connections`}]},{key:`capA`,label:`Server A capacity`,kind:`range`,min:100,max:2e3,step:100,unit:`req/s`},{key:`capB`,label:`Server B capacity`,kind:`range`,min:100,max:2e3,step:100,unit:`req/s`},{key:`capC`,label:`Server C capacity`,kind:`range`,min:100,max:2e3,step:100,unit:`req/s`},{key:`healthCheck`,label:`Health check interval`,kind:`range`,min:1,max:30,step:1,unit:`s`}],defaults:{traffic:1500,capA:1e3,capB:1e3,capC:200,strategy:`round-robin`,healthCheck:5},create:e=>({servers:[p(`A`,e.capA),p(`B`,e.capB),p(`C`,e.capC)],counter:0,fluidCounter:0,carry:0,now:0,wait:0,failed:0,lastPick:``}),step(e,t,n){e.servers[0].capacity=t.capA,e.servers[1].capacity=t.capB,e.servers[2].capacity=t.capC,u(e,t.strategy,t.traffic,t.healthCheck,f,n)},sample:e=>({measured:m(e),predicted:h(e)}),charts:[{title:`Requests waiting across all servers`,series:[{key:`measured`,label:`Measured`,role:`measured`},{key:`predicted`,label:`Predicted`,role:`predicted`}]}],metrics(t,a){let o=t.servers.filter(e=>e.up).reduce((e,t)=>e+t.capacity,0);return[{label:`Average utilization`,value:o?i(a.traffic/o):`No capacity`,tone:o&&a.traffic/o<1?void 0:`bad`},{label:`Backlog growth`,value:`${n(g(t,a))} req/s`,role:`predicted`},{label:`Wait for a new request`,value:e(t.wait),role:`measured`},{label:`Failed requests`,value:r(t.failed),role:`measured`,tone:t.failed?`bad`:void 0}]},math(e,t){let n=e.servers.filter(e=>e.up);if(!n.length)return[{expr:`No servers are up`,result:`every request fails`,tone:`bad`}];let a=n.reduce((e,t)=>e+t.capacity,0),o=t.traffic/a,s=[{expr:`Average: ${r(t.traffic)} ÷ ${r(a)} total capacity`,result:`${i(o)}, ${o<1?`looks healthy`:`overloaded`}`,tone:o<1?`good`:`bad`}];if(t.strategy===`round-robin`){let e=t.traffic/n.length;s.push({expr:`Round robin: ${r(t.traffic)} ÷ ${n.length} servers`,result:`${r(e)} req/s each`,tone:`good`});let i=n.filter(t=>e>t.capacity);for(let t of i)s.push({expr:`Server ${t.name}: ${r(e)} − ${r(t.capacity)} capacity`,result:`+${r(e-t.capacity)} req/s backlog`,tone:`bad`});i.length||s.push({expr:`Every server can absorb its share`,result:`no backlog`,tone:`good`})}else t.traffic<=a?s.push({expr:`Least connections: ${r(a)} − ${r(t.traffic)}`,result:`${r(a-t.traffic)} req/s spare`,tone:`good`}):s.push({expr:`Least connections: ${r(t.traffic)} − ${r(a)}`,result:`+${r(t.traffic-a)} req/s backlog`,tone:`bad`});return s},views:e=>[{kind:`bars`,title:`Load on each server, as a share of its capacity`,max:1,marker:{value:1,label:`100% of capacity`},items:e.servers.map(e=>{let t=e.up?e.rate/e.capacity:0;return{label:`Server ${e.name}`,value:t,display:e.up?i(t):`Down`,tone:e.up?t>1.02?`bad`:`neutral`:`bad`}})},{kind:`cells`,title:`Queue on each server`,items:e.servers.map(e=>({label:e.name,value:e.up?t(e.queue):`${t(e.lost)} lost`,tone:e.up?e.queue>500?`warn`:`neutral`:`bad`}))}],actions:[{key:`kill-a`,label:`Kill or restore server A`,run:e=>_(e,0)},{key:`kill-b`,label:`Kill or restore server B`,run:e=>_(e,1)},{key:`kill-c`,label:`Kill or restore server C`,run:e=>_(e,2)}],trace(e,n){let i=e.servers.map(e=>`${e.name}=${e.up?t(e.queue):`down`}`).join(` `);return{values:{live:e.servers.filter(e=>e.routable).map(e=>e.name).join(`, `)||`none`,rr:n.strategy===`round-robin`?`i=${r(e.counter)}, picks ${e.lastPick}`:``,lc:n.strategy===`least-connections`?`${i}, picks ${e.lastPick}`:``},active:[n.strategy===`round-robin`?`rr`:`lc`]}},experiments:[{title:`Healthy on average`,ticks:150,question:`Traffic is 1,500 req/s against 2,200 total capacity, so average utilization is 68%. With round robin, what happens to the queue?`,options:[`It stays near zero, since 68% is comfortable`,`It grows by about 300 requests every second`,`It grows by about 700 requests every second`],answer:1,explain:`Round robin gives every server 500 req/s, but server C can only do 200. It falls behind by exactly 300 a second, forever. Average utilization hid the problem, because the spare capacity on A and B can't help a queue that has already formed on C.`,check:(e,t,n)=>{let r=(n[n.length-1].measured-n[50].measured)/((n.length-51)*f);return r>250&&r<350}},{title:`Route around the slow server`,set:{strategy:`least-connections`},ticks:150,question:`Same servers, same traffic, but now the balancer picks the shortest queue. What happens to the backlog?`,options:[`It still grows by 300 req/s`,`It grows, but more slowly`,`It stays close to zero`],answer:2,explain:`Least connections reacts to load, so server C simply gets less work once its queue builds. Total capacity of 2,200 exceeds traffic of 1,500, so no queue can grow without limit. The strategy, not the hardware, was the bug.`,check:(e,t,n)=>n[n.length-1].measured<150},{title:`Lose a server`,set:{strategy:`least-connections`},act:[`kill-a`],actAt:25,ticks:200,question:`With least connections running, server A dies. Capacity drops to 1,200 against 1,500 req/s of traffic. How fast does the backlog grow?`,options:[`It doesn't, the other servers absorb it`,`About 300 req/s`,`About 1,500 req/s`],answer:1,explain:`Traffic minus remaining capacity is 1,500 − 1,200 = 300 req/s of backlog, and no routing strategy can beat that. It's why you plan capacity for N−1 servers. Requests also fail until the health check notices, which is why that interval matters.`,check:(e,t,n)=>{let r=(n[n.length-1].measured-n[100].measured)/((n.length-101)*f);return r>240&&r<360}},{title:`Run close to the limit`,set:{strategy:`least-connections`,traffic:2100},ticks:300,question:`Traffic is 2,100 against 2,200 capacity, or 95% utilization. The simple math says no backlog. What does the run show?`,options:[`No queue at all, the math is right`,`A real queue forms, larger than the math predicts`,`The system collapses and the queue grows forever`],answer:1,explain:`Real traffic is bursty. At 95% there's so little spare capacity that a random burst takes a long time to drain, so queues form even though the average fits. It's why teams target 60 to 70% utilization. The gap between the two lines is the cost of randomness.`,check:(e,t,n)=>{let r=n.slice(100),i=e=>r.reduce((t,n)=>t+n[e],0)/r.length;return i(`measured`)>i(`predicted`)*1.5}}]},pseudocode:[{code:`on_request(request):`},{code:`  live = servers passing health checks`,id:`live`},{code:`  if strategy == round_robin:`},{code:`    server = live[i % len(live)]; i += 1`,id:`rr`},{code:`  else:`},{code:`    server = live with fewest connections`,id:`lc`},{code:`  send request to server`}],sources:[{name:`engine.ts`,code:a,lang:`ts`}],tradeoffs:[{choice:`Round robin`,gain:`No state, trivially fast`,cost:`Overloads slow servers, as the lab shows`},{choice:`Least connections`,gain:`Adapts to slow servers`,cost:`Must track live connection counts`},{choice:`Consistent hash on user`,gain:`The same user reaches the same server, so caches work`,cost:`Hot users create hot servers`},{choice:`Short health check interval`,gain:`Finds failures faster, so fewer requests fail`,cost:`More probe traffic, and may eject servers on a blip`}],interview:[{q:`What if the load balancer itself fails?`,a:`Run two in active-passive or active-active, sharing a virtual IP or fronted by DNS. If one stops sending heartbeats, the other takes over the address.`},{q:`How do you handle sticky sessions?`,a:`Avoid them when you can. Move session data to a shared store like Redis so servers stay stateless. If you must have them, hash the session ID, and accept that a server failure logs out its users.`},{q:`How many servers should you provision?`,a:`Enough to handle peak load at your target utilization with one server down. Use the estimator above, then add one. Running at 95% looks efficient until the first burst, as the last experiment shows.`},{q:`How does a new server warm up?`,a:`A cold server with an empty cache can be overwhelmed by a full share of traffic. Slow start ramps its share up over a minute or so.`}],mistakes:[`Quoting average utilization without checking per-server load.`,`Forgetting that the load balancer needs redundancy too.`,`Capacity planning for the normal case, with no room to lose a server at peak.`]};export{v as default};