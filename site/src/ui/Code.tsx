import { useState, type ReactNode } from 'react';
import type { PseudoLine, SourceFile, Trace } from '../core/types';

const KEYWORDS: Record<SourceFile['lang'], RegExp> = {
  ts: /\b(export|import|from|const|let|var|function|return|if|else|for|while|do|of|in|new|class|interface|type|extends|implements|private|public|readonly|static|this|true|false|null|undefined|switch|case|break|continue|default|throw|try|catch|as|void|number|string|boolean)\b/,
  lua: /\b(local|function|return|if|then|else|elseif|end|for|while|do|in|and|or|not|nil|true|false)\b/,
};

function highlight(line: string, lang: SourceFile['lang']): ReactNode[] {
  const comment = lang === 'lua' ? '--' : '//';
  const pattern = new RegExp(`(${comment}.*$)|("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)|(\\b\\d[\\d_.]*\\b)|([A-Za-z_][A-Za-z0-9_]*)`, 'g');
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    if (m[1]) out.push(<span key={i++} className="tk-comment">{m[1]}</span>);
    else if (m[2]) out.push(<span key={i++} className="tk-string">{m[2]}</span>);
    else if (m[3]) out.push(<span key={i++} className="tk-number">{m[3]}</span>);
    else if (KEYWORDS[lang].test(m[4])) out.push(<span key={i++} className="tk-keyword">{m[4]}</span>);
    else out.push(m[4]);
    last = pattern.lastIndex;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

function SourceView({ file, trace }: { file: SourceFile; trace?: Trace }) {
  const executed = new Set(trace?.lines ?? []);
  return (
    <pre className="code source" tabIndex={0} aria-label={file.name}>
      {file.code.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').map((line, i) => {
        const n = i + 1;
        const local = file.lang === 'lua' ? line.match(/^\s*local (\w+)/)?.[1] : undefined;
        const value = local && trace?.values[local];
        return (
          <div key={i} className={'code-line' + (executed.has(n) ? ' ran' : '')}>
            <span className="ln">{n}</span>
            <span className="code-text">{highlight(line, file.lang)}</span>
            {value ? <span className="code-value">{value}</span> : null}
          </div>
        );
      })}
    </pre>
  );
}

function PseudoView({ lines, trace }: { lines: PseudoLine[]; trace?: Trace }) {
  const active = new Set(trace?.active ?? []);
  return (
    <pre className="code pseudo" tabIndex={0} aria-label="Pseudocode">
      {lines.map((l, i) => {
        const value = l.id ? trace?.values[l.id] : undefined;
        return (
          <div key={i} className={'code-line' + (l.id && active.has(l.id) ? ' ran' : '')}>
            <span className="code-text">{l.code || ' '}</span>
            {value ? <span className="code-value">{value}</span> : null}
          </div>
        );
      })}
    </pre>
  );
}

export function CodePanel({ pseudocode, sources, trace, note }: { pseudocode?: PseudoLine[]; sources?: SourceFile[]; trace?: Trace; note?: string }) {
  const tabs = [...(pseudocode?.length ? ['Pseudocode'] : []), ...(sources ?? []).map((s) => s.name)];
  const [tab, setTab] = useState(tabs[0]);
  if (!tabs.length) return null;
  const file = sources?.find((s) => s.name === tab);
  return (
    <div className="code-panel">
      <div className="seg code-tabs" role="group" aria-label="Choose a code view">
        {tabs.map((t) => (
          <button key={t} aria-pressed={t === tab} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {note && <p className="code-note">{note}</p>}
      {file ? <SourceView file={file} trace={trace} /> : <PseudoView lines={pseudocode ?? []} trace={trace} />}
    </div>
  );
}
