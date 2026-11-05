// Two ways to page through a list that is changing while you read it.
export type Mode = 'offset' | 'cursor';

/** Rows are ids, newest first. A binary search on the id is what an index does. */
export class Feed {
  rows: number[] = [];
  private present = new Set<number>();
  nextId = 1;

  constructor(count: number) {
    for (let i = 0; i < count; i++) this.insert();
  }

  insert() {
    const id = this.nextId++;
    this.rows.unshift(id);
    this.present.add(id);
  }

  remove(index: number) {
    const [id] = this.rows.splice(index, 1);
    this.present.delete(id);
  }

  has(id: number) {
    return this.present.has(id);
  }

  /** OFFSET n LIMIT k: the database has to walk past n rows before it can return any. */
  pageByOffset(offset: number, size: number): { ids: number[]; scanned: number } {
    return { ids: this.rows.slice(offset, offset + size), scanned: Math.min(this.rows.length, offset + size) };
  }

  /** WHERE id < cursor LIMIT k: jump straight to the spot, then read only the page. */
  pageByCursor(cursor: number, size: number): { ids: number[]; scanned: number } {
    let lo = 0;
    let hi = this.rows.length;
    let steps = 0;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      steps++;
      if (this.rows[mid] >= cursor) lo = mid + 1;
      else hi = mid;
    }
    const ids = this.rows.slice(lo, lo + size);
    return { ids, scanned: steps + ids.length };
  }
}
