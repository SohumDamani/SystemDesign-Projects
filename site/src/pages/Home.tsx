import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CATALOG, GROUPS } from '../topics/catalog';
import { GUIDE, LEVEL_LABEL, type Level } from '../topics/guide';
import { useProgress } from '../core/progress';
import type { Lab } from '../core/types';
import { Chart } from '../ui/Chart';
import { useSim } from '../ui/useSim';

function HeroLab({ lab }: { lab: Lab }) {
  const sim = useSim(lab);
  const { state, history } = sim.sim;
  const metrics = lab.metrics(state, sim.params);
  const steps = lab.math(state, sim.params);
  const strategy = sim.params.strategy as string;
  const serverA = state.servers[0];

  return (
    <div className="console hero-lab" ref={sim.containerRef}>
      <div className="console-bar">
        <div className="console-status">
          <span className={'pulse' + (sim.running ? ' on' : '')} aria-hidden="true" />
          <span>Live, in your browser</span>
        </div>
        <div className="seg" role="group" aria-label="Routing strategy">
          <button aria-pressed={strategy === 'round-robin'} onClick={() => sim.setParam('strategy', 'round-robin')}>
            Round robin
          </button>
          <button aria-pressed={strategy === 'least-connections'} onClick={() => sim.setParam('strategy', 'least-connections')}>
            Least connections
          </button>
        </div>
      </div>
      <div className="hero-math">
        {steps.slice(0, 3).map((s, i) => (
          <div key={i} className="math-step">
            <span>{s.expr}</span>
            <b className={s.tone ? 'tone-text-' + s.tone : undefined}>{s.result}</b>
          </div>
        ))}
      </div>
      <Chart spec={lab.charts[0]} history={history} secondsPerTick={lab.secondsPerTick} />
      <div className="hero-foot">
        <button onClick={() => sim.act('kill-a')}>{serverA?.up === false ? 'Restore server A' : 'Kill server A'}</button>
        <button onClick={sim.reset}>Reset</button>
        <span className="muted small">
          {metrics.find((m) => m.label.startsWith('Wait'))?.label}: <b>{metrics.find((m) => m.label.startsWith('Wait'))?.value}</b>
        </span>
      </div>
    </div>
  );
}

export function Home() {
  const { lessons, user } = useProgress();
  const [lab, setLab] = useState<Lab | null>(null);
  const [level, setLevel] = useState<Level | 'all'>('all');

  useEffect(() => {
    document.title = 'System Design Lab';
    import('../topics/load-balancer/index').then((m) => setLab(m.default.lab ?? null));
  }, []);

  return (
    <div className="page home">
      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">{user ? `Welcome back, ${user.name}` : `${CATALOG.length} lessons, all of them runnable`}</p>
          <h1>Don't just describe the system. Run it.</h1>
          <p className="lede">Most system design guides teach you what to say. Here you can also estimate the load, read the code, change the parameters, and break the thing, right in your browser.</p>
          <div className="row">
            <Link className="btn" to="/start">
              Choose a learning path
            </Link>
            <Link className="ghost btn-ghost" to="/learn/rate-limiter">
              Try a lab now
            </Link>
          </div>
        </div>
        {lab && <HeroLab lab={lab} />}
      </section>

      <section className="method">
        <div>
          <h2>Predict</h2>
          <p>Work out what should happen with real numbers: QPS, storage, keys moved, odds of a double charge.</p>
        </div>
        <div>
          <h2>Run</h2>
          <p>Change the parameters and watch the system react. The prediction stays on the same chart as the result.</p>
        </div>
        <div>
          <h2>Explain</h2>
          <p>Where the math and the run disagree, you've found the thing interviewers want you to talk about.</p>
        </div>
      </section>

      <div className="level-filter">
        <span className="small muted" id="level-label">
          Show
        </span>
        <div className="seg" role="group" aria-labelledby="level-label">
          {(['all', 'beginner', 'intermediate', 'advanced'] as const).map((l) => (
            <button key={l} aria-pressed={level === l} onClick={() => setLevel(l)}>
              {l === 'all' ? 'All lessons' : LEVEL_LABEL[l]}
            </button>
          ))}
        </div>
        <Link className="small" to="/glossary">
          Stuck on a word? See the glossary
        </Link>
      </div>

      {GROUPS.filter((g) => CATALOG.some((e) => e.group === g.id && (level === 'all' || GUIDE[e.id]?.level === level))).map((g) => (
        <section key={g.id} className="catalog">
          <header>
            <h2>{g.title}</h2>
            <p className="muted">{g.blurb}</p>
          </header>
          <ol className="catalog-list">
            {CATALOG.filter((e) => e.group === g.id && (level === 'all' || GUIDE[e.id]?.level === level)).map((e) => {
              const p = lessons[e.id];
              const tried = Object.keys(p?.experiments ?? {}).length;
              return (
                <li key={e.id}>
                  <Link to={`/learn/${e.id}`}>
                    <span className="catalog-num">{String(CATALOG.indexOf(e) + 1).padStart(2, '0')}</span>
                    <span className="catalog-main">
                      <b>{e.title}</b>
                      <span>{e.tagline}</span>
                    </span>
                    <span className="catalog-state">
                      {p?.completed ? 'Done' : tried ? `${tried} tried` : p?.visited ? 'Started' : <span className={'level level-' + GUIDE[e.id]?.level}>{GUIDE[e.id] ? LEVEL_LABEL[GUIDE[e.id].level] : ''}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      <footer className="site-foot">
        <p>
          Core topics follow the public chapter list of <i>System Design Interview: An Insider's Guide</i>, Volumes 1 and 2, by Alex Xu and Sahn Lam. Some extra lessons go beyond them. This site isn't affiliated with the authors. All explanations, code and labs here are original, and the books go much deeper, so they're worth buying.
        </p>
      </footer>
    </div>
  );
}
