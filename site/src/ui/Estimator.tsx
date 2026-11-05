import { useMemo, useState } from 'react';
import { formatVar, solve } from '../core/solver';
import { parseHuman } from '../core/format';
import type { EstimatorSpec, EstVar } from '../core/types';

const initialText = (v: EstVar, value: number) => {
  if (v.unit === 'bytes') return formatVar(v, value).replace(' ', ' ');
  return String(value);
};

const unitHint = (v: EstVar) => {
  if (v.unit === 'bytes' || v.unit === 'bytesPerSec') return 'Try 10 TB or 500 GB';
  if (v.unit === 'qps') return 'Try 12000 or 12k';
  if (v.unit === 'seconds') return 'In seconds';
  return 'Try 10M or 2.5 billion';
};

/** Pick any number you know, and the rest of the estimate solves around it. */
export function Estimator({ spec }: { spec: EstimatorSpec }) {
  const byKey = useMemo(() => new Map(spec.vars.map((v) => [v.key, v])), [spec]);
  const assumptions = spec.vars.filter((v) => v.assume !== undefined);
  const [start, setStart] = useState(spec.starts[0].key);
  const [startText, setStartText] = useState(() => initialText(byKey.get(spec.starts[0].key)!, spec.starts[0].value));
  const [assumeText, setAssumeText] = useState<Record<string, string>>(() => Object.fromEntries(assumptions.map((v) => [v.key, String(v.assume)])));

  const startVar = byKey.get(start)!;
  const startValue = parseHuman(startText, startVar.unit === 'bytes' || startVar.unit === 'bytesPerSec' ? 'bytes' : 'number');
  const parsed: Record<string, number> = {};
  const badAssumptions: string[] = [];
  for (const v of assumptions) {
    const n = parseHuman(assumeText[v.key] ?? '');
    if (n === null || !Number.isFinite(n) || n <= 0) badAssumptions.push(v.label);
    else parsed[v.key] = n;
  }
  const startOk = startValue !== null && startValue > 0;
  const result = startOk && !badAssumptions.length ? solve(spec, start, startValue!, parsed) : null;

  const choose = (key: string) => {
    const v = byKey.get(key)!;
    const current = result?.values[key];
    const fallback = spec.starts.find((s) => s.key === key)?.value ?? 1;
    const value = current ?? fallback;
    setStart(key);
    setStartText(initialText(v, Number(value.toPrecision(3))));
  };

  return (
    <div className="estimator">
      <div className="est-grid">
        <div>
          <p className="est-label" id="est-start-label">
            Start from what you know
          </p>
          <div className="seg" role="group" aria-labelledby="est-start-label">
            {spec.starts.map((s) => (
              <button key={s.key} aria-pressed={s.key === start} onClick={() => choose(s.key)}>
                {byKey.get(s.key)!.label}
              </button>
            ))}
          </div>
          <label className="est-field est-main">
            <span>{startVar.label}</span>
            <input value={startText} onChange={(e) => setStartText(e.target.value)} aria-invalid={!startOk} placeholder={unitHint(startVar)} />
          </label>
          {!startOk && <p className="field-error">{unitHint(startVar)}. It needs to be above 0.</p>}
          <p className="est-label">Assumptions</p>
          <div className="est-assumptions">
            {assumptions.map((v) => (
              <label key={v.key} className="est-field">
                <span>{v.label}</span>
                <input value={assumeText[v.key] ?? ''} onChange={(e) => setAssumeText((t) => ({ ...t, [v.key]: e.target.value }))} aria-invalid={badAssumptions.includes(v.label)} />
              </label>
            ))}
          </div>
          {badAssumptions.length > 0 && <p className="field-error">Enter a number above 0 for {badAssumptions.join(', ').toLowerCase()}.</p>}
        </div>
        <div>
          <p className="est-label">The work, step by step</p>
          {result ? (
            <ol className="est-steps">
              {result.steps.map((s) => (
                <li key={s.key}>
                  <span className="step-expr">
                    <b>{s.label}</b> = {s.expr}
                  </span>
                  <span className="step-result">{s.display}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">Fix the highlighted field to see the math.</p>
          )}
          {result && result.unsolved.length > 0 && <p className="muted small">Not enough information to solve: {result.unsolved.join(', ')}.</p>}
        </div>
      </div>
    </div>
  );
}
