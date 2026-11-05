import { useState } from 'react';
import type { DiagramSpec } from '../core/types';

const CELL_W = 196;
const CELL_H = 92;
const NODE_W = 136;
const NODE_H = 50;
const PAD = 12;

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
  const cols = Math.max(...spec.nodes.map((n) => n.col)) + 1;
  const rows = Math.max(...spec.nodes.map((n) => n.row)) + 1;
  const width = PAD * 2 + (cols - 1) * CELL_W + NODE_W;
  const height = PAD * 2 + (rows - 1) * CELL_H + NODE_H;
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const notes = spec.nodes.filter((n) => n.note);
  const focused = focus ? byId.get(focus) : null;

  return (
    <figure className="diagram">
      <div className="diagram-scroll">
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: Math.min(width, 620), maxWidth: width }} role="img" aria-label={`Architecture: ${spec.edges.map((e) => `${byId.get(e.from)?.label} to ${byId.get(e.to)?.label}`).join(', ')}.`}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill="var(--ink-2)" />
            </marker>
          </defs>
          {spec.edges.map((e, i) => {
            const a = byId.get(e.from)!;
            const b = byId.get(e.to)!;
            const ca = centre(a.col, a.row);
            const cb = centre(b.col, b.row);
            const p1 = edgePoint(ca, cb);
            const p2 = edgePoint(cb, ca);
            return (
              <g key={i}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--ink-2)" strokeWidth="1.2" strokeDasharray={e.dashed ? '4 3' : undefined} markerEnd="url(#arrow)" />
              </g>
            );
          })}
          {spec.nodes.map((n) => {
            const x = PAD + n.col * CELL_W;
            const y = PAD + n.row * CELL_H;
            return (
              <g key={n.id} className={'node node-' + (n.kind ?? 'service') + (focus === n.id ? ' focused' : '')} onMouseEnter={() => setFocus(n.id)} onClick={() => setFocus(n.id)}>
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
      {notes.length > 0 && (
        <figcaption className="diagram-note" aria-live="polite">
          {focused?.note ? (
            <>
              <b>{focused.label}:</b> {focused.note}
            </>
          ) : (
            <span className="muted">Hover or tap a component to see what it does.</span>
          )}
        </figcaption>
      )}
    </figure>
  );
}
