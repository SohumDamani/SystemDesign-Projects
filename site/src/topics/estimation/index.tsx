import { useMemo, useState } from 'react';
import type { EstimatorSpec, Topic } from '../../core/types';
import { fmtBytes, fmtCount, fmtDuration, parseHuman } from '../../core/format';
import { solve } from '../../core/solver';

const GENERAL: EstimatorSpec = {
  vars: [
    { key: 'dau', label: 'Daily active users', unit: 'count' },
    { key: 'writesPerUser', label: 'Writes per user per day', unit: 'plain', assume: 2 },
    { key: 'readRatio', label: 'Reads per write', unit: 'plain', assume: 10 },
    { key: 'peakFactor', label: 'Peak over average', unit: 'plain', assume: 2 },
    { key: 'recordBytes', label: 'Bytes per record', unit: 'plain', assume: 500 },
    { key: 'years', label: 'Years to keep', unit: 'plain', assume: 5 },
    { key: 'replicas', label: 'Copies of the data', unit: 'plain', assume: 3 },
    { key: 'writesDay', label: 'Writes per day', unit: 'count' },
    { key: 'writeQps', label: 'Write load', unit: 'qps' },
    { key: 'readQps', label: 'Read load', unit: 'qps' },
    { key: 'peakRead', label: 'Peak read load', unit: 'qps' },
    { key: 'storage', label: 'Total storage', unit: 'bytes' },
    { key: 'ingress', label: 'Write bandwidth', unit: 'bytesPerSec' },
  ],
  eqs: [
    { out: 'writesDay', terms: [['dau', 1], ['writesPerUser', 1]] },
    { out: 'writeQps', terms: [['writesDay', 1], [86400, -1]] },
    { out: 'readQps', terms: [['writeQps', 1], ['readRatio', 1]] },
    { out: 'peakRead', terms: [['readQps', 1], ['peakFactor', 1]] },
    { out: 'storage', terms: [['writesDay', 1], ['recordBytes', 1], [365, 1], ['years', 1], ['replicas', 1]] },
    { out: 'ingress', terms: [['writeQps', 1], ['recordBytes', 1]] },
  ],
  starts: [
    { key: 'dau', value: 100_000_000 },
    { key: 'storage', value: 100e12 },
    { key: 'writeQps', value: 1000 },
    { key: 'peakRead', value: 50000 },
  ],
};

const LATENCY: [string, number][] = [
  ['Read from CPU cache', 1e-9],
  ['Read from main memory', 1e-7],
  ['Compress 1 KB', 1e-5],
  ['Read from an SSD', 1.5e-4],
  ['Round trip within a data center', 5e-4],
  ['Read 1 MB from memory', 2.5e-4],
  ['Read 1 MB from an SSD', 1e-3],
  ['Disk seek', 1e-2],
  ['Read 1 MB from a disk', 2e-2],
  ['Round trip across an ocean', 1.5e-1],
];

const POWERS: [string, string, string][] = [
  ['2^10', 'About a thousand', '1 KB'],
  ['2^20', 'About a million', '1 MB'],
  ['2^30', 'About a billion', '1 GB'],
  ['2^40', 'About a trillion', '1 TB'],
  ['2^50', 'About a quadrillion', '1 PB'],
];

interface Scenario {
  name: string;
  dau: number;
  writesPerUser: number;
  recordBytes: number;
  what: string;
}

const SCENARIOS: Scenario[] = [
  { name: 'Photo sharing app', dau: 50_000_000, writesPerUser: 0.5, recordBytes: 2_000_000, what: 'uploads half a photo a day on average, at 2 MB each' },
  { name: 'Short message service', dau: 200_000_000, writesPerUser: 20, recordBytes: 100, what: 'sends 20 messages a day, at 100 bytes each' },
  { name: 'Microblog', dau: 150_000_000, writesPerUser: 2, recordBytes: 300, what: 'posts twice a day, at 300 bytes each' },
  { name: 'URL shortener', dau: 10_000_000, writesPerUser: 1, recordBytes: 500, what: 'creates one link a day, at 500 bytes each' },
  { name: 'Ride tracking', dau: 5_000_000, writesPerUser: 300, recordBytes: 50, what: 'sends 300 location points a day, at 50 bytes each' },
];

const YEARS = 5;
const COPIES = 3;

function within(answer: number, truth: number, factor: number) {
  return answer >= truth / factor && answer <= truth * factor;
}

