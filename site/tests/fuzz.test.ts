import { describe, expect, it } from 'vitest';
import { advance, createSim, fireAction } from '../src/core/sim';
import { Rng } from '../src/core/rng';
import { solve } from '../src/core/solver';
import type { Lab, ParamDef, Params, Topic, ViewBlock } from '../src/core/types';

const modules = import.meta.glob<{ default: Topic }>('../src/topics/*/index.{ts,tsx}');
const loaded = Object.entries(modules).map(([path, load]) => ({ id: path.split('/').at(-2)!, load }));

const BAD_TEXT = /NaN|undefined|Infinity|\[object/;

function extremes(def: ParamDef): (number | string | boolean)[] {
  if (def.kind === 'range') return [def.min, def.max];
  if (def.kind === 'choice') return def.options.map((o) => o.value);
  return [true, false];
}

function randomValue(def: ParamDef, rng: Rng): number | string | boolean {
  if (def.kind === 'range') {
    const steps = Math.floor((def.max - def.min) / def.step);
    return Number((def.min + rng.int(steps + 1) * def.step).toFixed(6));
  }
  if (def.kind === 'choice') return rng.pick(def.options).value;
  return rng.chance(0.5);
}

function assertClean(lab: Lab, state: unknown, params: Params, where: string) {
  for (const m of lab.metrics(state, params)) {
    expect(`${m.label} ${m.value}`, where).not.toMatch(BAD_TEXT);
  }
  for (const s of lab.math(state, params)) {
    expect(`${s.expr} ${s.result}`, where).not.toMatch(BAD_TEXT);
  }
  const views: ViewBlock[] = lab.views?.(state, params) ?? [];
  expect(JSON.stringify(views), where).not.toMatch(BAD_TEXT);
  const trace = lab.trace?.(state, params);
  if (trace) expect(JSON.stringify(trace.values), where).not.toMatch(/NaN|undefined|Infinity|\[object/);
}

function runFor(lab: Lab, params: Params, seed: number, ticks: number, where: string) {
  const sim = createSim(lab, params, seed);
  for (let i = 0; i < ticks; i++) advance(sim, lab, params);
  for (const row of sim.history) {
    for (const [key, value] of Object.entries(row)) expect(Number.isFinite(value), `${where}: sample ${key} = ${value}`).toBe(true);
  }
  assertClean(lab, sim.state, params, where);
  return sim;
}

describe.each(loaded)('$id under stress', ({ load }) => {
  it('survives every parameter at its extremes', async () => {
    const { lab } = (await load()).default;
    if (!lab) return;
    for (const def of lab.params) {
      for (const value of extremes(def)) {
        const params = { ...lab.defaults, [def.key]: value };
        runFor(lab, params, 11, 25, `${def.key}=${value}`);
      }
    }
  });

  it('survives random parameter combinations and random actions', async () => {
    const { lab } = (await load()).default;
    if (!lab) return;
    const rng = new Rng(2024);
    for (let round = 0; round < 12; round++) {
      const params: Params = { ...lab.defaults };
      for (const def of lab.params) params[def.key] = randomValue(def, rng);
      const where = `round ${round}: ${JSON.stringify(params)}`;
      const sim = createSim(lab, params, round + 1);
      for (let t = 0; t < 40; t++) {
        // Changing a non-rebuilding parameter mid-run is what learners do with a slider.
        if (t === 20) {
          const def = rng.pick(lab.params);
          if (def.kind !== 'range' || !def.rebuild) {
            if (!('rebuild' in def && def.rebuild)) params[def.key] = randomValue(def, rng);
          }
        }
        if (lab.actions?.length && rng.chance(0.15)) fireAction(sim, lab, params, rng.pick(lab.actions).key);
        advance(sim, lab, params);
      }
      for (const row of sim.history) {
        for (const [key, value] of Object.entries(row)) expect(Number.isFinite(value), `${where}: sample ${key} = ${value}`).toBe(true);
      }
      assertClean(lab, sim.state, params, where);
    }
  });

  it('runs fast enough for the 25× speed button at defaults', async () => {
    const { lab } = (await load()).default;
    if (!lab) return;
    const sim = createSim(lab, lab.defaults, 5);
    const start = performance.now();
    const ticks = 150;
    for (let i = 0; i < ticks; i++) advance(sim, lab, lab.defaults);
    const perTick = (performance.now() - start) / ticks;
    // 25 ticks must fit in one 100 ms frame, with time left for React.
    expect(perTick, `${perTick.toFixed(2)} ms per tick`).toBeLessThan(process.env.CI ? 15 : 3.5);
  });

  it('keeps the estimator stable on extreme input', async () => {
    const { estimator } = (await load()).default;
    if (!estimator) return;
    for (const start of estimator.starts) {
      for (const value of [1e-3, 1, 1e15]) {
        const res = solve(estimator, start.key, value);
        expect(res.unsolved).toEqual([]);
        for (const step of res.steps) {
          expect(Number.isFinite(step.value), `${start.key}=${value}: ${step.label}`).toBe(true);
          expect(step.display + step.expr).not.toMatch(BAD_TEXT);
        }
      }
    }
  });
});
