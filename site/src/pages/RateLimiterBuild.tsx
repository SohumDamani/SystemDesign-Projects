import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { setMeta } from '../core/meta';
import {
  ALGORITHMS, COMPONENTS, LIMIT, WINDOW, canConnect, evaluateBuild,
  type Algorithm, type BuildEdge, type BuildNode, type Component,
} from '../topics/rate-limiter/build';
import './rate-limiter-build.css';

const WIDTH = 650;
const HEIGHT = 365;
const HALF_WIDTH = 62;
const HALF_HEIGHT = 21;
const kinds = Object.keys(COMPONENTS) as Component[];
const requirements = [
  { question: 'How is traffic routed?', answer: 'One load balancer sends requests to three API servers in round-robin order.' },
  { question: 'What quota should I enforce?', answer: `Allow up to ${LIMIT} requests per account across all servers in any rolling ${WINDOW}-second window.` },
  { question: 'What should happen over quota?', answer: 'Return HTTP 429 for excess requests. Other accounts keep their own quotas.' },
];

function newNode(kind: Component, slot: number): BuildNode {
  const { label, max, x, y } = COMPONENTS[kind];
  return { id: `${kind}-${slot}`, kind, label: max > 1 ? `${label} ${slot + 1}` : label, x, y: y + slot * 72, algorithm: 'fixed' };
}

function edgePoint(from: BuildNode, to: BuildNode, gap = 0) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const scale = 1 / Math.max(Math.abs(dx) / (HALF_WIDTH + gap), Math.abs(dy) / (HALF_HEIGHT + gap), 1);
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}

function Results({ result }: { result: ReturnType<typeof evaluateBuild> }) {
  if (!result.checks) return <p className="build-error">{result.error}</p>;
  const passes = result.checks.every((check) => !check.firstFailure);
  return (
    <>
      <p><strong>{passes ? 'All scenarios passed' : 'Some scenarios failed'}</strong></p>
      <div className="build-checks">
        {result.checks.map((check) => (
          <article className="build-card" key={check.title}>
            <h3>{check.title}</h3>
            <p className="small">{check.description}</p>
            <p className="build-stats">
              <strong className={check.firstFailure ? 'build-error' : 'build-pass'}>{check.firstFailure ? 'Fail' : 'Pass'}</strong>
              <span>{check.allowed} reached API</span><span>{check.rejected} rejected (429)</span>
              <span>Peak per account {check.peak}/{LIMIT}</span>
            </p>
            {check.firstFailure && <p className="small">{check.firstFailure}</p>}
          </article>
        ))}
      </div>
      <details className="build-debrief">
        <summary>Interview follow-up</summary>
        <p>How did your counter placement affect the results? What trade-off does your algorithm make between accuracy and memory? What would you do if your counter store became unavailable?</p>
      </details>
    </>
  );
}