function Quiz() {
  const [index, setIndex] = useState(0);
  const [qpsText, setQpsText] = useState('');
  const [storageText, setStorageText] = useState('');
  const [checked, setChecked] = useState<null | { qps: number; storage: number }>(null);
  const [error, setError] = useState('');
  const s = SCENARIOS[index];
  const truth = useMemo(() => {
    const writesDay = s.dau * s.writesPerUser;
    return { qps: writesDay / 86400, storage: writesDay * s.recordBytes * 365 * YEARS * COPIES };
  }, [s]);

  const check = () => {
    const qps = parseHuman(qpsText);
    const storage = parseHuman(storageText, 'bytes');
    if (qps === null || storage === null || qps <= 0 || storage <= 0) {
      setError('Enter both answers, like 1200 or 1.2k for QPS, and 40 TB for storage.');
      return;
    }
    setError('');
    setChecked({ qps, storage });
  };

  const next = () => {
    setIndex((index + 1) % SCENARIOS.length);
    setQpsText('');
    setStorageText('');
    setChecked(null);
    setError('');
  };

  return (
    <div className="practice">
      <h3>Practice: do it in your head</h3>
      <p>
        <b>{s.name}.</b> {fmtCount(s.dau)} daily active users. Each one {s.what}. Assume you keep the data for {YEARS} years, with {COPIES} copies. Being within a factor of 2 is a good answer in an interview.
      </p>
      <div className="est-assumptions" style={{ maxWidth: 460, marginBottom: 12 }}>
        <label className="est-field">
          <span>Write QPS</span>
          <input value={qpsText} onChange={(e) => setQpsText(e.target.value)} placeholder="1200" aria-invalid={Boolean(error) && parseHuman(qpsText) === null} />
        </label>
        <label className="est-field">
          <span>Total storage</span>
          <input value={storageText} onChange={(e) => setStorageText(e.target.value)} placeholder="40 TB" aria-invalid={Boolean(error) && parseHuman(storageText, 'bytes') === null} />
        </label>
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={check}>
          Check my answer
        </button>
        <button onClick={next}>Next scenario</button>
      </div>
      {checked && (
        <div style={{ marginTop: 14 }}>
          <p className={within(checked.qps, truth.qps, 2) ? 'result-good' : 'result-bad'}>
            Write QPS: you said {fmtCount(checked.qps)}, the answer is about {fmtCount(truth.qps)}. {within(checked.qps, truth.qps, 2) ? 'Close enough.' : 'More than a factor of 2 off.'}
          </p>
          <p className={within(checked.storage, truth.storage, 2) ? 'result-good' : 'result-bad'}>
            Storage: you said {fmtBytes(checked.storage)}, the answer is about {fmtBytes(truth.storage)}. {within(checked.storage, truth.storage, 2) ? 'Close enough.' : 'More than a factor of 2 off.'}
          </p>
          <p className="muted small">
            Work: {fmtCount(s.dau)} × {s.writesPerUser} = {fmtCount(s.dau * s.writesPerUser)} writes a day. Divide by 86,400 (round to 100,000 in your head) for QPS. Multiply by {fmtBytes(s.recordBytes)} × 365 × {YEARS} × {COPIES} for storage.
          </p>
        </div>
      )}
    </div>
  );
}

