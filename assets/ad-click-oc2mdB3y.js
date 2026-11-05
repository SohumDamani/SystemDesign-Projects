import{a as e,i as t,n,o as r,s as i}from"./index-ar0glIxf.js";var a=`// Real windowed aggregation: events carry their own time, and arrive late and out of order.
export interface ClickEvent {
  id: number;
  ad: number;
  eventTime: number; // when the click happened
}

export interface WindowResult {
  start: number;
  counts: Map<number, number>;
  total: number;
  closedAt: number;
}

/**
 * Tumbling windows closed by a watermark. The watermark is a guess: "I've probably seen
 * everything up to this time." A longer wait means fewer late events, and later results.
 */
export class WindowedCounter {
  private open = new Map<number, Map<number, number>>();
  private seenIds = new Set<number>();
  private recentIds: number[] = [];
  maxEventTime = 0;
  closed: WindowResult[] = [];
  late = 0;
  duplicatesDropped = 0;

  constructor(private windowSeconds: number, private latenessSeconds: number, private dedupe: boolean) {}

  get watermark() {
    return this.maxEventTime - this.latenessSeconds;
  }

  private windowStart(t: number) {
    return Math.floor(t / this.windowSeconds) * this.windowSeconds;
  }

  add(event: ClickEvent, now: number) {
    if (this.dedupe) {
      if (this.seenIds.has(event.id)) {
        this.duplicatesDropped++;
        return;
      }
      this.seenIds.add(event.id);
      this.recentIds.push(event.id);
      if (this.recentIds.length > 200000) this.seenIds.delete(this.recentIds.shift()!);
    }
    this.maxEventTime = Math.max(this.maxEventTime, event.eventTime);
    const start = this.windowStart(event.eventTime);
    if (start + this.windowSeconds <= this.watermark) {
      this.late++; // its window has already been published
    } else {
      let counts = this.open.get(start);
      if (!counts) this.open.set(start, (counts = new Map()));
      counts.set(event.ad, (counts.get(event.ad) ?? 0) + 1);
    }
    this.closeReady(now);
  }

  closeReady(now: number) {
    for (const [start, counts] of this.open) {
      if (start + this.windowSeconds <= this.watermark) {
        let total = 0;
        for (const c of counts.values()) total += c;
        this.closed.push({ start, counts, total, closedAt: now });
        this.open.delete(start);
      }
    }
  }
}

export function topAds(counts: Map<number, number>, n: number): [number, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
`,o=class{windowSeconds;latenessSeconds;dedupe;open=new Map;seenIds=new Set;recentIds=[];maxEventTime=0;closed=[];late=0;duplicatesDropped=0;constructor(e,t,n){this.windowSeconds=e,this.latenessSeconds=t,this.dedupe=n}get watermark(){return this.maxEventTime-this.latenessSeconds}windowStart(e){return Math.floor(e/this.windowSeconds)*this.windowSeconds}add(e,t){if(this.dedupe){if(this.seenIds.has(e.id)){this.duplicatesDropped++;return}this.seenIds.add(e.id),this.recentIds.push(e.id),this.recentIds.length>2e5&&this.seenIds.delete(this.recentIds.shift())}this.maxEventTime=Math.max(this.maxEventTime,e.eventTime);let n=this.windowStart(e.eventTime);if(n+this.windowSeconds<=this.watermark)this.late++;else{let t=this.open.get(n);t||this.open.set(n,t=new Map),t.set(e.ad,(t.get(e.ad)??0)+1)}this.closeReady(t)}closeReady(e){for(let[t,n]of this.open)if(t+this.windowSeconds<=this.watermark){let r=0;for(let e of n.values())r+=e;this.closed.push({start:t,counts:n,total:r,closedAt:e}),this.open.delete(t)}}};function s(e,t){return[...e.entries()].sort((e,t)=>t[1]-e[1]).slice(0,t)}var c=.25,l=200,u=e=>e.arrived?e.counter.late/e.arrived:0,d={problem:[`Advertisers pay per click, so counting clicks accurately is directly about money. At billions of events a day, you need near real-time counts per ad, and top lists to help them adjust their campaigns, as well as final numbers correct enough to bill on.`,`The fundamental difficulty is that events arrive late and out of order, from phones that lose signal and networks that retry. You can't wait forever, and you can't count wrong. Watermarks are how you pick your point on that line.`],functional:[`Count clicks per ad over recent time windows`,`Return the top N ads each minute`,`Filter by region, device and so on`],nonFunctional:[`Accurate enough for billing`,`Handles late and duplicate events correctly`,`End-to-end delay of a few minutes at most`],diagram:{nodes:[{id:`l`,label:`Click logs`,col:0,row:1,kind:`client`,note:`Log files from ad servers, with event time, ad ID, user and so on.`},{id:`q1`,label:`Message queue`,col:1,row:1,kind:`queue`,note:`Decouples producers, and keeps raw events for replay.`},{id:`a`,label:`Aggregation`,col:2,row:1,note:`Stream processors count in windows, using watermarks to decide when to emit.`},{id:`q2`,label:`Results queue`,col:3,row:1,kind:`queue`,note:`Delivers results exactly once to the database.`},{id:`d`,label:`Aggregates database`,col:4,row:1,kind:`store`,note:`Time-series style store of counts, read by dashboards.`},{id:`r`,label:`Raw data store`,col:1,row:2,kind:`store`,note:`The source of truth, and enables recalculation when something goes wrong.`},{id:`b`,label:`Recalculation`,col:2,row:2,note:`Batch job that replays raw events to fix any errors in stream results.`}],edges:[{from:`l`,to:`q1`},{from:`q1`,to:`a`},{from:`a`,to:`q2`},{from:`q2`,to:`d`},{from:`q1`,to:`r`,dashed:!0},{from:`r`,to:`b`},{from:`b`,to:`d`,dashed:!0}]},ideas:[{title:`Event time, not processing time`,body:`Count by when the click happened, not when you received it. Otherwise a network delay moves clicks into the wrong minute, which matters when you bill on them.`},{title:`Watermarks`,body:`A watermark says you've probably seen everything before a certain time. Waiting longer catches more stragglers but delays results. Very late data goes to a correction job.`},{title:`Window types`,body:`Tumbling windows are consecutive and non-overlapping, for per-minute counts. Sliding windows overlap, for "top ads in the last 5 minutes". Both work with watermarks.`},{title:`Exactly-once`,body:`To be exact, offsets and results have to commit together, atomically. Keeping raw data gives you a backstop: you can always recalculate the truth.`}],estimator:{vars:[{key:`dau`,label:`Daily active users`,unit:`count`},{key:`clicksPerUser`,label:`Clicks per user per day`,unit:`plain`,assume:1},{key:`peakFactor`,label:`Peak over average`,unit:`plain`,assume:5},{key:`eventBytes`,label:`Bytes per click`,unit:`plain`,assume:100},{key:`days`,label:`Days of raw data`,unit:`plain`,assume:30},{key:`clicksDay`,label:`Clicks per day`,unit:`count`},{key:`avg`,label:`Average click rate`,unit:`qps`},{key:`peak`,label:`Peak click rate`,unit:`qps`},{key:`storage`,label:`Raw data`,unit:`bytes`}],eqs:[{out:`clicksDay`,terms:[[`dau`,1],[`clicksPerUser`,1]]},{out:`avg`,terms:[[`clicksDay`,1],[86400,-1]]},{out:`peak`,terms:[[`avg`,1],[`peakFactor`,1]]},{out:`storage`,terms:[[`clicksDay`,1],[`eventBytes`,1],[`days`,1]]}],starts:[{key:`dau`,value:1e9},{key:`peak`,value:5e4},{key:`storage`,value:3e12}]},lab:{secondsPerTick:c,params:[{key:`rate`,label:`Clicks`,kind:`range`,min:10,max:500,step:10,unit:`per s`},{key:`windowSec`,label:`Window size`,kind:`range`,min:5,max:60,step:5,unit:`s`,rebuild:!0},{key:`latenessSec`,label:`Allowed lateness (watermark)`,kind:`range`,min:0,max:60,step:1,unit:`s`,rebuild:!0},{key:`meanDelaySec`,label:`Average event delay`,kind:`range`,min:0,max:30,step:.5,unit:`s`},{key:`dupRate`,label:`Events delivered twice`,kind:`range`,min:0,max:.2,step:.01,format:e=>i(e)},{key:`dedupe`,label:`Deduplicate by event ID`,kind:`toggle`,rebuild:!0}],defaults:{rate:100,windowSec:10,latenessSec:5,meanDelaySec:3,dupRate:0,dedupe:!1},create:e=>({now:0,counter:new o(e.windowSec,e.latenessSec,e.dedupe),zipf:n(l,1),inFlight:[],nextId:1,trueClicks:0,arrived:0,outputDelay:0,countedTotal:0,closedSeen:0,trueByWindow:new Map,trueInClosed:0}),step(e,t,n){e.now+=c;for(let r=n.poisson(t.rate*c);r>0;r--){let r={id:e.nextId++,ad:e.zipf(n),eventTime:e.now+n.next()*c};e.trueClicks++;let i=Math.floor(r.eventTime/t.windowSec)*t.windowSec;e.trueByWindow.set(i,(e.trueByWindow.get(i)??0)+1),e.inFlight.push({event:r,arrivesAt:e.now+n.exponential(Math.max(.001,t.meanDelaySec))}),n.chance(t.dupRate)&&e.inFlight.push({event:r,arrivesAt:e.now+n.exponential(Math.max(.001,t.meanDelaySec))+.5})}for(e.inFlight=e.inFlight.filter(t=>t.arrivesAt>e.now||(e.arrived++,e.counter.add(t.event,e.now),!1)),e.counter.closeReady(e.now);e.closedSeen<e.counter.closed.length;e.closedSeen++){let n=e.counter.closed[e.closedSeen];e.countedTotal+=n.total,e.trueInClosed+=e.trueByWindow.get(n.start)??0,e.latest={start:n.start,total:n.total},e.outputDelay=n.closedAt-(n.start+t.windowSec)}},sample:(e,t)=>({late:u(e)*100,lateMath:Math.exp(-t.latenessSec/Math.max(.001,t.meanDelaySec))*100,output:e.outputDelay,outputMath:t.latenessSec}),charts:[{title:`Events arriving too late to count`,unit:`%`,series:[{key:`late`,label:`Measured`,role:`measured`},{key:`lateMath`,label:`Upper bound`,role:`predicted`}]},{title:`Result delay after a window ends`,unit:`s`,series:[{key:`output`,label:`Measured`,role:`measured`},{key:`outputMath`,label:`Math`,role:`predicted`}]}],metrics(n,a){let o=n.trueInClosed?n.countedTotal/n.trueInClosed:1;return[{label:`Late events, at most`,value:i(Math.exp(-a.latenessSec/Math.max(.001,a.meanDelaySec)),1),role:`predicted`},{label:`Late events`,value:i(u(n),1),role:`measured`,tone:u(n)>.02?`warn`:`good`},{label:`Result delay`,value:e(n.outputDelay),role:`measured`},{label:`Windows published`,value:r(n.counter.closed.length),role:`measured`},{label:`Duplicates dropped`,value:t(n.counter.duplicatesDropped),role:`measured`},{label:`Counted vs real clicks`,value:`${o.toFixed(3)}×`,role:`measured`,tone:o>1.01?`bad`:void 0}]},math(e,t){let n=Math.max(.001,t.meanDelaySec);return[{expr:`Chance of arriving later than the watermark: e^(−${t.latenessSec} ÷ ${t.meanDelaySec})`,result:i(Math.exp(-t.latenessSec/n),1)},{expr:`Results appear ${t.latenessSec} s after each window ends`,result:`${t.latenessSec} s delay`},{expr:`Double delivery without dedup inflates counts by`,result:t.dedupe?`0%, dropped`:i(t.dupRate),tone:t.dedupe||!t.dupRate?`good`:`bad`}]},views(e){let t=e.counter.closed[e.counter.closed.length-1];return[{kind:`bars`,title:t?`Top ads in window starting at ${r(t.start)} s`:`Top ads, once a window closes`,items:t?s(t.counts,5).map(([e,t])=>({label:`Ad ${e}`,value:t})):[]},{kind:`log`,title:`Published windows`,lines:e.counter.closed.slice(-5).reverse().map(e=>({text:`Window ${r(e.start)} s: ${r(e.total)} clicks`}))}]},trace:e=>({values:{wm:`${e.counter.watermark.toFixed(1)} s`,late:t(e.counter.late),latest:e.latest?`${r(e.latest.total)} clicks`:``}}),experiments:[{title:`Publish immediately`,set:{latenessSec:0,meanDelaySec:3,windowSec:10},ticks:240,question:`Close each window as soon as the time passes, with no allowance for lateness. Events take about 3 seconds to arrive on average. What happens to accuracy?`,options:[`Almost nothing is missed`,`A meaningful share of clicks gets missed`,`All are lost`],answer:1,explain:`Clicks near the end of a window arrive after it's closed, so they don't get counted. Results come fast, but they undercount, and advertisers are billed on these numbers.`,check:e=>u(e)>.05},{title:`Wait for stragglers`,set:{latenessSec:12,meanDelaySec:3,windowSec:10},ticks:240,question:`Now wait 12 seconds, four times the average delay. What share of events arrive too late?`,options:[`Under 2%`,`About 25%`,`About 50%`],answer:0,explain:`For exponentially distributed delays, the share later than 4 averages is e^(−4) = 1.8%, and in practice lower. But each result now appears 12 seconds later. That's the core tradeoff: fresh or correct. Some systems publish early and correct later.`,check:e=>u(e)<.02},{title:`Double delivery`,set:{dupRate:.1,dedupe:!1,latenessSec:15,meanDelaySec:1},ticks:200,question:`Your pipeline delivers at-least-once, and 10% of events arrive twice. With no deduplication, what happens to billed clicks?`,options:[`Nothing, since the counts are the same`,`About 10% too high`],answer:1,explain:`Each duplicate counts as a click, so advertisers get overcharged. In an ad system, that's real money and legal risk. Every event needs an ID, and exactly-once must hold across the whole pipeline.`,check:e=>{let t=e.countedTotal/Math.max(1,e.trueInClosed);return e.trueInClosed>1e3&&t>1.05&&t<1.16}},{title:`Deduplicate`,set:{dupRate:.1,dedupe:!0,latenessSec:15,meanDelaySec:1},ticks:200,question:`Remember recently seen event IDs and drop repeats. What share of events get counted twice?`,options:[`None`,`About 5%`,`About 10%`],answer:0,explain:`A repeat ID is dropped, so counts match reality. The cost is memory for recent IDs, and in a distributed pipeline those IDs have to be saved atomically with offsets, or a crash can bring duplicates back.`,check:e=>e.counter.duplicatesDropped>50&&e.trueInClosed>1e3&&e.countedTotal<=e.trueInClosed}]},pseudocode:[{code:`on_event(click):`},{code:`  if deduping and click.id already seen: drop it`},{code:`  watermark = newest event time − allowed lateness`,id:`wm`},{code:`  window = floor(click.time ÷ size)`},{code:`  if that window has closed: mark as late`,id:`late`},{code:`  else: count[window][click.ad] += 1`},{code:`  publish every window ending before the watermark`,id:`latest`}],sources:[{name:`engine.ts`,code:a,lang:`ts`}],tradeoffs:[{choice:`Longer watermark`,gain:`More accurate`,cost:`Slower results`},{choice:`Event time`,gain:`Correct assignment to windows`,cost:`Must handle late arrivals`},{choice:`Stream plus batch recalculation`,gain:`Fast results, and a truth to fall back on`,cost:`Two systems to run`},{choice:`Dedup with exactly-once`,gain:`Correct billing`,cost:`Overhead and complexity`}],interview:[{q:`What do you do with very late events?`,a:`Don't try to keep windows open indefinitely. Send them to a correction path, and have a daily batch reconciliation against raw data that produces the final billable numbers.`},{q:`How do you find the top N ads?`,a:`Keep a counter per ad in each window, along with a min-heap of size N, and emit them together. For very high cardinality, an approximate sketch trades a little accuracy for much less memory.`},{q:`How do you handle a hot ad?`,a:`Split its count across several aggregator nodes by adding a random suffix to the key, then merge partial counts. Hot keys are otherwise a real bottleneck in stream processing.`},{q:`How do you recover from a bad code deploy?`,a:`This is why you keep raw events. Replay them through the fixed code, and overwrite the affected results. Immutable input makes recovery simple.`}],mistakes:[`Counting by processing time.`,`Assuming at-least-once delivery is good enough for billing.`,`Throwing away raw events after aggregating.`]};export{d as default};