import{i as e,o as t,s as n}from"./index-ar0glIxf.js";import{a as r}from"./stats-SinZlVt1.js";import{r as i}from"./engine-LoCRo7Gb.js";var a=`// A crawler's core: a polite frontier, duplicate detection, and a depth limit for traps.
import { hash53 } from '../url-shortener/engine';

/** Answers "definitely new" or "probably seen" using very little memory. */
export class BloomFilter {
  private bits: Uint8Array;
  readonly k: number;
  inserted = 0;

  constructor(private size: number, k: number) {
    this.bits = new Uint8Array(Math.ceil(size / 8));
    this.k = Math.max(1, k);
  }

  private indexes(text: string): number[] {
    // Two hashes can simulate k independent hash functions.
    const a = hash53(text, 1);
    const b = hash53(text, 2);
    return Array.from({ length: this.k }, (_, i) => (a + i * b) % this.size);
  }

  mightContain(text: string): boolean {
    return this.indexes(text).every((i) => this.bits[i >> 3] & (1 << (i & 7)));
  }

  add(text: string) {
    for (const i of this.indexes(text)) this.bits[i >> 3] |= 1 << (i & 7);
    this.inserted++;
  }
}

export function bloomFalsePositiveRate(bitsPerItem: number, k: number, fill: number): number {
  return Math.pow(1 - Math.exp((-k * fill) / bitsPerItem), k);
}

export interface Link {
  url: string;
  host: number;
  depth: number;
}

const PAGES_PER_HOST = 500;
export const TRAP_HOST = -1;

/** A made-up web: the same page always has the same links. Most links stay on the same site. */
export function linksOn(page: Link, hostCount: number): Link[] {
  const depth = page.depth + 1;
  if (page.host === TRAP_HOST) {
    // A spider trap: every page links to two brand new pages, forever.
    return [0, 1].map((i) => ({ url: \`\${page.url}/\${i}\`, host: TRAP_HOST, depth }));
  }
  const seed = hash53(page.url);
  const count = 3 + (seed % 6);
  const links: Link[] = [];
  for (let i = 0; i < count; i++) {
    const h = hash53(page.url, i + 10);
    const host = h % 5 === 0 ? (h >>> 3) % hostCount : page.host;
    links.push({ url: \`h\${host}/p\${(h >>> 8) % PAGES_PER_HOST}\`, host, depth });
  }
  return links;
}

/** One FIFO queue per host, so a host is never hit faster than the politeness delay allows. */
export class Frontier {
  private queues = new Map<number, Link[]>();
  private nextAllowed = new Map<number, number>();
  private hosts: number[] = [];
  private cursor = 0;
  size = 0;

  push(link: Link) {
    let q = this.queues.get(link.host);
    if (!q) {
      this.queues.set(link.host, (q = []));
      this.hosts.push(link.host);
    }
    q.push(link);
    this.size++;
  }

  /** The next page from a host we're allowed to contact right now, if there is one. */
  pop(now: number, delay: number): Link | undefined {
    for (let i = 0; i < this.hosts.length; i++) {
      const host = this.hosts[(this.cursor + i) % this.hosts.length];
      const q = this.queues.get(host)!;
      if (q.length && (this.nextAllowed.get(host) ?? 0) <= now + 1e-9) {
        this.cursor = (this.cursor + i + 1) % this.hosts.length;
        this.nextAllowed.set(host, now + delay);
        this.size--;
        return q.shift();
      }
    }
    return undefined;
  }
}
`,o=class{size;bits;k;inserted=0;constructor(e,t){this.size=e,this.bits=new Uint8Array(Math.ceil(e/8)),this.k=Math.max(1,t)}indexes(e){let t=i(e,1),n=i(e,2);return Array.from({length:this.k},(e,r)=>(t+r*n)%this.size)}mightContain(e){return this.indexes(e).every(e=>this.bits[e>>3]&1<<(e&7))}add(e){for(let t of this.indexes(e))this.bits[t>>3]|=1<<(t&7);this.inserted++}};function s(e,t,n){return(1-Math.exp(-t*n/e))**t}var c=500;function l(e,t){let n=e.depth+1;if(e.host===-1)return[0,1].map(t=>({url:`${e.url}/${t}`,host:-1,depth:n}));let r=3+i(e.url)%6,a=[];for(let o=0;o<r;o++){let r=i(e.url,o+10),s=r%5==0?(r>>>3)%t:e.host;a.push({url:`h${s}/p${(r>>>8)%c}`,host:s,depth:n})}return a}var u=class{queues=new Map;nextAllowed=new Map;hosts=[];cursor=0;size=0;push(e){let t=this.queues.get(e.host);t||(this.queues.set(e.host,t=[]),this.hosts.push(e.host)),t.push(e),this.size++}pop(e,t){for(let n=0;n<this.hosts.length;n++){let r=this.hosts[(this.cursor+n)%this.hosts.length],i=this.queues.get(r);if(i.length&&(this.nextAllowed.get(r)??0)<=e+1e-9)return this.cursor=(this.cursor+n+1)%this.hosts.length,this.nextAllowed.set(r,e+t),this.size--,i.shift()}}},d=.1,f=1e5,p=2e5,m=e=>Math.max(1,Math.round(e*Math.LN2));function h(e){let t=e.workers/(e.fetchMs/1e3),n=e.delaySec>0?e.hosts/e.delaySec:1/0;return t<=n?{rate:t,limit:`workers`}:{rate:n,limit:`politeness`}}function g(e,t,n){if(t.maxDepth>0&&n.depth>t.maxDepth)return;let r=e.seen.has(n.url);if(e.bloom){if(e.checks++,e.bloom.mightContain(n.url)){r?e.duplicates++:(e.missed++,e.seen.add(n.url));return}e.bloom.add(n.url)}else if(r){e.duplicates++;return}e.seen.add(n.url),e.frontier.size<p&&e.frontier.push(n)}var _={problem:[`A web crawler starts from some URLs, downloads each page, finds the links on it, and repeats. A few lines of code can do it for 100 pages. Doing it for billions, while staying polite to every site and not wasting effort, is a very different problem.`,`Three things make it hard: you must not overload any site, the web is full of duplicates and traps, and the frontier of URLs to visit grows far faster than you can fetch them.`],functional:[`Start from seed URLs and follow links`,`Download and store HTML pages`,`Avoid crawling the same page twice`],nonFunctional:[`Scale to billions of pages per month`,`Stay polite, by respecting robots.txt and rate limits per site`,`Survive bad HTML, unresponsive servers and malicious pages`],diagram:{nodes:[{id:`seed`,label:`Seed URLs`,col:0,row:0,kind:`client`,note:`Where the crawl starts, often chosen by country or topic.`},{id:`f`,label:`URL frontier`,col:1,row:0,kind:`queue`,note:`Separate queues per host for politeness, and priority queues so important pages go first.`},{id:`dl`,label:`HTML downloader`,col:2,row:0,note:`Fetches pages, checks robots.txt, and retries with timeouts.`},{id:`dns`,label:`DNS resolver`,col:3,row:0,kind:`external`,note:`Often a bottleneck, so results are cached locally.`},{id:`parse`,label:`Parser and content check`,col:2,row:1,note:`Parses HTML and drops pages whose content has already been seen, using a hash.`},{id:`store`,label:`Content store`,col:3,row:1,kind:`store`,note:`Stores the page content, mostly on disk.`},{id:`ext`,label:`Link extractor`,col:1,row:1,note:`Finds links in the page and normalizes them.`},{id:`seen`,label:`URL seen filter`,col:0,row:1,kind:`store`,note:`A Bloom filter that quickly rejects URLs already visited.`}],edges:[{from:`seed`,to:`f`},{from:`f`,to:`dl`},{from:`dl`,to:`dns`,dashed:!0},{from:`dl`,to:`parse`},{from:`parse`,to:`store`},{from:`parse`,to:`ext`},{from:`ext`,to:`seen`},{from:`seen`,to:`f`}]},ideas:[{title:`BFS over DFS`,body:`The web is too deep for depth-first search. Breadth-first is the norm, with the frontier adding priority and politeness on top of a plain FIFO queue.`},{title:`Politeness`,body:`A queue per host means each host has one worker at a time, with a delay between requests. Without this, a crawler is effectively a denial of service attack.`},{title:`Duplicate detection`,body:`A Bloom filter checks URLs cheaply, with a small chance of wrongly skipping a page. Content hashes then catch different URLs with the same page, which is roughly 30% of the web.`},{title:`Spider traps`,body:`Some sites generate endless URLs, by accident or on purpose. Limit depth and URL length, and watch for sites with abnormal page counts.`}],estimator:{vars:[{key:`pagesMonth`,label:`Pages per month`,unit:`count`},{key:`pageBytes`,label:`Bytes per page`,unit:`plain`,assume:5e5},{key:`months`,label:`Months to keep`,unit:`plain`,assume:60},{key:`peakFactor`,label:`Peak over average`,unit:`plain`,assume:2},{key:`avg`,label:`Average fetch rate`,unit:`qps`},{key:`peak`,label:`Peak fetch rate`,unit:`qps`},{key:`monthly`,label:`Storage per month`,unit:`bytes`},{key:`total`,label:`Total storage`,unit:`bytes`}],eqs:[{out:`avg`,terms:[[`pagesMonth`,1],[2592e3,-1]]},{out:`peak`,terms:[[`avg`,1],[`peakFactor`,1]]},{out:`monthly`,terms:[[`pagesMonth`,1],[`pageBytes`,1]]},{out:`total`,terms:[[`monthly`,1],[`months`,1]]}],starts:[{key:`pagesMonth`,value:1e9},{key:`total`,value:0x6a94d74f430000},{key:`peak`,value:1e3}]},lab:{secondsPerTick:d,params:[{key:`hosts`,label:`Websites`,kind:`range`,min:5,max:200,step:5,rebuild:!0},{key:`workers`,label:`Fetch workers`,kind:`range`,min:1,max:200,step:1},{key:`fetchMs`,label:`Time per fetch`,kind:`range`,min:100,max:2e3,step:100,unit:`ms`},{key:`delaySec`,label:`Politeness delay per site`,kind:`range`,min:0,max:5,step:.1,unit:`s`},{key:`dedupe`,label:`Duplicate detection`,kind:`choice`,rebuild:!0,options:[{value:`exact`,label:`Exact set of URLs`},{value:`bloom`,label:`Bloom filter`}]},{key:`bitsPerItem`,label:`Bloom bits per URL`,kind:`range`,min:1,max:16,step:1,rebuild:!0},{key:`maxDepth`,label:`Depth limit`,kind:`range`,min:0,max:50,step:1,format:e=>e===0?`None`:String(e)},{key:`trap`,label:`Include a spider trap`,kind:`toggle`,rebuild:!0}],defaults:{hosts:50,workers:40,fetchMs:500,delaySec:1,dedupe:`exact`,bitsPerItem:10,trap:!1,maxDepth:0},create(e){let t={now:0,frontier:new u,seen:new Set,bloom:e.dedupe===`bloom`?new o(f*e.bitsPerItem,m(e.bitsPerItem)):void 0,inFlight:[],fetched:0,fetchedTick:0,rate:0,duplicates:0,missed:0,checks:0,trapPages:0,lastAction:``};for(let n=0;n<e.hosts;n++)g(t,e,{url:`h${n}/p0`,host:n,depth:0});return e.trap&&g(t,e,{url:`trap.example/cal`,host:-1,depth:0}),t},step(e,t){e.now+=d;let n=0;for(e.inFlight=e.inFlight.filter(r=>{if(r.doneAt>e.now+1e-9)return!0;n++,e.fetched++,e.last=r.page,r.page.host===-1&&e.trapPages++;for(let n of l(r.page,t.hosts))g(e,t,n);return!1});e.inFlight.length<t.workers;){let n=e.frontier.pop(e.now,t.delaySec);if(!n)break;e.inFlight.push({page:n,doneAt:e.now+t.fetchMs/1e3})}e.fetchedTick=n,e.rate=e.rate*.95+n/d*.05},sample:(e,t)=>({rate:e.rate,math:h(t).rate,frontier:e.frontier.size}),charts:[{title:`Pages fetched`,unit:`per s`,series:[{key:`rate`,label:`Measured`,role:`measured`},{key:`math`,label:`Math`,role:`predicted`}]},{title:`URLs waiting in the frontier`,series:[{key:`frontier`,label:`Measured`,role:`measured`}]}],metrics(r,i){let a=h(i),o=r.bloom?s(i.bitsPerItem,r.bloom.k,r.bloom.inserted/f):0;return[{label:`Pages per second`,value:e(a.rate),role:`predicted`},{label:`Pages per second`,value:e(r.rate),role:`measured`},{label:`Duplicates skipped`,value:e(r.duplicates),role:`measured`},{label:`Pages wrongly skipped`,value:t(r.missed),role:`measured`,tone:r.missed?`warn`:void 0},{label:`False positive rate`,value:r.bloom?n(o,2):`0%`,role:`predicted`},{label:`Trap pages crawled`,value:e(r.trapPages),role:`measured`,tone:r.trapPages>500?`bad`:void 0}]},math(t,n){let r=n.workers/(n.fetchMs/1e3),i=n.delaySec>0?n.hosts/n.delaySec:1/0;return[{expr:`Workers: ${n.workers} ÷ ${n.fetchMs/1e3} s per fetch`,result:`${e(r)} pages/s`},{expr:`Politeness: ${n.hosts} sites ÷ ${n.delaySec} s delay`,result:n.delaySec>0?`${e(i)} pages/s`:`no limit`},{expr:`Throughput is the smaller of the two, limited by`,result:h(n).limit,tone:`warn`}]},views:(t,n)=>[{kind:`note`,title:`Memory for duplicate detection`,text:t.bloom?`Bloom filter: ${e(f*n.bitsPerItem/8)} bytes, fixed. An exact set of the same URLs would take about ${e(t.seen.size*50)} bytes.`:`Exact set: about ${e(t.seen.size*50)} bytes so far, growing with every URL.`}],trace:t=>({values:{page:t.last?.url.slice(0,26)??``,depth:t.last?String(t.last.depth):``,frontier:e(t.frontier.size),seen:e(t.seen.size)}}),experiments:[{title:`Politeness sets the speed`,set:{hosts:20,workers:100,fetchMs:500,delaySec:1},ticks:200,question:`You have 100 workers that can fetch 200 pages a second between them, but only 20 sites, and may hit each one once per second. What throughput do you get?`,options:[`About 200 pages/s`,`About 20 pages/s`,`About 100 pages/s`],answer:1,explain:`Politeness caps you at 20 sites × 1 page per second, so most of those workers sit idle. More machines can't help, and the fix is to crawl more sites at once. That's why a crawler's queue is organized per host rather than as one big list.`,check:(e,t,n)=>{let i=r(n,`rate`,60);return i>13&&i<23}},{title:`Walk into a trap`,set:{hosts:5,workers:50,fetchMs:200,delaySec:0,trap:!0,maxDepth:0},ticks:600,question:`One site generates endless new links, like a calendar with a "next month" button. With no depth limit, where does the crawl's effort end up?`,options:[`The crawl finishes normally`,`Mostly inside the trap`,`It skips the trap automatically`],answer:1,explain:`Every URL there is new, so duplicate detection can't help. Once the normal sites are exhausted, the crawler keeps feeding on the trap forever. Real crawlers cap URL length and depth, and they spot sites producing suspicious numbers of pages.`,check:e=>e.trapPages>e.fetched*.5},{title:`Set a depth limit`,set:{hosts:5,workers:50,fetchMs:200,delaySec:0,trap:!0,maxDepth:6},ticks:600,question:`Same trap, but with a maximum depth of 6, and each trap page links to 2 more. What's the most trap pages you could crawl?`,options:[`127`,`1,000`,`Unlimited`],answer:0,explain:`A depth limit of 6 with 2 links per page gives 2^7 − 1 = 127 pages at most. The trap is reduced from infinite to a rounding error. The cost is that you might miss genuinely deep pages.`,check:e=>e.trapPages<=127},{title:`A Bloom filter too small`,set:{hosts:100,workers:200,fetchMs:200,delaySec:.2,dedupe:`bloom`,bitsPerItem:2},ticks:400,question:`You use a Bloom filter with only 2 bits per URL to save memory. It never misses a seen URL, but can wrongly say a new one was seen. What's the effect?`,options:[`Nothing, it's still accurate`,`Some new pages get skipped forever`,`It re-crawls the same pages`],answer:1,explain:`When the filter wrongly says "seen", that page is never crawled. Too few bits per item means a high false positive rate. The formula is (1 − e^(−kn/m))^k, which falls fast as you add bits.`,check:e=>e.missed>20},{title:`Give it ten bits`,set:{hosts:100,workers:200,fetchMs:200,delaySec:.2,dedupe:`bloom`,bitsPerItem:10},ticks:400,question:`Now use 10 bits per URL. What share of checks wrongly report "seen"?`,options:[`About 1% or less`,`About 10%`,`About 50%`],answer:0,explain:`With 10 bits and 7 hash functions, the false positive rate is under 1%. That's still far less memory than storing billions of URLs, which is why crawlers use Bloom filters for this job.`,check:e=>e.checks>100&&e.missed/e.checks<.02}]},pseudocode:[{code:`while frontier has URLs:`},{code:`  page = next URL from a host we may contact`,id:`page`},{code:`  wait out the politeness delay for that host`},{code:`  html = fetch(page)`},{code:`  for link in extract_links(html):`},{code:`    if depth > limit: skip`,id:`depth`},{code:`    if link in seen: skip`,id:`seen`},{code:`    add link to seen, then to frontier`,id:`frontier`}],sources:[{name:`engine.ts`,code:a,lang:`ts`}],tradeoffs:[{choice:`Bloom filter`,gain:`Fixed, tiny memory`,cost:`A small share of pages get skipped forever`},{choice:`Exact URL set`,gain:`No pages lost`,cost:`Memory for billions of URLs`},{choice:`Longer politeness delay`,gain:`Friendlier to sites, fewer bans`,cost:`Slower crawl`},{choice:`Depth limit`,gain:`Immune to infinite traps`,cost:`May miss deep content`}],interview:[{q:`How do you decide what to crawl first?`,a:`Rank URLs by usefulness, using PageRank, traffic and update frequency, and put them into priority queues. A selector then favors high-priority queues, without starving low-priority ones.`},{q:`How do you keep content fresh?`,a:`Re-crawl pages according to how often they change and how important they are, not on one schedule. Sitemaps and last-modified headers help you avoid wasted fetches.`},{q:`How do you scale across many machines?`,a:`Partition the frontier by host, so one machine owns each host's queue. That keeps politeness simple. Keep DNS caches local, and place crawlers near the sites they fetch.`},{q:`What makes a crawler robust?`,a:`Consistent hashing to spread work, saving crawl state so you can resume after a crash, timeouts on everything, and never trusting the input, since malformed and hostile HTML is routine.`}],mistakes:[`Ignoring politeness and treating the frontier as one simple queue.`,`Only deduplicating URLs and not content.`,`Forgetting about spider traps.`]};export{_ as default};