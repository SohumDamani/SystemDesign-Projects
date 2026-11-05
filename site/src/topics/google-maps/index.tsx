import { useMemo } from 'react';
import type { CustomViewProps, Lab, Topic } from '../../core/types';
import { fmtDuration, fmtInt, fmtPct } from '../../core/format';
import source from './engine.ts?raw';
import { addTraffic, buildGraph, clearTraffic, shortestPath, type RoadGraph, type Route } from './engine';

type P = { algorithm: 'astar' | 'dijkstra'; weight: number; size: number };

const DT = 0.5;
const NEW_ROUTE_EVERY = 5;
const JAM_FACTOR = 8;

interface S {
  graph: RoadGraph;
  tick: number;
  from: number;
  to: number;
  route: Route;
  optimal: Route;
  routeId: number;
  visitedSum: number;
  dijkstraSum: number;
  gapSum: number;
  routes: number;
  jam?: { beforeSeconds: number; afterSeconds: number; changed: boolean };
  holdUntil: number;
}

const heuristic = (p: P) => (p.algorithm === 'dijkstra' ? 0 : p.weight);

function solve(s: S, p: P) {
  s.route = shortestPath(s.graph, s.from, s.to, heuristic(p));
  s.optimal = shortestPath(s.graph, s.from, s.to, 0);
  s.routeId++;
  s.visitedSum += s.route.visited.length;
  s.dijkstraSum += s.optimal.visited.length;
  s.gapSum += s.route.seconds / s.optimal.seconds - 1;
  s.routes++;
}

function pickRoute(s: S, rng: { int(n: number): number }) {
  const n = s.graph.edges.length;
  s.from = rng.int(n);
  do {
    s.to = rng.int(n);
  } while (s.to === s.from);
}

