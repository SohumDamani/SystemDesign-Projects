import type { ComponentType } from 'react';
import type { Rng } from './rng';

export type Tone = 'good' | 'bad' | 'warn' | 'neutral';
export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

export type ParamDef =
  | { key: string; label: string; kind: 'range'; min: number; max: number; step: number; unit?: string; format?: (v: number) => string; rebuild?: boolean }
  | { key: string; label: string; kind: 'choice'; options: { value: string; label: string }[]; rebuild?: boolean }
  | { key: string; label: string; kind: 'toggle'; rebuild?: boolean };

export interface Metric {
  label: string;
  value: string;
  /** Marks a number as coming from the formula or from the running system. */
  role?: 'measured' | 'predicted';
  tone?: Tone;
}

/** One line of "what the math says" shown beside the chart. */
export interface MathStep {
  expr: string;
  result: string;
  tone?: Tone;
}

export interface ChartSpec {
  title: string;
  unit?: string;
  series: { key: string; label: string; role?: 'measured' | 'predicted' | 'other' }[];
}

export type ViewBlock =
  | { kind: 'bars'; title: string; items: { label: string; value: number; display?: string; tone?: Tone }[]; max?: number; marker?: { value: number; label: string } }
  | { kind: 'cells'; title: string; items: { label: string; value?: string; tone?: Tone }[] }
  | { kind: 'table'; title: string; columns: string[]; rows: string[][] }
  | { kind: 'log'; title: string; lines: { text: string; tone?: Tone }[] }
  | { kind: 'note'; title: string; text: string };

export interface LabAction<S, P extends Params> {
  key: string;
  label: string;
  run(s: S, p: P, rng: Rng): void;
}

/** A predict, run, explain exercise. `check` is also asserted by the test suite. */
export interface Experiment<S, P extends Params> {
  title: string;
  set?: Partial<P>;
  /** Action keys fired once, `actAt` ticks into the run. */
  act?: string[];
  actAt?: number;
  ticks: number;
  question: string;
  options: string[];
  answer: number;
  explain: string;
  check(s: S, p: P, history: Record<string, number>[]): boolean;
}

export interface Trace {
  values: Record<string, string>;
  active?: string[];
  /** For a source file view: lines that really executed on the latest request. */
  lines?: number[];
}

export interface CustomViewProps<S, P extends Params> {
  state: S;
  params: P;
  tick: number;
  act(key: string): void;
  rerender(): void;
}

export interface Lab<S = any, P extends Params = any> {
  /** Simulated seconds that pass per tick. */
  secondsPerTick: number;
  params: ParamDef[];
  defaults: P;
  create(p: P, rng: Rng): S;
  step(s: S, p: P, rng: Rng): void;
  sample(s: S, p: P): Record<string, number>;
  charts: ChartSpec[];
  metrics(s: S, p: P): Metric[];
  math(s: S, p: P): MathStep[];
  views?(s: S, p: P): ViewBlock[];
  View?: ComponentType<CustomViewProps<S, P>>;
  actions?: LabAction<S, P>[];
  trace?(s: S, p: P): Trace;
  experiments: Experiment<S, P>[];
}

export interface EstVar {
  key: string;
  label: string;
  unit: 'count' | 'qps' | 'bytes' | 'bytesPerSec' | 'plain' | 'seconds' | 'percent';
  /** An assumption stays editable and is never solved for. */
  assume?: number;
}

/** out = product of terms, each raised to +1 or -1. A number is a literal constant. */
export interface EstEq {
  out: string;
  terms: [string | number, 1 | -1][];
}

export interface EstimatorSpec {
  vars: EstVar[];
  eqs: EstEq[];
  /** Variables the learner may begin from, with default values. */
  starts: { key: string; value: number }[];
}

export interface PseudoLine {
  code: string;
  /** Trace id: its live value shows beside this line, and it can highlight. */
  id?: string;
}

export interface SourceFile {
  name: string;
  code: string;
  lang: 'ts' | 'lua';
}

export type DiagramNode = {
  id: string;
  label: string;
  col: number;
  row: number;
  note?: string;
  kind?: 'client' | 'service' | 'store' | 'queue' | 'external';
};

export interface DiagramSpec {
  nodes: DiagramNode[];
  edges: { from: string; to: string; label?: string; dashed?: boolean }[];
}

export interface Topic {
  problem: string[];
  functional: string[];
  nonFunctional: string[];
  diagram?: DiagramSpec;
  ideas: { title: string; body: string }[];
  estimator?: EstimatorSpec;
  lab?: Lab<any, any>;
  /** A lesson whose practical part is not a simulation. */
  Practice?: ComponentType;
  pseudocode?: PseudoLine[] | ((p: any) => PseudoLine[]);
  sources?: SourceFile[];
  tradeoffs: { choice: string; gain: string; cost: string }[];
  interview: { q: string; a: string }[];
  mistakes?: string[];
  references?: { name: string; url: string; note?: string }[];
}