function Availability() {
  const [text, setText] = useState('99.9');
  const [count, setCount] = useState(3);
  const a = parseFloat(text) / 100;
  const valid = a > 0 && a < 1;
  const series = Math.pow(a, count);
  const parallel = 1 - Math.pow(1 - a, count);
  const downtime = (x: number) => fmtDuration((1 - x) * 365 * 86400);
  return (
    <div className="practice">
      <h3>Availability: what the nines cost</h3>
      <div className="est-assumptions" style={{ maxWidth: 460, marginBottom: 10 }}>
        <label className="est-field">
          <span>Availability of one component (%)</span>
          <input value={text} onChange={(e) => setText(e.target.value)} aria-invalid={!valid} />
        </label>
        <label className="est-field">
          <span>Number of components: {count}</span>
          <input type="range" min={2} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </label>
      </div>
      {!valid && <p className="field-error">Enter a percentage between 0 and 100, like 99.9.</p>}
      {valid && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Setup</th>
                <th>Availability</th>
                <th>Downtime per year</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>One component</td>
                <td>{(a * 100).toFixed(3)}%</td>
                <td>{downtime(a)}</td>
              </tr>
              <tr>
                <td>{count} in a chain, where all must work</td>
                <td>{(series * 100).toFixed(3)}%</td>
                <td>{downtime(series)}</td>
              </tr>
              <tr>
                <td>{count} redundant, where any one is enough</td>
                <td>{(parallel * 100).toFixed(8).replace(/0+$/, '')}%</td>
                <td>{downtime(parallel)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
        Chaining services multiplies failure, and redundancy multiplies safety. This assumes failures are independent, which is the optimistic case.
      </p>
    </div>
  );
}

function Reference() {
  const max = Math.log10(LATENCY[LATENCY.length - 1][1] / LATENCY[0][1]);
  return (
    <div className="practice">
      <h3>Numbers worth memorizing</h3>
      <div className="ref-grid">
        <div>
          <p className="est-label">Latency, on a log scale (rough, and improving over time)</p>
          <div className="bars">
            {LATENCY.map(([name, sec]) => (
              <div key={name} className="bar-row" style={{ gridTemplateColumns: 'minmax(120px, 190px) minmax(0, 1fr) 60px' }}>
                <span className="bar-label" title={name}>
                  {name}
                </span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${8 + (Math.log10(sec / LATENCY[0][1]) / max) * 92}%`, background: 'var(--accent)' }} />
                </div>
                <span className="bar-value">{fmtDuration(sec).replace(' µs', ' µs')}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="est-label">Powers of two</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Power</th>
                  <th>Value</th>
                  <th>Bytes</th>
                </tr>
              </thead>
              <tbody>
                {POWERS.map((r) => (
                  <tr key={r[0]}>
                    {r.map((c) => (
                      <td key={c}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="est-label" style={{ marginTop: 14 }}>
            Handy rounding
          </p>
          <p className="small" style={{ margin: 0 }}>
            A day has about 100,000 seconds. A month has about 2.5 million, and a year about 30 million. One million requests a day is about 12 QPS.
          </p>
        </div>
      </div>
    </div>
  );
}

function Practice() {
  return (
    <>
      <Quiz />
      <Availability />
      <Reference />
    </>
  );
}

// Keeps the solver's behavior visible in one worked example for the test suite and readers.
export const WORKED_EXAMPLE = solve(GENERAL, 'storage', 10e12);

const topic: Topic = {
  problem: [
    'Early in almost every design interview you\'ll be asked how big this thing is. You aren\'t expected to be exact. You\'re expected to turn vague numbers into a rough scale fast, because that scale decides the architecture: 10 QPS and 100,000 QPS need completely different systems.',
    'The method is multiplication with well-chosen assumptions. Say your assumptions out loud, round aggressively, and label your units. The tool below works in both directions, so you can ask how much storage a user base needs, or how many users a storage budget can support.',
  ],
  functional: [
    'Estimate QPS for reads and writes, at average and at peak',
    'Estimate storage for the whole retention period',
    'Estimate bandwidth and the number of machines',
  ],
  nonFunctional: [
    'Fast enough to do on a whiteboard in a couple of minutes',
    'Right within about a factor of 2 to 10',
    'Every assumption stated out loud',
  ],
  ideas: [
    { title: 'Start from users', body: 'Most estimates start with daily active users, multiplied by actions per user per day. Dividing by 86,400 seconds gives average QPS. Peak is usually 2 to 3 times that.' },
    { title: 'Round on purpose', body: 'Treat 86,400 as 100,000 and 99,987 ÷ 9.1 as 100,000 ÷ 10. Nobody cares about the third digit, and clean numbers keep you from losing track of zeros.' },
    { title: 'Know your storage units', body: 'A thousand is KB, a million is MB, a billion is GB, a trillion is TB. So a billion rows of 1 KB is about 1 TB. That one fact covers most storage estimates.' },
    { title: 'Availability', body: 'Each extra nine cuts allowed downtime by 10. Three nines allows about 9 hours a year, and four allows about an hour. Chained services multiply, so five services at 99.9% come to about 99.5%.' },
  ],
  estimator: GENERAL,
  Practice,
  tradeoffs: [
    { choice: 'Round aggressively', gain: 'Fast, and hard to get lost', cost: 'A bit less precise, which rarely matters' },
    { choice: 'Add a peak factor', gain: 'Sizes for the moments that actually break systems', cost: 'A larger, more expensive estimate' },
    { choice: 'Count replicas in storage', gain: 'Honest about real disk needs', cost: 'Triples the number, so say it separately' },
  ],
  interview: [
    { q: 'How precise does an estimate need to be?', a: 'Right to within an order of magnitude is usually enough, since the point is to choose the right architecture. Interviewers care more about clear assumptions and sound reasoning than the final digits.' },
    { q: 'What if you don\'t know the number of users?', a: 'Ask. If the interviewer leaves it to you, state a sensible assumption and move on: "Let\'s say 10 million daily users, and I can adjust if that\'s off."' },
    { q: 'What do you do with the estimate?', a: 'Use it. Say what it implies: "100,000 reads a second means a single database can\'t do this, so we need caching and replicas." An estimate that doesn\'t change the design was wasted time.' },
  ],
  mistakes: [
    'Mixing up bits and bytes, or thousands and millions.',
    'Forgetting replication and multi-year retention in storage.',
    'Calculating in silence, instead of saying your assumptions as you go.',
  ],
};

export default topic;
