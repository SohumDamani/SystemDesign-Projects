import{n as e}from"./rolldown-runtime-WkwZ5CU-.js";import{b as t,d as n,f as r,g as i,p as a}from"./index-n79SFkCo.js";var o=e(t(),1),s=`// Real shortest-path search on a road graph: Dijkstra, and A* with an adjustable heuristic.
import type { Rng } from '../../core/rng';

export interface Edge {
  to: number;
  meters: number;
  speed: number; // meters per second, free flowing
  traffic: number; // travel-time multiplier, 1 when clear
}

export interface RoadGraph {
  width: number;
  height: number;
  edges: Edge[][];
  xs: Float64Array;
  ys: Float64Array;
  maxSpeed: number;
}

export const edgeTime = (e: Edge) => (e.meters / e.speed) * e.traffic;

/** A street grid with fast arterial roads every few blocks. */
export function buildGraph(width: number, height: number, rng: Rng): RoadGraph {
  const n = width * height;
  const edges: Edge[][] = Array.from({ length: n }, () => []);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const BLOCK = 200;
  let maxSpeed = 0;
  const id = (x: number, y: number) => y * width + x;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      xs[id(x, y)] = x * BLOCK + rng.range(-30, 30);
      ys[id(x, y)] = y * BLOCK + rng.range(-30, 30);
    }
  }
  const connect = (a: number, b: number, speed: number) => {
    const meters = Math.hypot(xs[a] - xs[b], ys[a] - ys[b]);
    edges[a].push({ to: b, meters, speed, traffic: 1 });
    edges[b].push({ to: a, meters, speed, traffic: 1 });
    maxSpeed = Math.max(maxSpeed, speed);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x + 1 < width) connect(id(x, y), id(x + 1, y), y % 6 === 0 ? 25 : rng.range(8, 14));
      if (y + 1 < height) connect(id(x, y), id(x, y + 1), x % 6 === 0 ? 25 : rng.range(8, 14));
    }
  }
  return { width, height, edges, xs, ys, maxSpeed };
}

/** A minimal binary heap, ordered by priority. */
class Heap {
  private items: { node: number; priority: number }[] = [];

  get size() {
    return this.items.length;
  }

  push(node: number, priority: number) {
    const a = this.items;
    a.push({ node, priority });
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].priority <= a[i].priority) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }

  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < a.length && a[l].priority < a[smallest].priority) smallest = l;
        if (r < a.length && a[r].priority < a[smallest].priority) smallest = r;
        if (smallest === i) break;
        [a[smallest], a[i]] = [a[i], a[smallest]];
        i = smallest;
      }
    }
    return top.node;
  }
}

export interface Route {
  path: number[];
  seconds: number;
  visited: number[];
}

/**
 * Explores nodes in order of known time + estimated time remaining.
 * heuristicWeight = 0 is Dijkstra, 1 is A*, and above 1 is faster but no longer optimal.
 */
export function shortestPath(g: RoadGraph, from: number, to: number, heuristicWeight: number): Route {
  const n = g.edges.length;
  const best = new Float64Array(n).fill(Infinity);
  const previous = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const heap = new Heap();
  const visited: number[] = [];
  const remaining = (node: number) => (Math.hypot(g.xs[node] - g.xs[to], g.ys[node] - g.ys[to]) / g.maxSpeed) * heuristicWeight;

  best[from] = 0;
  heap.push(from, remaining(from));
  while (heap.size) {
    const node = heap.pop();
    if (done[node]) continue;
    done[node] = 1;
    visited.push(node);
    if (node === to) break;
    for (const edge of g.edges[node]) {
      const time = best[node] + edgeTime(edge);
      if (time < best[edge.to]) {
        best[edge.to] = time;
        previous[edge.to] = node;
        heap.push(edge.to, time + remaining(edge.to));
      }
    }
  }
  const path: number[] = [];
  for (let at = to; at !== -1; at = previous[at]) path.unshift(at);
  return { path, seconds: best[to], visited };
}

/** Slows every road along the middle stretch of a route. */
export function addTraffic(g: RoadGraph, path: number[], factor: number) {
  const start = Math.floor(path.length / 3);
  const end = Math.max(Math.ceil((2 * path.length) / 3), start + 2);
  for (let i = start; i < end - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    for (const e of g.edges[a]) if (e.to === b) e.traffic = factor;
    for (const e of g.edges[b]) if (e.to === a) e.traffic = factor;
  }
}

export function clearTraffic(g: RoadGraph) {
  for (const list of g.edges) for (const e of list) e.traffic = 1;
}
`,c=e=>e.meters/e.speed*e.traffic;function l(e,t,n){let r=e*t,i=Array.from({length:r},()=>[]),a=new Float64Array(r),o=new Float64Array(r),s=0,c=(t,n)=>n*e+t;for(let r=0;r<t;r++)for(let t=0;t<e;t++)a[c(t,r)]=t*200+n.range(-30,30),o[c(t,r)]=r*200+n.range(-30,30);let l=(e,t,n)=>{let r=Math.hypot(a[e]-a[t],o[e]-o[t]);i[e].push({to:t,meters:r,speed:n,traffic:1}),i[t].push({to:e,meters:r,speed:n,traffic:1}),s=Math.max(s,n)};for(let r=0;r<t;r++)for(let i=0;i<e;i++)i+1<e&&l(c(i,r),c(i+1,r),r%6==0?25:n.range(8,14)),r+1<t&&l(c(i,r),c(i,r+1),i%6==0?25:n.range(8,14));return{width:e,height:t,edges:i,xs:a,ys:o,maxSpeed:s}}var u=class{items=[];get size(){return this.items.length}push(e,t){let n=this.items;n.push({node:e,priority:t});let r=n.length-1;for(;r>0;){let e=r-1>>1;if(n[e].priority<=n[r].priority)break;[n[e],n[r]]=[n[r],n[e]],r=e}}pop(){let e=this.items,t=e[0],n=e.pop();if(e.length){e[0]=n;let t=0;for(;;){let n=2*t+1,r=n+1,i=t;if(n<e.length&&e[n].priority<e[i].priority&&(i=n),r<e.length&&e[r].priority<e[i].priority&&(i=r),i===t)break;[e[i],e[t]]=[e[t],e[i]],t=i}}return t.node}};function d(e,t,n,r){let i=e.edges.length,a=new Float64Array(i).fill(1/0),o=new Int32Array(i).fill(-1),s=new Uint8Array(i),l=new u,d=[],f=t=>Math.hypot(e.xs[t]-e.xs[n],e.ys[t]-e.ys[n])/e.maxSpeed*r;for(a[t]=0,l.push(t,f(t));l.size;){let t=l.pop();if(!s[t]){if(s[t]=1,d.push(t),t===n)break;for(let n of e.edges[t]){let e=a[t]+c(n);e<a[n.to]&&(a[n.to]=e,o[n.to]=t,l.push(n.to,e+f(n.to)))}}}let p=[];for(let e=n;e!==-1;e=o[e])p.unshift(e);return{path:p,seconds:a[n],visited:d}}function f(e,t,n){let r=Math.floor(t.length/3),i=Math.max(Math.ceil(2*t.length/3),r+2);for(let a=r;a<i-1;a++){let r=t[a],i=t[a+1];for(let t of e.edges[r])t.to===i&&(t.traffic=n);for(let t of e.edges[i])t.to===r&&(t.traffic=n)}}function p(e){for(let t of e.edges)for(let e of t)e.traffic=1}var m=i(),h=.5,g=5,_=8,v=e=>e.algorithm===`dijkstra`?0:e.weight;function y(e,t){e.route=d(e.graph,e.from,e.to,v(t)),e.optimal=d(e.graph,e.from,e.to,0),e.routeId++,e.visitedSum+=e.route.visited.length,e.dijkstraSum+=e.optimal.visited.length,e.gapSum+=e.route.seconds/e.optimal.seconds-1,e.routes++}function b(e,t){let n=e.graph.edges.length;e.from=t.int(n);do e.to=t.int(n);while(e.to===e.from)}function x({state:e}){let t=e.graph,i=520/((t.width-1)*200+60),a=((t.height-1)*200+60)*i,s=e=>(t.xs[e]+30)*i,c=e=>(t.ys[e]+30)*i,{roads:l,visited:u,path:d}=(0,o.useMemo)(()=>{let n=``,r=``;t.edges.forEach((e,t)=>{for(let i of e){if(i.to<t)continue;let e=`M${s(t).toFixed(1)} ${c(t).toFixed(1)}L${s(i.to).toFixed(1)} ${c(i.to).toFixed(1)}`;i.traffic>1?r+=e:n+=e}});let i=e.route.visited.map(e=>`M${(s(e)-2.2).toFixed(1)} ${(c(e)-2.2).toFixed(1)}h4.4v4.4h-4.4z`).join(``),a=e.route.path.map((e,t)=>`${t?`L`:`M`}${s(e).toFixed(1)} ${c(e).toFixed(1)}`).join(``);return{roads:{roadsD:n,jamD:r},visited:i,path:a}},[e.routeId,t]);return(0,m.jsxs)(`div`,{className:`lab-panel`,children:[(0,m.jsxs)(`h4`,{children:[`Nodes explored in blue, route in green, traffic in red. `,r(e.route.visited.length),` of `,r(t.edges.length),` nodes explored.`]}),(0,m.jsxs)(`svg`,{viewBox:`0 0 520 ${a.toFixed(0)}`,className:`lab-svg`,role:`img`,"aria-label":`Road grid. The route takes ${n(e.route.seconds)} and the search explored ${e.route.visited.length} nodes.`,children:[(0,m.jsx)(`path`,{d:l.roadsD,stroke:`var(--line-strong)`,strokeWidth:`0.8`,fill:`none`}),(0,m.jsx)(`path`,{d:u,fill:`var(--measured)`,fillOpacity:`0.5`}),(0,m.jsx)(`path`,{d:l.jamD,stroke:`#f58a8a`,strokeWidth:`3`,fill:`none`}),(0,m.jsx)(`path`,{d,stroke:`#4cc98a`,strokeWidth:`2.6`,fill:`none`,strokeLinejoin:`round`}),(0,m.jsx)(`circle`,{cx:s(e.from),cy:c(e.from),r:`5`,fill:`#4cc98a`}),(0,m.jsx)(`circle`,{cx:s(e.to),cy:c(e.to),r:`5`,fill:`var(--predicted)`})]})]})}var S={problem:[`A maps app does three different jobs. It serves map images, at any zoom level, fast. It turns location updates from millions of phones into live traffic. And it finds the best route across a road network with billions of edges.`,`The road graph for the world is far too large to search in one go, so systems break it into tiles and pre-compute summaries at several levels of detail. The lab runs real shortest-path search on a small city, so you can see why the choice of algorithm matters so much.`],functional:[`Show a map at any location and zoom level`,`Find the fastest route between two places`,`Give an accurate arrival time, updated for traffic`],nonFunctional:[`Accurate directions, and fast rendering`,`Efficient use of mobile data and battery`,`Handles millions of location updates per second`],diagram:{nodes:[{id:`u`,label:`Mobile app`,col:0,row:1,kind:`client`,note:`Batches GPS points every 15 seconds or so, to save battery and data.`},{id:`c`,label:`CDN`,col:1,row:0,kind:`external`,note:`Serves pre-rendered map tiles, named by zoom and position.`},{id:`n`,label:`Navigation service`,col:1,row:1,note:`Geocodes addresses, finds routes, and asks for ETAs.`},{id:`l`,label:`Location service`,col:1,row:2,note:`Accepts batches of GPS points from clients.`},{id:`r`,label:`Routing tiles`,col:2,row:1,kind:`store`,note:`The road graph split into tiles at several levels: local roads, arterials, and highways.`},{id:`k`,label:`Stream of locations`,col:2,row:2,kind:`queue`,note:`Feeds traffic estimates, map updates and ML models.`},{id:`t`,label:`Traffic database`,col:3,row:1,kind:`store`,note:`Current speeds per road, which feed the edge weights for routing and ETA.`}],edges:[{from:`u`,to:`c`},{from:`u`,to:`n`},{from:`u`,to:`l`},{from:`n`,to:`r`},{from:`l`,to:`k`},{from:`k`,to:`t`},{from:`t`,to:`r`,dashed:!0}]},ideas:[{title:`Map tiles`,body:`The world is split into a grid of images at each zoom level, with 4^z tiles at zoom z. Tiles are pre-rendered and sit on a CDN, with a URL named by zoom and position, or a geohash.`},{title:`Routing tiles`,body:`The graph is too big for one search. Split it into tiles that load on demand, at several levels of detail. A long drive uses local tiles at each end and highway tiles in between.`},{title:`A* search`,body:`Dijkstra is correct but explores in every direction. A* uses an estimate of the remaining distance to focus the search, and remains optimal if the estimate is never too high.`},{title:`Traffic as weights`,body:`Phones report speed, which becomes the weight on each road. Routing then needs no special traffic logic: it just searches a graph whose numbers change.`}],estimator:{vars:[{key:`dau`,label:`Daily active users`,unit:`count`},{key:`navMinutes`,label:`Minutes navigating per user per day`,unit:`plain`,assume:5},{key:`batchSeconds`,label:`Seconds between GPS batches`,unit:`plain`,assume:15},{key:`tiles`,label:`Map tiles at top zoom`,unit:`count`,assume:44e11},{key:`landShare`,label:`Share of tiles worth storing (0 to 1)`,unit:`plain`,assume:.1},{key:`tileBytes`,label:`Bytes per tile`,unit:`plain`,assume:1e5},{key:`uploads`,label:`GPS batch uploads`,unit:`qps`},{key:`tileStorage`,label:`Tile storage`,unit:`bytes`}],eqs:[{out:`uploads`,terms:[[`dau`,1],[`navMinutes`,1],[60,1],[`batchSeconds`,-1],[86400,-1]]},{out:`tileStorage`,terms:[[`tiles`,1],[`landShare`,1],[`tileBytes`,1]]}],starts:[{key:`dau`,value:1e9},{key:`uploads`,value:2e5}]},lab:{secondsPerTick:h,params:[{key:`algorithm`,label:`Algorithm`,kind:`choice`,options:[{value:`astar`,label:`A*`},{value:`dijkstra`,label:`Dijkstra`}]},{key:`weight`,label:`A* heuristic weight`,kind:`range`,min:1,max:5,step:.1},{key:`size`,label:`Grid width`,kind:`range`,min:20,max:70,step:5,unit:`blocks`,rebuild:!0}],defaults:{algorithm:`astar`,weight:1,size:50},create(e,t){let n={graph:l(e.size,Math.round(e.size*.7),t),tick:0,from:0,to:1,route:{path:[],seconds:0,visited:[]},optimal:{path:[],seconds:0,visited:[]},routeId:0,visitedSum:0,dijkstraSum:0,gapSum:0,routes:0,holdUntil:0};return b(n,t),y(n,e),n},step(e,t,n){e.tick++,e.tick>=e.holdUntil&&e.tick%g===0&&(b(e,n),y(e,t))},sample:e=>({visited:e.route.visited.length,dijkstra:e.optimal.visited.length,seconds:e.route.seconds,optimal:e.optimal.seconds}),charts:[{title:`Nodes explored for the current route`,series:[{key:`visited`,label:`Your settings`,role:`measured`},{key:`dijkstra`,label:`Dijkstra`,role:`other`}]},{title:`Route travel time`,unit:`s`,series:[{key:`seconds`,label:`Found`,role:`measured`},{key:`optimal`,label:`Optimal`,role:`predicted`}]}],metrics(e){return[{label:`Explored vs Dijkstra`,value:a(e.dijkstraSum?e.visitedSum/e.dijkstraSum:1),role:`measured`},{label:`Time above optimal`,value:a(e.routes?e.gapSum/e.routes:0,1),role:`measured`,tone:e.routes&&e.gapSum/e.routes>.005?`warn`:`good`},{label:`Current route`,value:n(e.route.seconds),role:`measured`},{label:`Road segments`,value:r(e.graph.edges.reduce((e,t)=>e+t.length,0)/2)}]},math(e,t){return[{expr:`Dijkstra explores outward in every direction: about ${r(e.optimal.visited.length)} nodes`,result:`always optimal`,tone:`good`},{expr:`A* adds straight-line time ÷ top speed × ${v(t).toFixed(1)}`,result:v(t)<=1?`still optimal`:`faster, may be longer`,tone:v(t)<=1?`good`:`warn`},{expr:`Map tiles at zoom z: 4^z, so z = 21`,result:`4.4 trillion tiles`}]},View:x,actions:[{key:`jam`,label:`Add traffic on the current route`,run:(e,t)=>{let n=e.route;f(e.graph,e.route.path,_);let r=d(e.graph,e.from,e.to,v(t));e.jam={beforeSeconds:n.seconds,afterSeconds:r.seconds,changed:r.path.join()!==n.path.join()},e.route=r,e.routeId++,e.holdUntil=e.tick+20}},{key:`clear`,label:`Clear all traffic`,run:(e,t)=>{p(e.graph),y(e,t)}}],views:e=>[{kind:`note`,title:`Last traffic event`,text:e.jam?`The route ${e.jam.changed?`changed to avoid the jam`:`stayed the same`}. Time went from ${n(e.jam.beforeSeconds)} to ${n(e.jam.afterSeconds)}, while driving through it would have been about ${_} times slower on that stretch.`:`Add traffic to the current route to see it re-plan.`}],trace:(e,t)=>({values:{h:`weight ${v(t).toFixed(1)}`,seen:r(e.route.visited.length),best:n(e.route.seconds)}}),experiments:[{title:`Aim for the destination`,set:{algorithm:`astar`,weight:1},ticks:200,question:`A* prefers nodes that are closer to the destination, using straight-line distance as a guide. How many nodes does it explore, compared with Dijkstra?`,options:[`About the same`,`Noticeably fewer, with the same route time`,`Fewer, but with longer routes`],answer:1,explain:`Dijkstra grows a circle in every direction, wasting effort on roads heading away from your goal. A* biases toward the target. As long as its estimate never overstates the remaining time, it still finds the fastest route.`,check:e=>e.visitedSum/e.dijkstraSum<.8&&e.gapSum/e.routes<.001},{title:`Overweight the guess`,set:{algorithm:`astar`,weight:4},ticks:200,question:`If you weigh the estimate 4 times more heavily, the search rushes toward the destination. What happens?`,options:[`Fewer nodes and still the best route`,`Far fewer nodes, but routes get a bit longer`],answer:1,explain:`An inflated heuristic overstates remaining time, so it may skip the best route. It trades a slightly slower trip for a much cheaper search. For a server handling many route requests, a few extra seconds can be an acceptable price.`,check:e=>e.visitedSum/e.dijkstraSum<.45&&e.gapSum/e.routes>.002},{title:`A traffic jam`,set:{algorithm:`astar`,weight:1},act:[`jam`],actAt:10,ticks:15,question:`Traffic makes the middle of your route 8 times slower. What should routing do?`,options:[`Stay on the route, and arrive 8 times later`,`Find another way, costing a little more than the original`],answer:1,explain:`Edge weights are travel time, so traffic only changes numbers in the graph. Re-running the same search finds a detour. Real systems stream speeds into these weights constantly, and re-route when a better option appears.`,check:e=>!!(e.jam&&e.jam.changed&&e.jam.afterSeconds>=e.jam.beforeSeconds)}]},pseudocode:[{code:`find_route(from, to):`},{code:`  priority queue ordered by time so far + estimate`,id:`h`},{code:`  while queue not empty:`},{code:`    node = closest by that order`,id:`seen`},{code:`    if node == to: stop`},{code:`    for each road out of node:`},{code:`      time = time[node] + length ÷ speed × traffic`},{code:`      keep it if it's the best way to that road's end`},{code:`  return path, and arrival time`,id:`best`}],sources:[{name:`engine.ts`,code:s,lang:`ts`}],tradeoffs:[{choice:`Dijkstra`,gain:`Always optimal, and simple`,cost:`Searches far too much of the graph`},{choice:`A*`,gain:`Much less searching, still optimal`,cost:`Needs a good, safe estimate`},{choice:`Weighted A*`,gain:`Even less searching`,cost:`Routes can be slightly longer`},{choice:`Precomputed levels`,gain:`Long routes become very fast`,cost:`Heavy preprocessing, and harder to adjust for traffic`}],interview:[{q:`Why not render maps on the server per request?`,a:`Rendering is expensive, and most people look at the same places. Pre-rendered tiles on a CDN are vastly cheaper. Modern clients often download vector tiles and draw them locally, which also saves data.`},{q:`How do you get accurate arrival times?`,a:`Use current speeds, plus historical patterns for that road at that time of day. Machine learning combines these to predict speeds for when you'll actually reach each road, not only for now.`},{q:`How do you reduce location traffic?`,a:`Batch points on the phone and send them every so often. Adapt to movement: a stationary user sends far fewer updates than one on a highway.`},{q:`How do you handle changing the route mid-journey?`,a:`Track active navigation sessions and push to them when traffic changes along their route. Finding which sessions are affected is the difficult part, usually narrowed down using routing tiles.`}],mistakes:[`Assuming you can run one search over the whole world's graph.`,`Forgetting that traffic is data flowing in from users.`,`Sending every GPS point individually.`]};export{S as default};