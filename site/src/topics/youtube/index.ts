import type { Lab, Topic } from '../../core/types';
import { fmtInt, fmtPct } from '../../core/format';
import { zipfSampler } from '../../core/rng';
import { tailMean, zipfTopShare } from '../../core/stats';
import source from './engine.ts?raw';
import { Edge, MAX_BUFFER_SECONDS, RENDITIONS, advancePlayer, createPlayer, type Mode, type Player } from './engine';

type P = { mode: Mode; fixed: number; bandwidth: number; jitter: number; cdnPercent: number };

const DT = 0.5;
const CATALOG = 20000;
const ZIPF_S = 0.9;
const VIEW_GB = 0.5;
const VIEWS_PER_DAY = 10_000_000;
const EDGE_COST = 0.02; // assumed price per GB from a CDN
const ORIGIN_COST = 0.09; // assumed price per GB from origin

interface S {
  player: Player;
  edge: Edge;
  zipf: ReturnType<typeof zipfSampler>;
  drop: number;
  bandwidthNow: number;
  hitRate: number;
}

const stallRatio = (p: Player) => {
  const total = p.watched + p.stalled;
  return total ? p.stalled / total : 0;
};

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'mode', label: 'Quality selection', kind: 'choice', rebuild: true, options: [{ value: 'adaptive', label: 'Adaptive bitrate' }, { value: 'fixed', label: 'Always one quality' }] },
    { key: 'fixed', label: 'Fixed quality', kind: 'range', min: 0, max: RENDITIONS.length - 1, step: 1, format: (v) => `${RENDITIONS[v].name}, ${RENDITIONS[v].mbps} Mbps` },
    { key: 'bandwidth', label: 'Connection speed', kind: 'range', min: 0.5, max: 25, step: 0.5, unit: 'Mbps' },
    { key: 'jitter', label: 'Connection variability', kind: 'range', min: 0, max: 0.5, step: 0.05, format: (v) => fmtPct(v) },
    { key: 'cdnPercent', label: 'CDN holds this share of videos', kind: 'range', min: 1, max: 50, step: 1, unit: '%', rebuild: true },
  ],
  defaults: { mode: 'adaptive', fixed: 4, bandwidth: 3, jitter: 0.15, cdnPercent: 5 },
  create: (p) => ({ player: createPlayer(), edge: new Edge(Math.round((CATALOG * p.cdnPercent) / 100)), zipf: zipfSampler(CATALOG, ZIPF_S), drop: 0, bandwidthNow: p.bandwidth, hitRate: 0 }),
  step(s, p, rng) {
    const dropped = s.drop > 0 ? 0.25 : 1;
    if (s.drop > 0) s.drop -= DT;
    s.bandwidthNow = Math.max(0.1, p.bandwidth * dropped * (1 + rng.gaussian(0, p.jitter)));
    advancePlayer(s.player, s.bandwidthNow, DT, p.mode, p.fixed);
    let hits = 0;
    const requests = 200;
    for (let i = 0; i < requests; i++) if (s.edge.request(s.zipf(rng))) hits++;
    s.hitRate = s.hitRate * 0.97 + (hits / requests) * 0.03;
  },
  sample: (s, p) => ({
    buffer: s.player.buffer,
    bitrate: RENDITIONS[s.player.current].mbps,
    bandwidth: s.bandwidthNow,
    stall: stallRatio(s.player) * 100,
    hit: s.hitRate * 100,
    bestHit: zipfTopShare(Math.round((CATALOG * p.cdnPercent) / 100), CATALOG, ZIPF_S) * 100,
  }),
  charts: [
    { title: 'Seconds of video in the buffer', series: [{ key: 'buffer', label: 'Measured', role: 'measured' }] },
    { title: 'Video quality against connection', unit: 'Mbps', series: [{ key: 'bitrate', label: 'Video bitrate', role: 'measured' }, { key: 'bandwidth', label: 'Connection', role: 'other' }] },
    { title: 'CDN hit rate', unit: '%', series: [{ key: 'hit', label: 'Measured', role: 'measured' }, { key: 'bestHit', label: 'Best possible', role: 'predicted' }] },
  ],
  metrics(s, p) {
    const pl = s.player;
    const avg = pl.watched ? pl.bitrateSeconds / pl.watched : 0;
    const expected = p.mode === 'fixed' ? Math.max(0, 1 - p.bandwidth / RENDITIONS[p.fixed].mbps) : 0;
    const gb = VIEW_GB * VIEWS_PER_DAY;
    const cost = gb * (s.hitRate * EDGE_COST + (1 - s.hitRate) * ORIGIN_COST);
    return [
      { label: 'Time spent buffering', value: fmtPct(expected, 1), role: 'predicted' },
      { label: 'Time spent buffering', value: fmtPct(stallRatio(pl), 1), role: 'measured', tone: stallRatio(pl) > 0.03 ? 'bad' : 'good' },
      { label: 'Average bitrate', value: `${avg.toFixed(1)} Mbps`, role: 'measured' },
      { label: 'Quality switches', value: fmtInt(pl.switches), role: 'measured' },
      { label: 'Delivery cost per day', value: `$${fmtInt(cost)}`, role: 'measured' },
    ];
  },
  math(s, p) {
    const bitrate = RENDITIONS[s.player.current].mbps;
    const gb = VIEW_GB * VIEWS_PER_DAY;
    return [
      { expr: `Buffer drains if bitrate > speed: ${bitrate} vs ${p.bandwidth} Mbps`, result: bitrate > p.bandwidth ? `stalls ${fmtPct(1 - p.bandwidth / bitrate)} of the time` : 'keeps up', tone: bitrate > p.bandwidth ? 'bad' : 'good' },
      { expr: `No CDN: ${fmtInt(gb)} GB/day × an assumed $${ORIGIN_COST} per GB`, result: `$${fmtInt(gb * ORIGIN_COST)}` },
      { expr: `All from a CDN: ${fmtInt(gb)} GB/day × an assumed $${EDGE_COST} per GB`, result: `$${fmtInt(gb * EDGE_COST)}` },
    ];
  },
  views: (s) => [
    {
      kind: 'bars',
      title: 'Buffer',
      max: MAX_BUFFER_SECONDS,
      items: [{ label: 'Buffered', value: s.player.buffer, display: `${s.player.buffer.toFixed(0)} s` }],
    },
    { kind: 'cells', title: 'Renditions', items: RENDITIONS.map((r, i) => ({ label: r.name, value: `${r.mbps} Mbps`, tone: i === s.player.current ? 'good' : 'neutral' })) },
  ],
  actions: [
    {
      key: 'drop',
      label: 'Enter a tunnel: speed falls for 30 s',
      run: (s) => {
        s.drop = 30;
      },
    },
  ],
  trace: (s) => ({
    values: { est: `${s.player.estimate.toFixed(2)} Mbps`, pick: RENDITIONS[s.player.current].name, buf: `${s.player.buffer.toFixed(0)} s` },
  }),
  experiments: [
    {
      title: 'Insist on 1080p',
      set: { mode: 'fixed', fixed: 4, bandwidth: 3, jitter: 0 },
      ticks: 400,
      question: 'A 1080p stream needs 5 Mbps, and your connection gives 3. If you force 1080p, what share of the time will you spend staring at a spinner?',
      options: ['None, the buffer handles it', 'About 40%', 'About 80%'],
      answer: 1,
      explain: 'You download 3 seconds of video per 5 seconds of real time, so only 60% of the time can be playback. No buffer size can fix a sustained shortfall. It only delays when you first notice.',
      check: (s) => stallRatio(s.player) > 0.25 && stallRatio(s.player) < 0.52,
    },
    {
      title: 'Let the player adapt',
      set: { mode: 'adaptive', bandwidth: 3, jitter: 0.15 },
      ticks: 400,
      question: 'Same connection, but the player chooses quality for each chunk based on recent speed. What happens?',
      options: ['Still about 40% buffering', 'Almost no buffering, at 720p or lower', 'It stays at 240p forever'],
      answer: 1,
      explain: 'Because each chunk comes in several qualities, the player can pick one the connection can sustain, leaving a margin for variability. Viewers much prefer a slightly softer picture to a pause. This is why videos are encoded many times over.',
      check: (s) => stallRatio(s.player) < 0.03 && s.player.bitrateSeconds / s.player.watched < 3.05 && s.player.bitrateSeconds / s.player.watched > 1,
    },
    {
      title: 'Into a tunnel',
      set: { mode: 'adaptive', bandwidth: 10, jitter: 0.1 },
      act: ['drop'],
      actAt: 120,
      ticks: 300,
      question: 'You\'re watching in high quality at 10 Mbps when speed drops by 75% for 30 seconds. What should a good player do?',
      options: ['Pause until speed comes back', 'Drop quality and keep playing, using its buffer as a cushion'],
      answer: 1,
      explain: 'The buffer buys time for the estimate to catch up, then the player steps down. Once speed recovers, it climbs again. This is why a player likes to keep a full buffer before it needs one.',
      check: (s) => s.player.lowest < 4 && stallRatio(s.player) < 0.08,
    },
    {
      title: 'A small CDN',
      set: { cdnPercent: 5 },
      ticks: 500,
      question: 'The CDN only holds 5% of the videos. What share of views can it serve?',
      options: ['About 5%', 'About half', 'Nearly all'],
      answer: 1,
      explain: 'Video popularity is very skewed: a small share of videos gets most of the views. So a small cache removes much of the cost, and the long tail can be served from origin. That\'s also why rarely-watched videos don\'t need copies on every edge.',
      check: (_s, _p, h) => {
        const v = tailMean(h, 'hit', 100);
        return v > 35 && v < 70;
      },
    },
  ],
};

