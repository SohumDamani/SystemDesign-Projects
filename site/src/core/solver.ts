import type { EstEq, EstimatorSpec, EstVar } from './types';
import { fmtBytes, fmtCount, fmtDuration, fmtInt } from './format';

export function formatVar(v: EstVar, value: number): string {
  switch (v.unit) {
    case 'bytes':
      return fmtBytes(value);
    case 'bytesPerSec':
      return fmtBytes(value) + '/s';
    case 'qps':
      return fmtCount(value) + ' QPS';
    case 'seconds':
      return fmtDuration(value);
    case 'percent':
      return fmtCount(value * 100) + '%';
    default:
      return fmtCount(value);
  }
}

export interface SolveStep {
  key: string;
  label: string;
  expr: string;
  value: number;
  display: string;
}

export interface SolveResult {
  values: Record<string, number>;
  steps: SolveStep[];
  unsolved: string[];
}

function literal(n: number): string {
  return n < 1 ? String(n) : fmtInt(n);
}

const keysOf = (eq: EstEq) => [eq.out, ...eq.terms.map(([t]) => t).filter((t): t is string => typeof t === 'string')];

/**
 * Every estimate is a chain of products, so any single unknown in an equation can be
 * isolated with algebra. That's what lets the math run in both directions: give it
 * storage and it finds QPS, or give it QPS and it finds storage.
 */
export function solve(spec: EstimatorSpec, startKey: string, startValue: number, overrides: Record<string, number> = {}): SolveResult {
  const byKey = new Map(spec.vars.map((v) => [v.key, v]));
  const values: Record<string, number> = {};
  for (const v of spec.vars) {
    if (v.assume !== undefined) values[v.key] = overrides[v.key] ?? v.assume;
  }
  values[startKey] = startValue;

  const steps: SolveStep[] = [];
  const pending = [...spec.eqs];

  const describe = (term: string | number): string => {
    if (typeof term === 'number') return literal(term);
    const v = byKey.get(term)!;
    return `${formatVar(v, values[term])} ${v.label.toLowerCase()}`;
  };

  const solveOne = (eq: EstEq) => {
    const target = keysOf(eq).find((k) => values[k] === undefined);
    if (target === undefined) return;

    // Rewrite so target = product(numerator) / product(denominator).
    const num: (string | number)[] = [];
    const den: (string | number)[] = [];
    if (target === eq.out) {
      for (const [t, e] of eq.terms) (e === 1 ? num : den).push(t);
    } else {
      const own = eq.terms.find(([t]) => t === target)![1];
      if (own === 1) {
        num.push(eq.out);
        for (const [t, e] of eq.terms) if (t !== target) (e === 1 ? den : num).push(t);
      } else {
        den.push(eq.out);
        for (const [t, e] of eq.terms) if (t !== target) (e === 1 ? num : den).push(t);
      }
    }
    const val = (t: string | number) => (typeof t === 'number' ? t : values[t]);
    const result = num.reduce<number>((a, t) => a * val(t), 1) / den.reduce<number>((a, t) => a * val(t), 1);
    const expr = (num.length ? num.map(describe).join(' × ') : '1') + den.map((t) => ` ÷ ${describe(t)}`).join('');
    values[target] = result;
    const v = byKey.get(target)!;
    steps.push({ key: target, label: v.label, expr, value: result, display: formatVar(v, result) });
  };

  let progress = true;
  while (progress && pending.length) {
    progress = false;
    for (let i = 0; i < pending.length; i++) {
      const unknown = keysOf(pending[i]).filter((k) => values[k] === undefined).length;
      if (unknown <= 1) {
        solveOne(pending[i]);
        pending.splice(i, 1);
        progress = true;
        break;
      }
    }
  }
  return { values, steps, unsolved: spec.vars.filter((v) => values[v.key] === undefined).map((v) => v.label) };
}
