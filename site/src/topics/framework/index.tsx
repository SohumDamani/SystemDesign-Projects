import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Topic } from '../../core/types';
import { CATALOG } from '../catalog';

interface Phase {
  name: string;
  minutes: number;
  goal: string;
  checks: string[];
}

const PHASES: Phase[] = [
  {
    name: 'Understand and scope',
    minutes: 6,
    goal: 'Ask questions until you know what you\'re building and for how many people.',
    checks: ['Asked what the core features are', 'Asked who the users are, and how many', 'Stated what\'s out of scope', 'Agreed on the important quality: latency, consistency, or availability', 'Did a rough estimate of QPS and storage'],
  },
  {
    name: 'High-level design',
    minutes: 12,
    goal: 'Draw the main boxes and get the interviewer to agree before going deeper.',
    checks: ['Sketched clients, servers, data stores and queues', 'Walked through the main use case end to end', 'Defined the key APIs', 'Sketched the data model', 'Asked whether the interviewer agrees with the direction'],
  },
  {
    name: 'Deep dive',
    minutes: 20,
    goal: 'Go deep on the two or three hardest parts, led by what the interviewer cares about.',
    checks: ['Asked which part to focus on', 'Explained a key algorithm or data structure', 'Compared at least two options, and chose one', 'Stated the tradeoff of that choice', 'Tied a decision back to your estimate'],
  },
  {
    name: 'Wrap up',
    minutes: 5,
    goal: 'Show you can see your own design\'s weaknesses and what comes next.',
    checks: ['Named a bottleneck and how you\'d fix it', 'Discussed what happens when a part fails', 'Mentioned monitoring and metrics', 'Said how it would scale another 10×'],
  },
];

const QUESTIONS = CATALOG.filter((e) => e.title.startsWith('Design'));

function format(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function MockInterview() {
  const [questionIndex, setQuestionIndex] = useState(() => Math.floor(Math.random() * QUESTIONS.length));
  const [phase, setPhase] = useState(0);
  const [remaining, setRemaining] = useState(PHASES[0].minutes * 60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const remainingRef = useRef(remaining);
  remainingRef.current = remaining;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setRemaining((r) => r - 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const question = QUESTIONS[questionIndex];
  const current = PHASES[phase];
  const total = PHASES.reduce((a, p) => a + p.checks.length, 0);
  const score = useMemo(() => Object.values(done).filter(Boolean).length, [done]);
  const over = remaining < 0;

  const goTo = (i: number) => {
    setPhase(i);
    setRemaining(PHASES[i].minutes * 60);
  };

  const newQuestion = () => {
    setQuestionIndex((i) => (i + 1 + Math.floor(Math.random() * (QUESTIONS.length - 1))) % QUESTIONS.length);
    setDone({});
    setRunning(false);
    goTo(0);
  };

  return (
    <div className="practice">
      <h3>Mock interview</h3>
      <p>
        Your question: <b>{question.title}</b>. Talk through it out loud, or better, with a friend who keeps you honest. Tick items only once you've really done them.
      </p>
      <div className="row">
        <button className="btn" onClick={() => setRunning(!running)}>
          {running ? 'Pause timer' : 'Start timer'}
        </button>
        <button onClick={newQuestion}>Give me another question</button>
        <Link to={`/learn/${question.id}`}>Read this lesson afterwards</Link>
      </div>
      <div className="phase-bar" role="group" aria-label="Interview phase">
        {PHASES.map((p, i) => (
          <button key={p.name} aria-pressed={i === phase} onClick={() => goTo(i)}>
            {i + 1}. {p.name}
            <br />
            <span className="muted">{p.minutes} min</span>
          </button>
        ))}
      </div>
      <div className="ref-grid">
        <div>
          <div className={'timer' + (over ? ' result-bad' : '')} role="timer" aria-label="Time left in this phase">
            {over ? `+${format(-remaining)}` : format(remaining)}
          </div>
          <p className="small muted" style={{ marginTop: 4 }}>
            {over ? 'You\'re over time for this phase. Move on.' : 'Time left in this phase'}
          </p>
          <p>{current.goal}</p>
          {phase < PHASES.length - 1 && <button onClick={() => goTo(phase + 1)}>Move to the next phase</button>}
        </div>
        <div>
          <ul className="checklist">
            {current.checks.map((c) => {
              const key = `${phase}:${c}`;
              return (
                <li key={key}>
                  <label>
                    <input type="checkbox" checked={Boolean(done[key])} onChange={(e) => setDone((d) => ({ ...d, [key]: e.target.checked }))} />
                    <span>{c}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Covered {score} of {total} across the whole interview
          </p>
        </div>
      </div>
    </div>
  );
}

const topic: Topic = {
  problem: [
    'A system design interview is a conversation about an open-ended problem, and no one expects you to build the whole thing in 45 minutes. It tests whether you can take something vague, make it concrete, weigh tradeoffs, and work with another engineer while you do it.',
    'Candidates usually fail in predictable ways: they start drawing before they understand the question, or they go silent, or they over-engineer. A simple structure prevents all three. The tool below lets you rehearse that structure against a clock.',
  ],
  functional: [
    'Turn a vague prompt into a specific set of requirements',
    'Produce a design the interviewer has agreed with',
    'Go deep where it matters most, and defend your choices',
  ],
  nonFunctional: [
    'Stay within the time limit',
    'Think out loud so the interviewer can follow and help',
    'Be honest about tradeoffs and what you don\'t know',
  ],
  ideas: [
    { title: '1. Understand and scope', body: 'Ask about features, users, scale and constraints. Write down the assumptions. Jumping straight to a solution is the most common way to fail.' },
    { title: '2. High-level design', body: 'Draw the main components and walk through the main use cases. Treat your interviewer as a teammate, and check that they agree before you go deeper.' },
    { title: '3. Deep dive', body: 'Pick the hardest parts, usually with the interviewer\'s help. Compare options and explain your choice. This is where most of the signal comes from.' },
    { title: '4. Wrap up', body: 'Point out bottlenecks, failure modes and monitoring, and how you would scale further. Finding flaws in your own design is a strength, not an admission of failure.' },
  ],
  Practice: MockInterview,
  tradeoffs: [
    { choice: 'Ask more questions up front', gain: 'You solve the right problem', cost: 'Less time to design, so cap it at around 6 minutes' },
    { choice: 'Go broad before deep', gain: 'A complete picture, with no missing pieces', cost: 'Can look shallow if you never go deep' },
    { choice: 'Name a real technology', gain: 'Shows hands-on experience', cost: 'Only helps if you can explain why it fits' },
  ],
  interview: [
    { q: 'What if you don\'t know a technology the interviewer mentions?', a: 'Say so, and reason from first principles about what it must be doing. Interviewers trust honesty, and bluffing usually falls apart at the first follow-up question.' },
    { q: 'What if the interviewer challenges your design?', a: 'Treat it as a hint rather than an attack. Ask what they\'re concerned about, weigh it, and change your design if they\'re right. Being able to change your mind is part of what\'s being tested.' },
    { q: 'How much should you estimate?', a: 'Only as much as helps you decide. A quick QPS and storage figure often sets the shape of the design. Don\'t spend five minutes on arithmetic the interviewer didn\'t ask for.' },
    { q: 'Should you design for massive scale immediately?', a: 'Design for the scale you agreed on in the first step. Begin simple, and show how the design would evolve if the numbers grew.' },
  ],
  mistakes: [
    'Designing before asking a single question.',
    'Spending half the interview on one small component.',
    'Listing technologies without saying why you chose them.',
    'Treating the interviewer as an examiner instead of a colleague.',
  ],
};

export default topic;
