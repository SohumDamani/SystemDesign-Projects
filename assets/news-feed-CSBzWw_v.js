import{a as e,i as t,n,o as r}from"./index-ar0glIxf.js";import{a as i}from"./stats-SinZlVt1.js";var a=`// A social graph with real feeds, and the three ways of getting posts into them.
import { Rng, zipfSampler } from '../../core/rng';

export type Strategy = 'write' | 'read' | 'hybrid';

export interface Post {
  id: number;
  author: number;
  at: number;
}

export interface Network {
  followers: number[][]; // who follows this user
  following: number[][]; // who this user follows
  timelines: Post[][]; // each user's own recent posts
  feeds: Post[][]; // precomputed home feeds
}

const FEED_LENGTH = 50;

/** Popularity follows a power law, so user 0 is a celebrity and most users have few followers. */
export function buildNetwork(users: number, averageFollows: number, rng: Rng): Network {
  const sample = zipfSampler(users, 1);
  const followers: number[][] = Array.from({ length: users }, () => []);
  const following: number[][] = Array.from({ length: users }, () => []);
  for (let u = 0; u < users; u++) {
    const chosen = new Set<number>();
    for (let i = 0; i < averageFollows; i++) {
      const target = sample(rng);
      if (target !== u) chosen.add(target);
    }
    for (const t of chosen) {
      following[u].push(t);
      followers[t].push(u);
    }
  }
  return { followers, following, timelines: Array.from({ length: users }, () => []), feeds: Array.from({ length: users }, () => []) };
}

export const isCelebrity = (n: Network, user: number, threshold: number) => n.followers[user].length >= threshold;

export interface FanoutJob {
  follower: number;
  post: Post;
}

/** Writes the post to the author's timeline, and returns the feed writes it still needs. */
export function publish(n: Network, post: Post, strategy: Strategy, threshold: number): FanoutJob[] {
  n.timelines[post.author].unshift(post);
  if (n.timelines[post.author].length > FEED_LENGTH) n.timelines[post.author].pop();
  if (strategy === 'read') return [];
  if (strategy === 'hybrid' && isCelebrity(n, post.author, threshold)) return [];
  return n.followers[post.author].map((follower) => ({ follower, post }));
}

export function applyFanout(n: Network, job: FanoutJob) {
  const feed = n.feeds[job.follower];
  feed.unshift(job.post);
  if (feed.length > FEED_LENGTH) feed.pop();
}

export interface FeedResult {
  posts: Post[];
  /** Cache or database reads this took. */
  reads: number;
}

/** Builds a user's feed, and counts the reads it costs under each strategy. */
export function readFeed(n: Network, user: number, strategy: Strategy, threshold: number): FeedResult {
  if (strategy === 'write') return { posts: n.feeds[user], reads: 1 };
  const sources = strategy === 'read' ? n.following[user] : n.following[user].filter((f) => isCelebrity(n, f, threshold));
  const merged: Post[] = strategy === 'hybrid' ? [...n.feeds[user]] : [];
  for (const followee of sources) merged.push(...n.timelines[followee].slice(0, 10));
  merged.sort((a, b) => b.at - a.at);
  return { posts: merged.slice(0, FEED_LENGTH), reads: sources.length + (strategy === 'hybrid' ? 1 : 0) };
}
`,o=50;function s(e,t,r){let i=n(e,1),a=Array.from({length:e},()=>[]),o=Array.from({length:e},()=>[]);for(let n=0;n<e;n++){let e=new Set;for(let a=0;a<t;a++){let t=i(r);t!==n&&e.add(t)}for(let t of e)o[n].push(t),a[t].push(n)}return{followers:a,following:o,timelines:Array.from({length:e},()=>[]),feeds:Array.from({length:e},()=>[])}}var c=(e,t,n)=>e.followers[t].length>=n;function l(e,t,n,r){return e.timelines[t.author].unshift(t),e.timelines[t.author].length>o&&e.timelines[t.author].pop(),n===`read`||n===`hybrid`&&c(e,t.author,r)?[]:e.followers[t.author].map(e=>({follower:e,post:t}))}function u(e,t){let n=e.feeds[t.follower];n.unshift(t.post),n.length>o&&n.pop()}function d(e,t,n,r){if(n===`write`)return{posts:e.feeds[t],reads:1};let i=n===`read`?e.following[t]:e.following[t].filter(t=>c(e,t,r)),a=n===`hybrid`?[...e.feeds[t]]:[];for(let t of i)a.push(...e.timelines[t].slice(0,10));return a.sort((e,t)=>t.at-e.at),{posts:a.slice(0,o),reads:i.length+ +(n===`hybrid`)}}var f=.1,p=2e3,m=30,h={problem:[`A news feed shows you recent posts from people you follow. Doing that from scratch on each open means reading from hundreds of accounts in milliseconds. So the central question is when to do the work: when a post is written, or when a feed is read.`,`The answer depends on a fact about social graphs: followers follow a power law. Most people have a few hundred, and a tiny number have tens of millions. A design that works for the average user can fall over the moment a celebrity posts.`],functional:[`Publish a post`,`See a feed of posts from people you follow, newest first`,`Include text, images and video`],nonFunctional:[`Feed loads in under a few hundred milliseconds`,`A new post appears within seconds`,`Celebrity posts don't overload the system`],diagram:{nodes:[{id:`u`,label:`Users`,col:0,row:1,kind:`client`,note:`Publish posts and open feeds, through a load balancer.`},{id:`p`,label:`Post service`,col:1,row:0,note:`Saves the post, then hands off to fan-out.`},{id:`f`,label:`Fan-out service`,col:2,row:0,note:`Looks up followers and queues feed updates, skipping celebrities in the hybrid.`},{id:`q`,label:`Message queue`,col:3,row:0,kind:`queue`,note:`Smooths out large fan-outs, so a big post doesn't need instant work.`},{id:`n`,label:`Feed service`,col:1,row:2,note:`Reads the precomputed feed, merges in celebrity posts, and attaches content.`},{id:`c`,label:`Feed cache`,col:3,row:2,kind:`store`,note:`Stores post IDs per user, not whole posts, to save memory.`},{id:`g`,label:`Graph store`,col:2,row:1,kind:`store`,note:`Who follows whom. The fan-out service reads this constantly.`}],edges:[{from:`u`,to:`p`},{from:`u`,to:`n`},{from:`p`,to:`f`},{from:`f`,to:`g`},{from:`f`,to:`q`},{from:`q`,to:`c`},{from:`n`,to:`c`}]},ideas:[{title:`Fan-out on write`,body:`Push each post into every follower's feed cache at write time. Reads become a single cache lookup, but writing gets expensive for popular authors, and you do work for inactive users.`},{title:`Fan-out on read`,body:`Build the feed when it's opened, by reading from each followee. Posting is cheap and celebrities are no problem, but reads get slow, and reads are the common case.`},{title:`The hybrid`,body:`Push for most users, and pull for the few with huge followings. This gives fast reads without a fan-out storm, at the cost of two code paths.`},{title:`Store IDs, not posts`,body:`A feed cache holds lists of post IDs, with post content cached separately. It saves a great deal of memory, since one post can appear in millions of feeds.`}],estimator:{vars:[{key:`dau`,label:`Daily active users`,unit:`count`},{key:`postsPerUser`,label:`Posts per user per day`,unit:`plain`,assume:.5},{key:`avgFollowers`,label:`Average followers`,unit:`plain`,assume:300},{key:`opensPerUser`,label:`Feed opens per user per day`,unit:`plain`,assume:10},{key:`idBytes`,label:`Bytes per feed entry`,unit:`plain`,assume:8},{key:`feedLength`,label:`Entries kept per feed`,unit:`plain`,assume:800},{key:`postQps`,label:`Post rate`,unit:`qps`},{key:`fanoutQps`,label:`Fan-out write rate`,unit:`qps`},{key:`readQps`,label:`Feed read rate`,unit:`qps`},{key:`cache`,label:`Feed cache memory`,unit:`bytes`}],eqs:[{out:`postQps`,terms:[[`dau`,1],[`postsPerUser`,1],[86400,-1]]},{out:`fanoutQps`,terms:[[`postQps`,1],[`avgFollowers`,1]]},{out:`readQps`,terms:[[`dau`,1],[`opensPerUser`,1],[86400,-1]]},{out:`cache`,terms:[[`dau`,1],[`feedLength`,1],[`idBytes`,1]]}],starts:[{key:`dau`,value:1e8},{key:`fanoutQps`,value:2e5},{key:`cache`,value:0xe8d4a51000}]},lab:{secondsPerTick:f,params:[{key:`strategy`,label:`Fan-out strategy`,kind:`choice`,rebuild:!0,options:[{value:`write`,label:`Fan-out on write (push)`},{value:`read`,label:`Fan-out on read (pull)`},{value:`hybrid`,label:`Hybrid, pull for celebrities`}]},{key:`postsPerSec`,label:`Posts`,kind:`range`,min:0,max:100,step:1,unit:`per s`},{key:`opensPerSec`,label:`Feed opens`,kind:`range`,min:10,max:500,step:10,unit:`per s`},{key:`threshold`,label:`Celebrity threshold`,kind:`range`,min:100,max:1900,step:50,unit:`followers`},{key:`capacity`,label:`Fan-out capacity`,kind:`range`,min:500,max:2e4,step:500,unit:`writes/s`}],defaults:{strategy:`write`,postsPerSec:5,opensPerSec:100,threshold:1e3,capacity:2e3},create(e,t){return{now:0,net:s(p,m,t),queue:[],head:0,nextPost:1,writesNow:0,readsPerOpen:0,writeRate:0,backlog:0,peakBacklog:0,lastPost:``}},step(e,t,n){e.now+=f;for(let r=n.poisson(t.postsPerSec*f);r>0;r--){let r=20+n.int(1980);e.queue.push(...l(e.net,{id:e.nextPost++,author:r,at:e.now},t.strategy,t.threshold))}let r=Math.floor(t.capacity*f),i=0;for(;i<r&&e.head<e.queue.length;)u(e.net,e.queue[e.head++]),i++;e.head>4096&&(e.queue=e.queue.slice(e.head),e.head=0),e.writesNow=i,e.writeRate=e.writeRate*.9+i/f*.1,e.backlog=e.queue.length-e.head,e.peakBacklog=Math.max(e.peakBacklog,e.backlog);let a=Math.max(1,Math.min(200,n.poisson(t.opensPerSec*f))),o=0;for(let r=0;r<a;r++)o+=d(e.net,n.int(p),t.strategy,t.threshold).reads;e.readsPerOpen=e.readsPerOpen*.9+o/a*.1},sample:(e,t)=>({backlog:e.backlog,writes:e.writeRate,cap:t.capacity,reads:e.readsPerOpen}),charts:[{title:`Feed writes waiting`,series:[{key:`backlog`,label:`Measured`,role:`measured`}]},{title:`Reads per feed open`,series:[{key:`reads`,label:`Measured`,role:`measured`}]}],metrics(n,i){let a=n.net.followers[0].length;return[{label:`Feed writes per second`,value:i.strategy===`read`?`0`:t(i.postsPerSec*m),role:`predicted`},{label:`Feed writes per second`,value:t(n.writeRate),role:`measured`},{label:`Reads per feed open`,value:n.readsPerOpen.toFixed(1),role:`measured`},{label:`Delay before posts appear`,value:e(n.backlog/i.capacity),role:`measured`,tone:n.backlog/i.capacity>1?`bad`:void 0},{label:`Celebrity's followers`,value:r(a),role:`measured`}]},math(t,n){let i=t.net.followers[0].length,a=t.net.followers.filter((e,r)=>c(t.net,r,n.threshold)).length;return[{expr:`Fan-out writes: ${n.postsPerSec} posts/s × ${m} followers`,result:`${r(n.postsPerSec*m)} writes/s`},{expr:`One celebrity post: ${r(i)} writes ÷ ${r(n.capacity)}/s`,result:n.strategy===`write`?e(i/n.capacity):`no fan-out`,tone:n.strategy===`write`?`warn`:`good`},{expr:`Users above the celebrity threshold`,result:r(a)}]},views:e=>{let t=[...e.net.followers.map(e=>e.length)].sort((e,t)=>t-e);return[{kind:`bars`,title:`Followers by rank: a few have most of them`,items:[0,1,4,19,99,499,1999].map(e=>({label:`Rank ${e+1}`,value:t[e]}))}]},actions:[{key:`celebrity`,label:`The top celebrity posts`,run:(e,t)=>{e.queue.push(...l(e.net,{id:e.nextPost++,author:0,at:e.now},t.strategy,t.threshold)),e.lastPost=`Post #${e.nextPost-1} by the celebrity`}}],trace:(e,n)=>({values:{backlog:t(e.backlog),reads:e.readsPerOpen.toFixed(1),strategy:n.strategy},active:[n.strategy===`read`?`reads`:`backlog`]}),experiments:[{title:`A celebrity posts`,set:{strategy:`write`,capacity:2e3},act:[`celebrity`],actAt:20,ticks:60,question:`With fan-out on write, each post is copied into every follower's feed. The top celebrity, followed by almost everyone, posts once. What does that one post cost?`,options:[`One write`,`About 17 writes, the average`,`Nearly 2,000 writes, and a visible delay`],answer:2,explain:`One post becomes one write per follower. With capacity for 2,000 writes a second, it takes about a second to drain here, and everyone else's posts wait behind it. At real scale, with 100 million followers, this is the hot key problem at its worst.`,check:e=>e.peakBacklog>1e3},{title:`Pull instead`,set:{strategy:`read`},act:[`celebrity`],actAt:20,ticks:100,question:`With fan-out on read, nothing is precomputed, and each feed is built when opened. What does opening a feed cost now?`,options:[`One read, as before`,`About one read per person followed`,`Zero reads`],answer:1,explain:`Posting is now free, but each open reads every followee's timeline, about 24 reads here. Since reads vastly outnumber writes in a news feed, this usually moves the pain somewhere worse.`,check:(e,t,n)=>e.peakBacklog===0&&i(n,`reads`,30)>15},{title:`The hybrid`,set:{strategy:`hybrid`,threshold:1e3},act:[`celebrity`],actAt:20,ticks:100,question:`Now push posts from ordinary users, and pull only from celebrities with 1,000+ followers. What happens to the celebrity post and to reads?`,options:[`No backlog, and only a few extra reads per open`,`Same backlog as push`,`Same reads as pull`],answer:0,explain:`A handful of celebrities cause almost all of the fan-out cost, so special-casing just them removes the spike. Each feed open reads the precomputed feed plus a few celebrity timelines. It's the approach large social networks actually use.`,check:(e,t,n)=>e.peakBacklog<800&&i(n,`reads`,30)<10}]},pseudocode:[{code:`publish(post):`},{code:`  save to the author's timeline`},{code:`  if author is not a celebrity:`},{code:`    for each follower: queue a feed update`,id:`backlog`},{code:``},{code:`open_feed(user):`},{code:`  posts = precomputed feed for user`},{code:`  for each celebrity followed: read their timeline`,id:`reads`},{code:`  return posts merged by time`},{code:`strategy in use`,id:`strategy`}],sources:[{name:`engine.ts`,code:a,lang:`ts`}],tradeoffs:[{choice:`Fan-out on write`,gain:`Very fast reads`,cost:`Huge write bursts, and wasted work for inactive users`},{choice:`Fan-out on read`,gain:`Cheap writes and no celebrity problem`,cost:`Slow reads, and reads are the common case`},{choice:`Hybrid`,gain:`Fast reads without fan-out storms`,cost:`Two paths to build and keep correct`},{choice:`Skip inactive users`,gain:`Saves a lot of writes`,cost:`Slow first load when they return`}],interview:[{q:`How do you rank a feed instead of sorting by time?`,a:`Generate candidates with fan-out, then score them with a model at read time. Fan-out decides what could be shown, and ranking decides the order.`},{q:`What about someone who follows 5,000 people?`,a:`The same power law applies on the following side. Cap merges at a reasonable number of sources, and rely on precomputed feeds for the rest.`},{q:`How do you handle deleted posts?`,a:`Don't try to remove them from millions of feeds. Check at read time: when hydrating IDs into posts, drop any that are deleted or that the viewer shouldn't see.`},{q:`What do you cache?`,a:`Feed ID lists, post content, user profiles and social counts, all in separate layers. Post content is especially cache-friendly, as a small number of posts get most of the views.`}],mistakes:[`Designing only for the average user, and forgetting the celebrity.`,`Storing full posts in every feed.`,`Doing fan-out synchronously in the publish request.`]};export{h as default};