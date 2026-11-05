import { describe, expect, it } from 'vitest';
import { CATALOG, entryFor } from '../src/topics/catalog';
import { GUIDE, TRACKS } from '../src/topics/guide';
import { GLOSSARY } from '../src/topics/glossary';
import { advance, createSim, fireAction, runExperiment } from '../src/core/sim';
import { solve } from '../src/core/solver';
import type { Topic } from '../src/core/types';

const modules = import.meta.glob<{ default: Topic }>('../src/topics/*/index.{ts,tsx}');
const SEEDS = [1, 2, 3];

const loaded = Object.entries(modules).map(([path, load]) => ({
  id: path.split('/').at(-2)!,
  load,
}));

describe('catalog', () => {
  it('has a lesson for every catalog entry', () => {
    const ids = new Set(loaded.map((m) => m.id));
    expect(CATALOG.map((e) => e.id).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('gives every lesson a plain-English guide, with valid links', () => {
    for (const e of CATALOG) {
      const g = GUIDE[e.id];
      expect(g, `guide for ${e.id}`).toBeTruthy();
      expect(g.plain.length, e.id).toBeGreaterThan(40);
      expect(g.remember.length, e.id).toBeGreaterThan(20);
      for (const b of g.before) expect(entryFor(b), `${e.id} prerequisite ${b}`).toBeTruthy();
    }
    expect(Object.keys(GUIDE).filter((id) => !entryFor(id))).toEqual([]);
  });

  it('never makes a lesson depend on itself through its prerequisites', () => {
    const visit = (id: string, path: string[]): void => {
      expect(path.includes(id), `cycle: ${[...path, id].join(' -> ')}`).toBe(false);
      for (const b of GUIDE[id].before) visit(b, [...path, id]);
    };
    for (const e of CATALOG) visit(e.id, []);
  });

  it('builds tracks only from real lessons', () => {
    for (const track of TRACKS) {
      expect(new Set(track.lessons).size, track.id).toBe(track.lessons.length);
      for (const id of track.lessons) expect(entryFor(id), `${track.id}: ${id}`).toBeTruthy();
    }
  });

  it('links every glossary term to a real lesson', () => {
    expect(new Set(GLOSSARY.map((t) => t.id)).size).toBe(GLOSSARY.length);
    for (const t of GLOSSARY) if (t.lesson) expect(entryFor(t.lesson), t.id).toBeTruthy();
  });

  it('has no lessons missing from the catalog', () => {
    expect(loaded.filter((m) => !entryFor(m.id)).map((m) => m.id)).toEqual([]);
  });
});

describe.each(loaded)('$id', ({ load }) => {
  it('has complete lesson content', async () => {
    const t = (await load()).default;
    expect(t.problem.length).toBeGreaterThan(0);
    expect(t.functional.length).toBeGreaterThan(0);
    expect(t.nonFunctional.length).toBeGreaterThan(0);
    expect(t.ideas.length).toBeGreaterThan(1);
    expect(t.tradeoffs.length).toBeGreaterThan(1);
    expect(t.interview.length).toBeGreaterThan(1);
    expect(Boolean(t.lab || t.Practice)).toBe(true);
    if (t.diagram) {
      const ids = new Set(t.diagram.nodes.map((n) => n.id));
      for (const e of t.diagram.edges) {
        expect(ids.has(e.from), `edge from ${e.from}`).toBe(true);
        expect(ids.has(e.to), `edge to ${e.to}`).toBe(true);
      }
    }
  });

  it('runs its lab and produces finite numbers', async () => {
    const { lab } = (await load()).default;
    if (!lab) return;
    expect(lab.experiments.length).toBeGreaterThan(1);
    const sim = createSim(lab, lab.defaults, 7);
    for (let i = 0; i < 120; i++) advance(sim, lab, lab.defaults);
    for (const row of sim.history) {
      for (const [key, value] of Object.entries(row)) expect(Number.isFinite(value), `sample ${key}`).toBe(true);
    }
    const keys = new Set(Object.keys(sim.history[0]));
    for (const chart of lab.charts) for (const s of chart.series) expect(keys.has(s.key), `series ${s.key}`).toBe(true);
    for (const m of lab.metrics(sim.state, lab.defaults)) {
      expect(m.value).not.toMatch(/NaN|undefined|Infinity/);
    }
    for (const m of lab.math(sim.state, lab.defaults)) {
      expect(m.expr + m.result).not.toMatch(/NaN|undefined|Infinity/);
    }
    lab.views?.(sim.state, lab.defaults);
    lab.trace?.(sim.state, lab.defaults);
    for (const a of lab.actions ?? []) fireAction(sim, lab, lab.defaults, a.key);
    for (let i = 0; i < 20; i++) advance(sim, lab, lab.defaults);
  });

  it('keeps every experiment\'s claim true across random seeds', async () => {
    const { lab } = (await load()).default;
    if (!lab) return;
    lab.experiments.forEach((exp, index) => {
      expect(exp.answer, `experiment ${index} answer`).toBeLessThan(exp.options.length);
      for (const seed of SEEDS) {
        expect(runExperiment(lab, exp, seed), `"${exp.title}" with seed ${seed}`).toBe(true);
      }
    });
  });

  it('feeds every traced pseudocode line from the lab', async () => {
    const { lab, pseudocode } = (await load()).default;
    if (!lab?.trace || !pseudocode) return;
    const sim = createSim(lab, lab.defaults, 3);
    for (let i = 0; i < 40; i++) advance(sim, lab, lab.defaults);
    const trace = lab.trace(sim.state, lab.defaults);
    const lines = typeof pseudocode === 'function' ? pseudocode(lab.defaults) : pseudocode;
    for (const line of lines) {
      if (!line.id) continue;
      const known = line.id in trace.values || line.id === 'allow' || line.id === 'reject' || trace.active?.includes(line.id);
      expect(known, `pseudocode id "${line.id}"`).toBe(true);
    }
  });

  it('solves its estimate from every starting point, and round-trips', async () => {
    const { estimator } = (await load()).default;
    if (!estimator) return;
    const first = estimator.starts[0];
    const forward = solve(estimator, first.key, first.value);
    expect(forward.unsolved, 'forward solve').toEqual([]);
    for (const s of estimator.starts) {
      const solved = solve(estimator, s.key, s.value);
      expect(solved.unsolved, `start from ${s.key}`).toEqual([]);
      for (const step of solved.steps) expect(step.display).not.toMatch(/NaN|undefined|Infinity|n\/a/);
      // Feeding a forward result back in must give the original number.
      const back = solve(estimator, s.key, forward.values[s.key]);
      expect(back.values[first.key]).toBeCloseTo(first.value, 3);
    }
  });
});
