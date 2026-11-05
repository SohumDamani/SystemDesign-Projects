import{a as e,i as t,o as n,s as r,u as i}from"./index-ar0glIxf.js";var a=`// A live city: drivers in a grid index, and two ways of matching them with riders.
export const CITY_METERS = 10000;
export const CELL_METERS = 500;
export const SPEED = 10; // meters per second

export interface Driver {
  id: number;
  x: number;
  y: number;
  /** Where the system last heard this driver was. It can be out of date. */
  knownX: number;
  knownY: number;
  busyUntil: number;
}

export interface Rider {
  id: number;
  x: number;
  y: number;
  requestedAt: number;
}

const cellOf = (v: number) => Math.min(Math.floor(CITY_METERS / CELL_METERS) - 1, Math.max(0, Math.floor(v / CELL_METERS)));
const key = (cx: number, cy: number) => cy * 1000 + cx;

/** Maps each grid cell to the idle drivers last seen there. */
export class GridIndex {
  private cells = new Map<number, Set<Driver>>();
  /** Drivers looked at, across all searches. */
  visited = 0;

  add(d: Driver) {
    const k = key(cellOf(d.knownX), cellOf(d.knownY));
    let cell = this.cells.get(k);
    if (!cell) this.cells.set(k, (cell = new Set()));
    cell.add(d);
  }

  remove(d: Driver) {
    this.cells.get(key(cellOf(d.knownX), cellOf(d.knownY)))?.delete(d);
  }

  /** Searches outward one ring of cells at a time, and stops when nothing nearer can exist. */
  nearest(x: number, y: number): Driver | undefined {
    const cx = cellOf(x);
    const cy = cellOf(y);
    const maxRing = Math.ceil(CITY_METERS / CELL_METERS);
    let best: Driver | undefined;
    let bestDist = Infinity;
    for (let ring = 0; ring <= maxRing; ring++) {
      if (best && (ring - 1) * CELL_METERS > bestDist) break;
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const cell = this.cells.get(key(cx + dx, cy + dy));
          if (!cell) continue;
          for (const d of cell) {
            this.visited++;
            const dist = Math.hypot(d.knownX - x, d.knownY - y);
            if (dist < bestDist) {
              bestDist = dist;
              best = d;
            }
          }
        }
      }
    }
    return best;
  }
}

export interface Match {
  rider: Rider;
  driver: Driver;
}

/**
 * Batched matching: collect riders for a few seconds, then assign the closest pairs first
 * across everyone. A global view avoids giving one rider the driver that another needed.
 */
export function matchBatch(riders: Rider[], drivers: Driver[]): Match[] {
  const pairs: { r: Rider; d: Driver; dist: number }[] = [];
  for (const r of riders) for (const d of drivers) pairs.push({ r, d, dist: Math.hypot(d.knownX - r.x, d.knownY - r.y) });
  pairs.sort((a, b) => a.dist - b.dist);
  const usedRiders = new Set<number>();
  const usedDrivers = new Set<number>();
  const matches: Match[] = [];
  for (const p of pairs) {
    if (usedRiders.has(p.r.id) || usedDrivers.has(p.d.id)) continue;
    usedRiders.add(p.r.id);
    usedDrivers.add(p.d.id);
    matches.push({ rider: p.r, driver: p.d });
  }
  return matches;
}
`,o=1e4,s=e=>Math.min(Math.floor(o/500)-1,Math.max(0,Math.floor(e/500))),c=(e,t)=>t*1e3+e,l=class{cells=new Map;visited=0;add(e){let t=c(s(e.knownX),s(e.knownY)),n=this.cells.get(t);n||this.cells.set(t,n=new Set),n.add(e)}remove(e){this.cells.get(c(s(e.knownX),s(e.knownY)))?.delete(e)}nearest(e,t){let n=s(e),r=s(t),i=Math.ceil(o/500),a,l=1/0;for(let o=0;o<=i&&!(a&&(o-1)*500>l);o++)for(let i=-o;i<=o;i++)for(let s=-o;s<=o;s++){if(Math.max(Math.abs(s),Math.abs(i))!==o)continue;let u=this.cells.get(c(n+s,r+i));if(u)for(let n of u){this.visited++;let r=Math.hypot(n.knownX-e,n.knownY-t);r<l&&(l=r,a=n)}}return a}};function u(e,t){let n=[];for(let r of e)for(let e of t)n.push({r,d:e,dist:Math.hypot(e.knownX-r.x,e.knownY-r.y)});n.sort((e,t)=>e.dist-t.dist);let r=new Set,i=new Set,a=[];for(let e of n)r.has(e.r.id)||i.has(e.d.id)||(r.add(e.r.id),i.add(e.d.id),a.push({rider:e.r,driver:e.d}));return a}var d=i(),f=1,p=180;function m(e){let t=e.map(({x:e,y:t},n)=>({id:n,x:e,y:t,knownX:e,knownY:t,busyUntil:0})),n=new l;for(let e of t)n.add(e);return{drivers:t,index:n,waiting:[],pickupSum:0,pickupEma:0,matched:0,cancelled:0,errorSum:0,batchTimer:0}}function h(t,n,r,i,a,s){let c=Math.hypot(a.knownX-i.x,a.knownY-i.y),l=Math.hypot(a.x-i.x,a.y-i.y),u=l/10;t.index.remove(a),t.pickupSum+=u,t.pickupEma=t.pickupEma?t.pickupEma*.97+u*.03:u,t.errorSum+=Math.abs(l-c),t.matched++,a.busyUntil=n.now+u+s.exponential(r.tripMinutes*60),a.x=s.next()*o,a.y=s.next()*o,n.lastMatch=`Rider ${i.id} gets driver ${a.id}, ${e(u)} away`}function g(e,t,n,r){for(let i of e.drivers)i.busyUntil>t.now||(i.busyUntil>t.now-f&&i.busyUntil>0?(i.knownX=i.x,i.knownY=i.y,e.index.add(i)):(i.x=Math.min(o,Math.max(0,i.x+r.gaussian(0,8))),i.y=Math.min(o,Math.max(0,i.y+r.gaussian(0,8))),(t.now+i.id)%n.updateSeconds<f&&(e.index.remove(i),i.knownX=i.x,i.knownY=i.y,e.index.add(i))))}var _=(e,t)=>e.drivers.filter(e=>e.busyUntil<=t),v=e=>e.matched?e.pickupSum/e.matched:0;function y({state:e}){let t=e.batched,n=420/o;return(0,d.jsxs)(`div`,{className:`lab-panel`,children:[(0,d.jsx)(`h4`,{children:`The city: idle drivers in green, busy in gray, waiting riders in orange`}),(0,d.jsxs)(`svg`,{viewBox:`0 0 420 420`,className:`lab-svg`,style:{maxWidth:440},role:`img`,"aria-label":`${_(t,e.now).length} idle drivers and ${t.waiting.length} waiting riders.`,children:[t.drivers.map(t=>(0,d.jsx)(`circle`,{cx:t.x*n,cy:t.y*n,r:`2.4`,fill:t.busyUntil>e.now?`var(--line-strong)`:`#4cc98a`},t.id)),t.waiting.map(e=>(0,d.jsx)(`rect`,{x:e.x*n-3,y:e.y*n-3,width:`6`,height:`6`,fill:`var(--predicted)`},e.id))]})]})}var b={problem:[`A ride-sharing service has to match a rider with a nearby driver within seconds, using locations that change constantly. Millions of drivers send GPS updates every few seconds, so writes vastly outnumber actual ride requests.`,`There are two core problems. The first is finding nearby drivers quickly, which is a geo index problem. The second is assigning them well: the closest driver for one rider may be a bad choice for the system as a whole.`],functional:[`Riders request a ride, and see an estimated pickup time`,`Drivers report location, and accept rides`,`Match riders to nearby drivers, and track the trip`],nonFunctional:[`Matching takes only a few seconds`,`Handles a huge rate of location writes`,`A driver is never matched to two riders at once`],diagram:{nodes:[{id:`r`,label:`Rider app`,col:0,row:0,kind:`client`,note:`Requests a ride, and sees the driver approaching on the map.`},{id:`d`,label:`Driver app`,col:0,row:2,kind:`client`,note:`Sends location every few seconds, over a persistent connection.`},{id:`m`,label:`Matching service`,col:1,row:0,note:`Finds candidates, and assigns riders in small batches.`},{id:`l`,label:`Location service`,col:1,row:2,note:`Handles a huge stream of location updates.`},{id:`g`,label:`Geo index`,col:2,row:1,kind:`store`,note:`An in-memory grid of driver locations, sharded by city or cell. Losing it is fine, as updates rebuild it in seconds.`},{id:`t`,label:`Trip database`,col:2,row:0,kind:`store`,note:`Durable trip records. Assigning a driver has to be atomic, so that they can't be double-booked.`},{id:`k`,label:`Kafka`,col:2,row:2,kind:`queue`,note:`Streams locations to analytics, pricing, and ETA models.`}],edges:[{from:`r`,to:`m`},{from:`d`,to:`l`},{from:`l`,to:`g`},{from:`m`,to:`g`},{from:`m`,to:`t`},{from:`l`,to:`k`,dashed:!0}]},ideas:[{title:`A geo index in memory`,body:`Locations change too fast for a normal database index. Keep them in memory, in a grid or geohash, sharded by area. If you lose it, the next round of updates rebuilds it within seconds.`},{title:`Batched matching`,body:`Rather than assigning each rider instantly, gather requests for a few seconds, and optimize across all of them. Riders barely notice the wait, and overall pickup time falls.`},{title:`Avoiding double booking`,body:`Two riders mustn't get the same driver. Use an atomic state change on the driver, and treat offers as leases with an expiry, so that a driver who doesn't answer becomes available again.`},{title:`Surge pricing`,body:`When demand exceeds supply, no algorithm helps. Raising prices reduces demand and attracts drivers, and it requires estimating supply and demand per area in near real time.`}],estimator:{vars:[{key:`drivers`,label:`Active drivers`,unit:`count`},{key:`interval`,label:`Seconds between location updates`,unit:`plain`,assume:4},{key:`updateBytes`,label:`Bytes per update`,unit:`plain`,assume:100},{key:`trips`,label:`Trips per driver per day`,unit:`plain`,assume:15},{key:`locationQps`,label:`Location updates`,unit:`qps`},{key:`ingest`,label:`Location bandwidth`,unit:`bytesPerSec`},{key:`matchQps`,label:`Ride requests`,unit:`qps`}],eqs:[{out:`locationQps`,terms:[[`drivers`,1],[`interval`,-1]]},{out:`ingest`,terms:[[`locationQps`,1],[`updateBytes`,1]]},{out:`matchQps`,terms:[[`drivers`,1],[`trips`,1],[86400,-1]]}],starts:[{key:`drivers`,value:1e6},{key:`locationQps`,value:5e5},{key:`matchQps`,value:200}]},lab:{secondsPerTick:f,params:[{key:`drivers`,label:`Drivers`,kind:`range`,min:50,max:1e3,step:50,rebuild:!0},{key:`ridersPerMin`,label:`Ride requests`,kind:`range`,min:5,max:300,step:5,unit:`per min`},{key:`tripMinutes`,label:`Average trip`,kind:`range`,min:2,max:40,step:1,unit:`min`},{key:`batchSeconds`,label:`Batch window, for batched matching`,kind:`range`,min:1,max:30,step:1,unit:`s`},{key:`updateSeconds`,label:`Driver location update interval`,kind:`range`,min:1,max:120,step:1,unit:`s`}],defaults:{drivers:300,ridersPerMin:25,tripMinutes:5,batchSeconds:5,updateSeconds:4},create(e,t){let n=Array.from({length:e.drivers},()=>({x:t.next()*o,y:t.next()*o}));return{now:0,greedy:m(n),batched:m(n),nextRider:1,requested:0,lastMatch:``,searches:0}},step(e,t,n){e.now+=f,g(e.greedy,e,t,n),g(e.batched,e,t,n);for(let r=n.poisson(t.ridersPerMin/60*f);r>0;r--){let t={id:e.nextRider++,x:n.next()*o,y:n.next()*o,requestedAt:e.now};e.requested++,e.greedy.waiting.push({...t}),e.batched.waiting.push({...t})}if(e.greedy.waiting=e.greedy.waiting.filter(r=>{let i=e.greedy.index.nearest(r.x,r.y);return e.searches++,!i||(h(e.greedy,e,t,r,i,n),!1)}),e.batched.batchTimer+=f,e.batched.batchTimer>=t.batchSeconds){e.batched.batchTimer=0;for(let{rider:r,driver:i}of u(e.batched.waiting,_(e.batched,e.now)))h(e.batched,e,t,r,i,n),e.batched.waiting=e.batched.waiting.filter(e=>e.id!==r.id)}for(let t of[e.greedy,e.batched])t.waiting=t.waiting.filter(n=>e.now-n.requestedAt<p||(t.cancelled++,!1))},sample:(e,t)=>{let n=t.ridersPerMin/60*(t.tripMinutes*60+v(e.greedy));return{greedy:e.greedy.pickupEma,batched:e.batched.pickupEma,busy:e.greedy.drivers.length-_(e.greedy,e.now).length,busyMath:Math.min(t.drivers,n)}},charts:[{title:`Pickup time for the same riders`,unit:`s`,series:[{key:`greedy`,label:`Nearest driver now`,role:`measured`},{key:`batched`,label:`Batched`,role:`other`}]},{title:`Drivers on a trip`,series:[{key:`busy`,label:`Measured`,role:`measured`},{key:`busyMath`,label:`Math`,role:`predicted`}]}],metrics(t,i){let a=i.drivers/(i.tripMinutes*60),o=i.ridersPerMin/60;return[{label:`Driver utilization`,value:r(Math.min(1,o/a)),role:`predicted`,tone:o>=a?`bad`:o/a>.8?`warn`:`good`},{label:`Pickup, nearest now`,value:e(v(t.greedy)),role:`measured`},{label:`Pickup, batched`,value:e(v(t.batched)),role:`measured`},{label:`Drivers checked per match`,value:t.searches?(t.greedy.index.visited/t.searches).toFixed(1):`0`,role:`measured`},{label:`Rides cancelled`,value:n(t.greedy.cancelled),role:`measured`,tone:t.greedy.cancelled?`bad`:`good`},{label:`Location error at match`,value:`${n(t.greedy.matched?t.greedy.errorSum/t.greedy.matched:0)} m`,role:`measured`}]},math(e,r){let i=r.tripMinutes*60;return[{expr:`Most rides per minute: ${r.drivers} drivers ÷ ${r.tripMinutes} min`,result:`${n(r.drivers/r.tripMinutes)}/min`,tone:r.ridersPerMin<r.drivers/r.tripMinutes?`good`:`bad`},{expr:`Drivers busy: ${(r.ridersPerMin/60).toFixed(2)} rides/s × ${i} s`,result:`${n(r.ridersPerMin/60*i)} of ${r.drivers}`},{expr:`Location writes: ${r.drivers} drivers ÷ ${r.updateSeconds} s`,result:`${t(r.drivers/r.updateSeconds)}/s`}]},View:y,trace:e=>({values:{checked:e.searches?`${(e.greedy.index.visited/e.searches).toFixed(1)} drivers per search`:``,match:e.lastMatch,wait:`${e.batched.waiting.length} waiting`}}),experiments:[{title:`Use a geo index`,set:{drivers:800,ridersPerMin:60},ticks:120,question:`A rider requests a car, with 800 drivers in the city. Using a grid index that searches outward from the rider, how many drivers get looked at?`,options:[`A few dozen or fewer`,`About half`,`All 800`],answer:0,explain:`Only cells near the rider are checked, and the search stops once nothing closer can exist. That's what makes matching fast at city scale, where a real system may have millions of drivers worldwide.`,check:e=>e.greedy.index.visited/e.searches<40},{title:`Not enough drivers`,set:{drivers:100,ridersPerMin:60,tripMinutes:5},ticks:600,question:`There are 100 drivers, trips last 5 minutes, and 60 rides are requested per minute. Can they keep up?`,options:[`Yes`,`No, at most 20 rides a minute are possible, so riders give up`],answer:1,explain:`Each driver finishes 1 trip every 5 minutes, so 100 drivers handle 20 a minute. No matching algorithm can fix a capacity shortage. That's why surge pricing exists: to attract drivers and reduce demand.`,check:e=>e.greedy.cancelled>20},{title:`Wait, and match better`,set:{drivers:200,ridersPerMin:38,tripMinutes:5,batchSeconds:15},ticks:900,question:`Drivers are nearly all busy. Compare taking the nearest driver immediately, with waiting 15 seconds and matching everyone together. Which gives shorter pickups?`,options:[`Immediately, since it doesn't wait`,`Batched, as it can avoid wasting scarce drivers`],answer:1,explain:`When drivers are scarce, greedy matching can send a far-away driver to one rider, when another rider was right next to them. A small batch window sees both, and pairs them better. When drivers are plentiful, the two are nearly equal.`,check:e=>v(e.batched)<v(e.greedy)&&e.batched.matched>50},{title:`Stale locations`,set:{drivers:300,ridersPerMin:60,updateSeconds:120},ticks:300,question:`If drivers only report their location every 2 minutes, what happens to the distance the system thinks a driver is away?`,options:[`It's still accurate`,`It's off by a noticeable amount, so matches get worse`],answer:1,explain:`You're matching against where drivers were, not where they are. Real systems send updates every few seconds, and that's why location writes dominate a ride-sharing system's traffic, far exceeding the ride requests themselves.`,check:e=>e.greedy.errorSum/e.greedy.matched>20}]},pseudocode:[{code:`every few seconds:`},{code:`  riders = everyone waiting`,id:`wait`},{code:`  drivers = idle drivers near them`,id:`checked`},{code:`  sort all rider-driver pairs by distance`},{code:`  take pairs in order, skipping anyone already used`},{code:`  atomically mark each driver as assigned`,id:`match`}],sources:[{name:`engine.ts`,code:a,lang:`ts`}],tradeoffs:[{choice:`Nearest driver now`,gain:`Simple and instant`,cost:`Wastes drivers when they're scarce`},{choice:`Batched matching`,gain:`Shorter pickups overall`,cost:`A few seconds of extra wait, and more compute`},{choice:`Frequent location updates`,gain:`Accurate matching and ETAs`,cost:`Heavy write load and more phone battery`},{choice:`Grid index`,gain:`Simple and fast`,cost:`Uneven cell density, which S2 or H3 cells handle better`}],interview:[{q:`How do you shard the geo index?`,a:`By city or by geographic cell, since matches are local. Busy cities need many shards while quiet ones share. Trips crossing a boundary mean querying neighboring cells.`},{q:`What if a driver doesn't respond to an offer?`,a:`Offers are leases with a short expiry, around 10 to 15 seconds. When one expires, the driver is free again, and the rider goes back into the next batch.`},{q:`Do location updates need to be durable?`,a:`Not for matching, since the next update replaces them within seconds. Write them to memory for matching, and stream them to cheap storage for analysis and for records of the trip.`},{q:`How do you estimate arrival time?`,a:`Route on a road graph, using live and historical speeds. Machine learning corrects for local patterns, as covered in the maps lesson.`}],mistakes:[`Writing every GPS update to a transactional database.`,`Using straight-line distance as if it were travel time.`,`Letting one driver be offered to two riders at once.`]};export{b as default};