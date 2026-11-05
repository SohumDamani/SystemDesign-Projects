import type { Lab, Topic } from '../../core/types';
import { fmtCount, fmtInt, fmtPct } from '../../core/format';
import { tailMean } from '../../core/stats';
import source from './engine.ts?raw';
import { Channel, deliverLive, heartbeat, isOnline, sync, type Member } from './engine';

type P = { users: number; servers: number; messagesPerSec: number; heartbeatSec: number; timeoutSec: number; loss: number; ordering: 'sequence' | 'client-clock'; skewMs: number };

const DT = 0.1;
const RECONNECT_SECONDS = 3;

interface S {
  now: number;
  channel: Channel;
  members: Member[];
  serverUp: boolean[];
  skew: number[];
  live: number;
  synced: number;
  disconnects: number;
  misordered: number;
  maxClientTime: number;
  falseOffline: number;
  connectedSamples: number;
  offlineNow: number;
  last: string;
}

function liveServers(s: S): number[] {
  return s.serverUp.map((up, i) => (up ? i : -1)).filter((i) => i >= 0);
}

const missing = (s: S) => s.members.reduce((a, m) => a + (s.channel.latestSeq - m.cursor), 0);

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'users', label: 'Users in the channel', kind: 'range', min: 20, max: 200, step: 10, rebuild: true },
    { key: 'servers', label: 'Chat servers', kind: 'range', min: 2, max: 8, step: 1, rebuild: true },
    { key: 'messagesPerSec', label: 'Messages', kind: 'range', min: 1, max: 50, step: 1, unit: 'per s' },
    { key: 'heartbeatSec', label: 'Heartbeat interval', kind: 'range', min: 1, max: 30, step: 1, unit: 's', rebuild: true },
    { key: 'timeoutSec', label: 'Offline after no heartbeat for', kind: 'range', min: 1, max: 90, step: 1, unit: 's', rebuild: true },
    { key: 'loss', label: 'Heartbeats lost', kind: 'range', min: 0, max: 0.5, step: 0.05, format: (v) => fmtPct(v), rebuild: true },
    { key: 'ordering', label: 'Order messages by', kind: 'choice', rebuild: true, options: [{ value: 'sequence', label: 'Server sequence number' }, { value: 'client-clock', label: 'Sender\'s clock' }] },
    { key: 'skewMs', label: 'Device clock error', kind: 'range', min: 0, max: 1000, step: 50, unit: 'ms', rebuild: true },
  ],
  defaults: { users: 60, servers: 4, messagesPerSec: 10, heartbeatSec: 5, timeoutSec: 30, loss: 0.1, ordering: 'sequence', skewMs: 0 },
  create(p, rng) {
    const members: Member[] = Array.from({ length: p.users }, (_, id) => ({ id, connected: true, server: id % p.servers, reconnectAt: 0, cursor: 0, lastBeatSent: -rng.range(0, p.heartbeatSec), lastBeatSeen: 0 }));
    return {
      now: 0,
      channel: new Channel(),
      members,
      serverUp: Array(p.servers).fill(true),
      skew: members.map(() => rng.range(-1, 1) * (p.skewMs / 1000)),
      live: 0,
      synced: 0,
      disconnects: 0,
      misordered: 0,
      maxClientTime: 0,
      falseOffline: 0,
      connectedSamples: 0,
      offlineNow: 0,
      last: '',
    };
  },
  step(s, p, rng) {
    s.now += DT;
    const alive = liveServers(s);
    for (const m of s.members) {
      if (!m.connected && s.now >= m.reconnectAt && alive.length) {
        m.connected = true;
        m.server = alive[m.id % alive.length];
        const caught = sync(m, s.channel);
        s.synced += caught;
        if (caught) s.last = `User ${m.id} reconnected and synced ${caught} messages`;
      }
      heartbeat(m, s.now, p.heartbeatSec, p.loss, rng);
    }
    for (let i = rng.poisson(p.messagesPerSec * DT); i > 0; i--) {
      const online = s.members.filter((m) => m.connected);
      if (!online.length) break;
      const sender = online[rng.int(online.length)];
      const clientTime = s.now + rng.next() * DT + s.skew[sender.id];
      const message = s.channel.append(sender.id, clientTime);
      // If you sort by the sender's clock, a later message can claim an earlier time.
      if (clientTime < s.maxClientTime) s.misordered++;
      s.maxClientTime = Math.max(s.maxClientTime, clientTime);
      for (const m of online) {
        deliverLive(m, message);
        s.live++;
      }
    }
    let offline = 0;
    let connected = 0;
    for (const m of s.members) {
      if (!m.connected) continue;
      connected++;
      if (s.now > p.timeoutSec && !isOnline(m, s.now, p.timeoutSec)) offline++;
    }
    s.falseOffline += offline;
    s.connectedSamples += connected;
    s.offlineNow = connected ? offline / connected : 0;
  },
  sample: (s) => ({ falseOffline: s.offlineNow * 100, connected: s.members.filter((m) => m.connected).length }),
  charts: [
    { title: 'Connected users wrongly shown as offline', unit: '%', series: [{ key: 'falseOffline', label: 'Measured', role: 'measured' }] },
    { title: 'Connected users', series: [{ key: 'connected', label: 'Measured', role: 'measured' }] },
  ],
  metrics(s, p) {
    const misses = Math.max(1, Math.floor(p.timeoutSec / p.heartbeatSec));
    return [
      { label: 'Wrongly offline', value: fmtPct(Math.pow(p.loss, misses), 2), role: 'predicted' },
      { label: 'Wrongly offline', value: fmtPct(s.connectedSamples ? s.falseOffline / s.connectedSamples : 0, 2), role: 'measured' },
      { label: 'Messages out of order', value: fmtInt(p.ordering === 'sequence' ? 0 : s.misordered), role: 'measured', tone: p.ordering !== 'sequence' && s.misordered ? 'bad' : 'good' },
      { label: 'Delivered through sync', value: fmtCount(s.synced), role: 'measured' },
      { label: 'Messages still missing', value: fmtInt(missing(s)), role: 'measured', tone: missing(s) && s.members.every((m) => m.connected) ? 'bad' : undefined },
    ];
  },
  math(s, p) {
    const misses = Math.max(1, Math.floor(p.timeoutSec / p.heartbeatSec));
    const alive = liveServers(s).length || 1;
    return [
      { expr: `Heartbeats to miss before "offline": ${p.timeoutSec} ÷ ${p.heartbeatSec}`, result: String(misses) },
      { expr: `Chance of missing them all: ${p.loss.toFixed(2)}^${misses}`, result: fmtPct(Math.pow(p.loss, misses), 2) },
      { expr: `Connections per server: ${p.users} ÷ ${alive}`, result: fmtInt(p.users / alive) },
    ];
  },
  views(s) {
    const load = s.serverUp.map(() => 0);
    for (const m of s.members) if (m.connected) load[m.server]++;
    return [
      { kind: 'bars', title: 'Connections per server', items: load.map((v, i) => ({ label: `Server ${i + 1}`, value: v, display: s.serverUp[i] ? String(v) : 'Down', tone: s.serverUp[i] ? 'neutral' : 'bad' })) },
      { kind: 'note', title: 'Latest sync', text: s.last || 'No reconnects yet. Kill a server to see one.' },
    ];
  },
  actions: [
    {
      key: 'kill',
      label: 'Kill a chat server',
      run: (s) => {
        const i = s.serverUp.findIndex((up) => up);
        if (i < 0 || s.serverUp.filter(Boolean).length === 1) return;
        s.serverUp[i] = false;
        for (const m of s.members) {
          if (m.server === i && m.connected) {
            m.connected = false;
            m.reconnectAt = s.now + RECONNECT_SECONDS;
            s.disconnects++;
          }
        }
      },
    },
    {
      key: 'restore',
      label: 'Restore all servers',
      run: (s) => {
        s.serverUp = s.serverUp.map(() => true);
      },
    },
  ],
  trace: (s) => ({
    values: { seq: fmtInt(s.channel.latestSeq), cursor: fmtInt(s.members[0].cursor), synced: fmtCount(s.synced), offline: fmtPct(s.offlineNow, 1) },
  }),
  experiments: [
    {
      title: 'Hair-trigger presence',
      set: { heartbeatSec: 5, timeoutSec: 5, loss: 0.3 },
      ticks: 600,
      question: 'Show users offline after one missed heartbeat. If 30% of heartbeats get lost on a flaky mobile network, how often is a connected user wrongly shown offline?',
      options: ['Almost never', 'About 30% of the time', 'About 70% of the time'],
      answer: 1,
      explain: 'Each lost heartbeat flips the green dot. Users on patchy networks would blink online and offline constantly, and every flip would notify their friends.',
      check: (s) => {
        const rate = s.falseOffline / s.connectedSamples;
        return rate > 0.15 && rate < 0.45;
      },
    },
    {
      title: 'Add some patience',
      set: { heartbeatSec: 5, timeoutSec: 25, loss: 0.3 },
      ticks: 900,
      question: 'Now wait for 5 missed heartbeats before showing offline. How often is someone wrongly shown offline?',
      options: ['About 30%', 'About 6%', 'Under 1%'],
      answer: 2,
      explain: '0.3^5 is about 0.2%, so patience drives false alarms down exponentially. The cost is that someone who really left still looks online for up to 25 seconds, which is fine for a green dot.',
      check: (s) => s.falseOffline / s.connectedSamples < 0.015,
    },
    {
      title: 'Kill a chat server',
      set: { heartbeatSec: 5, timeoutSec: 30, loss: 0 },
      act: ['kill'],
      actAt: 30,
      ticks: 150,
      question: 'A chat server dies with a quarter of the users on it. Messages keep flowing to others. Once those users reconnect, how many messages have they lost?',
      options: ['None', 'Everything sent during the outage', 'Only the ones sent to them directly'],
      answer: 0,
      explain: 'Messages are saved before they\'re delivered, and each device remembers the last sequence number it got. On reconnecting, it asks for everything after that. The server holding the connection is disposable, while the message log is not.',
      check: (s) => s.disconnects > 0 && s.synced > 0 && missing(s) === 0,
    },
    {
      title: 'Trust the phone\'s clock',
      set: { ordering: 'client-clock', skewMs: 500, messagesPerSec: 20 },
      ticks: 300,
      question: 'Sort messages by each sender\'s clock, where phones can be off by half a second. With 20 messages a second, does the order hold?',
      options: ['Yes, half a second is small', 'No, many messages appear out of order'],
      answer: 1,
      explain: 'At that rate messages arrive every 50 ms, far less than the clock error, so replies can appear before the question they answer. Device clocks can\'t be trusted for ordering.',
      check: (s) => s.misordered > 20,
    },
    {
      title: 'Use a sequence number',
      set: { ordering: 'sequence', skewMs: 500, messagesPerSec: 20 },
      ticks: 300,
      question: 'Same bad clocks, but the server gives each message a sequence number in the channel. How many messages are out of order?',
      options: ['None', 'The same as before', 'About half'],
      answer: 0,
      explain: 'One authority picks the order, so every device agrees by definition. The IDs only need to be increasing within a channel, which is much easier than a global sequence. Clock errors stop mattering entirely.',
      check: (s) => s.channel.latestSeq > 100 && s.channel.messages.every((m, i) => m.seq === i + 1),
    },
  ],
};