function MapView({ state }: CustomViewProps<S, P>) {
  const g = state.graph;
  const W = 520;
  const scale = W / ((g.width - 1) * 200 + 60);
  const H = ((g.height - 1) * 200 + 60) * scale;
  const px = (i: number) => (g.xs[i] + 30) * scale;
  const py = (i: number) => (g.ys[i] + 30) * scale;
  const { roads, visited, path } = useMemo(() => {
    let roadsD = '';
    let jamD = '';
    g.edges.forEach((list, a) => {
      for (const e of list) {
        if (e.to < a) continue;
        const seg = `M${px(a).toFixed(1)} ${py(a).toFixed(1)}L${px(e.to).toFixed(1)} ${py(e.to).toFixed(1)}`;
        if (e.traffic > 1) jamD += seg;
        else roadsD += seg;
      }
    });
    const visitedD = state.route.visited.map((n) => `M${(px(n) - 2.2).toFixed(1)} ${(py(n) - 2.2).toFixed(1)}h4.4v4.4h-4.4z`).join('');
    const pathD = state.route.path.map((n, i) => `${i ? 'L' : 'M'}${px(n).toFixed(1)} ${py(n).toFixed(1)}`).join('');
    return { roads: { roadsD, jamD }, visited: visitedD, path: pathD };
    // The map only changes when a new route is solved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.routeId, g]);
  return (
    <div className="lab-panel">
      <h4>
        Nodes explored in blue, route in green, traffic in red. {fmtInt(state.route.visited.length)} of {fmtInt(g.edges.length)} nodes explored.
      </h4>
      <svg viewBox={`0 0 ${W} ${H.toFixed(0)}`} className="lab-svg" role="img" aria-label={`Road grid. The route takes ${fmtDuration(state.route.seconds)} and the search explored ${state.route.visited.length} nodes.`}>
        <path d={roads.roadsD} stroke="var(--line-strong)" strokeWidth="0.8" fill="none" />
        <path d={visited} fill="var(--measured)" fillOpacity="0.5" />
        <path d={roads.jamD} stroke="#f58a8a" strokeWidth="3" fill="none" />
        <path d={path} stroke="#4cc98a" strokeWidth="2.6" fill="none" strokeLinejoin="round" />
        <circle cx={px(state.from)} cy={py(state.from)} r="5" fill="#4cc98a" />
        <circle cx={px(state.to)} cy={py(state.to)} r="5" fill="var(--predicted)" />
      </svg>
    </div>
  );
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'algorithm', label: 'Algorithm', kind: 'choice', options: [{ value: 'astar', label: 'A*' }, { value: 'dijkstra', label: 'Dijkstra' }] },
    { key: 'weight', label: 'A* heuristic weight', kind: 'range', min: 1, max: 5, step: 0.1 },
    { key: 'size', label: 'Grid width', kind: 'range', min: 20, max: 70, step: 5, unit: 'blocks', rebuild: true },
  ],
  defaults: { algorithm: 'astar', weight: 1, size: 50 },
  create(p, rng) {
    const graph = buildGraph(p.size, Math.round(p.size * 0.7), rng);
    const s = { graph, tick: 0, from: 0, to: 1, route: { path: [], seconds: 0, visited: [] }, optimal: { path: [], seconds: 0, visited: [] }, routeId: 0, visitedSum: 0, dijkstraSum: 0, gapSum: 0, routes: 0, holdUntil: 0 } as S;
    pickRoute(s, rng);
    solve(s, p);
    return s;
  },
  step(s, p, rng) {
    s.tick++;
    if (s.tick >= s.holdUntil && s.tick % NEW_ROUTE_EVERY === 0) {
      pickRoute(s, rng);
      solve(s, p);
    }
  },
  sample: (s) => ({ visited: s.route.visited.length, dijkstra: s.optimal.visited.length, seconds: s.route.seconds, optimal: s.optimal.seconds }),
  charts: [
    { title: 'Nodes explored for the current route', series: [{ key: 'visited', label: 'Your settings', role: 'measured' }, { key: 'dijkstra', label: 'Dijkstra', role: 'other' }] },
    { title: 'Route travel time', unit: 's', series: [{ key: 'seconds', label: 'Found', role: 'measured' }, { key: 'optimal', label: 'Optimal', role: 'predicted' }] },
  ],
  metrics(s) {
    return [
      { label: 'Explored vs Dijkstra', value: fmtPct(s.dijkstraSum ? s.visitedSum / s.dijkstraSum : 1), role: 'measured' },
      { label: 'Time above optimal', value: fmtPct(s.routes ? s.gapSum / s.routes : 0, 1), role: 'measured', tone: s.routes && s.gapSum / s.routes > 0.005 ? 'warn' : 'good' },
      { label: 'Current route', value: fmtDuration(s.route.seconds), role: 'measured' },
      { label: 'Road segments', value: fmtInt(s.graph.edges.reduce((a, e) => a + e.length, 0) / 2) },
    ];
  },
  math(s, p) {
    return [
      { expr: `Dijkstra explores outward in every direction: about ${fmtInt(s.optimal.visited.length)} nodes`, result: 'always optimal', tone: 'good' },
      { expr: `A* adds straight-line time ÷ top speed × ${heuristic(p).toFixed(1)}`, result: heuristic(p) <= 1 ? 'still optimal' : 'faster, may be longer', tone: heuristic(p) <= 1 ? 'good' : 'warn' },
      { expr: 'Map tiles at zoom z: 4^z, so z = 21', result: '4.4 trillion tiles' },
    ];
  },
  View: MapView,
  actions: [
    {
      key: 'jam',
      label: 'Add traffic on the current route',
      run: (s, p) => {
        const before = s.route;
        addTraffic(s.graph, s.route.path, JAM_FACTOR);
        const after = shortestPath(s.graph, s.from, s.to, heuristic(p));
        s.jam = { beforeSeconds: before.seconds, afterSeconds: after.seconds, changed: after.path.join() !== before.path.join() };
        s.route = after;
        s.routeId++;
        s.holdUntil = s.tick + 20;
      },
    },
    {
      key: 'clear',
      label: 'Clear all traffic',
      run: (s, p) => {
        clearTraffic(s.graph);
        solve(s, p);
      },
    },
  ],
  views: (s) => [
    { kind: 'note', title: 'Last traffic event', text: s.jam ? `The route ${s.jam.changed ? 'changed to avoid the jam' : 'stayed the same'}. Time went from ${fmtDuration(s.jam.beforeSeconds)} to ${fmtDuration(s.jam.afterSeconds)}, while driving through it would have been about ${JAM_FACTOR} times slower on that stretch.` : 'Add traffic to the current route to see it re-plan.' },
  ],
  trace: (s, p) => ({
    values: { h: `weight ${heuristic(p).toFixed(1)}`, seen: fmtInt(s.route.visited.length), best: fmtDuration(s.route.seconds) },
  }),
  experiments: [
    {
      title: 'Aim for the destination',
      set: { algorithm: 'astar', weight: 1 },
      ticks: 200,
      question: 'A* prefers nodes that are closer to the destination, using straight-line distance as a guide. How many nodes does it explore, compared with Dijkstra?',
      options: ['About the same', 'Noticeably fewer, with the same route time', 'Fewer, but with longer routes'],
      answer: 1,
      explain: 'Dijkstra grows a circle in every direction, wasting effort on roads heading away from your goal. A* biases toward the target. As long as its estimate never overstates the remaining time, it still finds the fastest route.',
      check: (s) => s.visitedSum / s.dijkstraSum < 0.8 && s.gapSum / s.routes < 0.001,
    },
    {
      title: 'Overweight the guess',
      set: { algorithm: 'astar', weight: 4 },
      ticks: 200,
      question: 'If you weigh the estimate 4 times more heavily, the search rushes toward the destination. What happens?',
      options: ['Fewer nodes and still the best route', 'Far fewer nodes, but routes get a bit longer'],
      answer: 1,
      explain: 'An inflated heuristic overstates remaining time, so it may skip the best route. It trades a slightly slower trip for a much cheaper search. For a server handling many route requests, a few extra seconds can be an acceptable price.',
      check: (s) => s.visitedSum / s.dijkstraSum < 0.45 && s.gapSum / s.routes > 0.002,
    },
    {
      title: 'A traffic jam',
      set: { algorithm: 'astar', weight: 1 },
      act: ['jam'],
      actAt: 10,
      ticks: 15,
      question: 'Traffic makes the middle of your route 8 times slower. What should routing do?',
      options: ['Stay on the route, and arrive 8 times later', 'Find another way, costing a little more than the original'],
      answer: 1,
      explain: 'Edge weights are travel time, so traffic only changes numbers in the graph. Re-running the same search finds a detour. Real systems stream speeds into these weights constantly, and re-route when a better option appears.',
      check: (s) => Boolean(s.jam && s.jam.changed && s.jam.afterSeconds >= s.jam.beforeSeconds),
    },
  ],
};

