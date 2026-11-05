import{h as e,i as t,n,o as r,p as i,s as a,u as o}from"./index-ar0glIxf.js";import{a as s,o as c}from"./stats-SinZlVt1.js";import{n as l,t as u}from"./engine-LoCRo7Gb.js";var d=e(i(),1),f=`// Two real ways to make a short code, a real store, and a real LRU cache for lookups.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function toBase62(value: number): string {
  if (value === 0) return ALPHABET[0];
  let out = '';
  let n = value;
  while (n > 0) {
    out = ALPHABET[n % 62] + out;
    n = Math.floor(n / 62);
  }
  return out;
}

/** A 53-bit string hash (cyrb53). Salting lets us retry after a collision. */
export function hash53(text: string, salt = 0): number {
  let h1 = 0xdeadbeef ^ salt;
  let h2 = 0x41c6ce57 ^ salt;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function hashCode(url: string, length: number, salt: number): string {
  return toBase62(hash53(url, salt) % 62 ** length).padStart(length, '0');
}

export type Method = 'counter' | 'hash';

export interface Shortened {
  code: string;
  url: string;
  collisions: number;
  method: Method;
  id?: number;
}

export class Shortener {
  private byCode = new Map<string, string>();
  private byUrl = new Map<string, string>();
  private nextId = 1;
  collisions = 0;

  get size() {
    return this.byCode.size;
  }

  shorten(url: string, method: Method, length: number): Shortened {
    const existing = this.byUrl.get(url);
    if (existing) return { code: existing, url, collisions: 0, method };
    if (method === 'counter') {
      // A unique ID always makes a unique code, so collisions can't happen.
      const id = this.nextId++;
      const code = toBase62(id);
      this.save(code, url);
      return { code, url, collisions: 0, method, id };
    }
    // Hash, then keep re-salting until the code is free.
    let salt = 0;
    let code = hashCode(url, length, salt);
    while (this.byCode.has(code)) {
      salt++;
      this.collisions++;
      code = hashCode(url, length, salt);
    }
    this.save(code, url);
    return { code, url, collisions: salt, method };
  }

  private save(code: string, url: string) {
    this.byCode.set(code, url);
    this.byUrl.set(url, code);
  }

  resolve(code: string): string | undefined {
    return this.byCode.get(code);
  }
}

/** A Map remembers insertion order, so its first key is the least recently used. */
export class LruCache {
  private map = new Map<number, true>();
  constructor(private capacity: number) {}

  /** Returns true on a hit. A miss loads the key, as a real read path would. */
  access(key: number): boolean {
    if (this.map.delete(key)) {
      this.map.set(key, true);
      return true;
    }
    if (this.map.size >= this.capacity) this.map.delete(this.map.keys().next().value!);
    this.map.set(key, true);
    return false;
  }
}
`,p=o(),m=.1,h=1e4,g=1;function _({state:e,params:t,rerender:n}){let[r,i]=(0,d.useState)(`https://example.com/a/very/long/path?with=parameters`),[a,o]=(0,d.useState)(``),[s,c]=(0,d.useState)(``),l=()=>{let i=r.trim();if(!/^https?:\/\/\S+\.\S+/.test(i)){o(`Enter a full URL, like https://example.com/page.`);return}o(``);let a=e.store.shorten(i,t.method,t.length);e.last=a,e.mine=[a,...e.mine.filter(e=>e.code!==a.code)].slice(0,4),c(``),n()};return(0,p.jsxs)(`div`,{className:`lab-panel`,children:[(0,p.jsx)(`h4`,{children:`Shorten a real URL`}),(0,p.jsxs)(`div`,{className:`lab-input`,children:[(0,p.jsx)(`input`,{value:r,onChange:e=>i(e.target.value),"aria-label":`URL to shorten`,"aria-invalid":!!a,onKeyDown:e=>e.key===`Enter`&&l()}),(0,p.jsx)(`button`,{onClick:l,children:`Shorten`})]}),a&&(0,p.jsx)(`p`,{className:`field-error`,children:a}),e.mine.length>0&&(0,p.jsx)(`div`,{className:`table-wrap`,children:(0,p.jsxs)(`table`,{children:[(0,p.jsx)(`thead`,{children:(0,p.jsxs)(`tr`,{children:[(0,p.jsx)(`th`,{children:`Short code`}),(0,p.jsx)(`th`,{children:`Collisions`}),(0,p.jsx)(`th`,{children:`Resolve`})]})}),(0,p.jsx)(`tbody`,{children:e.mine.map(t=>(0,p.jsxs)(`tr`,{children:[(0,p.jsx)(`td`,{children:(0,p.jsxs)(`code`,{children:[`sho.rt/`,t.code]})}),(0,p.jsx)(`td`,{children:t.collisions}),(0,p.jsx)(`td`,{children:(0,p.jsx)(`button`,{onClick:()=>c(`${t.code} redirects to ${e.store.resolve(t.code)}`),children:`Resolve`})})]},t.code))})]})}),s&&(0,p.jsx)(`p`,{className:`small`,style:{marginTop:8,overflowWrap:`anywhere`},children:s})]})}var v={problem:[`A URL shortener turns a long address into a short one, and redirects anyone who visits it. It looks like a beginner question, yet it covers ID generation, read-heavy scaling, caching and collision math in a very small space.`,`Two facts drive the design. Reads vastly outnumber writes, perhaps 10 to 1 or more, so this is mostly a caching problem. And a short code means a small space of possible codes, so you need a deliberate way to avoid collisions.`],functional:[`Given a long URL, return a short one`,`Redirect a short URL to its original`,`Track click counts for analytics`],nonFunctional:[`Very fast redirects`,`Highly available, since a dead link breaks forever`,`Short codes that are hard to guess, if required`],diagram:{nodes:[{id:`u`,label:`Browser`,col:0,row:1,kind:`client`,note:`Sends GET /abc123 and follows the redirect.`},{id:`lb`,label:`Load balancer`,col:1,row:1,note:`Spreads traffic across stateless API servers.`},{id:`w`,label:`API servers`,col:2,row:1,note:`POST creates a code. GET looks it up and responds with a 301 or 302.`},{id:`c`,label:`Cache`,col:3,row:0,kind:`store`,note:`Holds popular code-to-URL pairs. Most redirects end here.`},{id:`d`,label:`Database`,col:3,row:1,kind:`store`,note:`A code-to-URL table. It needs no joins, so a key-value store fits well.`},{id:`i`,label:`ID generator`,col:3,row:2,note:`Gives each new URL a unique number, which becomes its base62 code.`}],edges:[{from:`u`,to:`lb`},{from:`lb`,to:`w`},{from:`w`,to:`c`},{from:`w`,to:`d`},{from:`w`,to:`i`}]},ideas:[{title:`Hash and check`,body:`Hash the URL, take the first few characters, and check the database. On a collision, add a salt and try again. It needs no ID service, but every write requires a lookup, which a Bloom filter can speed up.`},{title:`Base62 of an ID`,body:`Take a unique number from an ID generator and write it in base 62. It can't collide and needs no check, but codes are sequential and guessable, and their length grows over time.`},{title:`301 or 302`,body:`A 301 permanent redirect lets browsers cache it, cutting your load but hiding repeat clicks. A 302 temporary redirect sends every click through you, which analytics needs.`},{title:`Why seven characters`,body:`62^7 is about 3.5 trillion codes. At 100 million new URLs a day, that lasts about 95 years. Do this math out loud in the interview.`}],estimator:{vars:[{key:`newPerDay`,label:`New URLs per day`,unit:`count`},{key:`readRatio`,label:`Reads per write`,unit:`plain`,assume:10},{key:`recordBytes`,label:`Bytes per record`,unit:`plain`,assume:500},{key:`years`,label:`Years to keep`,unit:`plain`,assume:10},{key:`writeQps`,label:`Write load`,unit:`qps`},{key:`readQps`,label:`Read load`,unit:`qps`},{key:`totalUrls`,label:`Total URLs`,unit:`count`},{key:`storage`,label:`Total storage`,unit:`bytes`}],eqs:[{out:`writeQps`,terms:[[`newPerDay`,1],[86400,-1]]},{out:`readQps`,terms:[[`writeQps`,1],[`readRatio`,1]]},{out:`totalUrls`,terms:[[`newPerDay`,1],[365,1],[`years`,1]]},{out:`storage`,terms:[[`totalUrls`,1],[`recordBytes`,1]]}],starts:[{key:`newPerDay`,value:1e8},{key:`storage`,value:0x5af3107a4000},{key:`readQps`,value:1e4}]},lab:{secondsPerTick:m,params:[{key:`method`,label:`Code generation`,kind:`choice`,rebuild:!0,options:[{value:`hash`,label:`Hash, then retry on collision`},{value:`counter`,label:`Base62 of a unique ID`}]},{key:`length`,label:`Hash code length`,kind:`range`,min:3,max:7,step:1,rebuild:!0,unit:`chars`},{key:`writesPerSec`,label:`New URLs`,kind:`range`,min:0,max:2e3,step:10,unit:`per s`},{key:`readsPerWrite`,label:`Reads per write`,kind:`range`,min:1,max:200,step:1},{key:`cacheSize`,label:`Cache size`,kind:`range`,min:100,max:8e3,step:100,unit:`URLs`,rebuild:!0}],defaults:{method:`hash`,length:3,writesPerSec:500,readsPerWrite:10,cacheSize:2e3},create:e=>({store:new l,cache:new u(e.cacheSize),zipf:n(h,g),written:0,expectedCollisions:0,carry:0,hitRate:0,dbReads:0,mine:[]}),step(e,t,n){let r=62**t.length;e.carry+=t.writesPerSec*m;let i=Math.floor(e.carry);e.carry-=i;for(let n=0;n<i&&!(t.method===`hash`&&e.store.size>=r-1);n++)t.method===`hash`&&(e.expectedCollisions+=e.store.size/(r-e.store.size)),e.last=e.store.shorten(`https://example.com/page/${e.written}`,t.method,t.length),e.written++;let a=Math.min(3e3,Math.round(Math.max(i,1)*t.readsPerWrite)),o=0;for(let t=0;t<a;t++)e.cache.access(e.zipf(n))&&o++;e.dbReads+=a-o,e.hitRate=e.hitRate*.97+(a?o/a:0)*.03},sample:(e,t)=>({collisions:e.store.collisions,expected:e.expectedCollisions,hit:e.hitRate*100,bestHit:c(t.cacheSize,h,g)*100}),charts:[{title:`Total collisions`,series:[{key:`collisions`,label:`Measured`,role:`measured`},{key:`expected`,label:`Math`,role:`predicted`}]},{title:`Cache hit rate`,unit:`%`,series:[{key:`hit`,label:`Measured`,role:`measured`},{key:`bestHit`,label:`Best possible`,role:`predicted`}]}],metrics(e,n){let i=62**n.length;return[{label:`URLs stored`,value:t(e.store.size),role:`measured`},{label:`Possible codes`,value:t(i),role:`predicted`},{label:`Next write collides`,value:n.method===`hash`?a(e.store.size/i,2):`0%`,role:`predicted`},{label:`Collisions`,value:r(e.store.collisions),role:`measured`,tone:e.store.collisions?`warn`:`good`},{label:`Cache hit rate`,value:a(e.hitRate),role:`measured`}]},math(e,n){let r=62**n.length,i=e.store.size;return[{expr:`Code space: 62^${n.length}`,result:t(r)},{expr:`Collisions by birthday math: n² ÷ 2S, with n = ${t(i)}`,result:n.method===`hash`?`≈ ${t(i*i/(2*r))}`:`0, IDs are unique`,tone:n.method===`hash`?void 0:`good`},{expr:`Cache holds ${a(n.cacheSize/h)} of popular links`,result:`up to ${a(c(n.cacheSize,h,g))} of reads`}]},View:_,trace:e=>({values:{url:e.last?e.last.url.slice(0,30):``,code:e.last?.code??``,retry:e.last?`${e.last.collisions} retries`:``},active:e.last?[`code`]:[]}),experiments:[{title:`Birthday math`,set:{method:`hash`,length:3,writesPerSec:500},ticks:100,question:`Three-character codes give 238,328 options. After creating 5,000 URLs, only 2% of the space is used. About how many hash collisions have happened?`,options:[`Almost none`,`About 50`,`About 2,500`],answer:1,explain:`Each new URL can collide with any earlier one, so collisions grow with the square of the count: 5,000² ÷ (2 × 238,328) ≈ 52. This is the birthday paradox. That's why 7 characters are used in practice, with a check on each insert.`,check:e=>e.store.collisions>=25&&e.store.collisions<=85&&e.store.size>=4900},{title:`Use a counter instead`,set:{method:`counter`,writesPerSec:500},ticks:100,question:`Instead of hashing, each URL gets a unique number from an ID generator, encoded in base62. How many collisions after 5,000 URLs?`,options:[`Zero`,`About 50`,`It depends on the URLs`],answer:0,explain:`Different numbers always give different codes, so collisions are impossible and no database check is needed. The tradeoff is that codes are predictable, so anyone can walk through your URLs, and you need a distributed ID generator.`,check:e=>e.store.collisions===0&&e.store.size>=4900},{title:`Cache 20%`,set:{cacheSize:2e3,writesPerSec:100,readsPerWrite:50},ticks:500,question:`Cache 2,000 of the 10,000 most-read links. Reads are skewed, as real links are. What hit rate should you expect?`,options:[`About 20%`,`About 80%`,`About 100%`],answer:1,explain:`A small set of links gets most of the clicks, so caching 20% of them catches about 80% of reads. It's the familiar 80/20 rule, here coming straight out of the Zipf formula.`,check:(e,t,n)=>{let r=s(n,`hit`,100);return r>62&&r<90}}]},pseudocode:[{code:`shorten(url):`},{code:`  if url already stored: return its code`,id:`url`},{code:`  code = hash(url) or base62(next_id())`,id:`code`},{code:`  while code is taken: re-salt and hash again`,id:`retry`},{code:`  save code -> url`},{code:``},{code:`redirect(code):`},{code:`  url = cache.get(code) or database.get(code)`},{code:`  respond 301 or 302 with url`}],sources:[{name:`engine.ts`,code:f,lang:`ts`}],tradeoffs:[{choice:`Hash with collision check`,gain:`No ID service, and codes aren't guessable`,cost:`A lookup on every write, and retries as the space fills`},{choice:`Base62 of a counter`,gain:`No collisions and no lookup`,cost:`Guessable codes, and needs an ID generator`},{choice:`301 redirect`,gain:`Less load, since browsers cache it`,cost:`You lose repeat-click analytics`},{choice:`302 redirect`,gain:`Every click is visible`,cost:`All traffic reaches your servers`}],interview:[{q:`How do you stop people guessing URLs from a counter?`,a:`Scramble the ID with a reversible function, such as a format-preserving cipher, before encoding. You keep uniqueness without having sequential codes.`},{q:`What about custom aliases and expiry?`,a:`Custom aliases are just a uniqueness check on the requested code. Store an expiry date and check it on read, then clean up expired rows lazily or in a background job.`},{q:`How do you count clicks without slowing down redirects?`,a:`Write click events to a queue and aggregate them asynchronously. The redirect path should never wait on analytics.`},{q:`SQL or NoSQL?`,a:`Either works, since there are no joins. A key-value store scales simply for this one lookup pattern. A relational database is a fine start, and easier to reason about at low scale.`}],mistakes:[`Skipping the math on how long your code length lasts.`,`Forgetting that the read-to-write ratio makes this a caching problem.`,`Doing analytics synchronously on the redirect path.`]};export{v as default};