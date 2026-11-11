import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { entryFor } from '../topics/catalog';
import { GUIDE, LEVEL_LABEL, TRACKS } from '../topics/guide';
import { setMeta } from '../core/meta';
import { useProgress } from '../core/progress';

export function Start() {
  const { lessons } = useProgress();

  useEffect(() => {
    setMeta('Start here', 'Three learning paths through 43 runnable system design lessons: new to system design, interview in two weeks, or already experienced.');
  }, []);

  return (
    <div className="page start">
      <header className="lesson-head">
        <p className="eyebrow">Learning paths</p>
        <h1>Where do you want to start?</h1>
        <p className="lede">Pick the path that sounds like you. You can jump between them at any time, and your progress carries over.</p>
      </header>

      <section className="how-it-works">
        <h2>How each lesson works</h2>
        <ol>
          <li>
            <b>Read the short explanation.</b> Each lesson opens with an everyday comparison, then the real problem. Underlined words link to the <Link to="/glossary">glossary</Link>.
          </li>
          <li>
            <b>Do the math.</b> Start from any number you know, and the estimate solves itself step by step.
          </li>
          <li>
            <b>Predict, run, explain.</b> Guess what will happen, then watch it happen. It's fine to be wrong, since that's where you learn the most.
          </li>
          <li>
            <b>Break it yourself.</b> Move any slider, kill a server, and read the code that made each decision.
          </li>
        </ol>
      </section>

      <div className="tracks">
        {TRACKS.map((track) => {
          const done = track.lessons.filter((id) => lessons[id]?.completed).length;
          const next = track.lessons.find((id) => !lessons[id]?.completed) ?? track.lessons[0];
          const nextEntry = entryFor(next);
          return (
            <section key={track.id} className="track" aria-labelledby={`track-${track.id}`}>
              <header>
                <h2 id={`track-${track.id}`}>{track.title}</h2>
                <p className="muted">{track.who}</p>
              </header>
              <p>{track.description}</p>
              <div className="meter" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={track.lessons.length} aria-valuetext={`${done} of ${track.lessons.length} lessons done`} aria-label={`${track.title} progress`}>
                <div style={{ width: `${(done / track.lessons.length) * 100}%` }} />
              </div>
              <p className="small muted">
                {done} of {track.lessons.length} done
              </p>
              {nextEntry && (
                <Link className="btn" to={`/learn/${next}`}>
                  {done ? 'Continue' : 'Start'}: {nextEntry.title}
                </Link>
              )}
              <ol className="track-list">
                {track.lessons.map((id) => {
                  const entry = entryFor(id);
                  if (!entry) return null;
                  const complete = lessons[id]?.completed;
                  return (
                    <li key={id} className={complete ? 'complete' : undefined}>
                      <Link to={`/learn/${id}`}>{entry.title}</Link>
                      <span className={'level level-' + GUIDE[id]?.level}>{complete ? 'Done' : GUIDE[id] ? LEVEL_LABEL[GUIDE[id].level] : ''}</span>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