const topic: Topic = {
  problem: [
    'A chat system looks simple: A sends a message to B. But messages must arrive quickly, in order, on every device, even for someone who was offline when it was sent. And it\'s the rare web system where the server has to push to the client at any moment.',
    'That need for server push means long-lived connections, usually WebSockets. These make chat servers stateful in a way most web servers aren\'t, which affects everything about how you scale them and recover from failures.',
  ],
  functional: [
    '1-on-1 and group chat',
    'Online presence indicators',
    'Sync across devices, and push to offline users',
  ],
  nonFunctional: [
    'Low delivery latency',
    'Messages are never lost, and order is consistent everywhere',
    'Millions of concurrent connections',
  ],
  diagram: {
    nodes: [
      { id: 'a', label: 'Sender', col: 0, row: 0, kind: 'client', note: 'Holds a WebSocket connection to one chat server.' },
      { id: 's1', label: 'Chat server 1', col: 1, row: 0, note: 'Stateful, since it holds the connection, but it can be replaced at any time.' },
      { id: 'id', label: 'ID generator', col: 2, row: 0, note: 'Gives each message an increasing ID within its channel, which sets the order.' },
      { id: 'q', label: 'Message queue', col: 1, row: 1, kind: 'queue', note: 'Routes messages between chat servers, and to offline delivery.' },
      { id: 'kv', label: 'Message store', col: 2, row: 1, kind: 'store', note: 'A key-value store. Chat has huge write volume and mostly recent reads.' },
      { id: 's2', label: 'Chat server 2', col: 1, row: 2, note: 'Holds the recipient\'s connection, found through a lookup of user to server.' },
      { id: 'b', label: 'Recipient', col: 0, row: 2, kind: 'client', note: 'Gets the message live, or syncs from its cursor when it next connects.' },
      { id: 'p', label: 'Presence service', col: 2, row: 2, note: 'Tracks heartbeats, and only shows offline after several are missed.' },
    ],
    edges: [
      { from: 'a', to: 's1', label: 'WebSocket' },
      { from: 's1', to: 'id' },
      { from: 's1', to: 'q' },
      { from: 'q', to: 'kv' },
      { from: 'q', to: 's2' },
      { from: 's2', to: 'b', label: 'WebSocket' },
      { from: 'b', to: 'p', dashed: true, label: 'heartbeat' },
    ],
  },
  ideas: [
    { title: 'WebSockets', body: 'Polling wastes requests, and long polling is awkward. A WebSocket is a persistent two-way connection, so the server can push instantly. The cost is holding millions of open connections.' },
    { title: 'Stateful servers', body: 'Each user is tied to the chat server holding their connection. Service discovery assigns servers, and a lookup finds who holds whom. Everything else in the system stays stateless.' },
    { title: 'Sync with a cursor', body: 'Each device remembers the highest message ID it has seen, and asks for everything newer after reconnecting. That single number handles offline gaps and multiple devices.' },
    { title: 'Presence by heartbeat', body: 'A disconnect isn\'t a reliable signal, because phones flicker in and out of signal. Clients send periodic heartbeats, and only several misses in a row mean offline.' },
  ],
  estimator: {
    vars: [
      { key: 'dau', label: 'Daily active users', unit: 'count' },
      { key: 'concurrentShare', label: 'Share online at peak (0 to 1)', unit: 'plain', assume: 0.1 },
      { key: 'memPerConn', label: 'Bytes per connection', unit: 'plain', assume: 10000 },
      { key: 'connPerServer', label: 'Connections per server', unit: 'plain', assume: 500000 },
      { key: 'msgsPerUser', label: 'Messages per user per day', unit: 'plain', assume: 40 },
      { key: 'msgBytes', label: 'Bytes per message', unit: 'plain', assume: 100 },
      { key: 'years', label: 'Years to keep', unit: 'plain', assume: 5 },
      { key: 'concurrent', label: 'Concurrent connections', unit: 'count' },
      { key: 'connMemory', label: 'Connection memory', unit: 'bytes' },
      { key: 'servers', label: 'Chat servers', unit: 'count' },
      { key: 'msgQps', label: 'Message rate', unit: 'qps' },
      { key: 'storage', label: 'Message storage', unit: 'bytes' },
    ],
    eqs: [
      { out: 'concurrent', terms: [['dau', 1], ['concurrentShare', 1]] },
      { out: 'connMemory', terms: [['concurrent', 1], ['memPerConn', 1]] },
      { out: 'servers', terms: [['concurrent', 1], ['connPerServer', -1]] },
      { out: 'msgQps', terms: [['dau', 1], ['msgsPerUser', 1], [86400, -1]] },
      { out: 'storage', terms: [['dau', 1], ['msgsPerUser', 1], ['msgBytes', 1], [365, 1], ['years', 1]] },
    ],
    starts: [
      { key: 'dau', value: 50_000_000 },
      { key: 'servers', value: 20 },
      { key: 'storage', value: 100e12 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'on_send(message):' },
    { code: '  message.seq = next ID in this channel', id: 'seq' },
    { code: '  save message to the store' },
    { code: '  push to every member who is connected' },
    { code: '' },
    { code: 'on_reconnect(device):' },
    { code: '  send every message after device.cursor', id: 'cursor' },
    { code: '  messages caught up this way', id: 'synced' },
    { code: '' },
    { code: 'online = heartbeat seen within the timeout', id: 'offline' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'WebSocket', gain: 'Instant two-way push', cost: 'Stateful servers, with millions of open connections' },
    { choice: 'Long polling', gain: 'Works everywhere, with stateless servers', cost: 'Inefficient, with higher latency' },
    { choice: 'Longer presence timeout', gain: 'No flicker', cost: 'Users look online for a while after leaving' },
    { choice: 'Per-channel IDs', gain: 'Simple and scalable', cost: 'No total order across channels, which is rarely needed' },
  ],
  interview: [
    { q: 'How do you deliver in large groups?', a: 'Small groups can fan out to each member\'s inbox. For very large channels, it\'s better to have clients read from a shared channel log, since writing to thousands of inboxes per message gets expensive.' },
    { q: 'How do you find which server a user is on?', a: 'Keep a map of user to chat server in a fast store such as Redis, updated on connect and disconnect, with a TTL so entries from dead servers disappear.' },
    { q: 'How do presence updates reach friends without a storm?', a: 'Fan out to small friend lists directly. For large groups, fetch presence only when a user opens the chat, or batch updates instead of sending each change.' },
    { q: 'What about end-to-end encryption?', a: 'The server then stores only ciphertext it can\'t read. Routing, ordering and sync all work the same, but server-side search and spam filtering become much harder.' },
  ],
  mistakes: [
    'Ordering messages by client timestamps.',
    'Treating a dropped connection as the user being offline.',
    'Saying "just use HTTP" without addressing how the server reaches the client.',
  ],
};

export default topic;
