import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TERM_PATTERN, termForWord } from '../topics/glossary';

const MAX_TERMS_PER_BLOCK = 3;

function linkTerms(text: string, seen: Set<string>): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TERM_PATTERN)) {
    const term = termForWord(match[1]);
    if (!term || seen.has(term.id) || seen.size >= MAX_TERMS_PER_BLOCK) continue;
    seen.add(term.id);
    if (match.index > last) out.push(text.slice(last, match.index));
    out.push(
      <Link key={match.index} to={`/glossary?term=${term.id}`} className="term" title={term.definition}>
        {match[1]}
      </Link>,
    );
    last = match.index + match[1].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Renders `backticks` in lesson text as inline code. With `terms`, the first few words
 * that are in the glossary become links, so nobody gets stuck on jargon.
 */
export function Rich({ text, terms = false }: { text: string; terms?: boolean }) {
  const parts = text.split('`');
  const seen = new Set<string>();
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2) return <code key={i}>{part}</code>;
        return <Fragment key={i}>{terms ? linkTerms(part, seen) : part}</Fragment>;
      })}
    </>
  );
}