const topic: Topic = {
  problem: [
    'A maps app does three different jobs. It serves map images, at any zoom level, fast. It turns location updates from millions of phones into live traffic. And it finds the best route across a road network with billions of edges.',
    'The road graph for the world is far too large to search in one go, so systems break it into tiles and pre-compute summaries at several levels of detail. The lab runs real shortest-path search on a small city, so you can see why the choice of algorithm matters so much.',
  ],
  functional: [
    'Show a map at any location and zoom level',
    'Find the fastest route between two places',
    'Give an accurate arrival time, updated for traffic',
  ],
  nonFunctional: [
    'Accurate directions, and fast rendering',
    'Efficient use of mobile data and battery',
    'Handles millions of location updates per second',
  ],
  diagram: {
    nodes: [
      { id: 'u', label: 'Mobile app', col: 0, row: 1, kind: 'client', note: 'Batches GPS points every 15 seconds or so, to save battery and data.' },
      { id: 'c', label: 'CDN', col: 1, row: 0, kind: 'external', note: 'Serves pre-rendered map tiles, named by zoom and position.' },
      { id: 'n', label: 'Navigation service', col: 1, row: 1, note: 'Geocodes addresses, finds routes, and asks for ETAs.' },
      { id: 'l', label: 'Location service', col: 1, row: 2, note: 'Accepts batches of GPS points from clients.' },
      { id: 'r', label: 'Routing tiles', col: 2, row: 1, kind: 'store', note: 'The road graph split into tiles at several levels: local roads, arterials, and highways.' },
      { id: 'k', label: 'Stream of locations', col: 2, row: 2, kind: 'queue', note: 'Feeds traffic estimates, map updates and ML models.' },
      { id: 't', label: 'Traffic database', col: 3, row: 1, kind: 'store', note: 'Current speeds per road, which feed the edge weights for routing and ETA.' },
    ],
    edges: [
      { from: 'u', to: 'c' },
      { from: 'u', to: 'n' },
      { from: 'u', to: 'l' },
      { from: 'n', to: 'r' },
      { from: 'l', to: 'k' },
      { from: 'k', to: 't' },
      { from: 't', to: 'r', dashed: true },
    ],
  },
  ideas: [
    { title: 'Map tiles', body: 'The world is split into a grid of images at each zoom level, with 4^z tiles at zoom z. Tiles are pre-rendered and sit on a CDN, with a URL named by zoom and position, or a geohash.' },
    { title: 'Routing tiles', body: 'The graph is too big for one search. Split it into tiles that load on demand, at several levels of detail. A long drive uses local tiles at each end and highway tiles in between.' },
    { title: 'A* search', body: 'Dijkstra is correct but explores in every direction. A* uses an estimate of the remaining distance to focus the search, and remains optimal if the estimate is never too high.' },
    { title: 'Traffic as weights', body: 'Phones report speed, which becomes the weight on each road. Routing then needs no special traffic logic: it just searches a graph whose numbers change.' },
  ],
  estimator: {
    vars: [
      { key: 'dau', label: 'Daily active users', unit: 'count' },
      { key: 'navMinutes', label: 'Minutes navigating per user per day', unit: 'plain', assume: 5 },
      { key: 'batchSeconds', label: 'Seconds between GPS batches', unit: 'plain', assume: 15 },
      { key: 'tiles', label: 'Map tiles at top zoom', unit: 'count', assume: 4.4e12 },
      { key: 'landShare', label: 'Share of tiles worth storing (0 to 1)', unit: 'plain', assume: 0.1 },
      { key: 'tileBytes', label: 'Bytes per tile', unit: 'plain', assume: 100000 },
      { key: 'uploads', label: 'GPS batch uploads', unit: 'qps' },
      { key: 'tileStorage', label: 'Tile storage', unit: 'bytes' },
    ],
    eqs: [
      { out: 'uploads', terms: [['dau', 1], ['navMinutes', 1], [60, 1], ['batchSeconds', -1], [86400, -1]] },
      { out: 'tileStorage', terms: [['tiles', 1], ['landShare', 1], ['tileBytes', 1]] },
    ],
    starts: [
      { key: 'dau', value: 1e9 },
      { key: 'uploads', value: 200000 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'find_route(from, to):' },
    { code: '  priority queue ordered by time so far + estimate', id: 'h' },
    { code: '  while queue not empty:' },
    { code: '    node = closest by that order', id: 'seen' },
    { code: '    if node == to: stop' },
    { code: '    for each road out of node:' },
    { code: '      time = time[node] + length ÷ speed × traffic' },
    { code: '      keep it if it\'s the best way to that road\'s end' },
    { code: '  return path, and arrival time', id: 'best' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Dijkstra', gain: 'Always optimal, and simple', cost: 'Searches far too much of the graph' },
    { choice: 'A*', gain: 'Much less searching, still optimal', cost: 'Needs a good, safe estimate' },
    { choice: 'Weighted A*', gain: 'Even less searching', cost: 'Routes can be slightly longer' },
    { choice: 'Precomputed levels', gain: 'Long routes become very fast', cost: 'Heavy preprocessing, and harder to adjust for traffic' },
  ],
  interview: [
    { q: 'Why not render maps on the server per request?', a: 'Rendering is expensive, and most people look at the same places. Pre-rendered tiles on a CDN are vastly cheaper. Modern clients often download vector tiles and draw them locally, which also saves data.' },
    { q: 'How do you get accurate arrival times?', a: 'Use current speeds, plus historical patterns for that road at that time of day. Machine learning combines these to predict speeds for when you\'ll actually reach each road, not only for now.' },
    { q: 'How do you reduce location traffic?', a: 'Batch points on the phone and send them every so often. Adapt to movement: a stationary user sends far fewer updates than one on a highway.' },
    { q: 'How do you handle changing the route mid-journey?', a: 'Track active navigation sessions and push to them when traffic changes along their route. Finding which sessions are affected is the difficult part, usually narrowed down using routing tiles.' },
  ],
  mistakes: [
    'Assuming you can run one search over the whole world\'s graph.',
    'Forgetting that traffic is data flowing in from users.',
    'Sending every GPS point individually.',
  ],
};

export default topic;