const topic: Topic = {
  problem: [
    'A video platform really has two separate systems. The upload path takes a raw video file and turns it into many formats, a large and failure-prone batch job. The streaming path delivers those formats to viewers smoothly, whatever their connection.',
    'The numbers are huge, and bandwidth dominates the cost. So design decisions are mostly about two things: making transcoding reliable and parallel, and serving as much as possible from a CDN while still handling the long tail of rarely watched videos cheaply.',
  ],
  functional: [
    'Upload videos of many formats and sizes',
    'Stream smoothly on any device or connection',
    'Change quality automatically',
  ],
  nonFunctional: [
    'Fast startup and little buffering',
    'High availability, and low cost per view',
    'Uploads survive failures and can resume',
  ],
  diagram: {
    nodes: [
      { id: 'u', label: 'Creator', col: 0, row: 0, kind: 'client', note: 'Uploads in parts, so a broken connection only retries one part.' },
      { id: 'o', label: 'Original storage', col: 1, row: 0, kind: 'store', note: 'Blob storage holding the untouched source file.' },
      { id: 't', label: 'Transcoding workers', col: 2, row: 0, note: 'Split the video into segments and encode them in parallel, as a graph of tasks.' },
      { id: 's', label: 'Encoded storage', col: 3, row: 0, kind: 'store', note: 'Every resolution and codec for every segment.' },
      { id: 'c', label: 'CDN', col: 3, row: 1, kind: 'external', note: 'Serves the popular videos from locations near viewers.' },
      { id: 'v', label: 'Viewer', col: 2, row: 1, kind: 'client', note: 'Downloads a manifest, then chooses a quality for each chunk.' },
      { id: 'a', label: 'API and metadata', col: 1, row: 1, note: 'Handles video details, comments and user data, separately from the bytes themselves.' },
    ],
    edges: [
      { from: 'u', to: 'o' },
      { from: 'o', to: 't' },
      { from: 't', to: 's' },
      { from: 's', to: 'c' },
      { from: 'v', to: 'c' },
      { from: 'v', to: 'a' },
    ],
  },
  ideas: [
    { title: 'Adaptive bitrate', body: 'Each video is cut into short chunks, each encoded at several qualities. The player picks one per chunk based on speed and buffer level, so quality follows the connection.' },
    { title: 'Transcoding as a graph', body: 'Split a video into chunks, then run steps like encoding, thumbnails and watermarking as a directed graph of tasks across many workers. Parallelism turns hours into minutes, and failed tasks retry individually.' },
    { title: 'The CDN is the bill', body: 'Most of your cost is bandwidth. Serve popular videos from a CDN, and consider serving unpopular ones from your own servers, encoding them less, or encoding on demand.' },
    { title: 'Resumable uploads', body: 'Split uploads into parts with checksums. A dropped connection only loses one part, and clients can upload directly to storage, skipping your API servers.' },
  ],
  estimator: {
    vars: [
      { key: 'dau', label: 'Daily active users', unit: 'count' },
      { key: 'viewsPerUser', label: 'Videos watched per user per day', unit: 'plain', assume: 5 },
      { key: 'uploadShare', label: 'Share who upload daily (0 to 1)', unit: 'plain', assume: 0.1 },
      { key: 'videoBytes', label: 'Bytes per video', unit: 'plain', assume: 300e6 },
      { key: 'copies', label: 'Size multiple after transcoding', unit: 'plain', assume: 3 },
      { key: 'costPerByte', label: 'CDN cost per GB in dollars', unit: 'plain', assume: 0.02 },
      { key: 'uploadsDay', label: 'Uploads per day', unit: 'count' },
      { key: 'viewQps', label: 'Video views', unit: 'qps' },
      { key: 'storageDay', label: 'Storage added per day', unit: 'bytes' },
      { key: 'egressDay', label: 'Bytes served per day', unit: 'bytes' },
      { key: 'costDay', label: 'CDN dollars per day', unit: 'count' },
    ],
    eqs: [
      { out: 'uploadsDay', terms: [['dau', 1], ['uploadShare', 1]] },
      { out: 'viewQps', terms: [['dau', 1], ['viewsPerUser', 1], [86400, -1]] },
      { out: 'storageDay', terms: [['uploadsDay', 1], ['videoBytes', 1], ['copies', 1]] },
      { out: 'egressDay', terms: [['dau', 1], ['viewsPerUser', 1], ['videoBytes', 1]] },
      { out: 'costDay', terms: [['egressDay', 1], ['costPerByte', 1], [1e9, -1]] },
    ],
    starts: [
      { key: 'dau', value: 5_000_000 },
      { key: 'storageDay', value: 100e12 },
      { key: 'costDay', value: 100000 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'for each chunk:' },
    { code: '  estimate = smoothed recent download speed', id: 'est' },
    { code: '  margin = 0.8, or lower if the buffer is low', id: 'buf' },
    { code: '  quality = highest bitrate ≤ estimate × margin', id: 'pick' },
    { code: '  download the chunk and add it to the buffer' },
    { code: '  estimate from how long it really took' },
    { code: '' },
    { code: 'playback: consume the buffer, or stall when it\'s empty' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'More renditions', gain: 'Smoother adaptation across devices', cost: 'More transcoding and storage per video' },
    { choice: 'Bigger client buffer', gain: 'Survives longer dips', cost: 'Slower to adapt, and wasted data if the viewer leaves' },
    { choice: 'CDN everything', gain: 'The best experience for all videos', cost: 'Pays for the long tail no one watches' },
    { choice: 'Better codecs', gain: 'Less bandwidth for the same quality', cost: 'Much more compute, and older devices can\'t play them' },
  ],
  interview: [
    { q: 'How do you reduce cost?', a: 'Serve only popular videos from the CDN, encode unpopular videos on demand, skip high resolutions for short or low-view videos, and use better codecs for videos with many views.' },
    { q: 'How do you handle a transcoding failure?', a: 'Store the original safely and treat each graph step as a retryable task, using a queue. A failure re-runs one chunk, not the whole video.' },
    { q: 'How do you protect videos from being stolen?', a: 'DRM encrypts content so only licensed players can decode it, AES encryption with signed URLs raises the bar, and watermarks help trace leaks. None of this makes copying impossible.' },
    { q: 'How do you do live streaming differently?', a: 'It has a hard latency budget, so chunks must be smaller and it can\'t buffer much. There\'s also no second chance at encoding, and everyone wants the same chunk at the same moment.' },
  ],
  mistakes: [
    'Proxying video bytes through your API servers.',
    'Treating video data and metadata as one store.',
    'Assuming every video deserves the same treatment.',
  ],
};

export default topic;
