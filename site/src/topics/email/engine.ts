// A real inverted index over a mailbox, so search doesn't have to read every message.
export interface Mail {
  id: number;
  from: string;
  subject: string;
  body: string;
  threadId: number;
  folder: 'inbox' | 'sent' | 'spam';
}

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** Maps each word to the sorted list of mails containing it. */
export class InvertedIndex {
  private postings = new Map<string, number[]>();
  entries = 0;

  add(mail: Mail) {
    const words = new Set(tokenize(`${mail.from} ${mail.subject} ${mail.body}`));
    for (const word of words) {
      const list = this.postings.get(word);
      if (list) list.push(mail.id);
      else this.postings.set(word, [mail.id]);
      this.entries++;
    }
    return words.size;
  }

  get terms() {
    return this.postings.size;
  }

  frequency(word: string): number {
    return this.postings.get(word)?.length ?? 0;
  }

  /**
   * Intersects posting lists for an AND query. Starting from the shortest list means the
   * fewest comparisons, since the result can't be longer than that list.
   */
  search(words: string[], rarestFirst: boolean): { ids: number[]; comparisons: number } {
    const lists = words.map((w) => this.postings.get(w) ?? []);
    if (rarestFirst) lists.sort((a, b) => a.length - b.length);
    if (!lists.length) return { ids: [], comparisons: 0 };
    let result = lists[0];
    let comparisons = lists[0].length;
    for (const next of lists.slice(1)) {
      const out: number[] = [];
      let i = 0;
      let j = 0;
      while (i < result.length && j < next.length) {
        comparisons++;
        if (result[i] === next[j]) {
          out.push(result[i]);
          i++;
          j++;
        } else if (result[i] < next[j]) i++;
        else j++;
      }
      result = out;
    }
    return { ids: result, comparisons };
  }
}

/** The baseline: open every message and look. */
export function scan(mails: Mail[], words: string[]): { ids: number[]; comparisons: number } {
  const ids: number[] = [];
  for (const mail of mails) {
    const present = new Set(tokenize(`${mail.from} ${mail.subject} ${mail.body}`));
    if (words.every((w) => present.has(w))) ids.push(mail.id);
  }
  return { ids, comparisons: mails.length };
}

const TOPICS = ['invoice', 'meeting', 'project', 'travel', 'budget', 'report', 'launch', 'contract', 'review', 'schedule', 'design', 'server', 'database', 'hiring', 'customer', 'security'];
const COMMON = ['please', 'thanks', 'update', 'team', 'today', 'tomorrow', 'attached', 'follow', 'question', 'status', 'plan', 'notes'];
const PEOPLE = ['alex', 'priya', 'sam', 'maria', 'chen', 'fatima', 'jordan', 'lena'];
const RARE = ['kubernetes', 'quarterly', 'reimbursement', 'offsite', 'migration', 'renewal', 'audit', 'roadmap', 'prototype', 'vendor'];

/** A made-up mailbox with common and rare words, and conversations grouped into threads. */
export function generateMailbox(count: number, rng: { int(n: number): number; chance(p: number): boolean }): Mail[] {
  const pick = (list: string[]) => list[rng.int(list.length)];
  const mails: Mail[] = [];
  let thread = 0;
  for (let id = 0; id < count; id++) {
    if (!rng.chance(0.4)) thread++;
    const topic = pick(TOPICS);
    const words = [pick(COMMON), pick(COMMON), pick(TOPICS), pick(COMMON), topic];
    if (rng.chance(0.08)) words.push(pick(RARE));
    mails.push({ id, from: pick(PEOPLE), subject: `${topic} ${pick(COMMON)}`, body: words.join(' '), threadId: thread, folder: rng.chance(0.85) ? 'inbox' : rng.chance(0.7) ? 'sent' : 'spam' });
  }
  return mails;
}
