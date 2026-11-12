import{n as e}from"./rolldown-runtime-WkwZ5CU-.js";import{a as t,b as n,f as r,g as i,l as a,u as o}from"./index-n79SFkCo.js";var s=e(n(),1),c=`// A real trie that caches its top results at every node, plus the slower ways to search.
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
  for (const h of HEADS) for (const t of TAILS) all.push(\`\${h} \${t}\`);
  for (let i = all.length - 1; i > 0; i--) {
    const j = shuffle(i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, Math.min(count, all.length)).map((term, rank) => ({ term, freq: Math.round(1_000_000 / (rank + 1)) }));
}
`,l=class{children=new Map;freq=0;top=[]},u=class{root=new l;nodeCount=1;terms=[];insert(e,t){let n=this.root;for(let t of e){let e=n.children.get(t);e||(e=new l,n.children.set(t,e),this.nodeCount++),n=e}n.freq+=t,this.terms.push({term:e,freq:n.freq})}cacheTopResults(e){let t=(n,r)=>{let i=n.freq?[{term:r,freq:n.freq}]:[];for(let[e,a]of n.children)i.push(...t(a,r+e));return i.sort((e,t)=>t.freq-e.freq),n.top=i.slice(0,e),n.top};t(this.root,``)}search(e,t,n){if(t===`scan`)return this.scan(e,n);let r=this.root,i=1;for(let t of e){let e=r.children.get(t);if(!e)return{results:[],visited:i};r=e,i++}if(t===`cached`)return{results:r.top.slice(0,n),visited:i};let a=[],o=(e,t)=>{i++,e.freq&&a.push({term:t,freq:e.freq});for(let[n,r]of e.children)o(r,t+n)};return o(r,e),a.sort((e,t)=>t.freq-e.freq),{results:a.slice(0,n),visited:i}}scan(e,t){let n=this.terms.filter(t=>t.term.startsWith(e));return n.sort((e,t)=>t.freq-e.freq),{results:n.slice(0,t),visited:this.terms.length}}},d=[`how to`,`what is`,`best`,`why do`,`where to`,`can you`,`when did`,`system design`,`python`,`java`,`learn`,`weather in`,`flights to`,`hotels in`,`news about`,`recipe for`,`price of`,`review of`,`tutorial on`,`history of`],f=`rate limiter.load balancer.consistent hashing.redis.kafka.docker.kubernetes.london.paris.tokyo.new york.mumbai.berlin.coffee.pasta.bread.pizza.running shoes.laptop.phone.guitar.chess.climate.jupiter.dinosaurs.sql joins.binary search.graphs.dynamic programming.interview questions.cloud storage.machine learning.sourdough.travel insurance.solar panels.electric cars.tax returns.yoga.meditation.photography.gardening.podcasts.marathon training.home office.budget meals.world cup.stock market.space travel.video editing.typing speed.spanish.french.japanese.hiking.camping.cycling.swimming.sleep.vitamins.headphones`.split(`.`);function p(e,t){let n=[];for(let e of d)for(let t of f)n.push(`${e} ${t}`);for(let e=n.length-1;e>0;e--){let r=t(e+1);[n[e],n[r]]=[n[r],n[e]]}return n.slice(0,Math.min(e,n.length)).map((e,t)=>({term:e,freq:Math.round(1e6/(t+1))}))}var m=i(),h=.1,g=`world cup final tonight`;function _(e,t){let n=new u;for(let t of e)n.insert(t.term,t.freq);return n.cacheTopResults(t),n}function v({state:e,params:t}){let[n,i]=(0,s.useState)(`sys`),a=n.toLowerCase(),o=a?e.trie.search(a,t.mode,t.k):{results:[],visited:0},c=n=>a?e.trie.search(a,n,t.k).visited:0;return(0,m.jsxs)(`div`,{className:`lab-panel`,children:[(0,m.jsx)(`h4`,{children:`Type into the real trie`}),(0,m.jsx)(`div`,{className:`lab-input`,children:(0,m.jsx)(`input`,{value:n,onChange:e=>i(e.target.value),"aria-label":`Search prefix`,placeholder:`Start typing, like py or sys`})}),(0,m.jsxs)(`div`,{className:`ref-grid`,children:[(0,m.jsxs)(`div`,{children:[o.results.length===0&&(0,m.jsx)(`p`,{className:`muted small`,children:a?`No suggestions for that prefix.`:`Type something to see suggestions.`}),(0,m.jsx)(`ol`,{className:`small`,style:{margin:0},children:o.results.map(e=>(0,m.jsx)(`li`,{children:e.term},e.term))})]}),(0,m.jsxs)(`div`,{className:`bars`,children:[(0,m.jsx)(`p`,{className:`small`,style:{margin:0},children:`Work for this prefix:`}),[`cached`,`walk`,`scan`].map(e=>(0,m.jsxs)(`div`,{className:`bar-row`,children:[(0,m.jsx)(`span`,{className:`bar-label`,children:e===`cached`?`Cached trie`:e===`walk`?`Plain trie`:`Table scan`}),(0,m.jsx)(`div`,{className:`bar-track`,children:(0,m.jsx)(`div`,{className:`bar-fill`,style:{width:`${Math.max(2,c(e)/Math.max(c(`scan`),c(`walk`),1)*100)}%`}})}),(0,m.jsx)(`span`,{className:`bar-value`,children:r(c(e))})]},e))]})]})]})}var y={problem:[`As you type into a search box, the top suggestions for what you've typed so far appear. To feel instant, that lookup must finish in around 100 milliseconds, on every keystroke, for huge numbers of users. Any approach that searches the data on each keystroke is too slow.`,`So the system splits in two. A slow offline pipeline counts queries and builds a data structure. A fast online path only reads the precomputed answers. The lab lets you try the real data structure and see what each choice costs.`],functional:[`Return the top 5 suggestions for a prefix`,`Rank by popularity`,`Update as query patterns change`],nonFunctional:[`Respond in about 100 ms`,`Handle very high read rates`,`Suggestions are relevant, and filter out harmful terms`],diagram:{nodes:[{id:`u`,label:`Browser`,col:0,row:0,kind:`client`,note:`Sends a request per keystroke, debounced, and caches results for a while.`},{id:`a`,label:`Query service`,col:1,row:0,note:`Looks up the prefix and returns cached top results.`},{id:`c`,label:`Trie cache`,col:2,row:0,kind:`store`,note:`The trie in memory, sharded by prefix, so reads are fast.`},{id:`d`,label:`Trie store`,col:3,row:0,kind:`store`,note:`A durable snapshot of the trie, loaded into cache.`},{id:`l`,label:`Query logs`,col:0,row:1,kind:`queue`,note:`Every search is logged, often sampled, to count popularity.`},{id:`g`,label:`Aggregators`,col:1,row:1,note:`Count query frequency over time, typically in a batch job.`},{id:`w`,label:`Trie builders`,col:2,row:1,note:`Rebuild the trie from frequencies, usually weekly or daily.`}],edges:[{from:`u`,to:`a`},{from:`a`,to:`c`},{from:`c`,to:`d`,dashed:!0},{from:`a`,to:`l`,dashed:!0},{from:`l`,to:`g`},{from:`g`,to:`w`},{from:`w`,to:`d`}]},ideas:[{title:`Trie`,body:`A tree where each path spells a prefix. Finding a prefix takes one step per letter, regardless of how many queries you have.`},{title:`Cache top K at each node`,body:`Store the top results at every node, so a lookup needs no further search. This uses much more memory but makes reads constant-time.`},{title:`Offline updates`,body:`Rebuild from logs on a schedule rather than updating live. Reads stay simple and fast, at the cost of slightly stale suggestions.`},{title:`Client tricks`,body:`Debounce keystrokes, and let the browser cache results for an hour or so. These two tricks remove a large share of requests before they reach you.`}],estimator:{vars:[{key:`dau`,label:`Daily active users`,unit:`count`},{key:`searches`,label:`Searches per user per day`,unit:`plain`,assume:10},{key:`chars`,label:`Characters per search`,unit:`plain`,assume:20},{key:`peakFactor`,label:`Peak over average`,unit:`plain`,assume:2},{key:`newShare`,label:`Share of new queries (0 to 1)`,unit:`plain`,assume:.2},{key:`queryBytes`,label:`Bytes per query`,unit:`plain`,assume:20},{key:`avg`,label:`Average lookups`,unit:`qps`},{key:`peak`,label:`Peak lookups`,unit:`qps`},{key:`newDaily`,label:`New data per day`,unit:`bytes`}],eqs:[{out:`avg`,terms:[[`dau`,1],[`searches`,1],[`chars`,1],[86400,-1]]},{out:`peak`,terms:[[`avg`,1],[`peakFactor`,1]]},{out:`newDaily`,terms:[[`dau`,1],[`searches`,1],[`queryBytes`,1],[`newShare`,1]]}],starts:[{key:`dau`,value:1e7},{key:`peak`,value:5e4},{key:`newDaily`,value:1e9}]},lab:{secondsPerTick:h,params:[{key:`mode`,label:`Search method`,kind:`choice`,options:[{value:`cached`,label:`Trie with cached top results`},{value:`walk`,label:`Trie, searching the subtree`},{value:`scan`,label:`Scan the whole table`}]},{key:`k`,label:`Suggestions cached per node`,kind:`range`,min:1,max:20,step:1,rebuild:!0},{key:`vocabulary`,label:`Distinct queries`,kind:`range`,min:100,max:1200,step:100,rebuild:!0},{key:`refreshSec`,label:`Trie rebuild interval`,kind:`range`,min:5,max:120,step:5,unit:`s`,rebuild:!0}],defaults:{mode:`cached`,k:5,vocabulary:1200,refreshSec:30},create(e,t){let n=p(e.vocabulary,e=>t.int(e));return{now:0,trie:_(n,e.k),queries:n,pendingTrend:!1,trendInTrie:!1,nextRebuild:e.refreshSec,visited:0,avgPrefix:3,lastPrefix:``,lastVisited:0,rebuilds:0}},step(e,t,n){e.now+=h,e.now>=e.nextRebuild&&(e.nextRebuild=e.now+t.refreshSec,e.pendingTrend&&(e.queries=[...e.queries,{term:g,freq:5e6}],e.pendingTrend=!1,e.trendInTrie=!0),e.trie=_(e.queries,t.k),e.rebuilds++);let r=e.queries[Math.min(e.queries.length-1,Math.floor(n.next()**3*e.queries.length))],i=1+n.int(Math.min(6,r.term.length));e.lastPrefix=r.term.slice(0,i);let a=e.trie.search(e.lastPrefix,t.mode,t.k);e.lastVisited=a.visited,e.visited=e.visited*.9+a.visited*.1,e.avgPrefix=e.avgPrefix*.9+i*.1},sample:(e,t)=>({visited:e.visited,math:t.mode===`cached`?e.avgPrefix+1:t.mode===`scan`?e.queries.length:e.visited}),charts:[{title:`Nodes or rows examined per keystroke`,series:[{key:`visited`,label:`Measured`,role:`measured`},{key:`math`,label:`Math`,role:`predicted`}]}],metrics(e,t){let n=e.trie.search(`world`,`cached`,t.k).results.some(e=>e.term===g);return[{label:`Examined per keystroke`,value:o(e.visited),role:`measured`},{label:`Trie nodes`,value:o(e.trie.nodeCount),role:`measured`},{label:`Memory for cached results`,value:a(e.trie.nodeCount*t.k*8),role:`predicted`},{label:`Next rebuild in`,value:`${Math.max(0,Math.round(e.nextRebuild-e.now))} s`},{label:`Trending term suggested`,value:n?`Yes`:e.pendingTrend?`Waiting for rebuild`:`Not trending yet`,tone:n?`good`:e.pendingTrend?`warn`:void 0}]},math(e,t){return[{expr:`Cached lookup: root + ${e.avgPrefix.toFixed(1)} letters`,result:`${(e.avgPrefix+1).toFixed(1)} nodes`},{expr:`Table scan: every one of ${r(e.queries.length)} queries`,result:`${r(e.queries.length)} rows`},{expr:`Cache: ${o(e.trie.nodeCount)} nodes × ${t.k} × 8 bytes`,result:a(e.trie.nodeCount*t.k*8)}]},View:v,actions:[{key:`trend`,label:`Make a new query go viral`,run:e=>{e.trendInTrie||(e.pendingTrend=!0)}}],trace:(e,t)=>({values:{prefix:e.lastPrefix,nodes:r(e.lastVisited),k:`top ${t.k}`},active:[`nodes`]}),experiments:[{title:`The cached lookup`,set:{mode:`cached`},ticks:200,question:`Each trie node stores its top 5 suggestions. How much work does a lookup do, with thousands of nodes in the trie?`,options:[`Only one node per letter typed`,`About half the nodes`,`All of them`],answer:0,explain:`You walk down one node per letter, and the answer is already sitting there. Lookup cost depends on prefix length, not on how many queries exist. Trading memory and rebuild time for this is what makes it fast enough to run on every keystroke.`,check:e=>e.lastVisited===e.lastPrefix.length+1},{title:`No cached results`,set:{mode:`walk`},ticks:200,question:`Without cached results, the subtree under a prefix has to be searched to find the most popular. How much work is that per keystroke?`,options:[`About the same`,`Far more, especially for short prefixes`],answer:1,explain:`A one-letter prefix can have most of the trie beneath it, and at tens of thousands of keystrokes per second that's not affordable. Short prefixes are also the most common, which makes this worse.`,check:(e,n,r)=>t(r,`visited`,150)>30},{title:`A term goes viral`,set:{refreshSec:30},act:[`trend`],actAt:10,ticks:100,question:`A new query goes viral at second 1, and the trie is rebuilt every 30 seconds. Will it be suggested 10 seconds in?`,options:[`Yes, immediately`,`No, not until the next rebuild`],answer:1,explain:`Reads use a prebuilt trie, so new data has to wait for a rebuild. It's the price of fast reads. Real systems rebuild weekly or daily, and handle breaking trends with a small fast-updating layer on top.`,check:(e,t)=>!e.trie.search(`world`,`cached`,t.k).results.some(e=>e.term===g)},{title:`Rebuild more often`,set:{refreshSec:5},act:[`trend`],actAt:10,ticks:100,question:`Same viral term, but now the trie is rebuilt every 5 seconds. Is it suggested 10 seconds in?`,options:[`Yes`,`No`],answer:0,explain:`Fresher suggestions, at the cost of rebuilding far more often. The rebuild interval is a direct dial between freshness and compute cost, and rebuilding a real trie for billions of queries is expensive.`,check:(e,t)=>e.trie.search(`world`,`cached`,t.k).results.some(e=>e.term===g)}]},pseudocode:[{code:`suggest(prefix):`},{code:`  node = root`,id:`prefix`},{code:`  for each letter in prefix: node = node.child(letter)`,id:`nodes`},{code:`  return node.top_results`,id:`k`},{code:``},{code:`rebuild (offline):`},{code:`  count query frequency from logs`},{code:`  insert each query into a new trie`},{code:`  from the leaves up: top = best K of children`},{code:`  swap the new trie in`}],sources:[{name:`engine.ts`,code:c,lang:`ts`}],tradeoffs:[{choice:`Cache top K in nodes`,gain:`Constant-time reads`,cost:`Much more memory, and a slower rebuild`},{choice:`Rebuild more often`,gain:`Fresher suggestions`,cost:`More compute`},{choice:`Sample the logs`,gain:`Far less data to process`,cost:`Rare queries are less accurate`},{choice:`Shard by first letter`,gain:`Simple`,cost:`Uneven load, since some letters are far more common`}],interview:[{q:`How do you shard when letters aren't evenly used?`,a:"Measure traffic per prefix and split shards by load, not alphabetically. A small lookup service maps prefixes to shards, so `s` could get several shards while `x` shares one."},{q:`How do you remove a harmful suggestion immediately?`,a:`Put a filter layer between the cache and the client that removes blocked terms, and then purge the term properly at the next rebuild.`},{q:`How do you handle other languages?`,a:`Store Unicode in the trie nodes. Separate tries per language or country also make the suggestions much more relevant locally.`},{q:`How would you do real-time trending?`,a:`Reduce batch intervals, weight recent searches more heavily, and keep a small fast-updating layer that you merge with the main trie at read time.`}],mistakes:["Running a database query with `LIKE` on each keystroke.",`Updating the trie live on each search, which turns reads into writes.`,`Forgetting that the client can debounce and cache.`]};export{y as default};