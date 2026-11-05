import type { CustomViewProps, Lab, Topic } from '../../core/types';
import { fmtCount, fmtInt, fmtPct } from '../../core/format';
import { tailMean } from '../../core/stats';
import source from './engine.ts?raw';
import { GeohashIndex, QuadTree, cellBounds, cellsAround, cellSize, distanceKm, geohash, precisionForRadius, type Bounds, type Place } from './engine';

type P = { index: 'scan' | 'geohash' | 'quadtree'; places: number; radiusKm: number; neighbors: boolean };

const DT = 0.5;
const REGION: Bounds = { south: 37.2, north: 37.95, west: -122.65, east: -121.75 };

interface S {
  places: Place[];
  geo: GeohashIndex;
  tree: QuadTree;
  center: { lat: number; lng: number };
  holdUntil: number;
  tick: number;
  scanned: number;
  results: Place[];
  cells: Bounds[];
  missedLast: number;
  missedTotal: number;
  searches: number;
  scannedEma: number;
  label: string;
}

function search(s: S, p: P) {
  const { lat, lng } = s.center;
  const r = p.radiusKm;
  const truth = s.places.filter((b) => distanceKm(lat, lng, b.lat, b.lng) <= r);
  let candidates: Place[] = s.places;
  s.cells = [];
  s.label = 'full table';
  if (p.index === 'geohash') {
    const precision = precisionForRadius(r);
    const keys = cellsAround(lat, lng, precision, p.neighbors);
    candidates = s.geo.candidates(keys, precision);
    s.label = `${keys.length} cells at precision ${precision}, center ${geohash(lat, lng, precision)}`;
    const size = cellSize(precision);
    const offsets = p.neighbors ? [-1, 0, 1] : [0];
    for (const dLat of offsets) for (const dLng of offsets) s.cells.push(cellBounds(lat + dLat * size.lat, lng + dLng * size.lng, precision));
  } else if (p.index === 'quadtree') {
    const dLat = r / 111;
    const dLng = r / (111 * Math.cos((lat * Math.PI) / 180));
    candidates = [];
    s.tree.search({ south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng }, candidates, s.cells);
    s.label = `${s.cells.length} quadtree leaves`;
  }
  s.results = candidates.filter((b) => distanceKm(lat, lng, b.lat, b.lng) <= r);
  s.scanned = candidates.length;
  s.missedLast = truth.length - s.results.length;
  s.missedTotal += s.missedLast;
  s.searches++;
  s.scannedEma = s.scannedEma * 0.85 + s.scanned * 0.15;
}

function MapView({ state, params, rerender }: CustomViewProps<S, P>) {
  const W = 520;
  const H = 400;
  const x = (lng: number) => ((lng - REGION.west) / (REGION.east - REGION.west)) * W;
  const y = (lat: number) => ((REGION.north - lat) / (REGION.north - REGION.south)) * H;
  const dots = state.places.length > 1500 ? state.places.filter((_, i) => i % Math.ceil(state.places.length / 1500) === 0) : state.places;
  const rx = ((params.radiusKm / (111 * Math.cos((state.center.lat * Math.PI) / 180))) / (REGION.east - REGION.west)) * W;
  const ry = ((params.radiusKm / 111) / (REGION.north - REGION.south)) * H;
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    state.center = {
      lat: REGION.north - ((e.clientY - r.top) / r.height) * (REGION.north - REGION.south),
      lng: REGION.west + ((e.clientX - r.left) / r.width) * (REGION.east - REGION.west),
    };
    state.holdUntil = state.tick + 40;
    search(state, params);
    rerender();
  };
  return (
    <div className="lab-panel">
      <h4>Businesses on a map. Click to search from there. {state.label}.</h4>
      <svg viewBox={`0 0 ${W} ${H}`} className="lab-svg" onClick={onClick} style={{ cursor: 'crosshair' }} role="img" aria-label={`Map with ${state.places.length} places. The search found ${state.results.length} within ${params.radiusKm} km after scanning ${state.scanned}.`}>
        {dots.map((b) => (
          <circle key={b.id} cx={x(b.lng)} cy={y(b.lat)} r="1.1" fill="var(--ink-3)" />
        ))}
        {state.cells.map((c, i) => (
          <rect key={i} x={x(c.west)} y={y(c.north)} width={x(c.east) - x(c.west)} height={y(c.south) - y(c.north)} fill="var(--measured)" fillOpacity="0.14" stroke="var(--measured)" strokeWidth="0.8" />
        ))}
        {state.results.slice(0, 400).map((b) => (
          <circle key={b.id} cx={x(b.lng)} cy={y(b.lat)} r="2" fill="#4cc98a" />
        ))}
        <ellipse cx={x(state.center.lng)} cy={y(state.center.lat)} rx={rx} ry={ry} fill="none" stroke="var(--predicted)" strokeWidth="1.5" strokeDasharray="5 3" />
        <circle cx={x(state.center.lng)} cy={y(state.center.lat)} r="3.5" fill="var(--predicted)" />
      </svg>
    </div>
  );
}

