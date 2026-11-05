import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// Profiles and progress live in this browser's localStorage. There's no server and no
// password. To add real accounts, implement the same context on top of a hosted auth
// service, keeping `user`, `signIn` and `signOut` the same for the rest of the app.
export interface LessonProgress {
  visited?: boolean;
  completed?: boolean;
  /** Experiment index mapped to whether the learner predicted correctly. */
  experiments?: Record<number, boolean>;
}

interface ProgressValue {
  user: { name: string } | null;
  signIn(name: string): void;
  signOut(): void;
  lessons: Record<string, LessonProgress>;
  markVisited(id: string): void;
  setCompleted(id: string, done: boolean): void;
  recordExperiment(id: string, index: number, correct: boolean): void;
  resetProgress(): void;
}

const USER_KEY = 'sdl:user';
const keyFor = (name: string | undefined) => `sdl:progress:${name ?? 'guest'}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    const wantsObject = fallback === null || typeof fallback === 'object';
    if (wantsObject && (value === null || typeof value !== 'object' || Array.isArray(value))) return fallback;
    // A saved profile must have a text name, or the sidebar can't draw it.
    if (key === USER_KEY && typeof (value as { name?: unknown }).name !== 'string') return fallback;
    return value as T;
  } catch {
    return fallback;
  }
}

const Ctx = createContext<ProgressValue | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ name: string } | null>(() => read(USER_KEY, null));
  const [lessons, setLessons] = useState<Record<string, LessonProgress>>(() => read(keyFor(read<{ name: string } | null>(USER_KEY, null)?.name), {}));

  useEffect(() => {
    try {
      localStorage.setItem(keyFor(user?.name), JSON.stringify(lessons));
    } catch {
      // Private browsing can block storage. Progress then lasts only for this visit.
    }
  }, [lessons, user]);

  const patch = useCallback((id: string, change: (p: LessonProgress) => LessonProgress) => {
    setLessons((all) => ({ ...all, [id]: change(all[id] ?? {}) }));
  }, []);

  const value = useMemo<ProgressValue>(
    () => ({
      user,
      lessons,
      signIn(name) {
        const next = { name };
        try {
          localStorage.setItem(USER_KEY, JSON.stringify(next));
        } catch {
          // Private browsing can block storage. The profile then lasts for this visit only.
        }
        // A guest's progress carries over into a new profile.
        const existing = read<Record<string, LessonProgress>>(keyFor(name), {});
        setLessons((guest) => ({ ...guest, ...existing }));
        setUser(next);
      },
      signOut() {
        try {
          localStorage.removeItem(USER_KEY);
        } catch {
          // Nothing to clear if storage is blocked.
        }
        setUser(null);
        setLessons(read(keyFor(undefined), {}));
      },
      markVisited: (id) => patch(id, (p) => (p.visited ? p : { ...p, visited: true })),
      setCompleted: (id, done) => patch(id, (p) => ({ ...p, completed: done })),
      recordExperiment: (id, index, correct) => patch(id, (p) => ({ ...p, experiments: { ...p.experiments, [index]: correct } })),
      resetProgress: () => setLessons({}),
    }),
    [user, lessons, patch],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProgress(): ProgressValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useProgress must be used inside ProgressProvider');
  return value;
}
