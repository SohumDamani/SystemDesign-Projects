import{a as e,f as t,l as n,u as r}from"./index-n79SFkCo.js";import{t as i}from"./engine-C_JbDG-f.js";var a=`// Two real ways to store sorted keys on disk, and everything they write counted in bytes.
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
`,o=()=>({userBytes:0,diskBytes:0,reads:0,filesTouched:0}),s=class{memtableSize;maxTables;useBloom;stats=o();memtable=new Map;tables=[];compactions=0;constructor(e,t,n){this.memtableSize=e,this.maxTables=t,this.useBloom=n}put(e,t){this.stats.userBytes+=100,this.stats.diskBytes+=100,this.memtable.set(e,t),this.memtable.size>=this.memtableSize&&this.flush()}makeTable(e){e.sort((e,t)=>e[0]-t[0]);let t=null;if(this.useBloom){t=new i(Math.max(64,e.length*10),7);for(let[n]of e)t.add(String(n))}return this.stats.diskBytes+=e.length*100,{keys:e.map(e=>e[0]),values:e.map(e=>e[1]),filter:t}}flush(){this.tables.unshift(this.makeTable([...this.memtable.entries()])),this.memtable.clear(),this.tables.length>=this.maxTables&&this.compact()}compact(){let e=new Map;for(let t=this.tables.length-1;t>=0;t--){let n=this.tables[t];n.keys.forEach((t,r)=>e.set(t,n.values[r]))}this.tables=[this.makeTable([...e.entries()])],this.compactions++}get(e){if(this.stats.reads++,this.memtable.has(e))return this.memtable.get(e);for(let t of this.tables){if(t.filter&&!t.filter.mightContain(String(e)))continue;this.stats.filesTouched++;let n=0,r=t.keys.length-1;for(;n<=r;){let i=n+r>>1;if(t.keys[i]===e)return t.values[i];t.keys[i]<e?n=i+1:r=i-1}}}get storedRecords(){return this.tables.reduce((e,t)=>e+t.keys.length,0)+this.memtable.size}},c=class{pageBytes;stats=o();pages=[{low:-1/0,entries:new Map}];splits=0;live=0;constructor(e){this.pageBytes=e}get pageCapacity(){return Math.max(4,Math.floor(this.pageBytes/100))}findPage(e){let t=0,n=this.pages.length-1;for(;t<n;){let r=t+n+1>>1;this.pages[r].low<=e?t=r:n=r-1}return t}put(e,t){this.stats.userBytes+=100,this.stats.diskBytes+=100;let n=this.findPage(e),r=this.pages[n];if(r.entries.has(e)||this.live++,r.entries.set(e,t),this.stats.diskBytes+=this.pageBytes,r.entries.size>this.pageCapacity){let e=[...r.entries.entries()].sort((e,t)=>e[0]-t[0]),t=e.length>>1;r.entries=new Map(e.slice(0,t)),this.pages.splice(n+1,0,{low:e[t][0],entries:new Map(e.slice(t))}),this.stats.diskBytes+=this.pageBytes,this.splits++}}get height(){let e=Math.max(2,Math.floor(this.pageBytes/16));return Math.max(1,Math.ceil(Math.log(Math.max(2,this.pages.length))/Math.log(e))+1)}get(e){return this.stats.reads++,this.stats.filesTouched+=this.height,this.pages[this.findPage(e)].entries.get(e)}get storedRecords(){return this.live}},l=40,u=e=>e instanceof s,d=e=>e.store.stats.userBytes?e.store.stats.diskBytes/e.store.stats.userBytes:0,f=e=>e.distinct.size?e.store.storedRecords/e.distinct.size:1,p={problem:[`Every database has to answer one question: how do you lay out sorted data on a disk? Nearly all of them use one of two structures. B-trees update fixed-size pages in place, and LSM trees write new sorted files and clean up later.`,`Neither one wins. You're trading between three kinds of amplification: extra bytes written, extra files read, and extra space used. Understanding this lets you explain why Postgres and Cassandra behave so differently, and it comes up constantly in deep-dive interviews.`],functional:[`Store and find values by key`,`Survive a crash without losing acknowledged writes`,`Support range scans over sorted keys`],nonFunctional:[`High write throughput, or fast reads, depending on your needs`,`Reasonable space usage`,`Predictable latency, with few surprises from background work`],diagram:{nodes:[{id:`w`,label:`Writes`,col:0,row:0,kind:`client`,note:`Each write goes to the log first, so it survives a crash.`},{id:`log`,label:`Write-ahead log`,col:1,row:0,kind:`queue`,note:`Appended sequentially. Used only for recovery after a crash.`},{id:`mem`,label:`Memtable`,col:1,row:1,note:`Sorted in memory. When full, it's written out as one sorted file.`},{id:`sst`,label:`Sorted files`,col:2,row:1,kind:`store`,note:`Immutable once written. Reads check the newest first.`},{id:`c`,label:`Compaction`,col:3,row:1,note:`A background job that merges files and drops old versions.`},{id:`bf`,label:`Bloom filters`,col:2,row:0,note:`One per file, so reads can skip files that can't hold the key.`}],edges:[{from:`w`,to:`log`},{from:`w`,to:`mem`},{from:`mem`,to:`sst`,label:`flush`},{from:`sst`,to:`c`},{from:`bf`,to:`sst`,dashed:!0}]},ideas:[{title:`B-tree`,body:`A shallow tree of fixed-size pages, sorted. Reads take a few page lookups. Writes update a page in place, so one small change rewrites a whole page. Used by most relational databases.`},{title:`LSM tree`,body:`Writes go to memory, then flush as immutable sorted files. A background job merges them. Very fast writes, but reads may check several files. Used by Cassandra, RocksDB and many others.`},{title:`Three amplifications`,body:`Write amplification is bytes written per byte stored. Read amplification is work per lookup. Space amplification is disk used per byte of live data. You can't minimize all three at once.`},{title:`Compaction`,body:`The price of an LSM. Merge often and reads get fast, but you'll rewrite data more. Merge rarely and writes are cheap, but reads and space suffer. It also causes latency spikes if not managed.`}],estimator:{vars:[{key:`writes`,label:`Writes`,unit:`qps`},{key:`recordBytes`,label:`Bytes per record`,unit:`plain`,assume:100},{key:`amplification`,label:`Write amplification`,unit:`plain`,assume:10},{key:`diskRate`,label:`Disk bandwidth per second`,unit:`plain`,assume:5e8},{key:`userRate`,label:`Data written by users`,unit:`bytesPerSec`},{key:`actualRate`,label:`Actual disk writes`,unit:`bytesPerSec`},{key:`disks`,label:`Disks at full speed`,unit:`count`}],eqs:[{out:`userRate`,terms:[[`writes`,1],[`recordBytes`,1]]},{out:`actualRate`,terms:[[`userRate`,1],[`amplification`,1]]},{out:`disks`,terms:[[`actualRate`,1],[`diskRate`,-1]]}],starts:[{key:`writes`,value:1e5},{key:`disks`,value:4}]},lab:{secondsPerTick:.1,params:[{key:`engine`,label:`Storage engine`,kind:`choice`,rebuild:!0,options:[{value:`lsm`,label:`LSM tree`},{value:`btree`,label:`B-tree`}]},{key:`keys`,label:`Distinct keys`,kind:`range`,min:500,max:5e4,step:500},{key:`writesPerTick`,label:`Writes per tick`,kind:`range`,min:1,max:200,step:1},{key:`readsPerTick`,label:`Reads per tick`,kind:`range`,min:1,max:200,step:1},{key:`memtable`,label:`LSM memory buffer`,kind:`range`,min:50,max:2e3,step:50,unit:`records`,rebuild:!0},{key:`maxFiles`,label:`LSM files before compacting`,kind:`range`,min:2,max:l,step:1,rebuild:!0,format:e=>e===l?`Never compact`:String(e)},{key:`bloom`,label:`LSM Bloom filter on each file`,kind:`toggle`,rebuild:!0},{key:`pageKb`,label:`B-tree page size`,kind:`range`,min:1,max:16,step:1,unit:`KB`,rebuild:!0}],defaults:{engine:`lsm`,keys:5e3,writesPerTick:50,readsPerTick:20,memtable:200,maxFiles:8,bloom:!0,pageKb:4},create:e=>({store:e.engine===`lsm`?new s(e.memtable,e.maxFiles===l?1/0:e.maxFiles,e.bloom):new c(e.pageKb*1024),distinct:new Set,readAmp:0,lastGet:``}),step(e,t,n){for(let r=0;r<t.writesPerTick;r++){let r=n.int(t.keys);e.store.put(r,n.int(1e3)),e.distinct.add(r)}let r=e.store.stats.filesTouched;for(let r=0;r<t.readsPerTick;r++){let r=e.store.get(n.int(t.keys));e.lastGet=r===void 0?`not found`:`value ${r}`}let i=(e.store.stats.filesTouched-r)/t.readsPerTick;e.readAmp=e.readAmp?e.readAmp*.95+i*.05:i},sample:e=>({write:d(e),read:e.readAmp,space:f(e)}),charts:[{title:`Write amplification: bytes on disk per byte stored`,series:[{key:`write`,label:`Measured`,role:`measured`}]},{title:`Read amplification: pages or files per lookup`,series:[{key:`read`,label:`Measured`,role:`measured`}]},{title:`Space amplification: copies kept per live key`,series:[{key:`space`,label:`Measured`,role:`measured`}]}],metrics(e,r){let i=r.engine===`btree`?1+r.pageKb*1024/100:void 0,a=e.store;return[{label:`Write amplification`,value:`${d(e).toFixed(1)}×`,role:`measured`},...i?[{label:`Write amplification`,value:`${i.toFixed(0)}×`,role:`predicted`}]:[],{label:`Read amplification`,value:`${e.readAmp.toFixed(1)}`,role:`measured`},{label:`Space amplification`,value:`${f(e).toFixed(2)}×`,role:`measured`},{label:u(a)?`Files on disk`:`Tree height`,value:u(a)?t(a.tables.length):t(a.height),role:`measured`},{label:`Total disk written`,value:n(a.stats.diskBytes),role:`measured`}]},math(e,t){let r=t.pageKb*1024;return[{expr:`B-tree: rewrites a ${n(r)} page for a 100-byte record, plus the log`,result:`${(1+r/100).toFixed(0)}× writes`},{expr:`LSM: log + flush + each time compaction rewrites it`,result:`roughly 2 to 20×`},{expr:`Reads without Bloom filters check up to every file`,result:u(e.store)?`${e.store.tables.length} files`:`${e.store.height} pages per read`,tone:u(e.store)&&e.store.tables.length>8?`warn`:void 0}]},views(e){return u(e.store)?[{kind:`bars`,title:`LSM files, newest first, by records`,items:e.store.tables.slice(0,10).map((e,t)=>({label:`File ${t+1}`,value:e.keys.length}))}]:[{kind:`note`,title:`B-tree`,text:`${r(e.store.splits)} page splits so far. Updates happen in place, so there are no old copies to clean up.`}]},trace(e){return{values:{get:e.lastGet,amp:`${d(e).toFixed(1)}× written`,files:u(e.store)?`${e.store.tables.length} files, ${e.store.compactions} compactions`:`height ${e.store.height}`}}},experiments:[{title:`B-tree writes`,set:{engine:`btree`,pageKb:4},ticks:200,question:`A B-tree stores a 100-byte record by updating a 4 KB page in place, plus a log entry. How much actually gets written per record?`,options:[`About 2 times the record`,`About 42 times the record`,`About 500 times`],answer:1,explain:`Disks write whole pages, so you pay 4,096 + 100 bytes for a 100-byte record. Real databases batch several updates per page, which softens it. But for write-heavy systems, this is a big reason to look elsewhere.`,check:e=>d(e)>35&&d(e)<50},{title:`LSM writes`,set:{engine:`lsm`,memtable:200,maxFiles:8},ticks:400,question:`An LSM tree buffers writes in memory, and flushes sorted files in bulk. How does its write amplification compare?`,options:[`Worse than the B-tree`,`Much better, even counting compaction`],answer:1,explain:`Writes are batched and sequential, so even after compaction rewrites things a few times, the total stays well below the B-tree. That's why write-heavy systems such as Cassandra and RocksDB use them.`,check:e=>d(e)<20},{title:`Never compact`,set:{engine:`lsm`,maxFiles:l,bloom:!1,memtable:100},ticks:400,question:`What if you skip compaction, and have no Bloom filters? Each read may need to check every file.`,options:[`Reads stay about the same`,`Read amplification keeps climbing`],answer:1,explain:`Writes got cheaper, but a lookup now searches many files, newest first. This is the fundamental LSM tradeoff: compaction costs writes, and skipping it costs reads and space.`,check:(t,n,r)=>e(r,`read`,30)>3},{title:`Add Bloom filters`,set:{engine:`lsm`,maxFiles:l,bloom:!0,memtable:100},ticks:400,question:`Same uncompacted files, but each now has a Bloom filter that can say "this key is definitely not here". How many files does a read touch?`,options:[`Still many`,`Only about one or two`],answer:1,explain:`The filter skips almost every file that doesn't hold the key, without a disk read. A tiny bit of memory removes most of the read cost. That's why every LSM database uses them.`,check:(t,n,r)=>e(r,`read`,30)<2.5},{title:`Old copies pile up`,set:{engine:`lsm`,maxFiles:l,keys:500,memtable:100,writesPerTick:100},ticks:200,question:`If keys are updated constantly with no compaction, how much disk space is used, compared to the live data?`,options:[`About the same`,`Many times more, because old versions stay on disk`],answer:1,explain:`An LSM never overwrites: each update is another copy somewhere. Space stays wasted until compaction drops old versions. A B-tree updates in place, so it stays close to 1×.`,check:e=>f(e)>3}]},pseudocode:[{code:`LSM put(key, value):`},{code:`  append to the log, then insert into the memtable`},{code:`  if memtable is full: write it as a sorted file`,id:`files`},{code:`  if too many files: merge them into one`,id:`amp`},{code:``},{code:`LSM get(key):`},{code:`  check the memtable, then files, newest first`},{code:`  skip any file whose Bloom filter says no`,id:`get`}],sources:[{name:`engine.ts`,code:a,lang:`ts`}],tradeoffs:[{choice:`B-tree`,gain:`Fast, predictable reads, and no compaction`,cost:`Higher write amplification`},{choice:`LSM tree`,gain:`High write throughput, and good compression`,cost:`Slower reads, and background compaction`},{choice:`Compact more often`,gain:`Faster reads, less space used`,cost:`More write amplification`},{choice:`Bigger memtable`,gain:`Fewer flushes`,cost:`More memory, and longer recovery from a crash`}],interview:[{q:`Which would you choose for a write-heavy workload?`,a:`An LSM tree, since it turns random writes into sequential ones. For read-heavy workloads with point lookups and transactions, a B-tree is often simpler and more predictable.`},{q:`Why is sequential writing so much faster?`,a:`Spinning disks avoid seeks, and even SSDs perform better with large sequential writes, while also wearing less. Batching also means fewer write operations overall.`},{q:`What causes latency spikes in an LSM?`,a:`Compaction competes for disk with foreground work. If it falls behind, writes get throttled. Rate limiting compaction, and using leveled compaction, helps a lot.`},{q:`How do range scans differ?`,a:`A B-tree reads adjacent pages directly. An LSM has to merge results across several files. It works, but it's more work, which is why scan-heavy workloads often favor B-trees.`}],mistakes:[`Saying one is simply better, rather than naming the tradeoff.`,`Forgetting the write-ahead log when counting durability.`,`Ignoring compaction when estimating disk bandwidth.`]};export{p as default};