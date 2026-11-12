import{f as e,p as t,u as n}from"./index-n79SFkCo.js";var r=`// A payment service, a payment provider that times out, a double-entry ledger, and reconciliation.
import type { Rng } from '../../core/rng';

export interface ProviderBehavior {
  requestLoss: number; // the request never arrives, so no charge happens
  responseLoss: number; // the charge happens, but the reply never arrives
}

/** The outside provider. It's the source of truth about what was really charged. */
export class Provider {
  charges: { orderId: number; amount: number; key: string }[] = [];
  /** Running totals, so reading them costs nothing however long the lab runs. */
  chargeCount = 0;
  doubled = 0;
  private perOrder = new Map<number, number>();

  timesCharged(orderId: number) {
    return this.perOrder.get(orderId) ?? 0;
  }
  private seenKeys = new Set<string>();

  /** With an idempotency key, a repeat is recognized and not charged again. */
  charge(orderId: number, amount: number, key: string, honorKey: boolean, behavior: ProviderBehavior, rng: Rng): 'ok' | 'timeout' {
    if (rng.chance(behavior.requestLoss)) return 'timeout';
    if (!honorKey || !this.seenKeys.has(key)) {
      this.charges.push({ orderId, amount, key });
      this.chargeCount++;
      const times = (this.perOrder.get(orderId) ?? 0) + 1;
      this.perOrder.set(orderId, times);
      if (times === 2) this.doubled++;
      this.seenKeys.add(key);
    }
    if (rng.chance(behavior.responseLoss)) return 'timeout';
    return 'ok';
  }
}

export interface LedgerEntry {
  orderId: number;
  account: string;
  debit: number;
  credit: number;
}

/** Double-entry: every movement writes two sides, so debits always equal credits. */
export class Ledger {
  entries: LedgerEntry[] = [];

  record(orderId: number, amount: number, from = 'customer', to = 'merchant') {
    this.debitTotal += amount;
    this.creditTotal += amount;
    this.entries.push({ orderId, account: from, debit: amount, credit: 0 });
    this.entries.push({ orderId, account: to, debit: 0, credit: amount });
  }

  debitTotal = 0;
  creditTotal = 0;

  get totals() {
    return { debit: this.debitTotal, credit: this.creditTotal };
  }
}

export interface PayResult {
  status: 'paid' | 'unknown';
  attempts: number;
}

/** Calls the provider, retrying on timeout. The key stays the same across all retries. */
export function pay(provider: Provider, ledger: Ledger, orderId: number, amount: number, retries: number, useKey: boolean, behavior: ProviderBehavior, rng: Rng): PayResult {
  const key = \`order-\${orderId}\`;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    if (provider.charge(orderId, amount, key, useKey, behavior, rng) === 'ok') {
      ledger.record(orderId, amount);
      return { status: 'paid', attempts: attempt };
    }
  }
  // A timeout doesn't mean failure. It means we don't know.
  return { status: 'unknown', attempts: retries + 1 };
}

export interface Reconciliation {
  chargedButNotRecorded: number[];
  chargedTwice: number[];
}

/** Compares the provider's statement with our books, line by line. */
export function reconcile(provider: Provider, ledger: Ledger): Reconciliation {
  const counts = new Map<number, number>();
  for (const c of provider.charges) counts.set(c.orderId, (counts.get(c.orderId) ?? 0) + 1);
  const recorded = new Set(ledger.entries.map((e) => e.orderId));
  const chargedButNotRecorded: number[] = [];
  const chargedTwice: number[] = [];
  for (const [orderId, n] of counts) {
    if (!recorded.has(orderId)) chargedButNotRecorded.push(orderId);
    if (n > 1) chargedTwice.push(orderId);
  }
  return { chargedButNotRecorded, chargedTwice };
}
`,i=class{charges=[];chargeCount=0;doubled=0;perOrder=new Map;timesCharged(e){return this.perOrder.get(e)??0}seenKeys=new Set;charge(e,t,n,r,i,a){if(a.chance(i.requestLoss))return`timeout`;if(!r||!this.seenKeys.has(n)){this.charges.push({orderId:e,amount:t,key:n}),this.chargeCount++;let r=(this.perOrder.get(e)??0)+1;this.perOrder.set(e,r),r===2&&this.doubled++,this.seenKeys.add(n)}return a.chance(i.responseLoss)?`timeout`:`ok`}},a=class{entries=[];record(e,t,n=`customer`,r=`merchant`){this.debitTotal+=t,this.creditTotal+=t,this.entries.push({orderId:e,account:n,debit:t,credit:0}),this.entries.push({orderId:e,account:r,debit:0,credit:t})}debitTotal=0;creditTotal=0;get totals(){return{debit:this.debitTotal,credit:this.creditTotal}}};function o(e,t,n,r,i,a,o,s){let c=`order-${n}`;for(let l=1;l<=i+1;l++)if(e.charge(n,r,c,a,o,s)===`ok`)return t.record(n,r),{status:`paid`,attempts:l};return{status:`unknown`,attempts:i+1}}function s(e,t){let n=new Map;for(let t of e.charges)n.set(t.orderId,(n.get(t.orderId)??0)+1);let r=new Set(t.entries.map(e=>e.orderId)),i=[],a=[];for(let[e,t]of n)r.has(e)||i.push(e),t>1&&a.push(e);return{chargedButNotRecorded:i,chargedTwice:a}}var c=.2,l=20,u=e=>e.provider.doubled,d=e=>e.provider.chargeCount*l;function f(e){if(e.useKey||e.retries===0)return 0;let t=(1-e.requestLoss)*e.responseLoss,n=e.requestLoss,r=0;for(let i=1;i<=e.retries;i++)r+=n**(i-1)*t*(1-n**+(e.retries+1-i));return Math.min(1,r)}var p={problem:[`A payment system moves money between customers and merchants, through outside providers such as Stripe or card networks. In most systems, a bug means a bad page. Here it means a wrong charge, a missing payout, or a compliance problem.`,`The defining challenge is that the most important calls go over a network to someone else's system, and networks fail in ambiguous ways. When a request times out, you don't know whether the money moved. Everything in the design comes back to handling that uncertainty.`],functional:[`Accept payments from customers (pay-in)`,`Pay out to merchants (pay-out)`,`Keep an accurate record of all money movement`],nonFunctional:[`Correctness over everything: never lose or invent money`,`Reliable through provider failures`,`Auditable, with records that can be reconciled and never silently change`],diagram:{nodes:[{id:`c`,label:`Checkout`,col:0,row:1,kind:`client`,note:`Creates a payment order, with a key to prevent duplicates.`},{id:`p`,label:`Payment service`,col:1,row:1,note:`Orchestrates: records the payment, runs risk checks, and calls the executor.`},{id:`e`,label:`Payment executor`,col:2,row:1,note:`Calls the provider with an idempotency key.`},{id:`s`,label:`Payment provider`,col:3,row:1,kind:`external`,note:`Stripe or a card network. Holds card details, so you don't have to.`},{id:`l`,label:`Ledger`,col:2,row:0,kind:`store`,note:`Immutable double-entry records. Never updated, only added to.`},{id:`w`,label:`Wallet`,col:1,row:0,kind:`store`,note:`The merchant's balance.`},{id:`r`,label:`Reconciliation`,col:3,row:2,note:`Compares provider statements with the ledger each night, and flags mismatches.`}],edges:[{from:`c`,to:`p`},{from:`p`,to:`e`},{from:`e`,to:`s`},{from:`p`,to:`l`},{from:`p`,to:`w`},{from:`s`,to:`r`,dashed:!0,label:`statement`},{from:`l`,to:`r`,dashed:!0}]},ideas:[{title:`Idempotency`,body:`Each order gets a unique key, sent on every attempt. The provider charges a key only once. This makes retries safe, and it's also how you survive a double-click.`},{title:`Double-entry ledger`,body:`Each transaction writes two entries, a debit and a credit, that must balance. Mistakes show up straight away, and the entries are never changed, only added to.`},{title:`Reconciliation`,body:`Each night, compare the provider's settlement file with your ledger. It's your last line of defense, because it catches whatever every other part of the system got wrong.`},{title:`Don't touch card numbers`,body:`Use a hosted payment page from the provider. Card details never reach your servers, which removes most of the PCI compliance burden.`}],estimator:{vars:[{key:`perDay`,label:`Transactions per day`,unit:`count`},{key:`peakFactor`,label:`Peak over average`,unit:`plain`,assume:10},{key:`entries`,label:`Ledger entries per transaction`,unit:`plain`,assume:2},{key:`entryBytes`,label:`Bytes per entry`,unit:`plain`,assume:200},{key:`years`,label:`Years to keep`,unit:`plain`,assume:7},{key:`avg`,label:`Average rate`,unit:`qps`},{key:`peak`,label:`Peak rate`,unit:`qps`},{key:`ledger`,label:`Ledger storage`,unit:`bytes`}],eqs:[{out:`avg`,terms:[[`perDay`,1],[86400,-1]]},{out:`peak`,terms:[[`avg`,1],[`peakFactor`,1]]},{out:`ledger`,terms:[[`perDay`,1],[`entries`,1],[`entryBytes`,1],[365,1],[`years`,1]]}],starts:[{key:`perDay`,value:1e6},{key:`peak`,value:100},{key:`ledger`,value:0xe8d4a51000}]},lab:{secondsPerTick:c,params:[{key:`paymentsPerSec`,label:`Payments`,kind:`range`,min:10,max:200,step:10,unit:`per s`},{key:`responseLoss`,label:`Charged, but reply lost`,kind:`range`,min:0,max:.2,step:.01,format:e=>t(e)},{key:`requestLoss`,label:`Request lost, no charge`,kind:`range`,min:0,max:.2,step:.01,format:e=>t(e)},{key:`retries`,label:`Retries after a timeout`,kind:`range`,min:0,max:5,step:1},{key:`useKey`,label:`Send an idempotency key`,kind:`toggle`}],defaults:{paymentsPerSec:50,requestLoss:.02,responseLoss:.05,retries:2,useKey:!1},create:()=>({doubleEma:0,provider:new i,ledger:new a,nextOrder:1,paid:0,unknown:0,orders:0,retried:0,lastEvent:``,fixed:0}),step(e,t,n){for(let r=n.poisson(t.paymentsPerSec*c);r>0;r--){let r=e.nextOrder++,i=o(e.provider,e.ledger,r,l,t.retries,t.useKey,{requestLoss:t.requestLoss,responseLoss:t.responseLoss},n);e.orders++,e.doubleEma=e.doubleEma*.99+(e.provider.timesCharged(r)>1)*.01,i.attempts>1&&e.retried++,i.status===`paid`?e.paid++:e.unknown++,e.lastEvent=`Order ${r}: ${i.status} after ${i.attempts} attempt${i.attempts>1?`s`:``}`}},sample:(e,t)=>({doubles:e.doubleEma*100,math:f(t)*100,unknown:e.orders?e.unknown/e.orders*100:0}),charts:[{title:`Orders charged more than once`,unit:`%`,series:[{key:`doubles`,label:`Measured`,role:`measured`},{key:`math`,label:`Math`,role:`predicted`},{key:`unknown`,label:`Status unknown`,role:`other`}]}],metrics(r,i){return[{label:`Double-charge rate`,value:t(f(i),2),role:`predicted`},{label:`Double-charge rate`,value:t(r.doubleEma,2),role:`measured`,tone:r.doubleEma>.002?`bad`:`good`},{label:`Orders`,value:n(r.orders),role:`measured`},{label:`Unknown status`,value:e(r.unknown),role:`measured`,tone:r.unknown?`warn`:void 0},{label:`Provider charged`,value:`$${n(d(r))}`,role:`measured`},{label:`Ledger recorded`,value:`$${n(r.ledger.totals.credit)}`,role:`measured`,tone:d(r)===r.ledger.totals.credit?`good`:`warn`}]},math(n,r){let i=n.ledger.totals;return[{expr:`Reply lost, then retried without a key: ≈ ${t(r.responseLoss)}`,result:r.useKey?`0%, key blocks it`:r.retries?t(f(r),2):`0%, no retry`,tone:r.useKey||!r.retries?`good`:`bad`},{expr:`All attempts time out: (${r.requestLoss+r.responseLoss-r.requestLoss*r.responseLoss<1?(r.requestLoss+(1-r.requestLoss)*r.responseLoss).toFixed(3):`1`})^${r.retries+1}`,result:t((r.requestLoss+(1-r.requestLoss)*r.responseLoss)**+(r.retries+1),3)},{expr:`Ledger: debits − credits`,result:`$${e(i.debit-i.credit)}`,tone:`good`}]},views:t=>[{kind:`table`,title:`Last reconciliation against the provider's statement`,columns:[`Finding`,`Orders`],rows:t.recon?[[`Charged, but missing from our ledger`,e(t.recon.chargedButNotRecorded.length)],[`Charged more than once`,e(t.recon.chargedTwice.length)]]:[[`Run a reconciliation to compare`,``]]},{kind:`log`,title:`Ledger, latest entries`,lines:t.ledger.entries.slice(-4).reverse().map(e=>({text:`Order ${e.orderId}: ${e.account} ${e.debit?`debit`:`credit`} $${e.debit||e.credit}`}))}],actions:[{key:`reconcile`,label:`Run reconciliation`,run:e=>{e.recon=s(e.provider,e.ledger)}}],trace:e=>({values:{order:e.lastEvent,ledger:`${n(e.ledger.entries.length)} entries`}}),experiments:[{title:`Retry a timeout`,set:{requestLoss:0,responseLoss:.05,retries:3,useKey:!1},ticks:200,question:`Sometimes the provider charges the card but its reply gets lost, about 5% of the time. Your code retries on a timeout, with no idempotency key. What happens?`,options:[`All is fine, since retries make it reliable`,`About 5% of customers are charged twice`],answer:1,explain:`A timeout means "I don't know", not "it failed". So you've charged the card again for something that worked. It's the single most important fact about payment systems.`,check:e=>{let t=u(e)/e.orders;return t>.03&&t<.075}},{title:`Add an idempotency key`,set:{requestLoss:0,responseLoss:.05,retries:3,useKey:!0},ticks:200,question:`Same failure, but each retry carries the same key, and the provider charges a key only once. How many double charges?`,options:[`None`,`About half as many`],answer:0,explain:`The provider sees a repeat, and just returns the earlier result. So you can retry as much as you like. Generate the key once per order, and store it before making the first call.`,check:e=>u(e)===0&&e.orders>100},{title:`Lost requests are harmless`,set:{requestLoss:.1,responseLoss:0,retries:3,useKey:!1},ticks:200,question:`If instead the request itself gets lost, 10% of the time, and you retry with no key. Any double charges?`,options:[`None, since those never reached the provider`,`About 10%`],answer:0,explain:`Nothing was charged, so a retry is the first real charge. The trouble is that from your side both failures look like the same timeout. You can't tell which one it was, so you must always assume the dangerous one.`,check:e=>u(e)===0&&e.retried>10},{title:`Never retry?`,set:{requestLoss:0,responseLoss:.05,retries:0,useKey:!1},act:[`reconcile`],actAt:199,ticks:200,question:`What if you never retry? Double charges can't happen, but what about the 5% with a lost reply?`,options:[`Those orders just fail cleanly`,`Customers are charged, but your books say they weren't, until reconciliation finds it`],answer:1,explain:`You tell the customer it failed while their card was charged, and they'll probably try again. Comparing against the provider's statement catches this. It's why nightly reconciliation is non-negotiable, even in a well-built system.`,check:e=>!!(e.recon&&e.recon.chargedButNotRecorded.length>5&&u(e)===0)}]},pseudocode:[{code:`pay(order):`},{code:`  key = order.idempotency_key`},{code:`  repeat up to max_retries:`},{code:`    reply = provider.charge(order, key)`},{code:`    if reply is ok:`},{code:`      ledger: debit customer, credit merchant`,id:`ledger`},{code:`      return paid`},{code:`  return unknown  -- never assume it failed`,id:`order`}],sources:[{name:`engine.ts`,code:r,lang:`ts`}],tradeoffs:[{choice:`Retry on timeout`,gain:`Fewer failed payments`,cost:`Double charges, unless every retry is idempotent`},{choice:`Synchronous provider call`,gain:`Simple, with instant results`,cost:`Your request waits on someone else's slowness`},{choice:`Asynchronous with a queue`,gain:`Survives provider outages`,cost:`The customer doesn't get an answer right away`},{choice:`Hosted payment page`,gain:`Avoids most PCI compliance work`,cost:`Less control over checkout`}],interview:[{q:`How do you get exactly-once payment?`,a:`At-least-once delivery through retries, plus at-most-once effect through idempotency keys. Together they behave like exactly-once. Store the key and payment state before calling out, so a crash can resume safely.`},{q:`What if a payment is stuck in an unknown state?`,a:`Don't guess. Query the provider's API for that key, and act on the result. Webhooks help too, since providers can tell you asynchronously.`},{q:`How do you pay out to a merchant safely?`,a:`Treat it the same way: idempotent, recorded in the ledger, and reconciled. Pay-outs are usually batched, and often held back for a while to cover refunds and fraud.`},{q:`Why is the ledger append-only?`,a:`An auditor needs to see what happened, including mistakes. Corrections are new entries that reverse the old ones, rather than edits. The history can always explain the current balance.`}],mistakes:[`Treating a timeout as a failure.`,`Using floating point for money. Use integers in the smallest currency unit.`,`Skipping reconciliation because the code "can't be wrong".`]};export{p as default};