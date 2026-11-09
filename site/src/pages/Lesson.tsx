import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { entryFor, neighbors } from '../topics/catalog';
import { GUIDE, LEVEL_LABEL } from '../topics/guide';
import { PRIMER_REFERENCES } from '../topics/primerReferences';
import { useProgress } from '../core/progress';
import type { Topic } from '../core/types';
import { CodePanel } from '../ui/Code';
import { Diagram } from '../ui/Diagram';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { Estimator } from '../ui/Estimator';
import { LabRunner } from '../ui/LabRunner';
import { Rich } from '../ui/Rich';

const modules = import.meta.glob<{ default: Topic }>('../topics/*/index.{ts,tsx}');

function loaderFor(id: string) {
  return modules[`../topics/${id}/index.ts`] ?? modules[`../topics/${id}/index.tsx`];
}

export function Lesson() {
  const { id = '' } = useParams();
  const entry = entryFor(id);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [failed, setFailed] = useState(false);
  const { lessons, markVisited, setCompleted } = useProgress();
  const refs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    setTopic(null);
    setFailed(false);
    const load = loaderFor(id);
    if (!entry || !load) {
      setFailed(true);
      return;
    }
    let live = true;
    load()
      .then((m) => {
        if (live) setTopic(m.default);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    markVisited(id);
    if (entry) document.title = `${entry.title} | System Design Lab`;
    return () => {
      live = false;
    };
    // markVisited is stable across renders for our purposes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, entry]);

  if (!entry || failed) {
    return (
      <div className="page narrow">
        <h1>{entry ? "Couldn't load this lesson" : "That lesson doesn't exist"}</h1>
        <p>{entry ? 'Your connection may have dropped, or the site was just updated. Reloading usually fixes it.' : "This lesson doesn't exist."}</p>
        <div className="row">
          {entry && (
            <button className="btn" onClick={() => location.reload()}>
              Reload the page
            </button>
          )}
          <Link to="/">Go to all lessons</Link>
        </div>
      </div>
    );
  }

  const { prev, next } = neighbors(id);
  const done = Boolean(lessons[id]?.completed);
  const guide = GUIDE[id];
  const references = [...(topic?.references ?? []), ...(PRIMER_REFERENCES[id] ?? [])];
  const sections = topic
    ? [
        ['understand', 'Understand'],
        ...(topic.estimator ? [['estimate', 'Calculations']] : []),
        ['run', topic.lab ? 'Run it' : 'Practice'],
        ['interview', 'In the interview'],
      ]
    : [];

  return (
    <article className="page">
      <header className="lesson-head">
        <p className="eyebrow">
          <span className={'level level-' + guide.level}>{LEVEL_LABEL[guide.level]}</span> {entry.book}
        </p>
        <h1>{entry.title}</h1>
        <p className="lede">{entry.tagline}</p>
        <aside className="plain-english" aria-label="In plain English">
          <h2>In plain English</h2>
          <p>{guide.plain}</p>
          <p className="remember">
            <b>The one thing to remember:</b> {guide.remember}
          </p>
          {guide.before.length > 0 && (
            <p className="before small">
              Helpful to read first:{' '}
              {guide.before.map((b, i) => (
                <span key={b}>
                  {i > 0 && ', '}
                  <Link to={`/learn/${b}`}>{entryFor(b)?.title ?? b}</Link>
                  {lessons[b]?.completed ? ' (done)' : ''}
                </span>
              ))}
            </p>
          )}
        </aside>
      </header>

      {!topic && <p className="muted">Loading the lesson…</p>}

      {topic && (
        <>
          <nav className="lesson-nav" aria-label="Lesson sections">
            {sections.map(([key, label]) => (
              <button key={key} onClick={() => refs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                {label}
              </button>
            ))}
          </nav>

          <section ref={(el) => void (refs.current.understand = el)} className="lesson-section">
            <h2>Understand the problem</h2>
            <div className="prose">
              {topic.problem.map((p, i) => (
                <p key={i}>
                  <Rich text={p} terms />
                </p>
              ))}
            </div>
            <div className="reqs">
              <div>
                <h3>What it must do</h3>
                <ul>
                  {topic.functional.map((r, i) => (
                    <li key={i}>
                      <Rich text={r} />
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>How well it must do it</h3>
                <ul>
                  {topic.nonFunctional.map((r, i) => (
                    <li key={i}>
                      <Rich text={r} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {topic.diagram && <Diagram key={id} spec={topic.diagram} />}
            <div className="ideas">
              {topic.ideas.map((idea, i) => (
                <div key={i} className="idea">
                  <h3>{idea.title}</h3>
                  <p>
                    <Rich text={idea.body} terms />
                  </p>
                </div>
              ))}
            </div>
          </section>

          {topic.estimator && (
            <section ref={(el) => void (refs.current.estimate = el)} className="lesson-section">
              <details key={id} className="calculation-details lesson-calculations">
                <summary><span className="when-closed">Show calculations</span><span className="when-open">Hide calculations</span></summary>
                <p className="section-lede">Start with a number you know and see how it affects the rest of the system.</p>
                <ErrorBoundary what="The estimator" resetKey={id}>
                  <Estimator spec={topic.estimator} />
                </ErrorBoundary>
              </details>
            </section>
          )}

          <section ref={(el) => void (refs.current.run = el)} className="lesson-section wide">
            <h2>{topic.lab ? 'Run it, and try to break it' : 'Practice it'}</h2>
            {topic.lab && <p className="section-lede">Predict what will happen, run it, then see whether the math held. Afterwards, press Resume and change anything you like.</p>}
            <ErrorBoundary what="This lab" resetKey={id}>
              {topic.lab ? <LabRunner key={id} lab={topic.lab} entry={entry} pseudocode={topic.pseudocode} sources={topic.sources} /> : topic.Practice ? <topic.Practice /> : null}
            </ErrorBoundary>
            {!topic.lab && (topic.pseudocode || topic.sources) && (
              <div className="static-code">
                <CodePanel pseudocode={typeof topic.pseudocode === 'function' ? topic.pseudocode({}) : topic.pseudocode} sources={topic.sources} />
              </div>
            )}
          </section>

          <section ref={(el) => void (refs.current.interview = el)} className="lesson-section">
            <h2>In the interview</h2>
            <h3 className="sub">Tradeoffs to say out loud</h3>
            <div className="table-wrap">
              <table className="tradeoffs">
                <thead>
                  <tr>
                    <th>Choice</th>
                    <th>You gain</th>
                    <th>You pay</th>
                  </tr>
                </thead>
                <tbody>
                  {topic.tradeoffs.map((t, i) => (
                    <tr key={i}>
                      <th scope="row">
                        <Rich text={t.choice} />
                      </th>
                      <td>
                        <Rich text={t.gain} />
                      </td>
                      <td>
                        <Rich text={t.cost} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="sub">Follow-up questions</h3>
            <div className="qa">
              {topic.interview.map((q, i) => (
                <details key={i}>
                  <summary>
                    <Rich text={q.q} />
                  </summary>
                  <p>
                    <Rich text={q.a} terms />
                  </p>
                </details>
              ))}
            </div>
            {topic.mistakes && (
              <>
                <h3 className="sub">Common mistakes</h3>
                <ul className="mistakes">
                  {topic.mistakes.map((m, i) => (
                    <li key={i}>
                      <Rich text={m} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {references.length > 0 && (
            <section className="lesson-section references" aria-labelledby="references-heading">
              <h2 id="references-heading">Sources and further reading</h2>
              <ul>
                {references.map((reference) => (
                  <li key={reference.url}>
                    <a href={reference.url} target="_blank" rel="noreferrer">{reference.name}</a>
                    {reference.note && <span> — {reference.note}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <footer className="lesson-foot">
            <button className={done ? 'ghost' : 'btn'} onClick={() => setCompleted(id, !done)} aria-pressed={done}>
              {done ? 'Marked as done. Undo' : 'Mark lesson as done'}
            </button>
            <div className="lesson-pager">
              {prev && (
                <Link to={`/learn/${prev.id}`}>
                  <span className="muted small">Previous</span>
                  {prev.title}
                </Link>
              )}
              {next && (
                <Link to={`/learn/${next.id}`} className="next">
                  <span className="muted small">Next</span>
                  {next.title}
                </Link>
              )}
            </div>
          </footer>
        </>
      )}
    </article>
  );
}
