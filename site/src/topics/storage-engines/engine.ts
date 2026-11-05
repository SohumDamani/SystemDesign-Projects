// Two real ways to store sorted keys on disk, and everything they write counted in bytes.
import { BloomFilter } from '../bloom-filter/engine';

export const RECORD_BYTES = 100;

export interface EngineStats {
  userBytes: number; // what the application asked to store
  diskBytes: number; // what actually hit the disk
  reads: number;
  filesTouched: number; // pages or files read to answer lookups
}

const freshStats = (): EngineStats => ({ userBytes: 0, diskBytes: 0, reads: 0, filesTouched: 0 });

interface SSTable {
  keys: number[]; // sorted
  values: number[];
  filter: BloomFilter | null;
}

/** Log-structured merge tree: buffer in memory, flush sorted files, merge them later. */
export class LsmTree {
  stats = freshStats();
  private memtable = new Map<number, number>();
  tables: SSTable[] = []; // newest first
  compactions = 0;

  constructor(private memtableSize: number, private maxTables: number, private useBloom: boolean) {}

  put(key: number, value: number) {
    this.stats.userBytes += RECORD_BYTES;
    this.stats.diskBytes += RECORD_BYTES; // the write-ahead log, for crash safety
    this.memtable.set(key, value);
    if (this.memtable.size >= this.memtableSize) this.flush();
  }

  private makeTable(entries: [number, number][]): SSTable {
    entries.sort((a, b) => a[0] - b[0]);
    let filter: BloomFilter | null = null;
    if (this.useBloom) {
      filter = new BloomFilter(Math.max(64, entries.length * 10), 7);
      for (const [k] of entries) filter.add(String(k));
    }
    this.stats.diskBytes += entries.length * RECORD_BYTES;
    return { keys: entries.map((e) => e[0]), values: entries.map((e) => e[1]), filter };
  }

  private flush() {
    this.tables.unshift(this.makeTable([...this.memtable.entries()]));
    this.memtable.clear();
    if (this.tables.length >= this.maxTables) this.compact();
  }

  /** Merges every file into one, keeping only the newest version of each key. */
  compact() {
    const merged = new Map<number, number>();
    for (let i = this.tables.length - 1; i >= 0; i--) {
      const t = this.tables[i];
      t.keys.forEach((k, j) => merged.set(k, t.values[j]));
    }
    this.tables = [this.makeTable([...merged.entries()])];
    this.compactions++;
  }

  get(key: number): number | undefined {
    this.stats.reads++;
    if (this.memtable.has(key)) return this.memtable.get(key);
    for (const table of this.tables) {
      if (table.filter && !table.filter.mightContain(String(key))) continue;
      this.stats.filesTouched++;
      let lo = 0;
      let hi = table.keys.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (table.keys[mid] === key) return table.values[mid];
        if (table.keys[mid] < key) lo = mid + 1;
        else hi = mid - 1;
      }
    }
    return undefined;
  }

  /** Total records on disk, counting old versions not yet compacted away. */
  get storedRecords() {
    return this.tables.reduce((a, t) => a + t.keys.length, 0) + this.memtable.size;
  }
}

/** A B-tree keeps sorted pages, and updates them in place, so one small write rewrites a page. */
export class BTree {
  stats = freshStats();
  private pages: { low: number; entries: Map<number, number> }[] = [{ low: -Infinity, entries: new Map() }];
  splits = 0;
  private live = 0;

  constructor(private pageBytes: number) {}

  private get pageCapacity() {
    return Math.max(4, Math.floor(this.pageBytes / RECORD_BYTES));
  }

  private findPage(key: number): number {
    let lo = 0;
    let hi = this.pages.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.pages[mid].low <= key) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  put(key: number, value: number) {
    this.stats.userBytes += RECORD_BYTES;
    this.stats.diskBytes += RECORD_BYTES; // the write-ahead log
    const index = this.findPage(key);
    const page = this.pages[index];
    if (!page.entries.has(key)) this.live++;
    page.entries.set(key, value);
    this.stats.diskBytes += this.pageBytes; // the whole page gets rewritten
    if (page.entries.size > this.pageCapacity) {
      const sorted = [...page.entries.entries()].sort((a, b) => a[0] - b[0]);
      const half = sorted.length >> 1;
      page.entries = new Map(sorted.slice(0, half));
      this.pages.splice(index + 1, 0, { low: sorted[half][0], entries: new Map(sorted.slice(half)) });
      this.stats.diskBytes += this.pageBytes;
      this.splits++;
    }
  }

  /** Levels from root to leaf, given how many keys fit in one index page. */
  get height(): number {
    const fanout = Math.max(2, Math.floor(this.pageBytes / 16));
    return Math.max(1, Math.ceil(Math.log(Math.max(2, this.pages.length)) / Math.log(fanout)) + 1);
  }

  get(key: number): number | undefined {
    this.stats.reads++;
    this.stats.filesTouched += this.height;
    return this.pages[this.findPage(key)].entries.get(key);
  }

  get storedRecords() {
    return this.live;
  }
}
