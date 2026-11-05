// A real skip list with rank support, the structure behind Redis sorted sets, and the SQL-style alternative.
interface Node {
  member: string;
  score: number;
  forward: (Node | null)[];
  span: number[]; // how many nodes each forward pointer jumps over
}

const MAX_LEVEL = 24;

export interface Ranked {
  update(member: string, score: number): void;
  rank(member: string, score: number): number;
  top(n: number): { member: string; score: number }[];
  steps: number;
}

export class SkipList implements Ranked {
  private head: Node = { member: '', score: Infinity, forward: Array(MAX_LEVEL).fill(null), span: Array(MAX_LEVEL).fill(0) };
  private level = 1;
  length = 0;
  steps = 0;
  constructor(private random: () => number) {}

  /** Higher scores come first, and ties break on member name. */
  private before(aScore: number, aMember: string, bScore: number, bMember: string) {
    return aScore > bScore || (aScore === bScore && aMember < bMember);
  }

  private randomLevel() {
    let l = 1;
    while (l < MAX_LEVEL && this.random() < 0.25) l++;
    return l;
  }

  insert(member: string, score: number) {
    const update: Node[] = Array(MAX_LEVEL);
    const rank: number[] = Array(MAX_LEVEL).fill(0);
    let x = this.head;
    for (let i = this.level - 1; i >= 0; i--) {
      rank[i] = i === this.level - 1 ? 0 : rank[i + 1];
      while (x.forward[i] && this.before(x.forward[i]!.score, x.forward[i]!.member, score, member)) {
        rank[i] += x.span[i];
        x = x.forward[i]!;
        this.steps++;
      }
      update[i] = x;
    }
    const level = this.randomLevel();
    if (level > this.level) {
      for (let i = this.level; i < level; i++) {
        rank[i] = 0;
        update[i] = this.head;
        update[i].span[i] = this.length;
      }
      this.level = level;
    }
    const node: Node = { member, score, forward: Array(level).fill(null), span: Array(level).fill(0) };
    for (let i = 0; i < level; i++) {
      node.forward[i] = update[i].forward[i];
      update[i].forward[i] = node;
      node.span[i] = update[i].span[i] - (rank[0] - rank[i]);
      update[i].span[i] = rank[0] - rank[i] + 1;
    }
    for (let i = level; i < this.level; i++) update[i].span[i]++;
    this.length++;
  }

  remove(member: string, score: number) {
    const update: Node[] = Array(MAX_LEVEL);
    let x = this.head;
    for (let i = this.level - 1; i >= 0; i--) {
      while (x.forward[i] && this.before(x.forward[i]!.score, x.forward[i]!.member, score, member)) {
        x = x.forward[i]!;
        this.steps++;
      }
      update[i] = x;
    }
    const target = x.forward[0];
    if (!target || target.member !== member || target.score !== score) return;
    for (let i = 0; i < this.level; i++) {
      if (update[i].forward[i] === target) {
        update[i].span[i] += target.span[i] - 1;
        update[i].forward[i] = target.forward[i];
      } else {
        update[i].span[i]--;
      }
    }
    while (this.level > 1 && !this.head.forward[this.level - 1]) this.level--;
    this.length--;
  }

  update(member: string, score: number, previous?: number) {
    if (previous !== undefined) this.remove(member, previous);
    this.insert(member, score);
  }

  /** Adds up spans on the way down, so finding a rank never has to count every player. */
  rank(member: string, score: number): number {
    let rank = 0;
    let x = this.head;
    for (let i = this.level - 1; i >= 0; i--) {
      while (x.forward[i] && (this.before(x.forward[i]!.score, x.forward[i]!.member, score, member) || (x.forward[i]!.score === score && x.forward[i]!.member === member))) {
        rank += x.span[i];
        x = x.forward[i]!;
        this.steps++;
      }
      if (x.member === member) return rank;
    }
    return -1;
  }

  top(n: number) {
    const out: { member: string; score: number }[] = [];
    let x = this.head.forward[0];
    while (x && out.length < n) {
      out.push({ member: x.member, score: x.score });
      x = x.forward[0];
      this.steps++;
    }
    return out;
  }
}

/** What a SQL table without a usable index has to do: scan and count. */
export class SortedTable implements Ranked {
  private rows: { member: string; score: number }[] = [];
  private byMember = new Map<string, { member: string; score: number }>();
  steps = 0;

  update(member: string, score: number) {
    const row = this.byMember.get(member);
    if (row) row.score = score;
    else {
      const fresh = { member, score };
      this.rows.push(fresh);
      this.byMember.set(member, fresh);
    }
    this.steps++;
  }

  /** SELECT COUNT(*) WHERE score > mine, which must look at every row. */
  rank(_member: string, score: number): number {
    let rank = 1;
    for (const r of this.rows) {
      this.steps++;
      if (r.score > score) rank++;
    }
    return rank;
  }

  top(n: number) {
    // ORDER BY score DESC LIMIT n, which must read every row without an index.
    this.steps += this.rows.length;
    return [...this.rows].sort((a, b) => b.score - a.score).slice(0, n);
  }
}
