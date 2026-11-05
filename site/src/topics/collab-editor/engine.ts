// Three ways to merge concurrent edits. Only the CRDT gets it right without a server deciding.

/** A character's permanent identity. It never changes, so it never needs adjusting. */
export interface CharId {
  site: number;
  clock: number;
}

export interface CrdtChar {
  id: CharId;
  after: CharId | null; // the character this was typed after
  value: string;
  deleted: boolean;
}

const same = (a: CharId | null, b: CharId | null) => (a === null || b === null ? a === b : a.site === b.site && a.clock === b.clock);
const newer = (a: CharId, b: CharId) => a.clock > b.clock || (a.clock === b.clock && a.site > b.site);

export type CrdtOp = { kind: 'insert'; char: CrdtChar } | { kind: 'delete'; id: CharId };

/**
 * A sequence CRDT, in the style of RGA. Each insert says "after this character", not
 * "at this position". Concurrent inserts at one spot are ordered by ID, so every
 * replica sorts them the same way, no matter what order they arrived in.
 */
export class CrdtDoc {
  chars: CrdtChar[] = [];
  private clock = 0;
  private pending: CrdtOp[] = [];

  constructor(readonly site: number) {}

  get text(): string {
    return this.chars.filter((c) => !c.deleted).map((c) => c.value).join('');
  }

  get tombstones(): number {
    return this.chars.filter((c) => c.deleted).length;
  }

  /** Types a character after the visible position `index`. */
  insert(index: number, value: string): CrdtOp {
    const visible = this.chars.filter((c) => !c.deleted);
    const after = index > 0 ? visible[index - 1].id : null;
    const char: CrdtChar = { id: { site: this.site, clock: ++this.clock }, after, value, deleted: false };
    const op: CrdtOp = { kind: 'insert', char };
    this.integrate(op);
    return op;
  }

  delete(index: number): CrdtOp | null {
    const visible = this.chars.filter((c) => !c.deleted);
    if (!visible[index]) return null;
    const op: CrdtOp = { kind: 'delete', id: visible[index].id };
    this.integrate(op);
    return op;
  }

  private position(id: CharId): number {
    return this.chars.findIndex((c) => same(c.id, id));
  }

  /** Applies an op, or holds it until the character it refers to has arrived. */
  integrate(op: CrdtOp) {
    if (op.kind === 'insert') this.clock = Math.max(this.clock, op.char.id.clock);
    if (!this.apply(op)) {
      this.pending.push(op);
      return;
    }
    let progress = true;
    while (progress) {
      progress = false;
      this.pending = this.pending.filter((p) => {
        if (this.apply(p)) {
          progress = true;
          return false;
        }
        return true;
      });
    }
  }

  private apply(op: CrdtOp): boolean {
    if (op.kind === 'delete') {
      const at = this.position(op.id);
      if (at < 0) return false;
      // A deleted character stays as a tombstone, since later inserts may point at it.
      this.chars[at].deleted = true;
      return true;
    }
    if (this.position(op.char.id) >= 0) return true; // already have it
    let at = 0;
    if (op.char.after) {
      const parent = this.position(op.char.after);
      if (parent < 0) return false;
      at = parent + 1;
    }
    // Skip past anything newer that was also typed at this spot.
    while (at < this.chars.length && newer(this.chars[at].id, op.char.id)) at++;
    this.chars.splice(at, 0, { ...op.char });
    return true;
  }
}

/** The naive way: send "insert at position 5". Fine until two people type at once. */
export class IndexDoc {
  text = '';

  insert(index: number, value: string) {
    this.text = this.text.slice(0, index) + value + this.text.slice(index);
  }

  apply(index: number, value: string) {
    this.insert(Math.min(index, this.text.length), value);
  }

  delete(index: number) {
    this.text = this.text.slice(0, index) + this.text.slice(index + 1);
  }
}