export function RateLimiterBuild() {
  const [nodes, setNodes] = useState<BuildNode[]>(() => [newNode('client', 0)]);
  const [edges, setEdges] = useState<BuildEdge[]>([]);
  const [selected, setSelected] = useState('client-0');
  const [destination, setDestination] = useState('');
  const [interview, setInterview] = useState(false);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [result, setResult] = useState<ReturnType<typeof evaluateBuild> | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const results = useRef<HTMLElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number } | null>(null);
  const arrow = useId();
  const current = nodes.find((node) => node.id === selected);
  const choices = current ? nodes.filter((node) => canConnect(current, node, edges)) : [];

  useEffect(() => setMeta('Design a Distributed Rate Limiter', 'Build a distributed rate limiter and run simulated traffic against your design.'), []);
  useEffect(() => {
    if (result) results.current?.focus();
  }, [result]);

  function select(id: string) {
    setSelected(id);
    setDestination('');
  }

  function add(kind: Component) {
    const slot = Array.from({ length: COMPONENTS[kind].max }, (_, i) => i)
      .find((i) => !nodes.some((node) => node.id === `${kind}-${i}`));
    if (slot === undefined) return;
    const node = newNode(kind, slot);
    setNodes([...nodes, node]);
    select(node.id);
    setResult(null);
  }

  function move(id: string, x: number, y: number) {
    setNodes((previous) => previous.map((node) => node.id === id ? {
      ...node,
      x: Math.max(HALF_WIDTH + 8, Math.min(WIDTH - HALF_WIDTH - 8, x)),
      y: Math.max(HALF_HEIGHT + 8, Math.min(HEIGHT - HALF_HEIGHT - 8, y)),
    } : node));
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, node: BuildNode) {
    if (event.button !== 0) return;
    const box = canvas.current!.getBoundingClientRect();
    drag.current = { pointer: event.pointerId, x: event.clientX - box.left - node.x, y: event.clientY - box.top - node.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragNode(event: PointerEvent<HTMLButtonElement>, node: BuildNode) {
    if (drag.current?.pointer !== event.pointerId) return;
    const box = canvas.current!.getBoundingClientRect();
    move(node.id, event.clientX - box.left - drag.current.x, event.clientY - box.top - drag.current.y);
  }

  return (
    <article className="page build-page">
      <header className="build-heading">
        <Link to="/learn/rate-limiter">← Rate limiting lesson</Link>
        <h1>Design a Distributed Rate Limiter</h1>
        <p>Build a request path and run traffic through it to see where your design holds up.</p>
      </header>
      <section className="build-card build-brief" aria-labelledby="build-brief">
        <div className="build-toolbar">
          <h2 id="build-brief">Challenge brief</h2>
          <label><input type="checkbox" checked={interview} onChange={(event) => {
            setInterview(event.target.checked);
            setRevealed([]);
          }} /> Interview mode</label>
        </div>
        {interview && <p>Design a rate limiter for a distributed API. Ask for the requirements before you build.</p>}
        <ul className="build-requirements">
          {requirements.map(({ question, answer }, index) => (
            <li key={question}>
              {interview && (
                <button aria-expanded={revealed.includes(index)} onClick={() => setRevealed(revealed.includes(index)
                  ? revealed.filter((item) => item !== index) : [...revealed, index])}>{question}</button>
              )}
              {(!interview || revealed.includes(index)) && <span>{answer}</span>}
            </li>
          ))}
        </ul>
        {!interview && <details className="build-debrief">
          <summary>Hint</summary>
          <p>Follow one account’s requests through all three servers. If the limiter runs after the load balancer, how do those instances agree on the remaining quota?</p>
        </details>}
      </section>

      <section className="build-card build-workspace" aria-labelledby="build-architecture">
        <div className="build-toolbar">
          <h2 id="build-architecture">Architecture</h2>
          <button onClick={() => { setNodes([newNode('client', 0)]); setEdges([]); select('client-0'); setResult(null); }}>Reset canvas</button>
        </div>
        <div className="row build-palette" aria-label="Add components" role="group">
          {kinds.map((kind) => (
            <button key={kind} disabled={nodes.filter((node) => node.kind === kind).length >= COMPONENTS[kind].max}
              onClick={() => add(kind)}>+ {COMPONENTS[kind].label}</button>
          ))}
        </div>
        <p className="small muted">Drag boxes to arrange them. Select a box to edit its settings or connect it to another box. Arrow keys move a focused box.</p>
        <div className="build-canvas-scroll" tabIndex={0} role="region" aria-label="Architecture canvas">
          <div className="build-canvas" ref={canvas} style={{ width: WIDTH, height: HEIGHT }}>
            <svg width={WIDTH} height={HEIGHT} aria-hidden="true">
              <defs>
                <marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0 0L10 5L0 10z" fill="currentColor" />
                </marker>
              </defs>
              {edges.map(({ from, to }) => {
                const source = nodes.find((node) => node.id === from)!;
                const target = nodes.find((node) => node.id === to)!;
                const a = edgePoint(source, target);
                const b = edgePoint(target, source, 4);
                return <line key={`${from}:${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor"
                  strokeWidth="2" strokeDasharray={target.kind === 'store' ? '5 4' : undefined} markerEnd={`url(#${arrow})`} />;
              })}
            </svg>
            {nodes.map((node) => (
              <button key={node.id} className="build-node" style={{ left: node.x, top: node.y, width: HALF_WIDTH * 2, height: HALF_HEIGHT * 2 }}
                aria-pressed={selected === node.id} onClick={() => select(node.id)}
                onPointerDown={(event) => startDrag(event, node)} onPointerMove={(event) => dragNode(event, node)}
                onLostPointerCapture={() => { drag.current = null; }}
                onKeyDown={(event) => {
                  const offset = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[event.key];
                  if (!offset) return;
                  event.preventDefault();
                  move(node.id, node.x + offset[0], node.y + offset[1]);
                }}>
                {node.label}
              </button>
            ))}
          </div>
        </div>
        {current && (
          <div className="build-inspector">
            <div className="build-toolbar">
              <h3>{current.label}</h3>
              {current.kind !== 'client' && <button onClick={() => {
                setNodes(nodes.filter((node) => node.id !== current.id));
                setEdges(edges.filter(({ from, to }) => from !== current.id && to !== current.id));
                select('client-0');
                setResult(null);
              }}>Remove {current.label.toLowerCase()}</button>}
            </div>
            {current.kind === 'limiter' && <label className="build-field">Algorithm
              <select value={current.algorithm} onChange={(event) => {
                const algorithm = event.target.value as Algorithm;
                setNodes(nodes.map((node) => node.id === current.id ? { ...node, algorithm } : node));
                setResult(null);
              }}>
                {Object.entries(ALGORITHMS).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
              </select>
            </label>}
            {choices.length > 0 && <form className="build-connect" onSubmit={(event) => {
              event.preventDefault();
              if (!choices.some((node) => node.id === destination)) return;
              setEdges([...edges, { from: current.id, to: destination }]);
              setDestination('');
              setResult(null);
            }}>
              <label className="build-field">Connect to
                <select value={destination} onChange={(event) => setDestination(event.target.value)}>
                  <option value="">Choose a component</option>
                  {choices.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}
                </select>
              </label>
              <button type="submit" disabled={!destination}>Connect</button>
            </form>}
            {edges.some(({ from }) => from === current.id) && <ul className="build-connections">
              {edges.filter(({ from }) => from === current.id).map((edge) => {
                const target = nodes.find(({ id }) => id === edge.to)!;
                return <li key={edge.to}>
                  <span>{target.kind === 'store' ? 'State →' : 'Request →'} {target.label}</span>
                  <button aria-label={`Disconnect ${target.label}`} onClick={() => {
                    setEdges(edges.filter((item) => item !== edge));
                    setResult(null);
                  }}>Disconnect</button>
                </li>;
              })}
            </ul>}
            {current.kind === 'limiter' && <p className="small muted">A limiter keeps its own counters unless you connect it to a shared store.</p>}
          </div>
        )}
        <div className="build-toolbar build-run">
          <p className="small muted">Each run starts with empty counters and replays the same simulated traffic.</p>
          <button className="btn" onClick={() => setResult(evaluateBuild(nodes, edges))}>Run traffic</button>
        </div>
      </section>
      {result && <section ref={results} tabIndex={-1} className="build-results" aria-labelledby="build-results">
        <h2 id="build-results">Simulation results</h2>
        <Results result={result} />
      </section>}
    </article>
  );
}
