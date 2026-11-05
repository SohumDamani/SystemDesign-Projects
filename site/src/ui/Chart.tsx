import { useRef, useState } from 'react';
import type { ChartSpec } from '../core/types';
import { fmtCount, fmtDuration } from '../core/format';

const WINDOW = 300;
const HEIGHT = 150;
const GUTTER = 50;

function niceMax(m: number): number {
  if (m <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  const f = m / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

function colorFor(role: string | undefined, otherIndex: number): string {
  if (role === 'measured') return 'var(--measured)';
  if (role === 'predicted') return 'var(--predicted)';
  return otherIndex === 0 ? 'var(--series3)' : 'var(--series4)';
}

/** Time series on one shared axis. Predicted lines are dashed so color is never the only cue. */
export function Chart({ spec, history, secondsPerTick }: { spec: ChartSpec; history: Record<string, number>[]; secondsPerTick: number }) {
  const data = history.slice(-WINDOW);
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  let peak = 0;
  for (const row of data) for (const s of spec.series) if (Number.isFinite(row[s.key])) peak = Math.max(peak, row[s.key]);
  const yMax = niceMax(peak);
  const last = data[data.length - 1] ?? {};
  const offset = WINDOW - data.length;
  const span = fmtDuration(WINDOW * secondsPerTick);

  let other = 0;
  const series = spec.series.map((s) => {
    const color = colorFor(s.role, other);
    if (s.role !== 'measured' && s.role !== 'predicted') other++;
    return { ...s, color };
  });

  const points = (key: string) =>
    data
      .map((row, i) => {
        const v = Number.isFinite(row[key]) ? row[key] : 0;
        return `${offset + i},${(100 - Math.min(100, (v / yMax) * 100)).toFixed(2)}`;
      })
      .join(' ');

  const onMove = (e: React.MouseEvent) => {
    const rect = wrap.current!.getBoundingClientRect();
    const x = e.clientX - rect.left - GUTTER;
    if (x < 0) return setHover(null);
    setHover(Math.max(0, Math.min(WINDOW - 1, Math.round((x / (rect.width - GUTTER)) * (WINDOW - 1)))));
  };

  const hoverRow = hover !== null && hover >= offset ? data[hover - offset] : null;
  const width = wrap.current?.clientWidth ?? 600;
  const hoverX = hover !== null ? GUTTER + (hover / (WINDOW - 1)) * (width - GUTTER) : 0;
  const ago = hover !== null ? (WINDOW - 1 - hover) * secondsPerTick : 0;
  const summary = series.map((s) => `${s.label} ${fmtCount(last[s.key] ?? 0)}`).join(', ');

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">
          {spec.title}
          {spec.unit ? <span className="muted"> ({spec.unit})</span> : null}
        </span>
        <span className="legend">
          {series.map((s) => (
            <span key={s.key} className="legend-item">
              <svg width="18" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="18" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.role === 'predicted' ? '5 3' : undefined} />
              </svg>
              {s.label} <b>{fmtCount(last[s.key] ?? 0)}</b>
            </span>
          ))}
        </span>
      </figcaption>
      <div
        ref={wrap}
        className="plot"
        style={{ height: HEIGHT }}
        role="img"
        aria-label={`${spec.title} over the last ${span} of simulated time. Latest values: ${summary}.`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {[yMax, yMax / 2, 0].map((v, i) => {
          const top = i === 0 ? 0 : i === 1 ? HEIGHT / 2 : HEIGHT - 1;
          return (
            <div key={i}>
              <div className="gridline" style={{ left: GUTTER, top }} />
              <span className="tick" style={{ top: Math.max(0, Math.min(HEIGHT - 14, top - 7)), width: GUTTER - 8 }}>
                {fmtCount(v)}
              </span>
            </div>
          );
        })}
        <svg viewBox={`0 0 ${WINDOW - 1} 100`} preserveAspectRatio="none" className="plot-svg" style={{ left: GUTTER, width: `calc(100% - ${GUTTER}px)` }} aria-hidden="true">
          {series.map((s) => (
            <polyline
              key={s.key}
              points={points(s.key)}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.role === 'predicted' ? '6 5' : undefined}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {hoverRow && (
          <>
            <div className="crosshair" style={{ left: hoverX }} />
            <div className="chart-tip" style={{ left: Math.max(GUTTER, Math.min(width - 190, hoverX - 90)) }}>
              <div className="muted">{ago === 0 ? 'Now' : `${fmtDuration(ago)} ago`}</div>
              {series.map((s) => (
                <div key={s.key}>
                  {s.label}: <b>{fmtCount(hoverRow[s.key] ?? 0)}</b>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="axis-x" style={{ paddingLeft: GUTTER }}>
        <span>{span} ago</span>
        <span>Now</span>
      </div>
    </figure>
  );
}