function predictedScan(s: S, p: P): number {
  if (p.index === 'scan') return s.places.length;
  const area = (REGION.north - REGION.south) * (REGION.east - REGION.west);
  if (p.index === 'quadtree') {
    const dLat = p.radiusKm / 111;
    const dLng = p.radiusKm / 88;
    return Math.min(s.places.length, s.places.length * ((4 * dLat * dLng) / area));
  }
  const size = cellSize(precisionForRadius(p.radiusKm));
  return Math.min(s.places.length, s.places.length * (((p.neighbors ? 9 : 1) * size.lat * size.lng) / area));
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'index', label: 'Index', kind: 'choice', options: [{ value: 'geohash', label: 'Geohash' }, { value: 'quadtree', label: 'Quadtree' }, { value: 'scan', label: 'None, scan everything' }] },
    { key: 'places', label: 'Businesses', kind: 'range', min: 1000, max: 40000, step: 1000, rebuild: true },
    { key: 'radiusKm', label: 'Search radius', kind: 'range', min: 0.5, max: 20, step: 0.5, unit: 'km' },
    { key: 'neighbors', label: 'Include the 8 neighboring cells', kind: 'toggle' },
  ],
  defaults: { index: 'geohash', places: 20000, radiusKm: 2, neighbors: true },
  create(p, rng) {
    const centers = Array.from({ length: 8 }, () => ({ lat: rng.range(REGION.south + 0.1, REGION.north - 0.1), lng: rng.range(REGION.west + 0.1, REGION.east - 0.1), spread: rng.range(0.02, 0.07) }));
    const places: Place[] = [];
    for (let id = 0; id < p.places; id++) {
      if (rng.chance(0.75)) {
        const c = centers[rng.int(centers.length)];
        places.push({ id, lat: Math.min(REGION.north, Math.max(REGION.south, rng.gaussian(c.lat, c.spread))), lng: Math.min(REGION.east, Math.max(REGION.west, rng.gaussian(c.lng, c.spread))) });
      } else {
        places.push({ id, lat: rng.range(REGION.south, REGION.north), lng: rng.range(REGION.west, REGION.east) });
      }
    }
    const tree = new QuadTree(REGION, 100);
    for (const b of places) tree.insert(b);
    const s: S = { places, geo: new GeohashIndex(places), tree, center: { lat: places[0].lat, lng: places[0].lng }, holdUntil: 0, tick: 0, scanned: 0, results: [], cells: [], missedLast: 0, missedTotal: 0, searches: 0, scannedEma: 0, label: '' };
    search(s, p);
    return s;
  },
  step(s, p, rng) {
    s.tick++;
    if (s.tick >= s.holdUntil && s.tick % 4 === 0) {
      const b = s.places[rng.int(s.places.length)];
      s.center = { lat: b.lat, lng: b.lng };
    }
    search(s, p);
  },
  sample: (s, p) => ({ scanned: s.scannedEma, math: predictedScan(s, p), found: s.results.length }),
  charts: [{ title: 'Records examined per search', series: [{ key: 'scanned', label: 'Measured', role: 'measured' }, { key: 'math', label: 'Uniform estimate', role: 'predicted' }, { key: 'found', label: 'Results found', role: 'other' }] }],
  metrics: (s, p) => [
    { label: 'Share of table examined', value: fmtPct(predictedScan(s, p) / s.places.length, 2), role: 'predicted' },
    { label: 'Share of table examined', value: fmtPct(s.scannedEma / s.places.length, 2), role: 'measured' },
    { label: 'Results found', value: fmtInt(s.results.length), role: 'measured' },
    { label: 'Results missed', value: fmtInt(s.missedTotal), role: 'measured', tone: s.missedTotal ? 'bad' : 'good' },
  ],
  math(s, p) {
    const precision = precisionForRadius(p.radiusKm);
    const size = cellSize(precision);
    return [
      { expr: `Radius ${p.radiusKm} km needs geohash precision`, result: String(precision) },
      { expr: `Cell at precision ${precision}`, result: `${(size.lat * 111).toFixed(2)} × ${(size.lng * 88).toFixed(2)} km` },
      { expr: `Search covers ${p.neighbors ? 9 : 1} of those cells, of ${fmtCount(s.places.length)} records`, result: `≈ ${fmtCount(predictedScan(s, p))} examined` },
    ];
  },
  View: MapView,
  trace: (s) => ({
    values: { cells: s.label, scan: fmtInt(s.scanned), found: fmtInt(s.results.length) },
  }),
  experiments: [
    {
      title: 'Skip almost everything',
      set: { index: 'geohash', radiusKm: 2, places: 20000 },
      ticks: 60,
      question: 'You search within 2 km across 20,000 businesses, using a geohash. Roughly how much of the table must be examined?',
      options: ['All of it', 'About half', 'Just a few percent'],
      answer: 2,
      explain: 'Only the 9 cells around you are read, a tiny part of the region. It takes an index lookup per cell, and then a distance check on what comes back. Dense neighborhoods cost more than sparse ones, as the gap against the uniform estimate shows.',
      check: (_s, _p, h) => tailMean(h, 'scanned', 40) < 2000,
    },
    {
      title: 'The boundary problem',
      set: { index: 'geohash', radiusKm: 2, neighbors: false },
      ticks: 60,
      question: 'To save work, you read only the one cell you\'re in. Standing near its edge, a coffee shop is 100 meters away, across the boundary. What happens?',
      options: ['You still find it', 'It gets missed, even though it\'s close'],
      answer: 1,
      explain: 'Places on either side of a boundary can have completely different prefixes, even when they\'re right next to each other. That\'s why you always search the eight neighboring cells as well. It\'s the classic geohash gotcha.',
      check: (s) => s.missedTotal > 0,
    },
    {
      title: 'Try a quadtree',
      set: { index: 'quadtree', radiusKm: 2, places: 40000 },
      ticks: 60,
      question: 'A quadtree splits cells until each holds at most 100 places, so dense areas get small cells. Does it also avoid most of the table?',
      options: ['Yes, and it adapts to density', 'No, it reads most of the table'],
      answer: 0,
      explain: 'Unlike a fixed grid, a quadtree shapes itself around the data. The catch is that it lives in memory, must be rebuilt when servers start, and is trickier to update than a simple geohash column.',
      check: (s, _p, h) => tailMean(h, 'scanned', 40) < 4000 && s.missedTotal === 0,
    },
  ],
};

