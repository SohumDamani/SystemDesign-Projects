// A compact but real Raft: leader election and log replication over an unreliable network.
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
