import type { ViewBlock } from '../core/types';

export function Views({ blocks }: { blocks: ViewBlock[] }) {
  return (
    <div className="views">
      {blocks.map((b, i) => (
        <section key={i} className={'view view-' + b.kind}>
          <h4>{b.title}</h4>
          {b.kind === 'bars' && <Bars block={b} />}
          {b.kind === 'cells' && (
            <div className="cells">
              {b.items.map((c, j) => (
                <div key={j} className={'cell tone-' + (c.tone ?? 'neutral')}>
                  <span>{c.label}</span>
                  {c.value !== undefined && <b>{c.value}</b>}
                </div>
              ))}
            </div>
          )}
          {b.kind === 'table' && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {b.columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((c, k) => (
                        <td key={k}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {b.kind === 'log' && (
            <div className="log" role="log">
              {b.lines.length === 0 && <div className="muted">Nothing yet</div>}
              {b.lines.map((l, j) => (
                <div key={j} className={'tone-text-' + (l.tone ?? 'neutral')}>
                  {l.text}
                </div>
              ))}
            </div>
          )}
          {b.kind === 'note' && <p className="view-note">{b.text}</p>}
        </section>
      ))}
    </div>
  );
}

function Bars({ block }: { block: Extract<ViewBlock, { kind: 'bars' }> }) {
  const peak = Math.max(block.max ?? 0, block.marker?.value ?? 0, ...block.items.map((i) => i.value), 1e-9);
  return (
    <div className="bars">
      {block.marker && (
        <div className="bars-marker-label">
          <span className="marker-swatch" aria-hidden="true" />
          {block.marker.label}
        </div>
      )}
      {block.items.map((item, i) => (
        <div key={i} className="bar-row">
          <span className="bar-label">{item.label}</span>
          <div className="bar-track">
            <div className={'bar-fill tone-bg-' + (item.tone ?? 'neutral')} style={{ width: `${Math.min(100, (item.value / peak) * 100)}%` }} />
            {block.marker && <div className="bar-marker" style={{ left: `${Math.min(100, (block.marker.value / peak) * 100)}%` }} />}
          </div>
          <span className="bar-value">{item.display ?? Math.round(item.value).toLocaleString('en-US')}</span>
        </div>
      ))}
    </div>
  );
}