const topic: Topic = {
  problem: [
    '"Find restaurants near me" looks like a simple filter on latitude and longitude. But a database index works on one dimension at a time, so filtering on both still ends up examining a huge number of rows. At thousands of searches per second, that won\'t work.',
    'The trick is to turn two dimensions into one. A geohash encodes a location as a string in which nearby places usually share a prefix, so an ordinary database index can find everything in an area. Business data changes rarely, which makes this easy to cache and replicate.',
  ],
  functional: [
    'Return businesses within a radius of a location',
    'Show details for a business',
    'Business owners can add or update listings, with changes taking effect the next day',
  ],
  nonFunctional: [
    'Low latency for searches',
    'Handles spikes of thousands of searches per second',
    'Location data is treated as private',
  ],
  diagram: {
    nodes: [
      { id: 'u', label: 'Mobile app', col: 0, row: 0, kind: 'client', note: 'Sends latitude, longitude and radius.' },
      { id: 'l', label: 'Load balancer', col: 1, row: 0, note: 'Routes to the correct service by path.' },
      { id: 's', label: 'Location service', col: 2, row: 0, note: 'Stateless and read-only, so it scales simply.' },
      { id: 'r', label: 'Geo index replicas', col: 3, row: 0, kind: 'store', note: 'Maps geohash to business IDs. Data is small enough to fit in memory on one machine.' },
      { id: 'b', label: 'Business service', col: 2, row: 1, note: 'Serves business details, and accepts updates from owners.' },
      { id: 'c', label: 'Business cache', col: 3, row: 1, kind: 'store', note: 'Details rarely change, so they cache very well.' },
      { id: 'd', label: 'Primary database', col: 3, row: 2, kind: 'store', note: 'Holds the source of truth. A nightly job refreshes the geo index.' },
    ],
    edges: [
      { from: 'u', to: 'l' },
      { from: 'l', to: 's' },
      { from: 'l', to: 'b' },
      { from: 's', to: 'r' },
      { from: 'b', to: 'c' },
      { from: 'b', to: 'd' },
      { from: 'd', to: 'r', dashed: true },
    ],
  },
  ideas: [
    { title: 'Geohash', body: 'Split the world in half repeatedly, alternating longitude and latitude, and record each choice as a bit. Each extra character narrows the cell by about 32 times. Shared prefixes usually mean nearby.' },
    { title: 'Boundary issues', body: 'Two places can be side by side yet have totally different prefixes, if a cell boundary runs between them. So search the current cell and its 8 neighbors, then filter by true distance.' },
    { title: 'Quadtree', body: 'Recursively split cells that contain too many places. It handles uneven density nicely, since a city gets tiny cells while the ocean gets one big one, but it\'s an in-memory structure you must keep updated.' },
    { title: 'Why scaling is easy here', body: 'Businesses rarely change and the index is small enough to fit in memory, so read replicas and caches go a long way. Sharding is often unnecessary.' },
  ],
  estimator: {
    vars: [
      { key: 'dau', label: 'Daily active users', unit: 'count' },
      { key: 'searches', label: 'Searches per user per day', unit: 'plain', assume: 5 },
      { key: 'places', label: 'Businesses', unit: 'count', assume: 200000000 },
      { key: 'entryBytes', label: 'Bytes per index entry', unit: 'plain', assume: 21 },
      { key: 'detailBytes', label: 'Bytes per business record', unit: 'plain', assume: 1000 },
      { key: 'nodeQps', label: 'Searches per second per replica', unit: 'plain', assume: 2000 },
      { key: 'qps', label: 'Search rate', unit: 'qps' },
      { key: 'replicas', label: 'Read replicas', unit: 'count' },
      { key: 'index', label: 'Geo index size', unit: 'bytes' },
      { key: 'details', label: 'Business data', unit: 'bytes' },
    ],
    eqs: [
      { out: 'qps', terms: [['dau', 1], ['searches', 1], [86400, -1]] },
      { out: 'replicas', terms: [['qps', 1], ['nodeQps', -1]] },
      { out: 'index', terms: [['places', 1], ['entryBytes', 1]] },
      { out: 'details', terms: [['places', 1], ['detailBytes', 1]] },
    ],
    starts: [
      { key: 'dau', value: 100_000_000 },
      { key: 'qps', value: 5000 },
      { key: 'replicas', value: 10 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'search(lat, lng, radius):' },
    { code: '  precision = geohash length that fits radius' },
    { code: '  cells = cell of (lat, lng) and its 8 neighbors', id: 'cells' },
    { code: '  candidates = index lookup for those cells', id: 'scan' },
    { code: '  keep those within radius by true distance', id: 'found' },
    { code: '  sort by distance and return' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Geohash', gain: 'Simple, and a plain database index works', cost: 'Fixed cell sizes, and boundary handling' },
    { choice: 'Quadtree', gain: 'Adapts to density', cost: 'In memory, slower to build, and harder to update' },
    { choice: 'Google S2', gain: 'Accurate coverage of arbitrary shapes', cost: 'Complex to explain and implement' },
    { choice: 'Precompute by cell', gain: 'Very fast reads', cost: 'New businesses take a while to appear' },
  ],
  interview: [
    { q: 'How do you handle areas with too few results?', a: 'Remove the last character of the geohash, which makes the cell about 32 times larger, and search again. Keep expanding until you have enough or hit a limit.' },
    { q: 'Do you need to shard this?', a: 'Often not. Index entries are small, so 200 million of them fit on one machine. Replicas handle read volume, and that\'s simpler than sharding.' },
    { q: 'How would you add filters like rating or open now?', a: 'Filter the candidates after the location search, since nearby sets are small. If filters become complex, use a search engine such as Elasticsearch with geo support.' },
    { q: 'How does a new business appear?', a: 'Writes go to the primary database, and the geo index refreshes in a nightly batch. Requirements accept next-day updates, and that keeps the read path very simple.' },
  ],
  mistakes: [
    'Forgetting to search neighboring cells.',
    'Using a two-dimensional range query and calling it done.',
    'Sharding by default, when replicas would be enough.',
  ],
};

export default topic;
