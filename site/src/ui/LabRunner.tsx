import { useEffect, useState } from 'react';
import type { Lab, ParamDef, PseudoLine, SourceFile } from '../core/types';
import type { CatalogEntry } from '../topics/catalog';
import { fmtDuration } from '../core/format';
import { useProgress } from '../core/progress';
import { CHALLENGES } from '../topics/challenges';
import { Chart } from './Chart';
import { CodePanel } from './Code';
import { GuidedChallenge } from './GuidedChallenge';
import { Rich } from './Rich';
import { useSim } from './useSim';
import { Views } from './Views';

const SPEEDS = [1, 5, 25];

function Control({ def, value, onChange }: { def: ParamDef; value: any; onChange(v: any): void }) {
  const id = `param-${def.key}`;
  if (def.kind === 'range') {
    const shown = def.format ? def.format(value) : `${Number(value).toLocaleString('en-US')}${def.unit ? ' ' + def.unit : ''}`;
    return (
      <div className="control">
        <label htmlFor={id}>
          <span>{def.label}</span>
          <b>{shown}</b>
        </label>
        <input id={id} type="range" min={def.min} max={def.max} step={def.step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      </div>
    );
  }
  if (def.kind === 'choice') {
    return (
      <div className="control">
        <label htmlFor={id}>
          <span>{def.label}</span>
        </label>
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <div className="control control-toggle">
      <label htmlFor={id}>
        <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        <span>{def.label}</span>
      </label>
    </div>
  );
}

const HELP_KEY = 'sdl:lab-help-dismissed';

function LabHelp() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HELP_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  return (
    <div className="lab-help" role="note">
      <div>
        <h3>New to these labs?</h3>
        <ol>
          <li>Pick an experiment below, and choose what you think will happen.</li>
          <li>Watch it run. Then read why it happened.</li>
          <li>Move any slider and watch the numbers change. You can't break anything.</li>
        </ol>
        <p>
          <span className="key-measured" aria-hidden="true" /> A solid blue line is what the running system really did. <span className="key-predicted" aria-hidden="true" /> A dashed orange line is what the math predicted.
        </p>
      </div>
      <button
        onClick={() => {
          try {
            localStorage.setItem(HELP_KEY, '1');
          } catch {
            // Storage can be blocked. Hiding it for this visit is still fine.
          }
          setHidden(true);
        }}
      >
        Got it
      </button>
    </div>
  );
}

export function LabRunner({ lab, entry, pseudocode, sources }: { lab: Lab; entry: CatalogEntry; pseudocode?: PseudoLine[] | ((p: any) => PseudoLine[]); sources?: SourceFile[] }) {
  const { lessons, recordExperiment, completeChallenge } = useProgress();
  const sim = useSim(lab, (index, correct) => recordExperiment(entry.id, index, correct));
  const [openExp, setOpenExp] = useState<number | null>(0);
  const { state, tick, history } = sim.sim;
  const { params, run } = sim;
  const lines = typeof pseudocode === 'function' ? pseudocode(params) : pseudocode;
  const trace = lab.trace?.(state, params);
  const metrics = lab.metrics(state, params);
  const math = lab.math(state, params);
  const views = lab.views?.(state, params);
  const exp = openExp !== null ? lab.experiments[openExp] : null;
  const activeRun = run && run.index === openExp ? run : null;
  const results = lessons[entry.id]?.experiments ?? {};
  const View = lab.View;
  const challenge = CHALLENGES[entry.id];
  const predicting = exp !== null && !activeRun;

  // A prediction is only a prediction if the answer isn't already on screen. So while an
  // experiment is open and not yet started, the lab waits at zero instead of running ahead.
  useEffect(() => {
    if (openExp === null) return;
    sim.reset();
    sim.setRunning(false);
    // Only when the open experiment changes, not on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openExp]);

  return (
    <div className="console" ref={sim.containerRef}>
      <div className="console-bar">
        <div className="console-status">
          <span className={'pulse' + (sim.running && !run?.done ? ' on' : '')} aria-hidden="true" />
          <span>{sim.running ? 'Running' : predicting && tick === 0 ? 'Waiting for your prediction' : 'Paused'}</span>
          <span className="muted">t = {fmtDuration(tick * lab.secondsPerTick)}</span>
        </div>
        <div className="console-actions">
          <button onClick={() => sim.setRunning(!sim.running)}>{sim.running ? 'Pause' : 'Resume'}</button>
          <div className="seg" role="group" aria-label="Simulation speed">
            {SPEEDS.map((s) => (
              <button key={s} aria-pressed={s === sim.speed} onClick={() => sim.setSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
          <button onClick={sim.reset}>Reset</button>
        </div>
      </div>

      <div className="realness">
        <span>
          <b>Real here:</b> {entry.real}
        </span>
        <span>
          <b>Modeled:</b> {entry.modeled}
        </span>
      </div>

      <LabHelp />

      {challenge && <GuidedChallenge lab={lab} challenge={challenge}
        completed={Boolean(lessons[entry.id]?.challengeCompleted)}
        onComplete={() => completeChallenge(entry.id)} />}

      <section className="experiments" aria-label="Guided experiments">
        <div className="exp-tabs" role="group" aria-label="Choose an experiment">
          {lab.experiments.map((e, i) => (
            <button key={i} aria-pressed={openExp === i} onClick={() => setOpenExp(openExp === i ? null : i)}>
              <span className={'exp-mark ' + (results[i] === undefined ? '' : results[i] ? 'right' : 'wrong')} aria-hidden="true" />
              {i + 1}. {e.title}
            </button>
          ))}
        </div>
        {exp && (
          <div className="exp-body">
            <p className="exp-step">Predict</p>
            <p className="exp-question">
              <Rich text={exp.question} />
            </p>
            {predicting && <p className="muted small">Pick an answer and the lab runs. Or press Resume to explore freely first.</p>}
            <div className="exp-options">
              {exp.options.map((o, i) => {
                const picked = activeRun?.choice === i;
                const reveal = activeRun?.done;
                const cls = reveal ? (i === exp.answer ? ' right' : picked ? ' wrong' : '') : picked ? ' picked' : '';
                return (
                  <button key={i} className={'exp-option' + cls} onClick={() => sim.startExperiment(openExp!, i)} disabled={Boolean(activeRun && !activeRun.done)}>
                    <Rich text={o} />
                  </button>
                );
              })}
            </div>
            {activeRun && !activeRun.done && (
              <>
                <p className="exp-step">Run</p>
                <div className="meter exp-meter">
                  <div style={{ width: `${Math.min(100, (tick / exp.ticks) * 100)}%` }} />
                </div>
              </>
            )}
            {activeRun?.done && (
              <>
                <p className="exp-step">Explain</p>
                <p className={'exp-verdict ' + (activeRun.choice === exp.answer ? 'right' : 'wrong')}>{activeRun.choice === exp.answer ? 'You predicted it.' : 'Not quite. Here is what happened.'}</p>
                <p>
                  <Rich text={exp.explain} terms />
                </p>
                <p className="muted small">{activeRun.confirmed ? 'This run confirmed it: the numbers below are from the run you just watched.' : 'Randomness pushed this run off the usual result. Pick an answer again to re-run with new traffic.'}</p>
              </>
            )}
          </div>
        )}
      </section>

      <div className="console-grid">
        <aside className="controls" aria-label="Lab parameters">
          <div className="controls-inner">
          <h3>Parameters</h3>
          {lab.params.map((def) => (
            <Control key={def.key} def={def} value={params[def.key]} onChange={(v) => sim.setParam(def.key, v)} />
          ))}
          {lab.actions && lab.actions.length > 0 && (
            <>
              <h3>Actions</h3>
              <div className="action-list">
                {lab.actions.map((a) => (
                  <button key={a.key} onClick={() => sim.act(a.key)}>
                    {a.label}
                  </button>
                ))}
              </div>
            </>
          )}
          </div>
        </aside>
        <div className="readout">
          <div className="tiles">
            {metrics.map((m) => (
              <div key={`${m.role ?? 'plain'}-${m.label}`} className={'tile' + (m.tone ? ' tone-' + m.tone : '')}>
                <span className="tile-label">
                  {m.role && <i className={'role-' + m.role} aria-hidden="true" />}
                  {m.role === 'predicted' ? 'Math: ' : m.role === 'measured' ? 'Run: ' : ''}
                  {m.label}
                </span>
                <strong>{m.value}</strong>
              </div>
            ))}
          </div>
          <details className="math calculation-details">
            <summary><span className="when-closed">Show lab calculations</span><span className="when-open">Hide lab calculations</span></summary>
            {math.map((s, i) => (
              <div key={i} className="math-step">
                <span>
                  <Rich text={s.expr} />
                </span>
                <b className={s.tone ? 'tone-text-' + s.tone : undefined}>{s.result}</b>
              </div>
            ))}
          </details>
          {lab.charts.map((c) => (
            <Chart key={c.title} spec={c} history={history} secondsPerTick={lab.secondsPerTick} />
          ))}
          {View && <View state={state} params={params} tick={tick} act={sim.act} rerender={sim.rerender} />}
          {views && <Views blocks={views} />}
        </div>
      </div>

      {(lines?.length || sources?.length) ? (
        <section className="console-code">
          <h3>The code making these decisions</h3>
          <CodePanel pseudocode={lines} sources={sources} trace={trace} note={trace ? 'Values update as the lab runs and show the latest request.' : undefined} />
        </section>
      ) : null}
    </div>
  );
}
