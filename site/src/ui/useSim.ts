import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { advance, createSim, experimentTick, fireAction, type Sim } from '../core/sim';
import type { Experiment, Lab, Params } from '../core/types';

const FRAME_MS = 100;
const WARM_UP_TICKS = 100;

export interface ExperimentRun {
  index: number;
  choice: number;
  done: boolean;
  confirmed: boolean;
}

/** Owns one running lab: its parameters, its clock, and any guided experiment. */
export function useSim(lab: Lab, onExperimentDone?: (index: number, correct: boolean) => void) {
  const [params, setParamsState] = useState<Params>(lab.defaults);
  const paramsRef = useRef(params);
  const seedRef = useRef(1);
  const simRef = useRef<Sim | null>(null);
  if (!simRef.current) {
    simRef.current = createSim(lab, params, seedRef.current);
    for (let i = 0; i < WARM_UP_TICKS; i++) advance(simRef.current, lab, params);
  }

  const [running, setRunning] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [speed, setSpeed] = useState(1);
  const [run, setRun] = useState<ExperimentRun | null>(null);
  const runRef = useRef<ExperimentRun | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(true);

  const rebuild = useCallback(
    (next: Params) => {
      seedRef.current += 1;
      simRef.current = createSim(lab, next, seedRef.current);
    },
    [lab],
  );

  const setParam = useCallback(
    (key: string, value: Params[string]) => {
      const next = { ...paramsRef.current, [key]: value };
      paramsRef.current = next;
      setParamsState(next);
      if (lab.params.find((d) => d.key === key)?.rebuild) rebuild(next);
      bump();
    },
    [lab, rebuild],
  );

  const reset = useCallback(() => {
    rebuild(paramsRef.current);
    runRef.current = null;
    setRun(null);
    bump();
  }, [rebuild]);

  const act = useCallback(
    (key: string) => {
      fireAction(simRef.current!, lab, paramsRef.current, key);
      bump();
    },
    [lab],
  );

  const startExperiment = useCallback(
    (index: number, choice: number) => {
      const exp = lab.experiments[index];
      const next = { ...lab.defaults, ...exp.set } as Params;
      paramsRef.current = next;
      setParamsState(next);
      rebuild(next);
      const r: ExperimentRun = { index, choice, done: false, confirmed: false };
      runRef.current = r;
      setRun(r);
      setRunning(true);
      bump();
    },
    [lab, rebuild],
  );

  const clearExperiment = useCallback(() => {
    runRef.current = null;
    setRun(null);
  }, []);

  // Keep a stable reference so a re-render never restarts the clock.
  const doneRef = useRef(onExperimentDone);
  doneRef.current = onExperimentDone;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const runningRef = useRef(running);
  runningRef.current = running;

  useEffect(() => {
    const el = containerRef.current;
    let observer: IntersectionObserver | undefined;
    if (el && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        visibleRef.current = entries[0].isIntersecting;
      });
      observer.observe(el);
    }
    const timer = window.setInterval(() => {
      const sim = simRef.current!;
      const active = runRef.current;
      if (active && !active.done) {
        const exp: Experiment<any, any> = lab.experiments[active.index];
        // A guided run finishes in about four seconds, however long it simulates.
        const batch = Math.max(1, Math.ceil(exp.ticks / 40));
        for (let i = 0; i < batch && sim.tick < exp.ticks; i++) experimentTick(sim, lab, exp, paramsRef.current);
        if (sim.tick >= exp.ticks) {
          const finished: ExperimentRun = { ...active, done: true, confirmed: exp.check(sim.state, paramsRef.current, sim.history) };
          runRef.current = finished;
          setRun(finished);
          setRunning(false);
          doneRef.current?.(active.index, active.choice === exp.answer);
        }
        bump();
        return;
      }
      if (!runningRef.current || !visibleRef.current) return;
      for (let i = 0; i < speedRef.current; i++) advance(sim, lab, paramsRef.current);
      bump();
    }, FRAME_MS);
    return () => {
      window.clearInterval(timer);
      observer?.disconnect();
    };
  }, [lab]);

  return {
    sim: simRef.current,
    params,
    setParam,
    running,
    setRunning,
    speed,
    setSpeed,
    reset,
    act,
    run,
    startExperiment,
    clearExperiment,
    containerRef,
    rerender: bump,
  };
}
