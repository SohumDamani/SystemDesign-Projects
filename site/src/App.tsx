import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { CATALOG, GROUPS } from './topics/catalog';
import { useProgress } from './core/progress';
import { Glossary } from './pages/Glossary';
import { Home } from './pages/Home';
import { Lesson } from './pages/Lesson';
import { SignIn } from './pages/SignIn';
import { Start } from './pages/Start';

type Theme = 'light' | 'dark';

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('sdl:theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('sdl:theme', theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

function statusOf(p?: { visited?: boolean; completed?: boolean; experiments?: Record<number, boolean> }): 'none' | 'started' | 'done' {
  if (p?.completed) return 'done';
  if (p?.visited || (p?.experiments && Object.keys(p.experiments).length)) return 'started';
  return 'none';
}

function Sidebar({ open, onClose }: { open: boolean; onClose(): void }) {
  const { lessons, user, signOut } = useProgress();
  const [query, setQuery] = useState('');
  const [theme, toggleTheme] = useTheme();
  const q = query.trim().toLowerCase();
  const done = useMemo(() => CATALOG.filter((e) => lessons[e.id]?.completed).length, [lessons]);

  return (
    <aside className={'sidebar' + (open ? ' open' : '')} aria-label="Lessons">
      <div className="side-head">
        <Link to="/" className="brand" onClick={onClose}>
          <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
            <path d="M3 24l7-10 6 6 6-14 7 18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          System Design Lab
        </Link>
        <button className="ghost side-close" onClick={onClose} aria-label="Close menu">
          Close
        </button>
      </div>
      <div className="side-progress">
        <div className="meter" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={CATALOG.length} aria-label="Lessons completed">
          <div style={{ width: `${(done / CATALOG.length) * 100}%` }} />
        </div>
        <span>
          {done} of {CATALOG.length} lessons done
        </span>
      </div>
      <div className="side-links">
        <NavLink to="/start" onClick={onClose}>
          Start here
        </NavLink>
        <NavLink to="/glossary" onClick={onClose}>
          Glossary
        </NavLink>
      </div>
      <input className="side-search" type="search" placeholder="Find a lesson" aria-label="Find a lesson" value={query} onChange={(e) => setQuery(e.target.value)} />
      <nav className="side-nav">
        {GROUPS.map((g) => {
          const items = CATALOG.filter((e) => e.group === g.id && (!q || e.title.toLowerCase().includes(q) || e.tagline.toLowerCase().includes(q)));
          if (!items.length) return null;
          return (
            <div key={g.id} className="side-group">
              <h2>{g.title}</h2>
              {items.map((e) => (
                <NavLink key={e.id} to={`/learn/${e.id}`} onClick={onClose} className={({ isActive }) => 'side-link' + (isActive ? ' active' : '')}>
                  <span className={'status ' + statusOf(lessons[e.id])} aria-hidden="true" />
                  <span>{e.title.replace(/^Design (a |an )?/, '').replace(/^./, (c) => c.toUpperCase())}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="side-foot">
        {user ? (
          <div className="side-user">
            <span title={user.name}>{user.name}</span>
            <button className="ghost" onClick={signOut}>
              Sign out
            </button>
          </div>
        ) : (
          <Link className="btn wide" to="/signin" onClick={onClose}>
            Sign in to save progress
          </Link>
        )}
        <button className="ghost wide" onClick={toggleTheme}>
          {theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
        </button>
      </div>
    </aside>
  );
}

export function App() {
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="shell">
      <header className="topbar">
        <button className="ghost" onClick={() => setMenu(true)}>
          Lessons
        </button>
        <Link to="/" className="brand">
          System Design Lab
        </Link>
      </header>
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      {menu && <div className="scrim" onClick={() => setMenu(false)} aria-hidden="true" />}
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/learn/:id" element={<Lesson />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/start" element={<Start />} />
          <Route path="/glossary" element={<Glossary />} />
          <Route
            path="*"
            element={
              <div className="page narrow">
                <h1>That page doesn't exist</h1>
                <p>
                  <Link to="/">Go to all lessons</Link>
                </p>
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
