import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GLOSSARY } from '../topics/glossary';
import { entryFor } from '../topics/catalog';

export function Glossary() {
  const [params] = useSearchParams();
  const focusId = params.get('term');
  const [query, setQuery] = useState('');
  const focusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Glossary | System Design Lab';
  }, []);

  useEffect(() => {
    setQuery('');
    if (focusId) requestAnimationFrame(() => focusRef.current?.scrollIntoView({ block: 'center' }));
  }, [focusId]);

  const q = query.trim().toLowerCase();
  const list = useMemo(
    () =>
      [...GLOSSARY]
        .sort((a, b) => a.term.localeCompare(b.term))
        .filter((t) => !q || t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q)),
    [q],
  );

  return (
    <div className="page glossary">
      <header className="lesson-head">
        <p className="eyebrow">{GLOSSARY.length} terms in plain English</p>
        <h1>Glossary</h1>
        <p className="lede">Every word that sounds harder than it is. You'll see these linked throughout the lessons.</p>
      </header>
      <input className="glossary-search" type="search" placeholder="Search terms, like shard or latency" aria-label="Search the glossary" value={query} onChange={(e) => setQuery(e.target.value)} />
      {list.length === 0 && <p className="muted">No terms match that. Try a shorter word.</p>}
      <div className="glossary-list">
        {list.map((t) => {
          const lesson = t.lesson ? entryFor(t.lesson) : undefined;
          return (
            <div key={t.id} id={`term-${t.id}`} ref={t.id === focusId ? focusRef : undefined} className={'glossary-item' + (t.id === focusId ? ' focused' : '')}>
              <h2>{t.term}</h2>
              <p>{t.definition}</p>
              {lesson && (
                <p className="small">
                  <Link to={`/learn/${lesson.id}`}>See it in action: {lesson.title}</Link>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
