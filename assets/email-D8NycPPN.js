import{h as e,i as t,o as n,p as r,r as i,s as a,u as o}from"./index-ar0glIxf.js";import{a as s}from"./stats-SinZlVt1.js";var c=e(r(),1),l=`// A real inverted index over a mailbox, so search doesn't have to read every message.
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
    const words = new Set(tokenize(\`\${mail.from} \${mail.subject} \${mail.body}\`));
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
    const present = new Set(tokenize(\`\${mail.from} \${mail.subject} \${mail.body}\`));
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
    mails.push({ id, from: pick(PEOPLE), subject: \`\${topic} \${pick(COMMON)}\`, body: words.join(' '), threadId: thread, folder: rng.chance(0.85) ? 'inbox' : rng.chance(0.7) ? 'sent' : 'spam' });
  }
  return mails;
}
`;function u(e){return e.toLowerCase().match(/[a-z0-9]+/g)??[]}var d=class{postings=new Map;entries=0;add(e){let t=new Set(u(`${e.from} ${e.subject} ${e.body}`));for(let n of t){let t=this.postings.get(n);t?t.push(e.id):this.postings.set(n,[e.id]),this.entries++}return t.size}get terms(){return this.postings.size}frequency(e){return this.postings.get(e)?.length??0}search(e,t){let n=e.map(e=>this.postings.get(e)??[]);if(t&&n.sort((e,t)=>e.length-t.length),!n.length)return{ids:[],comparisons:0};let r=n[0],i=n[0].length;for(let e of n.slice(1)){let t=[],n=0,a=0;for(;n<r.length&&a<e.length;)i++,r[n]===e[a]?(t.push(r[n]),n++,a++):r[n]<e[a]?n++:a++;r=t}return{ids:r,comparisons:i}}};function f(e,t){let n=[];for(let r of e){let e=new Set(u(`${r.from} ${r.subject} ${r.body}`));t.every(t=>e.has(t))&&n.push(r.id)}return{ids:n,comparisons:e.length}}var p=[`invoice`,`meeting`,`project`,`travel`,`budget`,`report`,`launch`,`contract`,`review`,`schedule`,`design`,`server`,`database`,`hiring`,`customer`,`security`],m=[`please`,`thanks`,`update`,`team`,`today`,`tomorrow`,`attached`,`follow`,`question`,`status`,`plan`,`notes`],h=[`alex`,`priya`,`sam`,`maria`,`chen`,`fatima`,`jordan`,`lena`],g=[`kubernetes`,`quarterly`,`reimbursement`,`offsite`,`migration`,`renewal`,`audit`,`roadmap`,`prototype`,`vendor`];function _(e,t){let n=e=>e[t.int(e.length)],r=[],i=0;for(let a=0;a<e;a++){t.chance(.4)||i++;let e=n(p),o=[n(m),n(m),n(p),n(m),e];t.chance(.08)&&o.push(n(g)),r.push({id:a,from:n(h),subject:`${e} ${n(m)}`,body:o.join(` `),threadId:i,folder:t.chance(.85)?`inbox`:t.chance(.7)?`sent`:`spam`})}return r}var v=o(),y=.5,b=[`invoice`,`please`,`budget`,`kubernetes`,`alex`,`thanks`,`meeting`,`renewal`,`security`,`update`,`priya`,`audit`];function x({state:e,params:t}){let[r,i]=(0,c.useState)(`budget report`),a=u(r),o=a.length?e.index.search(a,t.order===`rarest`):{ids:[],comparisons:0},s=a.length?f(e.mails,a):{ids:[],comparisons:0},l=o.ids.slice(0,5).map(t=>e.mails[t]);return(0,v.jsxs)(`div`,{className:`lab-panel`,children:[(0,v.jsxs)(`h4`,{children:[`Search this mailbox of `,n(e.mails.length),` messages`]}),(0,v.jsx)(`div`,{className:`lab-input`,children:(0,v.jsx)(`input`,{value:r,onChange:e=>i(e.target.value),"aria-label":`Search terms`,placeholder:`budget report`})}),(0,v.jsxs)(`p`,{className:`small`,style:{marginBottom:6},children:[n(o.ids.length),` matches. The index did `,n(o.comparisons),` comparisons, and a full scan would do `,n(s.comparisons),`.`]}),(0,v.jsx)(`div`,{className:`table-wrap`,children:(0,v.jsx)(`table`,{children:(0,v.jsx)(`tbody`,{children:l.map(e=>(0,v.jsxs)(`tr`,{children:[(0,v.jsx)(`td`,{children:e.from}),(0,v.jsx)(`td`,{children:e.subject}),(0,v.jsx)(`td`,{children:e.folder})]},e.id))})})})]})}var S={problem:[`An email service moves messages between you and the rest of the world over old, loosely reliable protocols, and keeps them for years. The hard parts are the sheer volume of data, delivering reliably when other mail servers fail or refuse you, and making years of mail searchable instantly.`,`Search is an interesting case because each person's mailbox is mostly independent. You don't need one global index, and you can keep users' data separate. The lab runs a real inverted index, the structure behind nearly all text search.`],functional:[`Send and receive email`,`Read mail organized in folders and threads`,`Search within your own mail, and filter spam and viruses`],nonFunctional:[`Never lose a message`,`Available even when parts of the system fail`,`Scales to billions of users, and years of retention`],diagram:{nodes:[{id:`a`,label:`Webmail client`,col:0,row:0,kind:`client`,note:`Talks over HTTP, with a WebSocket pushing new mail.`},{id:`w`,label:`Web servers`,col:1,row:0,note:`Stateless. They handle API requests for reading and sending.`},{id:`q`,label:`Outgoing queue`,col:2,row:0,kind:`queue`,note:`Validates and queues mail, then retries if the receiver is unavailable.`},{id:`s`,label:`SMTP workers`,col:3,row:0,note:`Send mail to other servers, with careful rate limits to protect your reputation.`},{id:`x`,label:`Other mail servers`,col:3,row:1,kind:`external`,note:`Outside your control. They can reject or slow you down at any time.`},{id:`m`,label:`Metadata store`,col:1,row:1,kind:`store`,note:`Partitioned by user. Reads are mostly recent, so most data is cold.`},{id:`b`,label:`Attachment store`,col:2,row:1,kind:`store`,note:`Blob storage for attachments, separate from metadata.`},{id:`i`,label:`Search index`,col:0,row:1,kind:`store`,note:`An inverted index per user, kept up to date from a stream of new mail.`}],edges:[{from:`a`,to:`w`},{from:`w`,to:`q`},{from:`q`,to:`s`},{from:`s`,to:`x`},{from:`w`,to:`m`},{from:`w`,to:`b`},{from:`m`,to:`i`,dashed:!0}]},ideas:[{title:`Inverted index`,body:`For each word, store a sorted list of messages containing it. A search intersects those lists, which is far faster than reading each message, and costs extra writes on new mail.`},{title:`Partition by user`,body:`Almost every query is about one person's mail, so partition data by user ID. Each user's data stays together, and the system scales simply as users grow.`},{title:`Delivery reliability`,body:`Mail is queued and retried, with increasing delays, for days. Senders also need a good reputation, using SPF, DKIM and DMARC, plus careful warming up of new IP addresses.`},{title:`Threads`,body:"Message headers like `In-Reply-To` and `References` link replies together. Storing a thread ID at write time means reading a conversation doesn't require searching for it."}],estimator:{vars:[{key:`users`,label:`Users`,unit:`count`},{key:`sent`,label:`Mails sent per user per day`,unit:`plain`,assume:10},{key:`received`,label:`Mails received per user per day`,unit:`plain`,assume:40},{key:`metaBytes`,label:`Metadata bytes per mail`,unit:`plain`,assume:5e4},{key:`attachShare`,label:`Share with attachments (0 to 1)`,unit:`plain`,assume:.2},{key:`attachBytes`,label:`Bytes per attachment`,unit:`plain`,assume:5e5},{key:`years`,label:`Years to keep`,unit:`plain`,assume:1},{key:`sendQps`,label:`Send rate`,unit:`qps`},{key:`metaStorage`,label:`Metadata storage`,unit:`bytes`},{key:`attachStorage`,label:`Attachment storage`,unit:`bytes`}],eqs:[{out:`sendQps`,terms:[[`users`,1],[`sent`,1],[86400,-1]]},{out:`metaStorage`,terms:[[`users`,1],[`received`,1],[`metaBytes`,1],[365,1],[`years`,1]]},{out:`attachStorage`,terms:[[`users`,1],[`received`,1],[`attachShare`,1],[`attachBytes`,1],[365,1],[`years`,1]]}],starts:[{key:`users`,value:1e9},{key:`sendQps`,value:1e5},{key:`metaStorage`,value:0x9b6e64a8ec60000}]},lab:{secondsPerTick:y,params:[{key:`size`,label:`Mailbox size`,kind:`range`,min:1e3,max:5e4,step:1e3,rebuild:!0},{key:`method`,label:`Search method`,kind:`choice`,options:[{value:`index`,label:`Inverted index`},{value:`scan`,label:`Read every message`}]},{key:`order`,label:`Intersect lists`,kind:`choice`,options:[{value:`rarest`,label:`Rarest word first`},{value:`typed`,label:`As typed`}]},{key:`words`,label:`Words per query`,kind:`range`,min:1,max:3,step:1},{key:`mailsPerSec`,label:`New mail arriving`,kind:`range`,min:0,max:100,step:5,unit:`per s`}],defaults:{size:2e4,method:`index`,order:`rarest`,words:2,mailsPerSec:10},create(e,t){let n=_(e.size,t),r=new d,i=0;for(let e of n)i+=r.add(e);return{mails:n,index:r,nextId:e.size,thread:0,comparisons:0,ema:0,lastQuery:``,lastHits:0,indexed:n.length,carry:0,writeOps:i}},step(e,t,n){e.carry+=t.mailsPerSec*y;let r=Math.floor(e.carry);if(e.carry-=r,r){let t=_(r,n).map((t,n)=>({...t,id:e.nextId+n}));for(let n of t)e.mails.push(n),e.writeOps+=e.index.add(n);e.nextId+=r}let i=Array.from({length:t.words},()=>b[n.int(b.length)]);e.lastQuery=i.join(` `);let a=t.method===`scan`?f(e.mails,i):e.index.search(i,t.order===`rarest`);e.lastHits=a.ids.length,e.comparisons=a.comparisons,e.ema=e.ema?e.ema*.85+a.comparisons*.15:a.comparisons},sample:e=>({work:e.ema,all:e.mails.length}),charts:[{title:`Work per search`,series:[{key:`work`,label:`Measured`,role:`measured`},{key:`all`,label:`Full scan`,role:`predicted`}]}],metrics(e){let n=e.index.entries/e.mails.length;return[{label:`Work compared to a scan`,value:a(e.ema/e.mails.length,1),role:`measured`},{label:`Index entries`,value:t(e.index.entries),role:`measured`},{label:`Distinct words`,value:t(e.index.terms),role:`measured`},{label:`Index writes per mail`,value:n.toFixed(1),role:`measured`},{label:`Index size`,value:i(e.index.entries*8),role:`predicted`}]},math(e){return[{expr:`Full scan: all ${n(e.mails.length)} messages`,result:`${n(e.mails.length)} reads`},{expr:`Index for "${e.lastQuery}"`,result:`${n(e.comparisons)} comparisons`},{expr:`Each new mail adds ${(e.index.entries/e.mails.length).toFixed(1)} index entries`,result:`writes get slower`}]},View:x,views(e){return[{kind:`bars`,title:`How common each word is, in messages`,items:b.slice(0,6).map(t=>({label:t,value:e.index.frequency(t)}))}]},trace:e=>({values:{q:e.lastQuery,cmp:n(e.comparisons),hits:n(e.lastHits)}}),experiments:[{title:`Index or scan`,set:{method:`index`,size:2e4,words:2,mailsPerSec:0},ticks:80,question:`A search for two words over 20,000 messages, using an inverted index. How much work is it compared with reading every message?`,options:[`About the same`,`Far less`],answer:1,explain:`The index jumps straight to messages containing each word, and intersects those lists. Only they are examined. The less common the word, the bigger the saving.`,check:(e,t,n)=>s(n,`work`,60)<12e3},{title:`Which word first?`,set:{method:`index`,order:`rarest`,words:3,size:2e4,mailsPerSec:0},ticks:80,question:`Your query has a common word and a rare one. Why start intersecting with the rarest list?`,options:[`It doesn't matter`,`The result can't exceed the shortest list, so later steps have less to do`],answer:1,explain:`The answer can be no longer than the shortest list. Starting there makes every later step cheaper. Real search engines do this constantly, using stored word frequencies.`,check:e=>e.index.search([`please`,`budget`,`renewal`],!0).comparisons<=e.index.search([`please`,`budget`,`renewal`],!1).comparisons},{title:`What indexing costs`,set:{method:`index`,mailsPerSec:50,size:1e4},ticks:40,question:`What does an inverted index cost when new mail arrives?`,options:[`Nothing, it's free`,`Each mail adds many index entries, one per distinct word`,`It must be fully rebuilt per mail`],answer:1,explain:`One email becomes roughly one write per distinct word. This write amplification is why indexing typically runs asynchronously, with new messages taking a moment to become searchable.`,check:e=>e.index.entries/e.mails.length>4}]},pseudocode:[{code:`on_new_mail(mail):`},{code:`  for each distinct word: postings[word].add(mail.id)`},{code:``},{code:`search(words):`},{code:`  query terms`,id:`q`},{code:`  lists = postings for each word, shortest first`},{code:`  result = intersect the lists`,id:`cmp`},{code:`  return matching mails`,id:`hits`}],sources:[{name:`engine.ts`,code:l,lang:`ts`}],tradeoffs:[{choice:`Search engine such as Elasticsearch`,gain:`Powerful and quick to adopt`,cost:`Another big system, and syncing data to it`},{choice:`Custom search`,gain:`Fits email precisely, and saves money at huge scale`,cost:`Big engineering investment`},{choice:`Sync indexing`,gain:`New mail is searchable at once`,cost:`Slower writes`},{choice:`Key-value metadata`,gain:`Scales by user easily`,cost:`Harder to query across folders and threads`}],interview:[{q:`Why not use a relational database?`,a:`Mail bodies are large and a user can have millions of messages. Relational databases struggle at that scale. Custom key-value or wide-column stores partitioned by user are the common choice.`},{q:`What's the hard part of consistency?`,a:`A message must never be lost or shown in two conflicting states. Mailboxes usually choose consistency over availability: if the primary replica for a mailbox is down, that user waits, rather than risk divergence.`},{q:`How do you avoid being marked as spam?`,a:`Authenticate mail with SPF, DKIM and DMARC, warm up new IP addresses gradually, separate promotional from transactional mail, and remove addresses that bounce.`},{q:`How do you handle huge attachments?`,a:`Store attachments in blob storage, referenced from metadata, and dedupe by hash. Beyond a size limit, most providers send a download link instead.`}],mistakes:[`Storing attachments in the metadata database.`,`Building one global search index, when each user's mail is independent.`,`Assuming the receiving mail server is always available.`]};export{S as default};