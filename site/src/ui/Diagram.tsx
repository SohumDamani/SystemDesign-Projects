import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { DiagramSpec } from '../core/types';

const CELL_W = 196;
const CELL_H = 92;
const NODE_W = 136;
const NODE_H = 50;
const PAD = 12;
const STEP_MS = 3600;

function centre(col: number, row: number) {
  return { x: PAD + col * CELL_W + NODE_W / 2, y: PAD + row * CELL_H + NODE_H / 2 };
}

/** Where a line from a box's centre leaves its edge, so arrowheads stay visible. */
function edgePoint(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return from;
  const sx = dx === 0 ? Infinity : NODE_W / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : NODE_H / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: from.x + dx * s, y: from.y + dy * s };
}

export function Diagram({ spec }: { spec: DiagramSpec }) {
  const [focus, setFocus] = useState<string | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const arrowId = useId();
  const activeArrowId = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const activeLine = useRef<SVGLineElement>(null);
  const cols = Math.max(...spec.nodes.map((n) => n.col)) + 1;
  const rows = Math.max(...spec.nodes.map((n) => n.row)) + 1;
  const width = PAD * 2 + (cols - 1) * CELL_W + NODE_W;
  const height = PAD * 2 + (rows - 1) * CELL_H + NODE_H;
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const notes = spec.nodes.filter((n) => n.note);
  const focused = focus ? byId.get(focus) : null;
  const lastStep = spec.edges.length - 1;
  const active = step === null ? undefined : spec.edges[step];
  const target = active && byId.get(active.to);

  useEffect(() => {
    if (!playing || step === null) return;
    const timer = window.setTimeout(() => {
      if (step < lastStep) setStep(step + 1);
      else {
        setPlaying(false);
        setFinished(true);
      }
    }, STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, step, lastStep]);

  useEffect(() => {
    const scroll = viewport.current;
    const line = activeLine.current;
    if (step === null || !scroll || !line || scroll.scrollWidth <= scroll.clientWidth) return;
    const bounds = line.getBoundingClientRect();
    const left = bounds.left - scroll.getBoundingClientRect().left;
    scroll.scrollLeft += left + bounds.width / 2 - scroll.clientWidth / 2;
  }, [step]);

  function seek(index: number) {
    setPlaying(false);
    setFinished(false);
    setStep(index);
  }

  return (
    <figure className="diagram">
      <h3>Architecture walkthrough</h3>
      <div className="diagram-scroll" ref={viewport}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: Math.min(width, 620), maxWidth: width }} role="img" aria-label={`Architecture: ${spec.edges.map((e) => `${byId.get(e.from)?.label} to ${byId.get(e.to)?.label}`).join(', ')}.`}>
          <defs>
            <marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill="var(--ink-2)" />
            </marker>
            <marker id={activeArrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill="var(--accent)" />
            </marker>
          </defs>
          {spec.edges.map((e, i) => {
            const a = byId.get(e.from)!;
            const b = byId.get(e.to)!;
            const ca = centre(a.col, a.row);
            const cb = centre(b.col, b.row);
            const p1 = edgePoint(ca, cb);
            const p2 = edgePoint(cb, ca);
            const selected = i === step;
            return (
              <g key={i}>
                <line ref={selected ? activeLine : undefined} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  stroke={selected ? 'var(--accent)' : 'var(--ink-2)'} strokeWidth={selected ? 2.4 : 1.2}
                  strokeDasharray={e.dashed ? '4 3' : undefined} markerEnd={`url(#${selected ? activeArrowId : arrowId})`} />
                {selected && (
                  <circle className="diagram-packet" cx={p1.x} cy={p1.y} r="4"
                    data-playing={playing}
                    style={{ '--packet-x': `${p2.x - p1.x}px`, '--packet-y': `${p2.y - p1.y}px` } as CSSProperties} />
                )}
              </g>
            );
          })}
          {spec.nodes.map((n) => {
            const x = PAD + n.col * CELL_W;
            const y = PAD + n.row * CELL_H;
            return (
              <g key={n.id} className={'node node-' + (n.kind ?? 'service') + (focus === n.id ? ' focused' : '') + (active?.from === n.id || active?.to === n.id ? ' walkthrough-node' : '')} onMouseEnter={() => setFocus(n.id)} onClick={() => setFocus(n.id)}>
                <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={n.kind === 'store' ? 14 : 5} />
                <text x={x + NODE_W / 2} y={y + NODE_H / 2} textAnchor="middle" dominantBaseline="central">
                  {n.label}
                </text>
              </g>
            );
          })}
          {spec.edges
            .filter((e) => e.label)
            .map((e, i) => {
              const a = byId.get(e.from)!;
              const b = byId.get(e.to)!;
              const ca = centre(a.col, a.row);
              const cb = centre(b.col, b.row);
              const p1 = edgePoint(ca, cb);
              const p2 = edgePoint(cb, ca);
              return (
                <text key={i} x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 5} textAnchor="middle" className="edge-label">
                  {e.label}
                </text>
              );
            })}
        </svg>
      </div>
      <figcaption>
        {lastStep >= 0 && (
          <div className="diagram-player">
            <div className="row" role="group" aria-label="Walkthrough controls">
              <button type="button" className="btn" onClick={() => {
                if (playing) {
                  setPlaying(false);
                  return;
                }
                if (step === null || finished) setStep(0);
                setFinished(false);
                setPlaying(true);
              }}>{playing ? 'Pause' : step === null ? 'Play walkthrough' : finished ? 'Replay' : 'Resume'}</button>
              <button type="button" disabled={step === null || step === 0} onClick={() => seek((step ?? 0) - 1)}>Previous step</button>
              <button type="button" disabled={step === lastStep} onClick={() => seek((step ?? -1) + 1)}>Next step</button>
            </div>
            <p className="diagram-step" aria-live={playing ? 'off' : 'polite'}>
              {active && step !== null ? (
                <>
                  <span className="muted small">Connection {step + 1} of {spec.edges.length}</span>
                  <strong>{byId.get(active.from)?.label} → {target?.label}{active.label && ` · ${active.label}`}</strong>
                  {target?.note && <span>{target.note}</span>}
                </>
              ) : 'Play or step through the connections to see how the components interact.'}
            </p>
          </div>
        )}
        {notes.length > 0 && <div className="diagram-note" aria-live="polite">
          {focused?.note ? (
            <>
              <b>{focused.label}:</b> {focused.note}
            </>
          ) : (
            <span className="muted">Hover or tap a component to see what it does.</span>
          )}
        </div>}
      </figcaption>
    </figure>
  );
}
