import{a as e,i as t,o as n}from"./index-ar0glIxf.js";var r=`// A compact but real Raft: leader election and log replication over an unreliable network.
export type Role = 'follower' | 'candidate' | 'leader';

export interface Entry {
  term: number;
  command: number;
}

export interface RaftNode {
  id: number;
  role: Role;
  term: number;
  votedFor: number | null;
  log: Entry[];
  commitIndex: number; // how many log entries are committed
  electionAt: number; // start an election at this time, unless we hear from a leader
  votes: Set<number>;
  nextIndex: number[]; // per peer, leader only: next entry to send, counted from 1
  matchIndex: number[]; // per peer, leader only: highest entry known to be on them
  nextHeartbeat: number;
  alive: boolean;
  group: number; // nodes in different groups can't reach each other
}

type Message =
  | { kind: 'vote-request'; term: number; from: number; lastIndex: number; lastTerm: number }
  | { kind: 'vote-reply'; term: number; from: number; granted: boolean }
  | { kind: 'append'; term: number; from: number; prevIndex: number; prevTerm: number; entries: Entry[]; leaderCommit: number }
  | { kind: 'append-reply'; term: number; from: number; success: boolean; matchIndex: number };

interface InFlight {
  to: number;
  at: number;
  message: Message;
}

export interface Settings {
  latency: number; // seconds per message
  electionBase: number; // shortest election timeout
  electionSpread: number; // random extra, which is what stops repeated tied votes
  heartbeat: number;
}

export class Cluster {
  nodes: RaftNode[];
  network: InFlight[] = [];
  now = 0;
  elections = 0;
  /** Safety checks. Raft promises these can never go wrong, so we watch them constantly. */
  leaderOfTerm = new Map<number, number>();
  committed: Entry[] = [];
  violations = 0;
  truncated = 0;
  sawTwoLeaders = false;

  constructor(count: number, private settings: Settings, private random: () => number) {
    this.nodes = Array.from({ length: count }, (_, id) => ({
      id,
      role: 'follower',
      term: 0,
      votedFor: null,
      log: [],
      commitIndex: 0,
      electionAt: this.newTimeout(0),
      votes: new Set(),
      nextIndex: Array(count).fill(1),
      matchIndex: Array(count).fill(0),
      nextHeartbeat: 0,
      alive: true,
      group: 0,
    }));
  }

  get majority() {
    return Math.floor(this.nodes.length / 2) + 1;
  }

  private newTimeout(now: number) {
    return now + this.settings.electionBase + this.random() * this.settings.electionSpread;
  }

  private send(from: RaftNode, to: number, message: Message) {
    this.network.push({ to, at: this.now + this.settings.latency, message: { ...message, from: from.id } });
  }

  private lastTerm(n: RaftNode) {
    return n.log.length ? n.log[n.log.length - 1].term : 0;
  }

  private stepDown(n: RaftNode, term: number) {
    if (term > n.term) {
      n.term = term;
      n.votedFor = null;
    }
    n.role = 'follower';
  }

  private startElection(n: RaftNode) {
    n.term++;
    n.role = 'candidate';
    n.votedFor = n.id;
    n.votes = new Set([n.id]);
    n.electionAt = this.newTimeout(this.now);
    this.elections++;
    for (const peer of this.nodes) {
      if (peer.id !== n.id) this.send(n, peer.id, { kind: 'vote-request', term: n.term, from: n.id, lastIndex: n.log.length, lastTerm: this.lastTerm(n) });
    }
  }

  private becomeLeader(n: RaftNode) {
    n.role = 'leader';
    const existing = this.leaderOfTerm.get(n.term);
    if (existing !== undefined && existing !== n.id) this.violations++; // two leaders in one term
    this.leaderOfTerm.set(n.term, n.id);
    n.nextIndex = this.nodes.map(() => n.log.length + 1);
    n.matchIndex = this.nodes.map(() => 0);
    n.nextHeartbeat = this.now;
  }

  private replicate(leader: RaftNode) {
    for (const peer of this.nodes) {
      if (peer.id === leader.id) continue;
      const next = leader.nextIndex[peer.id];
      const prevIndex = next - 1;
      const prevTerm = prevIndex > 0 ? leader.log[prevIndex - 1].term : 0;
      this.send(leader, peer.id, { kind: 'append', term: leader.term, from: leader.id, prevIndex, prevTerm, entries: leader.log.slice(next - 1), leaderCommit: leader.commitIndex });
    }
  }

  private recordCommit(n: RaftNode) {
    for (let i = this.committed.length; i < n.commitIndex; i++) this.committed.push(n.log[i]);
    // Everyone's committed prefix must match. If it ever doesn't, Raft has been broken.
    for (let i = 0; i < n.commitIndex; i++) {
      if (this.committed[i].command !== n.log[i].command || this.committed[i].term !== n.log[i].term) {
        this.violations++;
        break;
      }
    }
  }

  private handle(n: RaftNode, m: Message) {
    if (m.term > n.term) this.stepDown(n, m.term);

    if (m.kind === 'vote-request') {
      const upToDate = m.lastTerm > this.lastTerm(n) || (m.lastTerm === this.lastTerm(n) && m.lastIndex >= n.log.length);
      const granted = m.term === n.term && (n.votedFor === null || n.votedFor === m.from) && upToDate;
      if (granted) {
        n.votedFor = m.from;
        n.electionAt = this.newTimeout(this.now);
      }
      this.send(n, m.from, { kind: 'vote-reply', term: n.term, from: n.id, granted });
    } else if (m.kind === 'vote-reply') {
      if (n.role === 'candidate' && m.term === n.term && m.granted) {
        n.votes.add(m.from);
        if (n.votes.size >= this.majority) this.becomeLeader(n);
      }
    } else if (m.kind === 'append') {
      if (m.term < n.term) {
        this.send(n, m.from, { kind: 'append-reply', term: n.term, from: n.id, success: false, matchIndex: 0 });
        return;
      }
      n.role = 'follower';
      n.electionAt = this.newTimeout(this.now);
      const hasPrev = m.prevIndex === 0 || (m.prevIndex <= n.log.length && n.log[m.prevIndex - 1].term === m.prevTerm);
      if (!hasPrev) {
        this.send(n, m.from, { kind: 'append-reply', term: n.term, from: n.id, success: false, matchIndex: 0 });
        return;
      }
      m.entries.forEach((entry, offset) => {
        const at = m.prevIndex + offset;
        if (n.log[at] && n.log[at].term !== entry.term) {
          this.truncated += n.log.length - at; // a stale leader's entries, safely thrown away
          n.log.length = at;
        }
        if (!n.log[at]) n.log.push(entry);
      });
      const match = m.prevIndex + m.entries.length;
      if (m.leaderCommit > n.commitIndex) {
        n.commitIndex = Math.min(m.leaderCommit, match);
        this.recordCommit(n);
      }
      this.send(n, m.from, { kind: 'append-reply', term: n.term, from: n.id, success: true, matchIndex: match });
    } else if (m.kind === 'append-reply' && n.role === 'leader' && m.term === n.term) {
      if (m.success) {
        n.matchIndex[m.from] = Math.max(n.matchIndex[m.from], m.matchIndex);
        n.nextIndex[m.from] = n.matchIndex[m.from] + 1;
        // Commit once a majority has an entry from the current term.
        for (let index = n.log.length; index > n.commitIndex; index--) {
          const copies = 1 + n.matchIndex.filter((x, peer) => peer !== n.id && x >= index).length;
          if (copies >= this.majority && n.log[index - 1].term === n.term) {
            n.commitIndex = index;
            this.recordCommit(n);
            break;
          }
        }
      } else {
        n.nextIndex[m.from] = Math.max(1, n.nextIndex[m.from] - 1);
      }
    }
  }

  /** A client command. Only a leader may accept it, and it isn't committed yet. */
  propose(command: number) {
    const leader = this.leader();
    if (leader) leader.log.push({ term: leader.term, command });
    return leader !== undefined;
  }

  /** The current leader with the highest term among nodes that are up. */
  leader(): RaftNode | undefined {
    return this.nodes.filter((n) => n.alive && n.role === 'leader').sort((a, b) => b.term - a.term)[0];
  }

  advance(dt: number) {
    this.now += dt;
    const due = this.network.filter((f) => f.at <= this.now);
    this.network = this.network.filter((f) => f.at > this.now);
    for (const f of due) {
      const target = this.nodes[f.to];
      const sender = this.nodes[f.message.from];
      // A dead node or a split network silently drops messages.
      if (target.alive && sender.alive && target.group === sender.group) this.handle(target, f.message);
    }
    for (const n of this.nodes) {
      if (!n.alive) continue;
      if (n.role === 'leader') {
        if (this.now >= n.nextHeartbeat) {
          this.replicate(n);
          n.nextHeartbeat = this.now + this.settings.heartbeat;
        }
      } else if (this.now >= n.electionAt) {
        this.startElection(n);
      }
    }
    if (this.nodes.filter((n) => n.alive && n.role === 'leader').length > 1) this.sawTwoLeaders = true;
  }
}
`,i=class{settings;random;nodes;network=[];now=0;elections=0;leaderOfTerm=new Map;committed=[];violations=0;truncated=0;sawTwoLeaders=!1;constructor(e,t,n){this.settings=t,this.random=n,this.nodes=Array.from({length:e},(t,n)=>({id:n,role:`follower`,term:0,votedFor:null,log:[],commitIndex:0,electionAt:this.newTimeout(0),votes:new Set,nextIndex:Array(e).fill(1),matchIndex:Array(e).fill(0),nextHeartbeat:0,alive:!0,group:0}))}get majority(){return Math.floor(this.nodes.length/2)+1}newTimeout(e){return e+this.settings.electionBase+this.random()*this.settings.electionSpread}send(e,t,n){this.network.push({to:t,at:this.now+this.settings.latency,message:{...n,from:e.id}})}lastTerm(e){return e.log.length?e.log[e.log.length-1].term:0}stepDown(e,t){t>e.term&&(e.term=t,e.votedFor=null),e.role=`follower`}startElection(e){e.term++,e.role=`candidate`,e.votedFor=e.id,e.votes=new Set([e.id]),e.electionAt=this.newTimeout(this.now),this.elections++;for(let t of this.nodes)t.id!==e.id&&this.send(e,t.id,{kind:`vote-request`,term:e.term,from:e.id,lastIndex:e.log.length,lastTerm:this.lastTerm(e)})}becomeLeader(e){e.role=`leader`;let t=this.leaderOfTerm.get(e.term);t!==void 0&&t!==e.id&&this.violations++,this.leaderOfTerm.set(e.term,e.id),e.nextIndex=this.nodes.map(()=>e.log.length+1),e.matchIndex=this.nodes.map(()=>0),e.nextHeartbeat=this.now}replicate(e){for(let t of this.nodes){if(t.id===e.id)continue;let n=e.nextIndex[t.id],r=n-1,i=r>0?e.log[r-1].term:0;this.send(e,t.id,{kind:`append`,term:e.term,from:e.id,prevIndex:r,prevTerm:i,entries:e.log.slice(n-1),leaderCommit:e.commitIndex})}}recordCommit(e){for(let t=this.committed.length;t<e.commitIndex;t++)this.committed.push(e.log[t]);for(let t=0;t<e.commitIndex;t++)if(this.committed[t].command!==e.log[t].command||this.committed[t].term!==e.log[t].term){this.violations++;break}}handle(e,t){if(t.term>e.term&&this.stepDown(e,t.term),t.kind===`vote-request`){let n=t.lastTerm>this.lastTerm(e)||t.lastTerm===this.lastTerm(e)&&t.lastIndex>=e.log.length,r=t.term===e.term&&(e.votedFor===null||e.votedFor===t.from)&&n;r&&(e.votedFor=t.from,e.electionAt=this.newTimeout(this.now)),this.send(e,t.from,{kind:`vote-reply`,term:e.term,from:e.id,granted:r})}else if(t.kind===`vote-reply`)e.role===`candidate`&&t.term===e.term&&t.granted&&(e.votes.add(t.from),e.votes.size>=this.majority&&this.becomeLeader(e));else if(t.kind===`append`){if(t.term<e.term||(e.role=`follower`,e.electionAt=this.newTimeout(this.now),!(t.prevIndex===0||t.prevIndex<=e.log.length&&e.log[t.prevIndex-1].term===t.prevTerm))){this.send(e,t.from,{kind:`append-reply`,term:e.term,from:e.id,success:!1,matchIndex:0});return}t.entries.forEach((n,r)=>{let i=t.prevIndex+r;e.log[i]&&e.log[i].term!==n.term&&(this.truncated+=e.log.length-i,e.log.length=i),e.log[i]||e.log.push(n)});let n=t.prevIndex+t.entries.length;t.leaderCommit>e.commitIndex&&(e.commitIndex=Math.min(t.leaderCommit,n),this.recordCommit(e)),this.send(e,t.from,{kind:`append-reply`,term:e.term,from:e.id,success:!0,matchIndex:n})}else if(t.kind===`append-reply`&&e.role===`leader`&&t.term===e.term){if(t.success){e.matchIndex[t.from]=Math.max(e.matchIndex[t.from],t.matchIndex),e.nextIndex[t.from]=e.matchIndex[t.from]+1;for(let t=e.log.length;t>e.commitIndex;t--)if(1+e.matchIndex.filter((n,r)=>r!==e.id&&n>=t).length>=this.majority&&e.log[t-1].term===e.term){e.commitIndex=t,this.recordCommit(e);break}}else e.nextIndex[t.from]=Math.max(1,e.nextIndex[t.from]-1)}}propose(e){let t=this.leader();return t&&t.log.push({term:t.term,command:e}),t!==void 0}leader(){return this.nodes.filter(e=>e.alive&&e.role===`leader`).sort((e,t)=>t.term-e.term)[0]}advance(e){this.now+=e;let t=this.network.filter(e=>e.at<=this.now);this.network=this.network.filter(e=>e.at>this.now);for(let e of t){let t=this.nodes[e.to],n=this.nodes[e.message.from];t.alive&&n.alive&&t.group===n.group&&this.handle(t,e.message)}for(let e of this.nodes)e.alive&&(e.role===`leader`?this.now>=e.nextHeartbeat&&(this.replicate(e),e.nextHeartbeat=this.now+this.settings.heartbeat):this.now>=e.electionAt&&this.startElection(e));this.nodes.filter(e=>e.alive&&e.role===`leader`).length>1&&(this.sawTwoLeaders=!0)}},a=.01,o=.15,s=.05,c=2,l=e=>{let t=new Map;for(let n of e.nodes)n.alive&&t.set(n.group,(t.get(n.group)??0)+1);return t},u={problem:[`Many systems need a group of machines to agree on something: who the leader is, what order writes happened in, which configuration is current. That's hard when machines crash, messages get delayed, and the network can split at any moment.`,`Raft solves this with a simple rule: nothing counts until a majority has it. Two majorities always overlap, so two sides of a split can never both make progress. etcd, Consul and many databases rely on it. This lab runs a real implementation that you can attack.`],functional:[`Elect one leader at a time`,`Replicate an ordered log of commands`,`Keep working while a majority of nodes is up`],nonFunctional:[`Never lose or reorder a committed command`,`Recover from a leader failure in under a second or so`,`Prefers being correct over being available`],diagram:{nodes:[{id:`c`,label:`Client`,col:0,row:1,kind:`client`,note:`Sends commands to the leader, and hears back only once they're committed.`},{id:`l`,label:`Leader`,col:1,row:1,note:`Appends to its log, and replicates to followers through regular heartbeats.`},{id:`a`,label:`Follower`,col:2,row:0,note:`Copies the log. Starts an election if the heartbeats stop.`},{id:`b`,label:`Follower`,col:2,row:1,note:`Grants its vote only to a candidate with a log at least as up to date as its own.`},{id:`d`,label:`Follower`,col:2,row:2,note:`Once a majority has an entry, it's committed, and can never be lost.`}],edges:[{from:`c`,to:`l`},{from:`l`,to:`a`,label:`append`},{from:`l`,to:`b`},{from:`l`,to:`d`}]},ideas:[{title:`Terms`,body:`Time is divided into numbered terms, each with at most one leader. A node seeing a higher term than its own immediately steps down, so old leaders can't cause trouble.`},{title:`Elections`,body:`A follower that hears nothing for a random timeout becomes a candidate and asks for votes. Each node votes once per term, so only one candidate can win a majority.`},{title:`Log replication`,body:`The leader appends commands to its log, and sends them to followers. Once a majority has an entry, it's committed. Followers with conflicting entries get overwritten by the leader.`},{title:`Why it's safe`,body:`A candidate needs votes from a majority, and voters refuse anyone with an older log. Any majority overlaps with the one that committed an entry, so a new leader always has every committed entry.`}],lab:{secondsPerTick:a,params:[{key:`nodes`,label:`Nodes`,kind:`range`,min:3,max:7,step:2,rebuild:!0},{key:`latencyMs`,label:`Network delay`,kind:`range`,min:1,max:40,step:1,unit:`ms`,rebuild:!0},{key:`spreadMs`,label:`Random extra election timeout`,kind:`range`,min:0,max:300,step:10,unit:`ms`,rebuild:!0},{key:`commandsPerSec`,label:`Client commands`,kind:`range`,min:0,max:200,step:5,unit:`per s`}],defaults:{nodes:5,latencyMs:10,spreadMs:150,commandsPerSec:50},create(e,t){return{c:new i(e.nodes,{latency:e.latencyMs/1e3,electionBase:o,electionSpread:e.spreadMs/1e3,heartbeat:s},()=>t.next()),nextCommand:1,carry:0,noLeaderTicks:0,healAt:0,splitActive:!1,killedLeader:-1,termAtKill:0,firstLeaderAt:-1}},step(e,t){for(e.carry+=t.commandsPerSec*a;e.carry>=1;)--e.carry,e.c.propose(e.nextCommand++);if(e.c.advance(a),e.c.leader()?e.firstLeaderAt<0&&(e.firstLeaderAt=e.c.now):e.noLeaderTicks++,e.splitActive&&e.c.now>=e.healAt){e.splitActive=!1;for(let t of e.c.nodes)t.group=0}},sample:e=>({committed:e.c.committed.length,term:e.c.leader()?.term??0,elections:e.c.elections}),charts:[{title:`Commands committed`,series:[{key:`committed`,label:`Measured`,role:`measured`}]},{title:`Elections held`,series:[{key:`elections`,label:`Measured`,role:`measured`}]}],metrics(r){let i=r.c.leader();return[{label:`Leader`,value:i?`Node ${i.id+1}, term ${i.term}`:`No leader`,role:`measured`,tone:i?`good`:`bad`},{label:`Needed to commit`,value:`${r.c.majority} of ${r.c.nodes.length}`,role:`predicted`},{label:`Committed`,value:t(r.c.committed.length),role:`measured`},{label:`Time without a leader`,value:e(r.noLeaderTicks*a),role:`measured`},{label:`Safety violations`,value:n(r.c.violations),role:`measured`,tone:r.c.violations?`bad`:`good`}]},math(e,t){let n=e.c.nodes.length,r=e.c.nodes.filter(e=>e.alive).length,i=Math.max(0,...l(e.c).values());return[{expr:`Majority of ${n} nodes: floor(${n} ÷ 2) + 1`,result:String(e.c.majority)},{expr:`Failures it can survive: ${n} − ${e.c.majority}`,result:String(n-e.c.majority)},{expr:`Largest group that can talk: ${i} of ${n}, ${r} up`,result:i>=e.c.majority?`can commit`:`cannot commit`,tone:i>=e.c.majority?`good`:`bad`},{expr:`Timeout: ${Math.round(o*1e3)} ms + random up to ${t.spreadMs} ms`,result:t.spreadMs?`ties are rare`:`elections can tie forever`,tone:t.spreadMs?`good`:`bad`}]},views:e=>[{kind:`cells`,title:`Nodes: role, term, log length, committed`,items:e.c.nodes.map(e=>({label:e.alive?`${e.id+1}: ${e.role}`:`${e.id+1}: down`,value:e.alive?`t${e.term} ${e.log.length}/${e.commitIndex}`:``,tone:e.alive?e.role===`leader`?`good`:e.role===`candidate`?`warn`:`neutral`:`bad`}))},{kind:`note`,title:`Network`,text:e.splitActive?`Split for another ${Math.max(0,e.healAt-e.c.now).toFixed(1)} s. Groups can't reach each other.`:`All connected.`}],actions:[{key:`kill-leader`,label:`Kill the leader, or else any node`,run:e=>{let t=e.c.leader()??e.c.nodes.find(e=>e.alive);t&&(e.killedLeader=t.id,e.termAtKill=t.term,t.alive=!1,t.role=`follower`)}},{key:`restore`,label:`Restore all nodes`,run:e=>{for(let t of e.c.nodes)t.alive||(t.alive=!0,t.electionAt=e.c.now+o)}},{key:`split`,label:`Split the network for 2 s, leader in the minority`,run:e=>{let t=e.c.leader(),n=e.c.nodes.length-e.c.majority,r=new Set(t?[t.id]:[]);for(let t of e.c.nodes)r.size<n&&r.add(t.id);for(let t of e.c.nodes)t.group=+!!r.has(t.id);e.splitActive=!0,e.healAt=e.c.now+c}}],trace(e){let t=e.c.leader();return{values:{term:String(t?.term??`-`),votes:`${e.c.majority} votes to win`,log:n(t?.log.length??0),commit:n(e.c.committed.length),safe:`${n(e.c.violations)} violations`}}},experiments:[{title:`Kill the leader`,act:[`kill-leader`],actAt:100,ticks:200,question:`A 5-node cluster has a leader, and it dies. No person steps in. What happens?`,options:[`Writes stop until an operator acts`,`A follower notices, wins a vote, and carries on in under a second`],answer:1,explain:`Followers expect regular heartbeats. When they stop, one times out first, asks for votes, and needs 3 of 5 to win. No committed data is lost, since a node can only win if its log is up to date.`,check:e=>{let t=e.c.leader();return!!(t&&t.id!==e.killedLeader&&t.term>e.termAtKill&&e.c.violations===0)}},{title:`Lose two of five`,act:[`kill-leader`,`kill-leader`],actAt:100,ticks:300,question:`Two of the five nodes die. Can the cluster still commit new commands?`,options:[`Yes, since 3 nodes are still a majority`,`No, it needs all of them`],answer:0,explain:`A majority of 5 is 3, so you can lose 2. This is why clusters have odd sizes: 4 nodes also only survive 1 failure, so the extra node would buy nothing.`,check:(e,t,n)=>n[n.length-1].committed>n[n.length-80].committed&&e.c.violations===0},{title:`Lose three of five`,act:[`kill-leader`,`kill-leader`,`kill-leader`],actAt:100,ticks:300,question:`Now three nodes die, leaving two. What happens?`,options:[`The two keep going`,`Nothing commits until a node returns`],answer:1,explain:`Two can't form a majority, so no leader can be elected. The system stops rather than risk disagreeing with nodes it can't see. That's the C in CAP: when in doubt, it refuses. No data is wrong, it's just unavailable.`,check:(e,t,n)=>n[n.length-1].committed===n[n.length-150].committed},{title:`Split the network`,act:[`split`],actAt:100,ticks:1100,question:`The network splits, with the leader in the smaller group. It keeps accepting commands, while the larger group elects a new leader. When it heals, what happens to the old leader's commands?`,options:[`Both sets get merged`,`They're thrown away, since they never reached a majority`,`The two groups stay diverged`],answer:1,explain:`Two nodes did think they were leader, but only one could commit anything, because only one side has a majority. On healing, the old leader sees a higher term, steps down, and overwrites its uncommitted entries. Clients were never told those succeeded.`,check:e=>e.c.sawTwoLeaders&&e.c.truncated>0&&e.c.violations===0&&e.c.leader()!==void 0},{title:`Remove the randomness`,set:{spreadMs:0},ticks:400,question:`What if every node uses exactly the same election timeout?`,options:[`Elections get faster and more predictable`,`Everyone votes for themselves, again and again, and no leader appears`],answer:1,explain:`All nodes time out together, become candidates at once, and vote for themselves, so nobody gets a majority. The small random delay is what breaks the tie, and it's one of the simplest clever ideas in distributed systems.`,check:e=>!e.c.leader()&&e.c.elections>=10}]},pseudocode:[{code:`on election timeout:`},{code:`  term += 1, and vote for myself`,id:`term`},{code:`  ask everyone for a vote`,id:`votes`},{code:`  a majority of votes: become leader`},{code:``},{code:`leader, on command:`},{code:`  append to my log, and replicate`,id:`log`},{code:`  once a majority has it: commit`,id:`commit`},{code:`committed entries must match on every node`,id:`safe`}],sources:[{name:`engine.ts`,code:r,lang:`ts`}],tradeoffs:[{choice:`More nodes`,gain:`Survives more failures`,cost:`Writes wait for more acknowledgements, and get slower`},{choice:`Short election timeout`,gain:`Faster failover`,cost:`More false elections on a slow network`},{choice:`Consensus over simple replication`,gain:`No split brain, and no lost commits`,cost:`Lower throughput, and it needs a majority up`},{choice:`Odd cluster sizes`,gain:`Best fault tolerance per node`,cost:`Even sizes add cost but no extra tolerance`}],interview:[{q:`Why not use consensus for everything?`,a:`Each write needs a majority round trip, which limits throughput and adds latency. Most systems use it only for the critical small stuff, such as metadata and leader election, and use faster replication for the bulk data.`},{q:`What happens to a client whose command was on the old leader?`,a:`It might never hear back. The client retries with the new leader, ideally with a unique ID, so that a command that actually committed doesn't apply twice.`},{q:`Raft or Paxos?`,a:`They offer similar guarantees. Raft was designed to be easier to understand and build, with a strong leader and a clear log structure, which is why most newer systems use it.`},{q:`How are reads handled?`,a:`Reading from the leader isn't quite enough, since it may have been deposed without knowing. It confirms it's still leader with a majority round trip, or relies on a lease based on clock assumptions.`}],mistakes:[`Saying a two-node cluster is more reliable than one. It's actually less so.`,`Forgetting the safety rule that voters reject candidates with older logs.`,`Treating consensus as a way to store large volumes of data.`]};export{u as default};