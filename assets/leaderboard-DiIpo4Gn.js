import{i as e,o as t,r as n,u as r}from"./index-ar0glIxf.js";import{a as i}from"./stats-SinZlVt1.js";var a=`// A real skip list with rank support, the structure behind Redis sorted sets, and the SQL-style alternative.
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
`,o=24,s=class{random;head={member:``,score:1/0,forward:Array(o).fill(null),span:Array(o).fill(0)};level=1;length=0;steps=0;constructor(e){this.random=e}before(e,t,n,r){return e>n||e===n&&t<r}randomLevel(){let e=1;for(;e<o&&this.random()<.25;)e++;return e}insert(e,t){let n=Array(o),r=Array(o).fill(0),i=this.head;for(let a=this.level-1;a>=0;a--){for(r[a]=a===this.level-1?0:r[a+1];i.forward[a]&&this.before(i.forward[a].score,i.forward[a].member,t,e);)r[a]+=i.span[a],i=i.forward[a],this.steps++;n[a]=i}let a=this.randomLevel();if(a>this.level){for(let e=this.level;e<a;e++)r[e]=0,n[e]=this.head,n[e].span[e]=this.length;this.level=a}let s={member:e,score:t,forward:Array(a).fill(null),span:Array(a).fill(0)};for(let e=0;e<a;e++)s.forward[e]=n[e].forward[e],n[e].forward[e]=s,s.span[e]=n[e].span[e]-(r[0]-r[e]),n[e].span[e]=r[0]-r[e]+1;for(let e=a;e<this.level;e++)n[e].span[e]++;this.length++}remove(e,t){let n=Array(o),r=this.head;for(let i=this.level-1;i>=0;i--){for(;r.forward[i]&&this.before(r.forward[i].score,r.forward[i].member,t,e);)r=r.forward[i],this.steps++;n[i]=r}let i=r.forward[0];if(i&&i.member===e&&i.score===t){for(let e=0;e<this.level;e++)n[e].forward[e]===i?(n[e].span[e]+=i.span[e]-1,n[e].forward[e]=i.forward[e]):n[e].span[e]--;for(;this.level>1&&!this.head.forward[this.level-1];)this.level--;this.length--}}update(e,t,n){n!==void 0&&this.remove(e,n),this.insert(e,t)}rank(e,t){let n=0,r=this.head;for(let i=this.level-1;i>=0;i--){for(;r.forward[i]&&(this.before(r.forward[i].score,r.forward[i].member,t,e)||r.forward[i].score===t&&r.forward[i].member===e);)n+=r.span[i],r=r.forward[i],this.steps++;if(r.member===e)return n}return-1}top(e){let t=[],n=this.head.forward[0];for(;n&&t.length<e;)t.push({member:n.member,score:n.score}),n=n.forward[0],this.steps++;return t}},c=class{rows=[];byMember=new Map;steps=0;update(e,t){let n=this.byMember.get(e);if(n)n.score=t;else{let n={member:e,score:t};this.rows.push(n),this.byMember.set(e,n)}this.steps++}rank(e,t){let n=1;for(let e of this.rows)this.steps++,e.score>t&&n++;return n}top(e){return this.steps+=this.rows.length,[...this.rows].sort((e,t)=>t.score-e.score).slice(0,e)}},l=r(),u=.2,d=`you`;function f(e,t,n,r){let i=e.scores.get(n);e.scores.set(n,r),t.structure===`skiplist`?e.board.update(n,r,i):e.board.update(n,r)}function p({state:e}){return(0,l.jsxs)(`div`,{className:`lab-panel`,children:[(0,l.jsxs)(`h4`,{children:[`Live top 10. You are ranked `,t(e.rankOfYou),`.`]}),(0,l.jsx)(`div`,{className:`table-wrap`,children:(0,l.jsxs)(`table`,{children:[(0,l.jsx)(`thead`,{children:(0,l.jsxs)(`tr`,{children:[(0,l.jsx)(`th`,{children:`Rank`}),(0,l.jsx)(`th`,{children:`Player`}),(0,l.jsx)(`th`,{children:`Score`})]})}),(0,l.jsx)(`tbody`,{children:e.top.slice(0,10).map((e,n)=>(0,l.jsxs)(`tr`,{children:[(0,l.jsx)(`td`,{children:n+1}),(0,l.jsx)(`td`,{children:e.member===d?`You`:e.member}),(0,l.jsx)(`td`,{children:t(e.score)})]},e.member))})]})})]})}var m={problem:[`A gaming leaderboard ranks players, updates as they score, and shows the top 10 and your own position. The top 10 is easy. It's "what's my exact rank out of 25 million players, right now" that breaks a normal database.`,`A database has to count how many rows are above you, and with scores changing constantly, indexes can't save it. The trick is a data structure that makes both updating and ranking take logarithmic time: the sorted set, built on a skip list.`],functional:[`Show the top 10 players`,`Show a player's own rank`,`Update scores in real time, when a player wins`],nonFunctional:[`Real-time updates to scores and ranks`,`Scales to millions of players`,`Scores can't be cheated from the client`],diagram:{nodes:[{id:`c`,label:`Game client`,col:0,row:0,kind:`client`,note:`Never reports its own score, or players would cheat.`},{id:`g`,label:`Game service`,col:1,row:0,note:`Decides who won, then reports that to the leaderboard service.`},{id:`l`,label:`Leaderboard service`,col:2,row:0,note:`Updates scores and answers rank queries.`},{id:`r`,label:`Redis sorted sets`,col:3,row:0,kind:`store`,note:`One sorted set per leaderboard, kept in memory with a skip list.`},{id:`d`,label:`Database`,col:3,row:1,kind:`store`,note:`Keeps score history and user profiles. Redis can be rebuilt from here after a failure.`},{id:`q`,label:`Queue`,col:2,row:1,kind:`queue`,note:`Optionally decouples game results from leaderboard writes, if other services want them too.`}],edges:[{from:`c`,to:`g`},{from:`g`,to:`l`},{from:`l`,to:`r`},{from:`l`,to:`d`,dashed:!0},{from:`g`,to:`q`,dashed:!0},{from:`q`,to:`l`,dashed:!0}]},ideas:[{title:`Skip list`,body:`A sorted linked list with extra express lanes on top. Search starts on the fastest lane and drops down, for about log n steps. It's simpler than a balanced tree, and easy to keep balanced using randomness.`},{title:`Getting a rank`,body:`Each pointer stores how many nodes it skips. Adding those up as you walk gives you the exact rank, without counting anyone.`},{title:`Why not a database?`,body:`A rank query has to count rows above you, and scores change constantly. Caching doesn't help, since everyone's rank shifts. In-memory sorted sets fit this pattern exactly.`},{title:`Sharding`,body:`Past one Redis node, fixed score ranges let you find rank by adding up higher shards. Hash partitioning spreads load evenly, but makes top-N and exact rank much harder.`}],estimator:{vars:[{key:`mau`,label:`Monthly active users`,unit:`count`},{key:`dauShare`,label:`Daily share (0 to 1)`,unit:`plain`,assume:.2},{key:`gamesPerDay`,label:`Games per user per day`,unit:`plain`,assume:10},{key:`peakFactor`,label:`Peak over average`,unit:`plain`,assume:5},{key:`entryBytes`,label:`Bytes per player`,unit:`plain`,assume:26},{key:`overheadFactor`,label:`Memory overhead multiple`,unit:`plain`,assume:2},{key:`dau`,label:`Daily active users`,unit:`count`},{key:`updates`,label:`Average score updates`,unit:`qps`},{key:`peak`,label:`Peak score updates`,unit:`qps`},{key:`memory`,label:`Redis memory`,unit:`bytes`}],eqs:[{out:`dau`,terms:[[`mau`,1],[`dauShare`,1]]},{out:`updates`,terms:[[`dau`,1],[`gamesPerDay`,1],[86400,-1]]},{out:`peak`,terms:[[`updates`,1],[`peakFactor`,1]]},{out:`memory`,terms:[[`mau`,1],[`entryBytes`,1],[`overheadFactor`,1]]}],starts:[{key:`mau`,value:25e6},{key:`peak`,value:3e3},{key:`memory`,value:13e8}]},lab:{secondsPerTick:u,params:[{key:`structure`,label:`Data structure`,kind:`choice`,rebuild:!0,options:[{value:`skiplist`,label:`Skip list (sorted set)`},{value:`table`,label:`SQL table, no usable index`}]},{key:`players`,label:`Players`,kind:`range`,min:1e3,max:1e5,step:1e3,rebuild:!0},{key:`updatesPerSec`,label:`Score updates`,kind:`range`,min:5,max:100,step:5,unit:`per s`},{key:`topN`,label:`Leaderboard length`,kind:`range`,min:10,max:100,step:10}],defaults:{structure:`skiplist`,players:5e4,updatesPerSec:50,topN:10},create(e,t){let n=e.structure===`skiplist`?new s(()=>t.next()):new c,r={board:n,scores:new Map,names:[],stepsPerOp:0,lastOpSteps:0,rankOfYou:0,topStepsLast:0,top:[],ops:0};r.names=Array.from({length:e.players},(e,t)=>`player${t}`);for(let n of r.names)f(r,e,n,t.int(1e5));return f(r,e,d,1e3),n.steps=0,r},step(e,t,n){let r=Math.min(40,n.poisson(t.updatesPerSec*u));for(let i=0;i<r;i++){let r=e.names[n.int(e.names.length)],i=e.board.steps;f(e,t,r,(e.scores.get(r)??0)+n.int(500)),e.board.rank(r,e.scores.get(r)),e.lastOpSteps=e.board.steps-i,e.stepsPerOp=e.stepsPerOp?e.stepsPerOp*.97+e.lastOpSteps*.03:e.lastOpSteps,e.ops++}let i=e.board.steps;e.top=e.board.top(t.topN),e.topStepsLast=e.board.steps-i,e.rankOfYou=e.board.rank(d,e.scores.get(d))},sample:(e,t)=>({steps:e.stepsPerOp,math:t.structure===`skiplist`?2.5*Math.log2(t.players):t.players,top:e.topStepsLast}),charts:[{title:`Nodes touched per score update and rank lookup`,series:[{key:`steps`,label:`Measured`,role:`measured`},{key:`math`,label:`Math`,role:`predicted`}]}],metrics(r,i){return[{label:`Work per update`,value:e(i.structure===`skiplist`?2.5*Math.log2(i.players):i.players),role:`predicted`},{label:`Work per update`,value:e(r.stepsPerOp),role:`measured`},{label:`Work to read the top list`,value:e(r.topStepsLast),role:`measured`},{label:`Your rank`,value:t(r.rankOfYou),role:`measured`},{label:`Memory at about 100 bytes each`,value:n(r.scores.size*100),role:`predicted`}]},math(e,r){return[{expr:`Skip list: about log2(${t(r.players)}) × a small constant`,result:`${t(2.5*Math.log2(r.players))} steps`},{expr:`Table scan: count every row above you`,result:`${t(r.players)} steps`,tone:`bad`},{expr:`Scale it: ${t(e.scores.size)} players × 100 bytes`,result:n(e.scores.size*100)}]},View:p,actions:[{key:`small`,label:`You win a match: +500`,run:(e,t)=>f(e,t,d,(e.scores.get(d)??0)+500)},{key:`big`,label:`You go on a huge streak: +1,000,000`,run:(e,t)=>f(e,t,d,(e.scores.get(d)??0)+1e6)}],trace:n=>({values:{steps:e(n.lastOpSteps),rank:t(n.rankOfYou),top:e(n.topStepsLast)}}),experiments:[{title:`Rank in a sorted set`,set:{structure:`skiplist`,players:5e4},ticks:60,question:`You have 50,000 players in a skip list. How many nodes does it touch to update a score and find the new rank?`,options:[`A few dozen`,`About 25,000`,`All 50,000`],answer:0,explain:`Express lanes skip over large parts of the list, so it takes about log n steps down. Spans along the way add up to the rank. Double the players and it costs only a couple of extra steps. This is why Redis uses this for sorted sets.`,check:(e,t,n)=>i(n,`steps`,40)<200},{title:`Rank in a table`,set:{structure:`table`,players:5e4},ticks:40,question:"A table with `SELECT COUNT(*) WHERE score > mine`. How many rows does it read per lookup?",options:[`A few dozen`,`All 50,000`],answer:1,explain:`With scores changing constantly, every rank lookup needs a count across the table. That's fine for 1,000 players, and terrible for 50 million playing at once. An index helps reads, but it's costly to maintain under this update rate.`,check:(e,t,n)=>i(n,`steps`,20)>3e4},{title:`Read the top 10`,set:{structure:`skiplist`,topN:10,players:5e4},ticks:20,question:`How much work is it to read the top 10 from a skip list?`,options:[`About 10 steps`,`About log n steps`,`All the players`],answer:0,explain:`The best scores are already at the front, so you simply walk 10 nodes. That's why the most-viewed part of the leaderboard is also the cheapest.`,check:e=>e.topStepsLast<=11},{title:`Jump to the top`,set:{structure:`skiplist`,players:2e4},act:[`big`],actAt:10,ticks:15,question:`You jump a million points. What does the skip list do?`,options:[`Removes and re-inserts you, in about log n steps, and you're first`,`Re-sorts everything`],answer:0,explain:`Only your node moves, so nobody else gets touched. That's why it can handle tens of thousands of updates per second, on just one in-memory node.`,check:e=>e.rankOfYou===1}]},pseudocode:[{code:`update(player, new_score):`},{code:`  remove player's old node, in about log n steps`},{code:`  insert with new score, in about log n steps`,id:`steps`},{code:``},{code:`rank(player):`},{code:`  walk down from the top lane, adding spans`,id:`rank`},{code:``},{code:`top(n): walk n nodes from the head`,id:`top`}],sources:[{name:`engine.ts`,code:a,lang:`ts`}],tradeoffs:[{choice:`Redis sorted set`,gain:`Fast updates and rank, with simple commands`,cost:`Memory cost, and durability needs care`},{choice:`SQL table`,gain:`Familiar and durable`,cost:`Rank queries scan far too many rows`},{choice:`Shard by score range`,gain:`Exact global rank stays possible`,cost:`Uneven shards, and players move between them`},{choice:`Approximate rank`,gain:`Scales much further`,cost:`"Top 1%" rather than an exact position`}],interview:[{q:`What if Redis fails?`,a:`Use a replica for failover, and keep scores in a durable database too. In the worst case, you can rebuild the sorted set from that data, since it's derived.`},{q:`How do you break ties?`,a:`Use a secondary sort, such as earliest to reach the score. With a sorted set, you can encode the timestamp into the low bits of the score, or keep a separate lookup.`},{q:`How do you scale to 500 million players?`,a:`Shard the sorted set. With fixed score ranges, exact rank is the count in higher shards plus your rank in yours. At that scale, many products show a percentile rather than an exact rank.`},{q:`How do you stop cheating?`,a:`The server decides scores, from game outcomes. Clients never submit them directly. Add an idempotency key so a game result can't be counted twice, plus anomaly detection on the results.`}],mistakes:["Using `ORDER BY` on a huge table for rank.",`Letting the client submit its own score.`,`Sharding by hash, then trying to find a global rank.`]};export{m as default};