import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { CATALOG, GROUPS } from './topics/catalog';
import { setMeta } from './core/meta';
import { useProgress } from './core/progress';
import { Glossary } from './pages/Glossary';
import { Home } from './pages/Home';
import { Lesson } from './pages/Lesson';
import { SignIn } from './pages/SignIn';
import { Start } from './pages/Start';

type Theme = 'light' | 'dark';

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('sdl:theme');
    } catch {
      // Blocked storage: fall back to the system theme.
    }
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('sdl:theme', theme);
    } catch {
      // Blocked or full storage: the theme just won't be remembered.
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

function statusOf(p?: { visited?: boolean; completed?: boolean; experiments?: Record<number, boolean> }): 'none' | 'started' | 'done' {
  if (p?.completed) return 'done';
  if (p?.visited || (p?.experiments && Object.keys(p.experiments).length)) return 'started';
  return 'none';
}

const STATUS_TEXT = { none: '', started: 'started', done: 'done' } as const;

function Sidebar({ open, onClose }: { open: boolean; onClose(): void }) {
  const { lessons, user, signOut } = useProgress();
  const [query, setQuery] = useState('');
  const [theme, toggleTheme] = useTheme();
  const searchRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  const done = useMemo(() => CATALOG.filter((e) => lessons[e.id]?.completed).length, [lessons]);
  const matches = CATALOG.filter((e) => !q || e.title.toLowerCase().includes(q) || e.tagline.toLowerCase().includes(q));

  // On a phone the drawer opens over the page, so put the keyboard in the search box.
  useEffect(() => {
    if (open) searchRef.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <aside id="sidebar" className={'sidebar' + (open ? ' open' : '')} aria-label="Lessons">
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
        <div className="meter" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={CATALOG.length} aria-valuetext={`${done} of ${CATALOG.length} lessons done`} aria-label="Lessons completed">
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
      <input ref={searchRef} className="side-search" type="search" placeholder="Find a lesson" aria-label="Find a lesson" value={query} onChange={(e) => setQuery(e.target.value)} />
      <nav className="side-nav">
        {matches.length === 0 && (
          <p className="side-empty small muted" role="status">
            No lessons match “{query.trim()}”.{' '}
            <button className="link-button" onClick={() => setQuery('')}>
              Clear search
            </button>{' '}
            or try the <Link to="/glossary" onClick={onClose}>glossary</Link>.
          </p>
        )}
        {GROUPS.map((g) => {
          const items = matches.filter((e) => e.group === g.id);
          if (!items.length) return null;
          return (
            <div key={g.id} className="side-group">
              <h2>{g.title}</h2>
              {items.map((e) => {
                const status = statusOf(lessons[e.id]);
                return (
                  <NavLink key={e.id} to={`/learn/${e.id}`} onClick={onClose} className={({ isActive }) => 'side-link' + (isActive ? ' active' : '')}>
                    <span className={'status ' + status} aria-hidden="true" />
                    <span>{e.title.replace(/^Design (a |an )?/, '').replace(/^./, (c) => c.toUpperCase())}</span>
                    {status !== 'none' && <span className="sr-only">, {STATUS_TEXT[status]}</span>}
                  </NavLink>
                );
              })}
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
  const menuButton = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  const firstRender = useRef(true);
  useEffect(() => {
    window.scrollTo(0, 0);
    // Pages that set their own title do so after this runs.
    if (pathname === '/signin') setMeta('Sign in');
    else if (!/^\/(learn\/|glossary|start)|^\/$/.test(pathname)) setMeta('Page not found');
    // Moving focus to the new page tells screen readers it changed. Not on first load, so the page starts at the top.
    if (firstRender.current) firstRender.current = false;
    else document.getElementById('main')?.focus({ preventScroll: true });
  }, [pathname]);
  const closeMenu = () => {
    setMenu(false);
    menuButton.current?.focus();
  };
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  return (
    <div className="shell">
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="topbar">
        <button ref={menuButton} className="ghost" onClick={() => setMenu(true)} aria-expanded={menu} aria-controls="sidebar">
          Lessons
        </button>
        <Link to="/" className="brand">
          System Design Lab
        </Link>
      </header>
      <Sidebar open={menu} onClose={closeMenu} />
      {menu && <div className="scrim" onClick={closeMenu} aria-hidden="true" />}
      <main className="main" id="main" tabIndex={-1} inert={menu || undefined}>
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
