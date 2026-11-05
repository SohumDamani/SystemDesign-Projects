import { Rng } from './rng';
import type { Experiment, Lab, Params } from './types';

const HISTORY_LIMIT = 600;

export interface Sim {
  state: any;
  rng: Rng;
  tick: number;
  history: Record<string, number>[];
}

export function createSim(lab: Lab, params: Params, seed: number): Sim {
  const rng = new Rng(seed);
  return { state: lab.create(params, rng), rng, tick: 0, history: [] };
}

export function advance(sim: Sim, lab: Lab, params: Params) {
  lab.step(sim.state, params, sim.rng);
  sim.tick++;
  sim.history.push(lab.sample(sim.state, params));
  if (sim.history.length > HISTORY_LIMIT) sim.history.shift();
}

export function fireAction(sim: Sim, lab: Lab, params: Params, key: string) {
  const action = lab.actions?.find((a) => a.key === key);
  if (!action) throw new Error(`Unknown action ${key}`);
  action.run(sim.state, params, sim.rng);
}

/** One step of a guided experiment. The UI and the test suite both run through this. */
export function experimentTick(sim: Sim, lab: Lab, exp: Experiment<any, any>, params: Params) {
  if (exp.act && sim.tick === (exp.actAt ?? 0)) {
    for (const key of exp.act) fireAction(sim, lab, params, key);
  }
  advance(sim, lab, params);
}

export function runExperiment(lab: Lab, exp: Experiment<any, any>, seed: number): boolean {
  const params = { ...lab.defaults, ...exp.set };
  const sim = createSim(lab, params, seed);
  while (sim.tick < exp.ticks) experimentTick(sim, lab, exp, params);
  return exp.check(sim.state, params, sim.history);
}
