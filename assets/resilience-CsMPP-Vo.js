import{a as e,d as t,p as n,u as r}from"./index-n79SFkCo.js";var i=`// A client that retries, a service that can fall behind, and a circuit breaker between them.

export interface Attempt {
  requestId: number;
  number: number; // 1 for the first try
  sentAt: number;
  served: boolean;
  givenUp: boolean;
}

/** Stops sending to a service that's mostly failing, then cautiously tries again. */
export class CircuitBreaker {
  state: 'closed' | 'open' | 'half-open' = 'closed';
  private openUntil = 0;
  private successes = 0;
  private failures = 0;
  private probes = 0;
  opens = 0;

  constructor(private failureThreshold: number, private cooldownSeconds: number, private windowSize: number) {}

  /** May this request go out at all? */
  allow(now: number): boolean {
    if (this.state === 'open') {
      if (now < this.openUntil) return false;
      this.state = 'half-open';
      this.probes = 0;
    }
    if (this.state === 'half-open') {
      // Let only a trickle through, to see if the service has recovered.
      if (this.probes >= 20) return false;
      this.probes++;
    }
    return true;
  }

  onSuccess() {
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= 10) this.close();
      return;
    }
    this.successes++;
    this.roll();
  }

  onFailure(now: number) {
    if (this.state === 'half-open') {
      this.trip(now);
      return;
    }
    this.failures++;
    if (this.failures + this.successes >= this.windowSize && this.failures / (this.failures + this.successes) >= this.failureThreshold) this.trip(now);
    this.roll();
  }

  private roll() {
    if (this.failures + this.successes >= this.windowSize) {
      this.failures = 0;
      this.successes = 0;
    }
  }

  private close() {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
  }

  private trip(now: number) {
    this.state = 'open';
    this.openUntil = now + this.cooldownSeconds;
    this.failures = 0;
    this.successes = 0;
    this.opens++;
  }
}

/** Each failure waits twice as long, with randomness so clients don't retry in sync. */
export function retryDelay(attempt: number, base: number, exponential: boolean, random: () => number): number {
  if (!exponential) return 0;
  return base * 2 ** (attempt - 1) * (0.5 + random());
}

/** Caps retries to a share of normal traffic, so a failure can't multiply the load. */
export class RetryBudget {
  private tokens = 0;
  constructor(private ratio: number, private max: number) {}

  onRequest() {
    this.tokens = Math.min(this.max, this.tokens + this.ratio);
  }

  tryRetry(): boolean {
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
`,a=class{failureThreshold;cooldownSeconds;windowSize;state=`closed`;openUntil=0;successes=0;failures=0;probes=0;opens=0;constructor(e,t,n){this.failureThreshold=e,this.cooldownSeconds=t,this.windowSize=n}allow(e){if(this.state===`open`){if(e<this.openUntil)return!1;this.state=`half-open`,this.probes=0}if(this.state===`half-open`){if(this.probes>=20)return!1;this.probes++}return!0}onSuccess(){this.state===`half-open`?(this.successes++,this.successes>=10&&this.close()):(this.successes++,this.roll())}onFailure(e){this.state===`half-open`?this.trip(e):(this.failures++,this.failures+this.successes>=this.windowSize&&this.failures/(this.failures+this.successes)>=this.failureThreshold&&this.trip(e),this.roll())}roll(){this.failures+this.successes>=this.windowSize&&(this.failures=0,this.successes=0)}close(){this.state=`closed`,this.failures=0,this.successes=0}trip(e){this.state=`open`,this.openUntil=e+this.cooldownSeconds,this.failures=0,this.successes=0,this.opens++}};function o(e,t,n,r){return n?t*2**(e-1)*(.5+r()):0}var s=class{ratio;max;tokens=0;constructor(e,t){this.ratio=e,this.max=t}onRequest(){this.tokens=Math.min(this.max,this.tokens+this.ratio)}tryRetry(){return this.tokens<1?!1:(--this.tokens,!0)}},c=.05,l=5,u=.2,d=10;function f(e,t,n,r){e.load+=1/c;let i={requestId:t,number:n,sentAt:e.now,served:!1,givenUp:!1};return e.queue.length-e.head>=r*l?(i.givenUp=!0,i):(e.queue.push(i),e.watching.push(i),i)}function p(e,t,n,r){t.breaker&&e.breaker.onFailure(e.now),n.number<=t.retries&&(!t.budget||e.budget.tryRetry())?e.retryAt.push({requestId:n.requestId,number:n.number+1,at:e.now+o(n.number,.2,t.backoff,()=>r.next())}):e.failed++}var m={problem:[`Things fail, so clients retry. That sounds harmless, and it's responsible for some of the worst outages in the industry. When a service slows down, retries add more load exactly when it can least handle it, and the system can get stuck in that state long after the original problem has passed.`,`This lab reproduces that effect, a metastable failure, using real retry and circuit breaker logic. It's a favorite topic in senior interviews, since many people assume adding retries always makes things more reliable.`],functional:[`Retry failed requests, when that's safe`,`Stop calling a service that's clearly failing`,`Recover automatically once the service is healthy`],nonFunctional:[`Short failures are invisible to users`,`Failures don't multiply load`,`Total load stays under capacity, whatever happens`],diagram:{nodes:[{id:`c`,label:`Client`,col:0,row:1,kind:`client`,note:`Sends requests, with timeouts, and retries when one fails.`},{id:`b`,label:`Circuit breaker`,col:1,row:1,note:`Closed lets traffic through. Open fails fast. Half-open tests whether things have recovered.`},{id:`q`,label:`Request queue`,col:2,row:1,kind:`queue`,note:`Requests wait here. Clients can give up while their requests stay in line, wasting work.`},{id:`s`,label:`Service`,col:3,row:1,note:`Works through the queue, at a limited rate.`}],edges:[{from:`c`,to:`b`},{from:`b`,to:`q`},{from:`q`,to:`s`}]},ideas:[{title:`Retry amplification`,body:`With 3 retries, a failure can mean 4 times the load. Across layers it multiplies: 3 retries at each of 3 layers means up to 64 calls for one user action. Retry at one layer only.`},{title:`Metastable failure`,body:`The system has two stable states, working and stuck. A short trigger moves it into the stuck state, and retries or queues keep it there. The trigger can be gone, while the outage continues.`},{title:`Circuit breaker`,body:`Track recent failures. If too many fail, stop calling for a while and fail fast. Then try a few requests, and resume if they succeed. Like a fuse, it protects the thing behind it.`},{title:`Timeouts and load shedding`,body:`Requests nobody is waiting for still consume work. Drop requests whose deadline has passed, and reject new work when you're overloaded, so that the requests you do accept can succeed.`}],estimator:{vars:[{key:`traffic`,label:`Normal traffic`,unit:`qps`},{key:`attempts`,label:`Attempts per request`,unit:`plain`,assume:4},{key:`layers`,label:`Extra multiplier from other layers`,unit:`plain`,assume:2},{key:`peakLoad`,label:`Worst-case load during failure`,unit:`qps`}],eqs:[{out:`peakLoad`,terms:[[`traffic`,1],[`attempts`,1],[`layers`,1]]}],starts:[{key:`traffic`,value:1e3},{key:`peakLoad`,value:8e3}]},lab:{secondsPerTick:c,params:[{key:`traffic`,label:`Incoming requests`,kind:`range`,min:100,max:2e3,step:50,unit:`per s`},{key:`capacity`,label:`Service capacity`,kind:`range`,min:200,max:2e3,step:50,unit:`per s`},{key:`timeoutSec`,label:`Client timeout`,kind:`range`,min:.1,max:3,step:.1,unit:`s`},{key:`retries`,label:`Retries per request`,kind:`range`,min:0,max:5,step:1},{key:`backoff`,label:`Exponential backoff with jitter`,kind:`toggle`},{key:`budget`,label:`Retry budget of 10%`,kind:`toggle`},{key:`breaker`,label:`Circuit breaker`,kind:`toggle`}],defaults:{traffic:800,capacity:1e3,timeoutSec:.5,retries:3,backoff:!1,breaker:!1,budget:!1},create:()=>({now:0,queue:[],head:0,watching:[],retryAt:[],nextRequest:1,slowUntil:0,breaker:new a(.5,2,100),budget:new s(.1,200),goodput:0,load:0,wasted:0,failed:0,fastFailed:0,succeeded:0,carry:0,capacityNow:0}),step(e,t,n){e.now+=c;let r=e.load;e.load=0;let i=(r,i)=>{if(t.breaker&&!e.breaker.allow(e.now)){e.fastFailed++;return}let a=f(e,r,i,t.capacity);a.givenUp&&p(e,t,a,n)};for(let r=n.poisson(t.traffic*c);r>0;r--)e.budget.onRequest(),i(e.nextRequest++,1);e.retryAt=e.retryAt.filter(t=>t.at>e.now||(i(t.requestId,t.number),!1));let a=e.now<e.slowUntil?t.capacity*u:t.capacity;e.capacityNow=a,e.carry+=a*c;let o=0;for(;e.carry>=1&&e.head<e.queue.length;){--e.carry;let n=e.queue[e.head++];n.served=!0,n.givenUp?e.wasted++:(o++,e.succeeded++,t.breaker&&e.breaker.onSuccess())}e.carry>a*c&&(e.carry=a*c),e.head>4096&&(e.queue=e.queue.slice(e.head),e.head=0);let s=0;for(;s<e.watching.length;s++){let r=e.watching[s];if(!r.served){if(e.now-r.sentAt<t.timeoutSec)break;r.givenUp=!0,p(e,t,r,n)}}e.watching=e.watching.slice(s),e.goodput=e.goodput*.9+o/c*.1,r=r*.9+e.load*.1,e.load=r},sample:(e,t)=>({goodput:e.goodput,offered:t.traffic,capacity:e.capacityNow,load:e.load,queue:e.queue.length-e.head}),charts:[{title:`Requests that succeed`,unit:`per s`,series:[{key:`goodput`,label:`Measured`,role:`measured`},{key:`offered`,label:`Incoming`,role:`predicted`}]},{title:`Load on the service, with retries`,unit:`per s`,series:[{key:`load`,label:`Measured`,role:`measured`},{key:`capacity`,label:`Capacity`,role:`predicted`}]}],metrics(e,i){let a=e.queue.length-e.head,o=e.succeeded+e.failed+e.fastFailed;return[{label:`Worst-case load if all fail`,value:`${r(i.traffic*(i.budget?1.1:i.retries+1))}/s`,role:`predicted`,tone:i.traffic*(i.budget?1.1:i.retries+1)>i.capacity?`warn`:`good`},{label:`Succeeding`,value:`${r(e.goodput)}/s`,role:`measured`,tone:e.goodput<i.traffic*.5?`bad`:`good`},{label:`Wait in queue`,value:t(a/Math.max(1,e.capacityNow)),role:`measured`},{label:`Wasted work`,value:r(e.wasted),role:`measured`,tone:e.wasted?`warn`:void 0},{label:`Requests failed`,value:n(o?(e.failed+e.fastFailed)/o:0),role:`measured`},{label:`Circuit breaker`,value:i.breaker?e.breaker.state:`off`,role:`measured`,tone:e.breaker.state===`open`?`warn`:void 0}]},math(e,t){let i=t.traffic*(t.budget?1.1:t.retries+1);return[{expr:`Normal load: ${t.traffic} ÷ ${t.capacity} capacity`,result:n(t.traffic/t.capacity),tone:t.traffic<t.capacity?`good`:`bad`},{expr:`If every attempt times out: ${t.traffic} × ${t.budget?`1.1 with a budget`:`${t.retries+1} attempts`}`,result:`${r(i)}/s`,tone:i>t.capacity?`bad`:`good`},{expr:`That's more than capacity, so a queue can't drain`,result:i>t.capacity?`it can get stuck`:`it will recover`,tone:i>t.capacity?`bad`:`good`}]},views:e=>[{kind:`cells`,title:`Outcomes`,items:[{label:`Succeeded`,value:r(e.succeeded),tone:`good`},{label:`Failed`,value:r(e.failed),tone:e.failed?`bad`:`neutral`},{label:`Failed fast`,value:r(e.fastFailed),tone:e.fastFailed?`warn`:`neutral`},{label:`Breaker opened`,value:r(e.breaker.opens)}]}],actions:[{key:`slow`,label:`Slow the service to 20% for 10 s`,run:e=>{e.slowUntil=e.now+d}}],trace:e=>({values:{state:e.breaker.state,queue:r(e.queue.length-e.head),good:`${r(e.goodput)}/s`}}),experiments:[{title:`A blip that never ends`,set:{traffic:800,capacity:1e3,retries:3,backoff:!1,breaker:!1,budget:!1},act:[`slow`],actAt:40,ticks:700,question:`A service handling 800 req/s, with capacity for 1,000, slows down for just 10 seconds. Clients retry 3 times. Once it's back to full speed, what happens?`,options:[`It recovers within seconds`,`It stays down, even though nothing is wrong anymore`],answer:1,explain:`During the blip, a queue built up, so requests started timing out. Timeouts trigger retries, up to 4 times the load, which keeps the queue full, so everything times out. This is a metastable failure. The original cause is gone, and the outage feeds itself.`,check:(t,n,r)=>e(r,`goodput`,80)<240},{title:`No retries`,set:{traffic:800,capacity:1e3,retries:0,backoff:!1,breaker:!1,budget:!1},act:[`slow`],actAt:40,ticks:1100,question:`Same blip, with no retries at all. What happens after the 10 seconds?`,options:[`It stays stuck`,`It recovers by itself`],answer:1,explain:`Load stays at 800, below capacity, so the queue drains using the spare 200 a second, and everything returns to normal in about 25 seconds. The retries were the entire problem. Though of course, without retries, ordinary brief failures reach your users.`,check:(t,n,r)=>e(r,`goodput`,80)>560},{title:`Just add backoff?`,set:{traffic:800,capacity:1e3,retries:3,backoff:!0,breaker:!1,budget:!1},act:[`slow`],actAt:40,ticks:700,question:`Everyone says "use exponential backoff". With 3 retries and backoff, new requests keep arriving at 800 a second. Does that fix it?`,options:[`Yes, backoff solves it`,`No, each request still makes 4 attempts, only later`],answer:1,explain:`Backoff spreads retries out over time, and that helps with short spikes. But when new requests keep arriving regardless, the long-run load is still up to 4 times normal. You have to limit the number of retries, not only delay them.`,check:(t,n,r)=>e(r,`goodput`,80)<400},{title:`A retry budget`,set:{traffic:800,capacity:1e3,retries:3,backoff:!0,breaker:!1,budget:!0},act:[`slow`],actAt:40,ticks:1500,question:`Now retries are capped at 10% of normal traffic, so the worst-case load is 880 a second, which is under capacity. What happens?`,options:[`It recovers`,`It stays stuck`],answer:0,explain:`Normal small failures still get retried, but during a big outage retries can't multiply the load. Recovery is slow, since only 120 a second of capacity is left over to drain the queue, but it does happen. The key is that total load stays under capacity, whatever happens.`,check:(t,n,r)=>e(r,`goodput`,80)>560},{title:`A circuit breaker`,set:{traffic:800,capacity:1e3,retries:3,backoff:!1,breaker:!0,budget:!1},act:[`slow`],actAt:40,ticks:1100,question:`With full retries, but a breaker that stops sending when most calls fail, does the service get a chance to recover?`,options:[`Yes, the breaker gives it room to drain`,`No, it stays stuck`],answer:0,explain:`While open, it fails fast, sending nothing, so the queue drains. Then it lets a small number of requests through to test. If those work, it closes. Users see fast errors for a while, instead of a much longer outage.`,check:(t,n,r)=>e(r,`goodput`,80)>400&&t.breaker.opens>0}]},pseudocode:[{code:`call(request):`},{code:`  if breaker is open: fail fast`,id:`state`},{code:`  send, and wait up to the timeout`},{code:`  on success: record it, and return`,id:`good`},{code:`  on timeout:`},{code:`    if retries and budget remain:`},{code:`      wait with exponential backoff and jitter`},{code:`      try again`},{code:`requests in the service's queue`,id:`queue`}],sources:[{name:`engine.ts`,code:i,lang:`ts`}],tradeoffs:[{choice:`More retries`,gain:`Hides brief failures`,cost:`Multiplies load during real ones`},{choice:`Backoff with jitter`,gain:`Avoids synchronized retry waves`,cost:`Slower recovery, and doesn't limit total retries`},{choice:`Retry budget`,gain:`Load stays bounded`,cost:`Some retryable failures reach users during outages`},{choice:`Circuit breaker`,gain:`Gives failing services room to recover`,cost:`Fails fast, and may reject requests that would have worked`},{choice:`Long timeouts`,gain:`Fewer false failures`,cost:`Resources tied up waiting`}],interview:[{q:`At which layer should you retry?`,a:`Ideally one, usually nearest the user or at the point with the most context. Retrying at each layer multiplies load quickly. Pass deadlines down, so lower layers don't work on requests nobody is waiting for.`},{q:`Which requests are safe to retry?`,a:`Only idempotent ones, or those with an idempotency key. And retry only errors likely to be temporary, like timeouts or 503s, not a 400, which will fail the same way every time.`},{q:`How do you get out of a metastable state?`,a:`You must remove the sustaining load: shed traffic at the edge, disable retries with a flag, or scale up well past normal. Restarting servers rarely helps, because the load comes straight back.`},{q:`What is load shedding?`,a:`Rejecting some requests on purpose, when overloaded, so you can serve the others well. It's better to serve 80% of users properly than to time out on all of them.`}],mistakes:[`Assuming more retries always mean more reliability.`,`Using retries with no limit on their total volume.`,`Retrying at every layer of a call chain.`]};export{m as default};