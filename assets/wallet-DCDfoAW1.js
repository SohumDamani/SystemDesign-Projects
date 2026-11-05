import{i as e,o as t}from"./index-ar0glIxf.js";var n=`// Moving money between accounts on different shards, three ways, plus a replayable event log.
import type { Rng } from '../../core/rng';

export type Mode = 'naive' | 'two-phase' | 'saga';

export interface WalletEvent {
  kind: 'debit' | 'credit';
  account: number;
  amount: number;
}

export interface Wallets {
  balances: number[];
  locked: Set<number>; // accounts held by an unfinished two-phase commit
  log: WalletEvent[];
  inDoubt: { from: number; to: number; amount: number; recoverAt: number }[];
  compensations: { account: number; amount: number; at: number }[];
}

export function createWallets(accounts: number, startingBalance: number): Wallets {
  return { balances: Array(accounts).fill(startingBalance), locked: new Set(), log: [], inDoubt: [], compensations: [] };
}

function apply(w: Wallets, event: WalletEvent) {
  w.log.push(event);
  w.balances[event.account] += event.kind === 'credit' ? event.amount : -event.amount;
}

export type TransferOutcome = 'done' | 'no-funds' | 'blocked' | 'crashed';

/**
 * Two separate writes with nothing tying them together. A crash between
 * them removes the money from one account without ever adding it to the other.
 */
export function transferNaive(w: Wallets, from: number, to: number, amount: number, crash: boolean): TransferOutcome {
  if (w.balances[from] < amount) return 'no-funds';
  apply(w, { kind: 'debit', account: from, amount });
  if (crash) return 'crashed';
  apply(w, { kind: 'credit', account: to, amount });
  return 'done';
}

/**
 * Prepare both sides, then commit. No money is lost in a crash, but both accounts stay
 * locked until the coordinator recovers, and anything touching them has to wait.
 */
export function transferTwoPhase(w: Wallets, from: number, to: number, amount: number, crash: boolean, now: number, recoverySeconds: number): TransferOutcome {
  if (w.locked.has(from) || w.locked.has(to)) return 'blocked';
  if (w.balances[from] < amount) return 'no-funds';
  w.locked.add(from);
  w.locked.add(to);
  if (crash) {
    w.inDoubt.push({ from, to, amount, recoverAt: now + recoverySeconds });
    return 'crashed';
  }
  apply(w, { kind: 'debit', account: from, amount });
  apply(w, { kind: 'credit', account: to, amount });
  w.locked.delete(from);
  w.locked.delete(to);
  return 'done';
}

export function recoverCoordinator(w: Wallets, now: number) {
  w.inDoubt = w.inDoubt.filter((t) => {
    if (t.recoverAt > now) return true;
    apply(w, { kind: 'debit', account: t.from, amount: t.amount });
    apply(w, { kind: 'credit', account: t.to, amount: t.amount });
    w.locked.delete(t.from);
    w.locked.delete(t.to);
    return false;
  });
}

/**
 * No locks. Each step commits on its own. If a later step fails, a compensating
 * transaction undoes the earlier one. Others can see the in-between state.
 */
export function transferSaga(w: Wallets, from: number, to: number, amount: number, crash: boolean, now: number, recoverySeconds: number): TransferOutcome {
  if (w.balances[from] < amount) return 'no-funds';
  apply(w, { kind: 'debit', account: from, amount });
  if (crash) {
    w.compensations.push({ account: from, amount, at: now + recoverySeconds });
    return 'crashed';
  }
  apply(w, { kind: 'credit', account: to, amount });
  return 'done';
}

export function runCompensations(w: Wallets, now: number): number {
  let ran = 0;
  w.compensations = w.compensations.filter((c) => {
    if (c.at > now) return true;
    apply(w, { kind: 'credit', account: c.account, amount: c.amount });
    ran++;
    return false;
  });
  return ran;
}

/** Event sourcing: the log is the truth, and balances can be rebuilt from it at any time. */
export function replay(log: WalletEvent[], accounts: number, startingBalance: number): number[] {
  const balances = Array(accounts).fill(startingBalance);
  for (const e of log) balances[e.account] += e.kind === 'credit' ? e.amount : -e.amount;
  return balances;
}

export const pickAccount = (accounts: number, rng: Rng) => rng.int(accounts);
`;function r(e,t){return{balances:Array(e).fill(t),locked:new Set,log:[],inDoubt:[],compensations:[]}}function i(e,t){e.log.push(t),e.balances[t.account]+=t.kind===`credit`?t.amount:-t.amount}function a(e,t,n,r,a){return e.balances[t]<r?`no-funds`:(i(e,{kind:`debit`,account:t,amount:r}),a?`crashed`:(i(e,{kind:`credit`,account:n,amount:r}),`done`))}function o(e,t,n,r,a,o,s){return e.locked.has(t)||e.locked.has(n)?`blocked`:e.balances[t]<r?`no-funds`:(e.locked.add(t),e.locked.add(n),a?(e.inDoubt.push({from:t,to:n,amount:r,recoverAt:o+s}),`crashed`):(i(e,{kind:`debit`,account:t,amount:r}),i(e,{kind:`credit`,account:n,amount:r}),e.locked.delete(t),e.locked.delete(n),`done`))}function s(e,t){e.inDoubt=e.inDoubt.filter(n=>n.recoverAt>t||(i(e,{kind:`debit`,account:n.from,amount:n.amount}),i(e,{kind:`credit`,account:n.to,amount:n.amount}),e.locked.delete(n.from),e.locked.delete(n.to),!1))}function c(e,t,n,r,a,o,s){return e.balances[t]<r?`no-funds`:(i(e,{kind:`debit`,account:t,amount:r}),a?(e.compensations.push({account:t,amount:r,at:o+s}),`crashed`):(i(e,{kind:`credit`,account:n,amount:r}),`done`))}function l(e,t){let n=0;return e.compensations=e.compensations.filter(r=>r.at>t||(i(e,{kind:`credit`,account:r.account,amount:r.amount}),n++,!1)),n}function u(e,t,n){let r=Array(t).fill(n);for(let t of e)r[t.account]+=t.kind===`credit`?t.amount:-t.amount;return r}var d=(e,t)=>t.int(e),f=.1,p=500,m=1e3,h=p*m,g=e=>e.balances.reduce((e,t)=>e+t,0),_=e=>e.compensations.reduce((e,t)=>e+t.amount,0),v={problem:[`A digital wallet holds balances and moves money between users. Within one database that's a simple transaction. But at this scale, accounts live on different shards, so one transfer needs to change two independent databases, and that's no longer atomic.`,`If the system crashes halfway through, money can vanish. The design question is which protocol keeps your total correct: two-phase commit, sagas, or event sourcing, each with a different failure mode. The lab has a single invariant that matters: the total must never change.`],functional:[`Transfer money between wallets`,`Check a balance`,`See the full history of every transaction`],nonFunctional:[`Strong correctness: money is never created or destroyed`,`High throughput, across many shards`,`A complete audit trail, and the ability to reproduce any balance`],diagram:{nodes:[{id:`c`,label:`Client`,col:0,row:1,kind:`client`,note:`Sends a transfer with a unique ID, so retries are safe.`},{id:`w`,label:`Wallet service`,col:1,row:1,note:`Validates, and coordinates the transaction.`},{id:`t`,label:`Transaction coordinator`,col:2,row:1,note:`Tracks transfer state, so it can resume or compensate after a crash.`},{id:`a`,label:`Shard A`,col:3,row:0,kind:`store`,note:`Holds the source account.`},{id:`b`,label:`Shard B`,col:3,row:2,kind:`store`,note:`Holds the destination account.`},{id:`e`,label:`Event log`,col:2,row:2,kind:`queue`,note:`Immutable record of each balance change, from which state can be rebuilt.`}],edges:[{from:`c`,to:`w`},{from:`w`,to:`t`},{from:`t`,to:`a`},{from:`t`,to:`b`},{from:`t`,to:`e`,dashed:!0}]},ideas:[{title:`Two-phase commit`,body:`A coordinator asks all participants to prepare and lock, then tells them to commit. It's atomic, but locks are held across a network round trip, and a coordinator crash blocks everyone.`},{title:`Try-Confirm/Cancel`,body:`A version of 2PC at the application level: first hold the funds, then confirm or release them. No database locks are held in between, but each service must implement all three operations.`},{title:`Saga`,body:`A chain of local transactions, each with a compensating action to undo it. There are no distributed locks, and availability is good, but other requests can see intermediate states.`},{title:`Event sourcing`,body:`Store changes rather than state. The balance is computed by replaying events. You can reproduce any past balance and answer any audit question, and the log is what you can trust.`}],estimator:{vars:[{key:`tps`,label:`Transfers`,unit:`qps`},{key:`opsPerTransfer`,label:`Writes per transfer`,unit:`plain`,assume:2},{key:`nodeTps`,label:`Writes per second per database node`,unit:`plain`,assume:1e3},{key:`eventBytes`,label:`Bytes per event`,unit:`plain`,assume:100},{key:`days`,label:`Days of log to keep`,unit:`plain`,assume:365},{key:`opsPerSec`,label:`Database writes`,unit:`qps`},{key:`nodes`,label:`Database nodes`,unit:`count`},{key:`log`,label:`Event log size`,unit:`bytes`}],eqs:[{out:`opsPerSec`,terms:[[`tps`,1],[`opsPerTransfer`,1]]},{out:`nodes`,terms:[[`opsPerSec`,1],[`nodeTps`,-1]]},{out:`log`,terms:[[`opsPerSec`,1],[`eventBytes`,1],[86400,1],[`days`,1]]}],starts:[{key:`tps`,value:1e6},{key:`nodes`,value:100},{key:`log`,value:0x38d7ea4c68000}]},lab:{secondsPerTick:f,params:[{key:`mode`,label:`Transfer protocol`,kind:`choice`,rebuild:!0,options:[{value:`naive`,label:`Two plain writes`},{value:`two-phase`,label:`Two-phase commit`},{value:`saga`,label:`Saga with compensation`}]},{key:`tps`,label:`Transfers`,kind:`range`,min:10,max:1e3,step:10,unit:`per s`},{key:`crashChance`,label:`Crash chance per transfer`,kind:`range`,min:0,max:.05,step:.001,format:e=>`${(e*100).toFixed(1)}%`},{key:`recoverySec`,label:`Time to recover from a crash`,kind:`range`,min:1,max:30,step:1,unit:`s`}],defaults:{mode:`naive`,tps:200,crashChance:.01,recoverySec:5},create:()=>({now:0,w:r(p,m),done:0,crashed:0,blocked:0,noFunds:0,compensated:0,replayOk:null,lastEvent:``}),step(e,t,n){e.now+=f,s(e.w,e.now),e.compensated+=l(e.w,e.now);for(let r=n.poisson(t.tps*f);r>0;r--){let r=d(p,n),i=d(p,n);i===r&&(i=(i+1)%p);let s=1+n.int(50),l=n.chance(t.crashChance),u=t.mode===`naive`?a(e.w,r,i,s,l):t.mode===`two-phase`?o(e.w,r,i,s,l,e.now,t.recoverySec):c(e.w,r,i,s,l,e.now,t.recoverySec);u===`done`?e.done++:u===`crashed`?e.crashed++:u===`blocked`?e.blocked++:e.noFunds++,e.lastEvent=`$${s} from ${r} to ${i}: ${u}`}},sample:e=>({total:g(e.w),initial:h,locked:e.w.locked.size,drift:g(e.w)-h}),charts:[{title:`Total money in the system`,series:[{key:`total`,label:`Measured`,role:`measured`},{key:`initial`,label:`Must stay at`,role:`predicted`}]},{title:`Accounts locked and waiting`,series:[{key:`locked`,label:`Measured`,role:`measured`}]}],metrics(n){let r=g(n.w)-h;return[{label:`Money that should exist`,value:`$${e(h)}`,role:`predicted`},{label:`Money that exists`,value:`$${e(g(n.w))}`,role:`measured`,tone:r?`bad`:`good`},{label:`Currently missing`,value:`$${t(-r)}`,role:`measured`,tone:r?`bad`:`good`},{label:`Blocked by locks`,value:e(n.blocked),role:`measured`,tone:n.blocked?`warn`:void 0},{label:`Compensations run`,value:e(n.compensated),role:`measured`}]},math(n,r){let i=r.tps*r.crashChance;return[{expr:`Crashes: ${r.tps}/s × ${(r.crashChance*100).toFixed(1)}%`,result:`${i.toFixed(1)}/s`},{expr:r.mode===`two-phase`?`Locked at any moment: ${i.toFixed(1)}/s × ${r.recoverySec} s × 2 accounts`:r.mode===`saga`?`Money in limbo: ${i.toFixed(1)}/s × ${r.recoverySec} s × $25.50 avg`:`Money gone forever: ${i.toFixed(1)}/s × $25.50 avg`,result:r.mode===`two-phase`?`≈ ${t(i*r.recoverySec*2)} accounts`:r.mode===`saga`?`≈ $${t(i*r.recoverySec*25.5)}`:`$${t(i*25.5)}/s`,tone:r.mode===`naive`?`bad`:`warn`},{expr:`Event log entries`,result:e(n.w.log.length)}]},views:t=>[{kind:`note`,title:`Replay from the event log`,text:t.replayOk===null?`Rebuild every balance from the event log, and compare with the live state.`:t.replayOk?`Rebuilt balances match the live state exactly, across every account.`:`Rebuilt balances do not match the live state.`},{kind:`cells`,title:`Outcomes`,items:[{label:`Completed`,value:e(t.done),tone:`good`},{label:`Crashed`,value:e(t.crashed),tone:t.crashed?`warn`:`neutral`},{label:`Not enough funds`,value:e(t.noFunds)}]}],actions:[{key:`replay`,label:`Replay the event log`,run:e=>{e.replayOk=u(e.w.log,p,m).every((t,n)=>t===e.w.balances[n])}}],trace:(e,n)=>({values:{last:e.lastEvent,mode:n.mode,locks:t(e.w.locked.size),pending:`$${t(_(e.w))}`}}),experiments:[{title:`Two plain writes`,set:{mode:`naive`,crashChance:.01,tps:200},ticks:200,question:`A transfer subtracts from one account, then adds to another, on a different database. Sometimes the process crashes between the two. What happens to the total money?`,options:[`It stays the same`,`It slowly drains away, and never comes back`],answer:1,explain:`The debit committed, and the credit never happened. Your customers are out real money, with no record of why. Across shards, you can't get atomicity from two independent writes. You need a protocol.`,check:e=>g(e.w)<h},{title:`Two-phase commit`,set:{mode:`two-phase`,crashChance:.01,tps:200,recoverySec:5},ticks:300,question:`A coordinator asks both sides to prepare, then tells them to commit. Crashes still happen. What goes wrong now?`,options:[`Money still disappears`,`No money is lost, but accounts stay locked and transfers get blocked`],answer:1,explain:`Atomicity holds, so no money disappears. But prepared accounts stay locked until the coordinator comes back. A crashed coordinator blocks unrelated transfers, which is the well-known weakness of 2PC.`,check:e=>e.blocked>0&&g(e.w)===h},{title:`A saga`,set:{mode:`saga`,crashChance:.01,tps:200,recoverySec:5},ticks:300,question:`A saga commits each step separately, and runs a compensating refund if a later step fails. Does money disappear?`,options:[`Never, even for a moment`,`Temporarily, then a compensation restores it`],answer:1,explain:`For a few seconds the money is debited but not credited, and that window is visible to other reads. Then the compensation runs. No locks and better availability, at the cost of weaker isolation. Compensations must be idempotent.`,check:e=>e.compensated>0&&g(e.w)+_(e.w)===h},{title:`Replay history`,set:{mode:`saga`,crashChance:.01,tps:200},act:[`replay`],actAt:199,ticks:200,question:`Every balance change is an immutable event. If you throw away all balances and replay the log from the start, what do you get?`,options:[`Something close to it`,`Exactly the current state, down to the cent`],answer:1,explain:`State is just a fold over the events. This is event sourcing, and it gives you a perfect audit trail, recovery after a bug, and the ability to rebuild any past balance. Snapshots keep replays from taking forever.`,check:e=>e.replayOk===!0}]},pseudocode:e=>e?.mode===`two-phase`?[{code:`prepare: lock both accounts, and check funds`,id:`locks`},{code:`if the coordinator crashes here: everyone waits`},{code:`commit: debit, credit, and release locks`},{code:`latest`,id:`last`}]:e?.mode===`saga`?[{code:`step 1: debit source, and commit`},{code:`step 2: credit destination, and commit`},{code:`if step 2 fails: refund source later`,id:`pending`},{code:`latest`,id:`last`}]:[{code:`debit source  -- committed on shard A`},{code:`crash here = money gone forever`},{code:`credit destination  -- committed on shard B`},{code:`latest`,id:`last`}],sources:[{name:`engine.ts`,code:n,lang:`ts`}],tradeoffs:[{choice:`Two-phase commit`,gain:`Strong atomicity`,cost:`Blocking, with slow locks across the network`},{choice:`Try-Confirm/Cancel`,gain:`No long database locks`,cost:`More application logic, and funds held temporarily`},{choice:`Saga`,gain:`Available and scalable`,cost:`Other requests can see in-between states`},{choice:`Event sourcing`,gain:`Perfect audit trail, and reproducible state`,cost:`A new way of building, and replay needs snapshots`}],interview:[{q:`Why not one big database?`,a:`At high throughput, a single relational database can only do a few thousand transactions a second. You must shard, and shards don't share a transaction. That's the entire reason for this problem.`},{q:`How do you avoid a double spend?`,a:`Each account's balance is checked and changed atomically on its shard. Idempotency keys on transfers stop retries from applying twice.`},{q:`How can you make event sourcing reliable and fast?`,a:`Replicate the log with a consensus algorithm like Raft, so no event is lost. Save snapshots regularly, so replay starts from a recent state rather than the beginning.`},{q:`How do you verify nothing went wrong?`,a:`Continuously check the invariant: the sum of all balances should be constant. This is a simple and powerful monitor that catches whole classes of bugs.`}],mistakes:[`Performing a cross-shard transfer as two independent updates.`,`Forgetting that compensating transactions must be idempotent too.`,`Saying "use a distributed transaction" without naming its failure mode.`]};export{v as default};