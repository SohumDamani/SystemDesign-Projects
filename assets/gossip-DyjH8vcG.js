import{i as e,o as t,s as n}from"./index-ar0glIxf.js";import{n as r}from"./engine-DiFru7hp.js";var i=`// News spreading with no coordinator, and finding differences between replicas cheaply.
import { hash32 } from '../consistent-hashing/engine';
import type { Rng } from '../../core/rng';

/** One round of gossip. Everyone who knows the news tells \`fanout\` random peers. */
export function gossipRound(informed: Uint8Array, count: number, fanout: number, lossRate: number, rng: Rng): { newlyInformed: number; messages: number } {
  const n = informed.length;
  const newly: number[] = [];
  let messages = 0;
  for (let i = 0; i < n; i++) {
    if (!informed[i]) continue;
    for (let f = 0; f < fanout; f++) {
      messages++;
      if (rng.chance(lossRate)) continue; // the message got lost
      const peer = rng.int(n);
      if (!informed[peer]) newly.push(peer);
    }
  }
  let added = 0;
  for (const peer of newly) {
    if (!informed[peer]) {
      informed[peer] = 1;
      added++;
    }
  }
  return { newlyInformed: added, messages: count ? messages : 0 };
}

/** The textbook estimate of how many nodes will know after one more round. */
export function predictNextRound(informed: number, n: number, fanout: number, lossRate: number): number {
  const reach = fanout * (1 - lossRate);
  return n - (n - informed) * Math.exp((-reach * informed) / n);
}

/** Replicas compare hashes from the top down, and only descend where they differ. */
export class MerkleTree {
  levels: number[][]; // levels[0] is the leaves, the last level is the root

  constructor(leaves: number[]) {
    this.levels = [leaves.map((v, i) => hash32(\`\${i}:\${v}\`))];
    while (this.levels[this.levels.length - 1].length > 1) {
      const below = this.levels[this.levels.length - 1];
      const level: number[] = [];
      for (let i = 0; i < below.length; i += 2) level.push(hash32(\`\${below[i]}:\${below[i + 1] ?? 0}\`));
      this.levels.push(level);
    }
  }
}

/** Walks two trees, and returns the differing leaves and how many hashes had to be compared. */
export function diffTrees(a: MerkleTree, b: MerkleTree): { differing: number[]; comparisons: number } {
  let comparisons = 0;
  const differing: number[] = [];
  const walk = (level: number, index: number) => {
    comparisons++;
    if (a.levels[level][index] === b.levels[level][index]) return;
    if (level === 0) {
      differing.push(index);
      return;
    }
    walk(level - 1, index * 2);
    if (index * 2 + 1 < a.levels[level - 1].length) walk(level - 1, index * 2 + 1);
  };
  walk(a.levels.length - 1, 0);
  return { differing, comparisons };
}
`;function a(e,t,n,r,i){let a=e.length,o=[],s=0;for(let t=0;t<a;t++)if(e[t])for(let t=0;t<n;t++){if(s++,i.chance(r))continue;let t=i.int(a);e[t]||o.push(t)}let c=0;for(let t of o)e[t]||(e[t]=1,c++);return{newlyInformed:c,messages:t?s:0}}function o(e,t,n,r){let i=n*(1-r);return t-(t-e)*Math.exp(-i*e/t)}var s=class{levels;constructor(e){for(this.levels=[e.map((e,t)=>r(`${t}:${e}`))];this.levels[this.levels.length-1].length>1;){let e=this.levels[this.levels.length-1],t=[];for(let n=0;n<e.length;n+=2)t.push(r(`${e[n]}:${e[n+1]??0}`));this.levels.push(t)}}};function c(e,t){let n=0,r=[],i=(a,o)=>{n++,e.levels[a][o]!==t.levels[a][o]&&(a===0?r.push(o):(i(a-1,o*2),o*2+1<e.levels[a-1].length&&i(a-1,o*2+1)))};return i(e.levels.length-1,0),{differing:r,comparisons:n}}function l(e,t,n){e.informed=new Uint8Array(t.nodes),e.informed[n.int(t.nodes)]=1,e.count=1,e.predicted=1,e.round=0,e.waitTicks=0}function u(e,t){let n=2**e.keyPower,r=Array.from({length:n},(e,t)=>t*7),i=[...r],a=new Set;for(;a.size<Math.min(e.differences,n);)a.add(t.int(n));for(let e of a)i[e]=-1;let o=c(new s(r),new s(i));return{comparisons:o.comparisons,found:o.differing.length,keys:n,expected:a.size}}var d=e=>e.rounds.length?e.rounds.reduce((e,t)=>e+t,0)/e.rounds.length:0,f={problem:[`In a cluster of thousands of machines, how does every node learn who's alive? A central coordinator is a bottleneck and a single point of failure. Having every node ping every other node takes far too many messages.`,`Gossip solves this the way rumors spread: each node regularly tells a few random others what it knows. And when replicas need to find out what they disagree on, Merkle trees let them compare billions of keys by exchanging a handful of hashes. Dynamo, Cassandra and many other systems use both.`],functional:[`Spread information to every node`,`Detect failed nodes, with no central monitor`,`Find differences between replicas efficiently`],nonFunctional:[`Scales to thousands of nodes`,`Works when many messages are lost`,`Uses little network bandwidth`],ideas:[{title:`Why gossip works`,body:`Each round, the number of informed nodes multiplies, so reaching everyone takes about log N rounds. It needs no membership list to be perfect, and has no single point of failure.`},{title:`Failure detection`,body:`Each node keeps a heartbeat counter for every other node, and shares that table through gossip. If a node's counter stops increasing everywhere for a while, it's presumed dead.`},{title:`Merkle trees`,body:`Hash each key, then hash pairs of hashes, up to one root. Two replicas with the same root are identical. If they differ, descend only into the branches that differ.`},{title:`Anti-entropy`,body:`Replicas can slowly drift through missed writes. Regular background comparison with Merkle trees finds and repairs differences, without scanning all of the data.`}],estimator:{vars:[{key:`nodes`,label:`Nodes`,unit:`count`},{key:`fanout`,label:`Peers per round`,unit:`plain`,assume:3},{key:`interval`,label:`Seconds per round`,unit:`plain`,assume:1},{key:`msgBytes`,label:`Bytes per message`,unit:`plain`,assume:1e3},{key:`msgRate`,label:`Messages across the cluster`,unit:`qps`},{key:`bandwidth`,label:`Total bandwidth`,unit:`bytesPerSec`}],eqs:[{out:`msgRate`,terms:[[`nodes`,1],[`fanout`,1],[`interval`,-1]]},{out:`bandwidth`,terms:[[`msgRate`,1],[`msgBytes`,1]]}],starts:[{key:`nodes`,value:5e3},{key:`bandwidth`,value:1e8}]},lab:{secondsPerTick:1,params:[{key:`nodes`,label:`Nodes`,kind:`range`,min:100,max:2e4,step:100,rebuild:!0},{key:`fanout`,label:`Peers told each round`,kind:`range`,min:1,max:10,step:1},{key:`loss`,label:`Messages lost`,kind:`range`,min:0,max:.8,step:.05,format:e=>n(e)},{key:`keyPower`,label:`Keys in the replicas`,kind:`range`,min:8,max:16,step:1,rebuild:!0,format:e=>t(2**e)},{key:`differences`,label:`Keys that differ`,kind:`range`,min:0,max:200,step:1,rebuild:!0}],defaults:{nodes:1e3,fanout:3,loss:0,keyPower:16,differences:1},create(e,t){let n={rounds:[],messages:0,lastRoundMessages:0,merkle:u(e,t)};return l(n,e,t),n},step(e,t,n){if(e.count>=t.nodes){e.waitTicks++,e.waitTicks>6&&l(e,t,n);return}let r=a(e.informed,e.count,t.fanout,t.loss,n);e.count+=r.newlyInformed,e.predicted=Math.min(t.nodes,o(e.predicted,t.nodes,t.fanout,t.loss)),e.lastRoundMessages=r.messages,e.messages+=r.messages,e.round++,e.count>=t.nodes&&e.rounds.push(e.round)},sample:e=>({informed:e.count,math:e.predicted}),charts:[{title:`Nodes that know the news`,series:[{key:`informed`,label:`Measured`,role:`measured`},{key:`math`,label:`Math`,role:`predicted`}]}],metrics(r,i){let a=i.fanout*(1-i.loss),o=a>0?Math.log(i.nodes)/Math.log(1+a)+Math.log(i.nodes)/Math.max(a,.01):1/0;return[{label:`Rounds to reach everyone`,value:Number.isFinite(o)?`about ${t(o)}`:`Never`,role:`predicted`},{label:`Rounds to reach everyone`,value:r.rounds.length?d(r).toFixed(1):`Still spreading`,role:`measured`},{label:`Share informed`,value:n(r.count/i.nodes),role:`measured`},{label:`Messages this round`,value:e(r.lastRoundMessages),role:`measured`},{label:`Merkle comparisons`,value:t(r.merkle.comparisons),role:`measured`},{label:`Comparing every key`,value:t(r.merkle.keys),role:`predicted`}]},math(e,r){let i=r.fanout*(1-r.loss);return[{expr:`Each informed node reaches ${r.fanout} × (1 − ${n(r.loss)})`,result:`${i.toFixed(1)} peers`},{expr:`Growth phase: log(${t(r.nodes)}) ÷ log(1 + ${i.toFixed(1)})`,result:i>0?`${(Math.log(r.nodes)/Math.log(1+i)).toFixed(1)} rounds`:`never`},{expr:`Merkle: ${e.merkle.expected} differing of ${t(e.merkle.keys)}, found ${e.merkle.found}`,result:`${t(e.merkle.comparisons)} comparisons`,tone:`good`}]},views:e=>[{kind:`bars`,title:`Latest rounds needed to reach everyone`,items:e.rounds.slice(-6).map((t,n)=>({label:`Rumor ${e.rounds.length-Math.min(6,e.rounds.length)+n+1}`,value:t}))}],trace:e=>({values:{round:t(e.round),knows:t(e.count),cmp:`${t(e.merkle.comparisons)} comparisons`}}),experiments:[{title:`How fast does it spread?`,set:{nodes:1e3,fanout:3},ticks:40,question:`In a group of 1,000 nodes, each node that knows some news tells 3 random peers each round. How many rounds until everyone knows?`,options:[`About 10`,`About 100`,`About 333`],answer:0,explain:`The number of informed nodes roughly quadruples per round at the start, and that's exponential. Finding the very last few takes a bit longer, as random picks often hit people who already know. No coordinator, no list of nodes, and it still reaches everyone.`,check:e=>e.rounds.length>0&&d(e)>=5&&d(e)<=15},{title:`Ten times the nodes`,set:{nodes:1e4,fanout:3},ticks:40,question:`With 10,000 nodes, ten times as many, how many rounds does it take?`,options:[`About 100, ten times as many`,`Only a few more`],answer:1,explain:`Growth depends on the logarithm of the size, so 10 times the nodes adds just a couple of rounds. This is why gossip scales so well, and why large clusters use it for membership and failure detection.`,check:e=>e.rounds.length>0&&d(e)>=6&&d(e)<=18},{title:`A terrible network`,set:{nodes:1e3,fanout:3,loss:.5},ticks:40,question:`Half of all messages get lost. What happens to the spread?`,options:[`It fails`,`It takes a few more rounds, and still reaches everyone`],answer:1,explain:`There's no single message that matters, since the same news arrives from many directions. That redundancy is the point of gossip: reliability comes from repetition, not from any one delivery.`,check:e=>e.rounds.length>0&&d(e)<=25},{title:`Find one difference`,set:{keyPower:16,differences:1},ticks:2,question:`Two replicas hold 65,536 keys, and one key differs. By comparing hashes in a Merkle tree from the top down, how many comparisons does it take to find it?`,options:[`About 33`,`About 32,000`,`All 65,536`],answer:0,explain:`If two subtree hashes match, everything below them is identical, so you skip it. You only descend along the differing path, 2 comparisons per level for 16 levels. A very small exchange of data finds the difference among 65,536 keys.`,check:e=>e.merkle.found===1&&e.merkle.comparisons<=40},{title:`Many differences`,set:{keyPower:16,differences:200},ticks:2,question:`If 200 keys differ, how does the work grow?`,options:[`Still around 33`,`Roughly in proportion to the differences, far less than comparing everything`],answer:1,explain:`Each differing key needs its own path down, with shared upper levels. It's still only a few thousand comparisons, compared with 65,536 for a full scan. The cost depends on how much differs, not on how much data you have.`,check:e=>e.merkle.found===200&&e.merkle.comparisons<6e3&&e.merkle.comparisons>200}]},pseudocode:[{code:`every round, on each node that knows:`},{code:`  pick a few random peers`,id:`round`},{code:`  send them what I know`,id:`knows`},{code:``},{code:`compare(replica A, replica B):`},{code:`  start at the two roots`},{code:`  if hashes match: everything below matches`},{code:`  else: compare both children`,id:`cmp`}],sources:[{name:`engine.ts`,code:i,lang:`ts`}],tradeoffs:[{choice:`Gossip over a coordinator`,gain:`No single point of failure, and it scales`,cost:`Information spreads in seconds, not instantly`},{choice:`Higher fan-out`,gain:`Faster spread`,cost:`More messages, and much of it redundant`},{choice:`Merkle tree comparison`,gain:`Finds differences with very little data`,cost:`Trees need maintaining as data changes`},{choice:`Short failure timeout`,gain:`Finds dead nodes faster`,cost:`More false alarms during network hiccups`}],interview:[{q:`How do you avoid falsely marking nodes as dead?`,a:`Use a suspicion phase, so that a node is first marked suspect, and gets a chance to refute it. SWIM-style protocols also ask other nodes to probe it, in case the problem is only on your own path.`},{q:`Why not have everyone ping everyone?`,a:`That's N² messages each round. With 5,000 nodes, that's 25 million. Gossip reaches the same result with about 15,000 messages per round.`},{q:`How often do Merkle comparisons run?`,a:`In the background, and not continuously, since rebuilding trees takes work. Systems often split a tree per key range, so a small change only touches one small tree.`},{q:`Is gossip consistent?`,a:`No, it's eventually consistent. Different nodes briefly have different views of the cluster. For things like membership, that's fine. When you need agreement, you need consensus.`}],mistakes:[`Using gossip where you need strong agreement.`,`Treating a single missed heartbeat as a failure.`,`Scanning all keys to compare replicas.`]};export{f as default};