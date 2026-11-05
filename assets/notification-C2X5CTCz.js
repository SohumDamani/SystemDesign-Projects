import{a as e,i as t,s as n}from"./index-ar0glIxf.js";var r=`// Delivery workers, third-party providers that fail, retries, and duplicate protection.
import type { Rng } from '../../core/rng';

export type Channel = 'push' | 'email' | 'sms';
export const CHANNELS: Channel[] = ['push', 'email', 'sms'];

export interface Task {
  id: number;
  channel: Channel;
  attempts: number;
  createdAt: number;
  readyAt: number;
}

export interface Provider {
  down: boolean;
  failRate: number; // the provider rejects the send
  ackLossRate: number; // delivered, but our side never hears back
}

export const SEND_SECONDS = 0.1;
export const TIMEOUT_SECONDS = 2;

export interface Outcome {
  delivered: boolean;
  /** What our side believes. A lost ack looks exactly like a failure. */
  confirmed: boolean;
  busyFor: number;
}

export function attemptSend(p: Provider, rng: Rng): Outcome {
  if (p.down) return { delivered: false, confirmed: false, busyFor: TIMEOUT_SECONDS };
  if (rng.chance(p.failRate)) return { delivered: false, confirmed: false, busyFor: SEND_SECONDS };
  if (rng.chance(p.ackLossRate)) return { delivered: true, confirmed: false, busyFor: TIMEOUT_SECONDS };
  return { delivered: true, confirmed: true, busyFor: SEND_SECONDS };
}

/** Wait longer after each failure, with jitter, so retries don't all arrive together. */
export function backoffSeconds(attempt: number, rng: Rng): number {
  return 0.5 * 2 ** attempt * rng.range(0.5, 1.5);
}

export class Queue {
  ready: Task[] = [];
  delayed: Task[] = [];
  private head = 0;

  push(task: Task) {
    this.ready.push(task);
  }

  pop(): Task | undefined {
    if (this.head >= this.ready.length) return undefined;
    const task = this.ready[this.head++];
    if (this.head > 1024) {
      this.ready = this.ready.slice(this.head);
      this.head = 0;
    }
    return task;
  }

  get length() {
    return this.ready.length - this.head;
  }

  retryLater(task: Task, at: number) {
    task.readyAt = at;
    this.delayed.push(task);
  }

  releaseDue(now: number) {
    this.delayed = this.delayed.filter((t) => {
      if (t.readyAt > now) return true;
      this.push(t);
      return false;
    });
  }

  /** How long the first waiting task of a channel has been waiting. */
  oldestAge(channel: Channel, now: number): number {
    for (let i = this.head; i < this.ready.length; i++) {
      if (this.ready[i].channel === channel) return now - this.ready[i].readyAt;
    }
    return 0;
  }
}
`,i=[`push`,`email`,`sms`],a=.1;function o(e,t){return e.down?{delivered:!1,confirmed:!1,busyFor:2}:t.chance(e.failRate)?{delivered:!1,confirmed:!1,busyFor:a}:t.chance(e.ackLossRate)?{delivered:!0,confirmed:!1,busyFor:2}:{delivered:!0,confirmed:!0,busyFor:a}}function s(e,t){return .5*2**e*t.range(.5,1.5)}var c=class{ready=[];delayed=[];head=0;push(e){this.ready.push(e)}pop(){if(this.head>=this.ready.length)return;let e=this.ready[this.head++];return this.head>1024&&(this.ready=this.ready.slice(this.head),this.head=0),e}get length(){return this.ready.length-this.head}retryLater(e,t){e.readyAt=t,this.delayed.push(e)}releaseDue(e){this.delayed=this.delayed.filter(t=>t.readyAt>e||(this.push(t),!1))}oldestAge(e,t){for(let n=this.head;n<this.ready.length;n++)if(this.ready[n].channel===e)return t-this.ready[n].readyAt;return 0}},l=.1,u={push:.6,email:.3,sms:.1},d={push:.5,email:.3,sms:.2},f=(e,t,n)=>t.queues===`shared`?e.pools[0]:e.pools[i.indexOf(n)],p={problem:[`A notification system sends messages through push, SMS and email, on behalf of many other services. It rarely sends anything itself. It relies on third parties such as APNs, FCM and SMS gateways, and those fail, slow down and rate limit you.`,`So the design is really about delivering reliably through unreliable partners: queueing, retries, not sending the same thing twice, and making sure trouble with one provider doesn't become trouble with all of them.`],functional:[`Send push, SMS and email notifications`,`Accept requests from many internal services`,`Respect user preferences and opt-outs`],nonFunctional:[`Soft real time: fast, with slight delays acceptable at peak`,`No lost notifications, and few duplicates`,`One provider's outage doesn't affect the others`],diagram:{nodes:[{id:`s`,label:`Internal services`,col:0,row:1,kind:`client`,note:`Billing, shipping and so on. They call one API and don't need to know about providers.`},{id:`n`,label:`Notification service`,col:1,row:1,note:`Validates, applies rate limits, checks preferences, and renders templates.`},{id:`q1`,label:`Push queue`,col:2,row:0,kind:`queue`,note:`Each channel has its own queue so failures are isolated.`},{id:`q2`,label:`Email queue`,col:2,row:1,kind:`queue`,note:`Absorbs spikes, so a burst waits instead of failing.`},{id:`q3`,label:`SMS queue`,col:2,row:2,kind:`queue`,note:`Separate from others, so an SMS gateway outage stays here.`},{id:`w`,label:`Workers`,col:3,row:1,note:`Send to the provider, retry with backoff, and log the result.`},{id:`p`,label:`Providers`,col:4,row:1,kind:`external`,note:`APNs, FCM, email and SMS gateways, which are outside your control.`}],edges:[{from:`s`,to:`n`},{from:`n`,to:`q1`},{from:`n`,to:`q2`},{from:`n`,to:`q3`},{from:`q1`,to:`w`},{from:`q2`,to:`w`},{from:`q3`,to:`w`},{from:`w`,to:`p`}]},ideas:[{title:`Queues decouple`,body:`Services hand off and move on. A spike becomes a longer queue rather than a failure, and workers can scale independently of the callers.`},{title:`Retries with backoff`,body:`Retry failed sends, waiting longer each time and adding jitter so retries don't arrive as a wave. Send what still fails to a dead letter queue.`},{title:`At-least-once, then dedupe`,body:`Exactly-once delivery over a network isn't really achievable, so retry until confirmed and make repeats harmless with an event ID both sides remember.`},{title:`Bulkheads`,body:`Give each channel its own queue and workers, so a provider outage only consumes its own share. It's the same idea as watertight compartments in a ship.`}],estimator:{vars:[{key:`perDay`,label:`Notifications per day`,unit:`count`},{key:`peakFactor`,label:`Peak over average`,unit:`plain`,assume:5},{key:`workerRate`,label:`Sends per second per worker`,unit:`plain`,assume:10},{key:`logBytes`,label:`Log bytes per send`,unit:`plain`,assume:500},{key:`days`,label:`Days of logs`,unit:`plain`,assume:90},{key:`avg`,label:`Average send rate`,unit:`qps`},{key:`peak`,label:`Peak send rate`,unit:`qps`},{key:`workers`,label:`Workers at peak`,unit:`count`},{key:`logs`,label:`Log storage`,unit:`bytes`}],eqs:[{out:`avg`,terms:[[`perDay`,1],[86400,-1]]},{out:`peak`,terms:[[`avg`,1],[`peakFactor`,1]]},{out:`workers`,terms:[[`peak`,1],[`workerRate`,-1]]},{out:`logs`,terms:[[`perDay`,1],[`logBytes`,1],[`days`,1]]}],starts:[{key:`perDay`,value:16e6},{key:`peak`,value:2e3},{key:`workers`,value:100}]},lab:{secondsPerTick:l,params:[{key:`eventsPerSec`,label:`Notifications`,kind:`range`,min:10,max:500,step:10,unit:`per s`},{key:`workers`,label:`Delivery workers`,kind:`range`,min:5,max:100,step:1,rebuild:!0},{key:`failRate`,label:`Provider failure rate`,kind:`range`,min:0,max:.6,step:.05,format:e=>n(e)},{key:`ackLoss`,label:`Lost acknowledgements`,kind:`range`,min:0,max:.2,step:.01,format:e=>n(e)},{key:`maxRetries`,label:`Max retries`,kind:`range`,min:0,max:6,step:1},{key:`queues`,label:`Queues`,kind:`choice`,rebuild:!0,options:[{value:`separate`,label:`One queue per channel`},{value:`shared`,label:`One shared queue`}]},{key:`dedupe`,label:`Send an idempotency key`,kind:`toggle`}],defaults:{eventsPerSec:100,workers:20,failRate:.1,ackLoss:0,maxRetries:3,dedupe:!1,queues:`separate`},create(e){let t=e=>({queue:new c,busyUntil:Array(Math.max(1,e)).fill(0)});return{now:0,nextId:1,pools:e.queues===`shared`?[t(e.workers)]:i.map(n=>t(Math.round(e.workers*d[n]))),providerDown:{push:!1,email:!1,sms:!1},deliveredIds:new Set,delivered:0,duplicates:0,dead:0,attempts:0,lag:{push:0,email:0,sms:0},last:``}},step(e,t,n){e.now+=l;for(let r=n.poisson(t.eventsPerSec*l);r>0;r--){let r=n.next(),i=r<u.push?`push`:r<u.push+u.email?`email`:`sms`,a={id:e.nextId++,channel:i,attempts:0,createdAt:e.now,readyAt:e.now};f(e,t,i).queue.push(a)}for(let r of e.pools){r.queue.releaseDue(e.now);for(let i=0;i<r.busyUntil.length;i++)for(;r.busyUntil[i]<=e.now;){let a=r.queue.pop();if(!a)break;let c=o({down:e.providerDown[a.channel],failRate:t.failRate,ackLossRate:t.ackLoss},n);e.attempts++,r.busyUntil[i]=Math.max(r.busyUntil[i],e.now-l)+c.busyFor,c.delivered&&(e.deliveredIds.has(a.id)?t.dedupe||e.duplicates++:(e.deliveredIds.add(a.id),e.delivered++)),c.confirmed?e.last=`${a.channel} #${a.id} delivered on attempt ${a.attempts+1}`:(a.attempts++,a.attempts>t.maxRetries?(e.deliveredIds.has(a.id)||e.dead++,e.last=`${a.channel} #${a.id} moved to dead letters`):(r.queue.retryLater(a,e.now+s(a.attempts,n)),e.last=`${a.channel} #${a.id} will retry, attempt ${a.attempts+1}`))}}for(let n of i)e.lag[n]=f(e,t,n).queue.oldestAge(n,e.now)},sample:e=>({push:e.lag.push,sms:e.lag.sms,email:e.lag.email,delivered:e.delivered,duplicates:e.duplicates}),charts:[{title:`How long the oldest task has waited`,unit:`s`,series:[{key:`push`,label:`Push`,role:`measured`},{key:`sms`,label:`SMS`,role:`other`},{key:`email`,label:`Email`,role:`other`}]}],metrics(r,i){let a=r.delivered+r.dead,o=1-i.failRate**+(i.maxRetries+1);return[{label:`Delivered`,value:n(o,2),role:`predicted`},{label:`Delivered`,value:a?n(r.delivered/a,2):`0%`,role:`measured`},{label:`Duplicates`,value:t(r.duplicates),role:`measured`,tone:r.duplicates?`bad`:void 0},{label:`Dead letters`,value:t(r.dead),role:`measured`,tone:r.dead?`warn`:void 0},{label:`Push waiting`,value:e(r.lag.push),role:`measured`,tone:r.lag.push>2?`bad`:void 0}]},math(e,r){let i=r.workers/a,o=1-r.failRate**+(r.maxRetries+1);return[{expr:`Reach: 1 − ${r.failRate.toFixed(2)}^${r.maxRetries+1}`,result:n(o,2)},{expr:`Worker capacity: ${r.workers} ÷ ${a} s`,result:`${t(i)} sends/s`,tone:i>r.eventsPerSec?`good`:`bad`},{expr:`Duplicates: lost acks are retried`,result:r.dedupe?`dropped by the key`:`≈ ${n(r.ackLoss)} of sends`,tone:r.dedupe||!r.ackLoss?`good`:`bad`}]},views:e=>[{kind:`cells`,title:`Providers`,items:i.map(t=>({label:t.toUpperCase()===`SMS`?`SMS`:t===`push`?`Push`:`Email`,value:e.providerDown[t]?`Outage`:`Healthy`,tone:e.providerDown[t]?`bad`:`good`}))},{kind:`bars`,title:`Tasks waiting by queue`,items:e.pools.map((t,n)=>({label:e.pools.length===1?`Shared`:[`Push`,`Email`,`SMS`][n],value:t.queue.length+t.queue.delayed.length}))}],actions:[{key:`sms-outage`,label:`Start or end an SMS outage`,run:e=>{e.providerDown.sms=!e.providerDown.sms}},{key:`push-outage`,label:`Start or end a push outage`,run:e=>{e.providerDown.push=!e.providerDown.push}}],trace:e=>({values:{last:e.last,retry:`${t(e.attempts)} sends so far`},active:e.last.includes(`retry`)?[`retry`]:[`last`]}),experiments:[{title:`Retries buy reliability`,set:{failRate:.3,maxRetries:3,ackLoss:0},ticks:300,question:`A provider fails 30% of the time. With 3 retries, what share of notifications eventually reach the provider?`,options:[`About 70%`,`About 99%`,`Exactly 100%`],answer:1,explain:`A notification is lost only if all four attempts fail: 0.3^4 = 0.8%. Retries multiply reliability quickly, as long as failures are independent. A dead letter queue catches the rest so you can inspect them.`,check:e=>e.delivered+e.dead>500&&e.delivered/(e.delivered+e.dead)>.96},{title:`The lost acknowledgement`,set:{failRate:0,ackLoss:.1,maxRetries:3,dedupe:!1},ticks:300,question:`The provider never fails, but 10% of its acknowledgements get lost. Your system retries anything unconfirmed. What do users see?`,options:[`Nothing unusual`,`About 1 in 10 notifications arrives twice`,`About 1 in 10 never arrives`],answer:1,explain:`A lost ack looks just like a failure, so you retry something that already worked. This is why exactly-once delivery is so hard over a network. Retrying is safe only if repeats can be detected.`,check:e=>e.delivered>500&&e.duplicates/e.delivered>.05&&e.duplicates/e.delivered<.16},{title:`Send an idempotency key`,set:{failRate:0,ackLoss:.1,maxRetries:3,dedupe:!0},ticks:300,question:`Each send now carries a unique key, and the provider drops repeats of a key it has already seen. How many duplicates reach users?`,options:[`None`,`About half as many`,`The same`],answer:0,explain:`Your side can keep retrying safely, because the provider recognizes the repeat. You get at-least-once delivery plus deduplication, which behaves like exactly-once. The cost is that the provider, or you, must remember recent keys.`,check:e=>e.duplicates===0&&e.delivered>500},{title:`One queue, one outage`,set:{queues:`shared`,workers:20,failRate:0,maxRetries:3},act:[`sms-outage`],actAt:30,ticks:300,question:`SMS has an outage, and each attempt hangs for 2 seconds. All channels share one queue and one worker pool. What happens to push notifications?`,options:[`Nothing, since push is healthy`,`They slow to a crawl, even though push is fine`],answer:1,explain:`SMS is only 10% of traffic, but its hung sends use up every worker. Healthy push traffic waits behind them. One slow dependency has taken down the whole system.`,check:e=>e.lag.push>2},{title:`Isolate the blast`,set:{queues:`separate`,workers:20,failRate:0,maxRetries:3},act:[`sms-outage`],actAt:30,ticks:300,question:`Same outage, but each channel has its own queue and workers. How long do push notifications wait?`,options:[`Almost no time`,`The same as before`],answer:0,explain:`This is the bulkhead pattern. SMS still fails, but it can only consume its own workers, so push and email carry on. Separate queues contain a failure to the part that actually failed.`,check:e=>e.lag.push<1}]},pseudocode:[{code:`worker loop:`},{code:`  task = next ready task`},{code:`  result = send(task, idempotency_key = task.id)`},{code:`  if confirmed: log it, and move on`},{code:`  else if attempts < max_retries:`},{code:`    retry after backoff with jitter`,id:`retry`},{code:`  else: move to dead letter queue`},{code:`latest event`,id:`last`}],sources:[{name:`engine.ts`,code:r,lang:`ts`}],tradeoffs:[{choice:`Separate queues`,gain:`Failures stay isolated`,cost:`Some idle capacity, and more to operate`},{choice:`More retries`,gain:`Higher reach`,cost:`Possible duplicates, and more load during outages`},{choice:`Idempotency keys`,gain:`Retries are safe`,cost:`Someone must remember keys for a while`},{choice:`Second provider per channel`,gain:`Survives a provider outage`,cost:`More contracts and code`}],interview:[{q:`How do you avoid spamming users?`,a:`Rate limit per user and per notification type, respect opt-outs, and check preferences before enqueueing. Collapse similar notifications into a digest where possible.`},{q:`How do you track whether notifications worked?`,a:`Log each state change: sent, delivered, opened, clicked. Open and click rates tell you when a template or provider has a problem.`},{q:`What if a device token is invalid?`,a:`Providers report dead tokens. Remove them, or you'll waste sends and may hurt your standing with the provider. The same goes for bounced email addresses.`},{q:`Why not just send directly from each service?`,a:`Every service would need to handle retries, templates, preferences and provider keys. Centralizing keeps that in one place, and gives one place to enforce rate limits.`}],mistakes:[`Promising exactly-once delivery.`,`A single queue shared by all channels.`,`Retrying instantly, which piles more load on a provider already in trouble.`]};export{p as default};