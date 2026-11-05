// A real trie that caches its top results at every node, plus the slower ways to search.
export interface Suggestion {
  term: string;
  freq: number;
}

class TrieNode {
  children = new Map<string, TrieNode>();
  freq = 0; // non-zero when a complete query ends here
  top: Suggestion[] = [];
}

export type Mode = 'scan' | 'walk' | 'cached';

export interface SearchResult {
  results: Suggestion[];
  visited: number;
}

export class Trie {
  private root = new TrieNode();
  nodeCount = 1;
  private terms: Suggestion[] = [];

  insert(term: string, freq: number) {
    let node = this.root;
    for (const ch of term) {
      let next = node.children.get(ch);
      if (!next) {
        next = new TrieNode();
        node.children.set(ch, next);
        this.nodeCount++;
      }
      node = next;
    }
    node.freq += freq;
    this.terms.push({ term, freq: node.freq });
  }

  /** Bottom-up: each node's top K comes from merging its children's top K. */
  cacheTopResults(k: number) {
    const visit = (node: TrieNode, prefix: string): Suggestion[] => {
      const merged: Suggestion[] = node.freq ? [{ term: prefix, freq: node.freq }] : [];
      for (const [ch, child] of node.children) merged.push(...visit(child, prefix + ch));
      merged.sort((a, b) => b.freq - a.freq);
      node.top = merged.slice(0, k);
      return node.top;
    };
    visit(this.root, '');
  }

  search(prefix: string, mode: Mode, k: number): SearchResult {
    if (mode === 'scan') return this.scan(prefix, k);
    let node = this.root;
    let visited = 1;
    for (const ch of prefix) {
      const next = node.children.get(ch);
      if (!next) return { results: [], visited };
      node = next;
      visited++;
    }
    if (mode === 'cached') return { results: node.top.slice(0, k), visited };
    // Without a cache, the whole subtree must be searched to find the most popular.
    const found: Suggestion[] = [];
    const walk = (n: TrieNode, text: string) => {
      visited++;
      if (n.freq) found.push({ term: text, freq: n.freq });
      for (const [ch, child] of n.children) walk(child, text + ch);
    };
    walk(node, prefix);
    found.sort((a, b) => b.freq - a.freq);
    return { results: found.slice(0, k), visited };
  }

  /** The baseline: check every query in the table. */
  private scan(prefix: string, k: number): SearchResult {
    const found = this.terms.filter((t) => t.term.startsWith(prefix));
    found.sort((a, b) => b.freq - a.freq);
    return { results: found.slice(0, k), visited: this.terms.length };
  }
}

const HEADS = ['how to', 'what is', 'best', 'why do', 'where to', 'can you', 'when did', 'system design', 'python', 'java', 'learn', 'weather in', 'flights to', 'hotels in', 'news about', 'recipe for', 'price of', 'review of', 'tutorial on', 'history of'];
const TAILS = ['rate limiter', 'load balancer', 'consistent hashing', 'redis', 'kafka', 'docker', 'kubernetes', 'london', 'paris', 'tokyo', 'new york', 'mumbai', 'berlin', 'coffee', 'pasta', 'bread', 'pizza', 'running shoes', 'laptop', 'phone', 'guitar', 'chess', 'climate', 'jupiter', 'dinosaurs', 'sql joins', 'binary search', 'graphs', 'dynamic programming', 'interview questions', 'cloud storage', 'machine learning', 'sourdough', 'travel insurance', 'solar panels', 'electric cars', 'tax returns', 'yoga', 'meditation', 'photography', 'gardening', 'podcasts', 'marathon training', 'home office', 'budget meals', 'world cup', 'stock market', 'space travel', 'video editing', 'typing speed', 'spanish', 'french', 'japanese', 'hiking', 'camping', 'cycling', 'swimming', 'sleep', 'vitamins', 'headphones'];

/** A made-up query log, with popularity assigned by a shuffled power law. */
export function buildQueries(count: number, shuffle: (n: number) => number): Suggestion[] {
  const all: string[] = [];
  for (const h of HEADS) for (const t of TAILS) all.push(`${h} ${t}`);
  for (let i = all.length - 1; i > 0; i--) {
    const j = shuffle(i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, Math.min(count, all.length)).map((term, rank) => ({ term, freq: Math.round(1_000_000 / (rank + 1)) }));
}
