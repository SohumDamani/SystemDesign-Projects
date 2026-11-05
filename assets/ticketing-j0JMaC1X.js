import{a as e,i as t,o as n,s as r,u as i}from"./index-ar0glIxf.js";var a=`// Seats with expiring holds, and a waiting room in front of a limited database.
export type SeatState = 'free' | 'held' | 'sold';

export interface Seat {
  state: SeatState;
  heldUntil: number;
  holder: number;
}

export class Venue {
  seats: Seat[];
  sold = 0;
  doubleSold = 0;
  private free: number[];

  constructor(count: number, shuffle: (n: number) => number) {
    this.seats = Array.from({ length: count }, () => ({ state: 'free', heldUntil: 0, holder: 0 }));
    this.free = Array.from({ length: count }, (_, i) => i);
    for (let i = count - 1; i > 0; i--) {
      const j = shuffle(i + 1);
      [this.free[i], this.free[j]] = [this.free[j], this.free[i]];
    }
  }

  /**
   * Holds a seat for a limited time. In a real database, this is one atomic update:
   * UPDATE seats SET state = 'held' WHERE id = ? AND state = 'free'.
   */
  hold(user: number, now: number, ttl: number): number | null {
    const seat = this.free.pop();
    if (seat === undefined) return null;
    this.seats[seat] = { state: 'held', heldUntil: now + ttl, holder: user };
    return seat;
  }

  /** Only works if this user's hold hasn't expired. Otherwise the seat isn't theirs anymore. */
  pay(seat: number, user: number, now: number): boolean {
    const s = this.seats[seat];
    if (s.state === 'sold') {
      this.doubleSold++;
      return false;
    }
    if (s.state !== 'held' || s.holder !== user || s.heldUntil < now) return false;
    s.state = 'sold';
    this.sold++;
    return true;
  }

  /** Returns expired holds to the pool, so that someone else can buy them. */
  releaseExpired(now: number): number {
    let released = 0;
    this.seats.forEach((s, i) => {
      if (s.state === 'held' && s.heldUntil < now) {
        s.state = 'free';
        this.free.push(i);
        released++;
      }
    });
    return released;
  }

  get freeCount() {
    return this.free.length;
  }

  get heldCount() {
    return this.seats.length - this.sold - this.free.length;
  }
}

/** First come, first served, with a fixed rate of people let in per second. */
export class WaitingRoom {
  private queue: { user: number; joinedAt: number }[] = [];
  private head = 0;

  join(user: number, now: number) {
    this.queue.push({ user, joinedAt: now });
  }

  admit(count: number): { user: number; joinedAt: number }[] {
    const out = this.queue.slice(this.head, this.head + count);
    this.head += out.length;
    if (this.head > 8192) {
      this.queue = this.queue.slice(this.head);
      this.head = 0;
    }
    return out;
  }

  get length() {
    return this.queue.length - this.head;
  }
}
`,o=class{seats;sold=0;doubleSold=0;free;constructor(e,t){this.seats=Array.from({length:e},()=>({state:`free`,heldUntil:0,holder:0})),this.free=Array.from({length:e},(e,t)=>t);for(let n=e-1;n>0;n--){let e=t(n+1);[this.free[n],this.free[e]]=[this.free[e],this.free[n]]}}hold(e,t,n){let r=this.free.pop();return r===void 0?null:(this.seats[r]={state:`held`,heldUntil:t+n,holder:e},r)}pay(e,t,n){let r=this.seats[e];return r.state===`sold`?(this.doubleSold++,!1):r.state!==`held`||r.holder!==t||r.heldUntil<n?!1:(r.state=`sold`,this.sold++,!0)}releaseExpired(e){let t=0;return this.seats.forEach((n,r)=>{n.state===`held`&&n.heldUntil<e&&(n.state=`free`,this.free.push(r),t++)}),t}get freeCount(){return this.free.length}get heldCount(){return this.seats.length-this.sold-this.free.length}},s=class{queue=[];head=0;join(e,t){this.queue.push({user:e,joinedAt:t})}admit(e){let t=this.queue.slice(this.head,this.head+e);return this.head+=t.length,this.head>8192&&(this.queue=this.queue.slice(this.head),this.head=0),t}get length(){return this.queue.length-this.head}},c=i(),l=.25;function u({state:e}){let t=e.venue.seats,r=t.slice(0,1600),i={free:``,held:``,sold:``};return r.forEach((e,t)=>{i[e.state]+=`M${t%50*9} ${Math.floor(t/50)*9}h7.5v7.5h-7.5z`}),(0,c.jsxs)(`div`,{className:`lab-panel`,children:[(0,c.jsxs)(`h4`,{children:[`Seats: empty, held in orange, sold in blue`,t.length>r.length?`. First ${n(r.length)} shown`:``]}),(0,c.jsxs)(`svg`,{viewBox:`0 0 450 ${Math.ceil(r.length/50)*9}`,className:`lab-svg`,style:{padding:6},role:`img`,"aria-label":`${e.venue.sold} seats sold, ${e.venue.heldCount} held, ${e.venue.freeCount} free.`,children:[(0,c.jsx)(`path`,{d:i.free,fill:`var(--line)`}),(0,c.jsx)(`path`,{d:i.held,fill:`var(--predicted)`}),(0,c.jsx)(`path`,{d:i.sold,fill:`var(--measured)`})]})]})}var d={problem:[`A ticketing site is quiet most of the time. Then a huge concert goes on sale, and a million people arrive in the same minute, wanting a few thousand seats. It's the most extreme traffic spike in everyday systems.`,`There are two main problems. The first is surviving the spike without falling over. The second is seat holds: when you pick a seat, it must be reserved while you pay, but people walk away, and bots try to hold seats they'll never buy.`],functional:[`Browse events, and see available seats`,`Hold a seat while paying`,`Buy tickets, with no seat sold twice`],nonFunctional:[`Survives enormous spikes at sale time`,`Fair, with a first-come feel`,`Strong consistency for seats, while browsing can be slightly stale`],diagram:{nodes:[{id:`u`,label:`Fans`,col:0,row:1,kind:`client`,note:`A spike of millions, all at the same second.`},{id:`w`,label:`Waiting room`,col:1,row:1,kind:`queue`,note:`A queue at the edge, often served by a CDN, letting people in at a controlled rate.`},{id:`b`,label:`Booking service`,col:2,row:1,note:`Holds seats atomically, and handles checkout.`},{id:`c`,label:`Event cache`,col:2,row:0,kind:`store`,note:`Event pages barely change, and can absorb most browsing traffic.`},{id:`d`,label:`Seat database`,col:3,row:1,kind:`store`,note:`One row per seat. The source of truth, protected by the waiting room.`},{id:`p`,label:`Payment provider`,col:3,row:2,kind:`external`,note:`A slow outside dependency. Holds give people time to finish.`}],edges:[{from:`u`,to:`w`},{from:`u`,to:`c`,dashed:!0},{from:`w`,to:`b`},{from:`b`,to:`d`},{from:`b`,to:`p`}]},ideas:[{title:`Waiting room`,body:`A queue in front of the booking system admits people at the rate the database can handle. The spike becomes a line. Telling people their position makes the wait feel fair.`},{title:`Seat holds`,body:`A seat moves from free to held to sold. A hold is an atomic update with an expiry, and when it expires, a background job, or the next read, frees the seat for someone else.`},{title:`Read and write separately`,body:`Most traffic is people looking. Serve event pages and rough availability from a cache or CDN, and keep the database for the small part that really books seats.`},{title:`Fighting bots`,body:`Bots buy out seats for resale. Common tools are per-account limits, CAPTCHAs, verified-fan pre-registration, and watching for unusually fast checkouts.`}],estimator:{vars:[{key:`fans`,label:`Fans at sale time`,unit:`count`},{key:`window`,label:`Seconds they arrive within`,unit:`plain`,assume:60},{key:`admitRate`,label:`Admitted per second`,unit:`plain`,assume:1e3},{key:`pageBytes`,label:`Bytes per waiting-room page`,unit:`plain`,assume:5e4},{key:`arrivals`,label:`Arrival rate`,unit:`qps`},{key:`waitSeconds`,label:`Longest wait in line`,unit:`seconds`},{key:`edgeBandwidth`,label:`Bandwidth at the edge`,unit:`bytesPerSec`}],eqs:[{out:`arrivals`,terms:[[`fans`,1],[`window`,-1]]},{out:`waitSeconds`,terms:[[`fans`,1],[`admitRate`,-1]]},{out:`edgeBandwidth`,terms:[[`arrivals`,1],[`pageBytes`,1]]}],starts:[{key:`fans`,value:2e6},{key:`arrivals`,value:3e4},{key:`waitSeconds`,value:1800}]},lab:{secondsPerTick:l,params:[{key:`fans`,label:`Fans trying to buy`,kind:`range`,min:1e3,max:1e5,step:1e3,rebuild:!0},{key:`spikeSeconds`,label:`They all arrive within`,kind:`range`,min:5,max:120,step:5,unit:`s`,rebuild:!0},{key:`seats`,label:`Seats`,kind:`range`,min:200,max:5e3,step:100,rebuild:!0},{key:`dbCapacity`,label:`Database capacity`,kind:`range`,min:100,max:5e3,step:100,unit:`per s`},{key:`waitingRoom`,label:`Use a waiting room`,kind:`toggle`,rebuild:!0},{key:`admitPerSec`,label:`Let in from the waiting room`,kind:`range`,min:10,max:3e3,step:10,unit:`per s`},{key:`holdSeconds`,label:`Seat hold time`,kind:`range`,min:10,max:900,step:10,unit:`s`},{key:`checkoutSeconds`,label:`Time people take to pay`,kind:`range`,min:5,max:300,step:5,unit:`s`},{key:`abandon`,label:`People who hold, then never pay`,kind:`range`,min:0,max:.8,step:.05,format:e=>r(e)}],defaults:{fans:2e4,spikeSeconds:10,seats:1e3,dbCapacity:1e3,waitingRoom:!1,admitPerSec:500,holdSeconds:300,checkoutSeconds:60,abandon:.2},create:(e,t)=>({now:0,venue:new o(e.seats,e=>t.int(e)),room:new s,arrived:0,errors:0,served:0,soldOut:0,checkouts:[],expiredWhilePaying:0,abandoned:0,maxWait:0,waitEma:0,soldOutAt:-1,carry:0,nextUser:1,dbLoad:0}),step(e,t,n){e.now+=l,e.venue.releaseExpired(e.now);let r=0;e.arrived<t.fans&&(r=Math.min(t.fans-e.arrived,Math.ceil(t.fans/t.spikeSeconds*l))),e.arrived+=r;let i=[];if(t.waitingRoom){for(let t=0;t<r;t++)e.room.join(e.nextUser++,e.now);e.carry+=t.admitPerSec*l;let n=Math.floor(e.carry);e.carry-=n,i=e.room.admit(n)}else for(let t=0;t<r;t++)i.push({user:e.nextUser++,joinedAt:e.now});let a=Math.floor(t.dbCapacity*l);e.dbLoad=e.dbLoad*.8+i.length/l*.2,i.forEach((r,i)=>{if(i>=a){e.errors++;return}e.served++;let o=e.now-r.joinedAt;e.maxWait=Math.max(e.maxWait,o),e.waitEma=e.waitEma*.99+o*.01;let s=e.venue.hold(r.user,e.now,t.holdSeconds);s===null?e.soldOut++:e.checkouts.push({user:r.user,seat:s,payAt:e.now+n.range(.5,1.5)*t.checkoutSeconds,willPay:!n.chance(t.abandon)})}),e.checkouts=e.checkouts.filter(t=>t.payAt>e.now?!0:t.willPay?(e.venue.pay(t.seat,t.user,e.now)||e.expiredWhilePaying++,!1):(e.abandoned++,!1)),e.soldOutAt<0&&e.venue.sold>=t.seats&&(e.soldOutAt=e.now)},sample:(e,t)=>({load:e.dbLoad,cap:t.dbCapacity,sold:e.venue.sold,held:e.venue.heldCount,seats:t.seats}),charts:[{title:`Requests reaching the database`,unit:`per s`,series:[{key:`load`,label:`Measured`,role:`measured`},{key:`cap`,label:`Capacity`,role:`predicted`}]},{title:`Seats`,series:[{key:`sold`,label:`Sold`,role:`measured`},{key:`held`,label:`Held`,role:`other`},{key:`seats`,label:`Total`,role:`predicted`}]}],metrics(t,i){let a=t.errors+t.served;return[{label:`Longest wait in line`,value:i.waitingRoom?e(i.fans/i.admitPerSec):`No line`,role:`predicted`},{label:`Requests that errored`,value:r(a?t.errors/a:0),role:`measured`,tone:t.errors?`bad`:`good`},{label:`Sold`,value:`${n(t.venue.sold)} of ${n(i.seats)}`,role:`measured`},{label:`Held, unpaid`,value:n(t.venue.heldCount),role:`measured`,tone:t.venue.heldCount>i.seats*.3?`warn`:void 0},{label:`Lost at checkout`,value:n(t.expiredWhilePaying),role:`measured`,tone:t.expiredWhilePaying?`bad`:`good`},{label:`Sold twice`,value:n(t.venue.doubleSold),role:`measured`,tone:t.venue.doubleSold?`bad`:`good`}]},math(r,i){let a=i.fans/i.spikeSeconds;return[{expr:`Arrival rate: ${n(i.fans)} ÷ ${i.spikeSeconds} s`,result:`${t(a)}/s`,tone:!i.waitingRoom&&a>i.dbCapacity?`bad`:`good`},{expr:`Database can take`,result:`${t(i.dbCapacity)}/s`},{expr:`Line clears in: ${n(i.fans)} ÷ ${n(i.admitPerSec)}/s`,result:i.waitingRoom?e(i.fans/i.admitPerSec):`No waiting room`,tone:i.waitingRoom&&i.admitPerSec>i.dbCapacity?`bad`:void 0},{expr:`Hold ${i.holdSeconds} s vs checkout up to ${Math.round(i.checkoutSeconds*1.5)} s`,result:i.holdSeconds<i.checkoutSeconds*1.5?`some will run out of time`:`enough time`,tone:i.holdSeconds<i.checkoutSeconds*1.5?`warn`:`good`}]},View:u,trace:e=>({values:{line:t(e.room.length),hold:`${n(e.venue.heldCount)} held`,pay:`${n(e.venue.sold)} sold`,exp:`${n(e.abandoned)} walked away`}}),experiments:[{title:`Everyone at once`,set:{fans:5e4,spikeSeconds:10,dbCapacity:1e3,waitingRoom:!1},ticks:80,question:`50,000 fans arrive within 10 seconds, and the database handles 1,000 requests a second. With no waiting room, what share of requests fail?`,options:[`A few`,`About half`,`Most of them`],answer:2,explain:`5,000 a second hit a database that can take 1,000, so about 80% fail, and in real life those fans retry, making it even worse. Your site looks broken at its most-watched moment.`,check:e=>e.errors/(e.errors+e.served)>.7},{title:`Add a waiting room`,set:{fans:5e4,spikeSeconds:10,dbCapacity:1e3,waitingRoom:!0,admitPerSec:800},ticks:120,question:`Fans now join a line, and you let in 800 a second, under the database's capacity. How many requests fail?`,options:[`None`,`About the same`],answer:0,explain:`The database only ever sees what it can handle. The last fan waits about a minute, but gets a real answer, and a line feels fair. It turns a capacity problem into a waiting problem, which users accept far better than errors.`,check:e=>e.errors===0&&e.served>1e3},{title:`Holds that never pay`,set:{fans:3e3,spikeSeconds:5,seats:1e3,holdSeconds:600,checkoutSeconds:30,abandon:.5,waitingRoom:!0,admitPerSec:500},ticks:500,question:`Half of those who hold a seat never pay, and holds last 10 minutes. Two minutes in, can other fans buy those seats?`,options:[`Yes, right away`,`No, they're stuck in holds until they expire`],answer:1,explain:`Those seats look gone, although nobody paid. Fans get told it's sold out while seats are actually unsold. Bots can exploit this too, by holding seats just to block others. Hold time is a real business decision.`,check:e=>e.venue.heldCount>200&&e.venue.sold<1e3},{title:`A hold that's too short`,set:{fans:1e3,spikeSeconds:5,seats:800,holdSeconds:30,checkoutSeconds:60,abandon:0,waitingRoom:!0,admitPerSec:500},ticks:500,question:`What if holds last 30 seconds, but people take around a minute to enter their card details?`,options:[`No problem`,`People lose their seat in the middle of paying`],answer:1,explain:`The worst possible experience: they enter their card, and the seat is gone. The hold must comfortably exceed checkout time, which is why many sites show a countdown, and extend it once you start paying.`,check:e=>e.expiredWhilePaying>100},{title:`Never sold twice`,set:{fans:3e4,spikeSeconds:10,seats:500,waitingRoom:!0,admitPerSec:1e3,dbCapacity:2e3,holdSeconds:60,checkoutSeconds:30,abandon:.3},ticks:500,question:`With huge demand, seats held, expired, and held again, can one seat ever be sold to two people?`,options:[`Yes, under this much load`,`No`],answer:1,explain:`A hold is an atomic update that only succeeds if the seat is free, and paying checks that you still hold it. Those two checks make it impossible, however much load there is. It's the same idea as in the hotel lesson.`,check:e=>e.venue.doubleSold===0&&e.venue.sold>100}]},pseudocode:[{code:`on_arrive(fan):`},{code:`  join the waiting room`,id:`line`},{code:``},{code:`every second: admit a fixed number of fans`},{code:``},{code:`on_select_seat(fan):`},{code:`  UPDATE seat SET held WHERE state = free`,id:`hold`},{code:`  if no row changed: choose another seat`},{code:``},{code:`on_pay(fan, seat):`},{code:`  sell only if this fan's hold is still valid`,id:`pay`},{code:`people who held a seat and walked away`,id:`exp`}],sources:[{name:`engine.ts`,code:a,lang:`ts`}],tradeoffs:[{choice:`Waiting room`,gain:`Protects the database, and feels fair`,cost:`People wait, and it's another system to run`},{choice:`Long hold`,gain:`Time to finish paying`,cost:`Abandoned seats stay locked for longer`},{choice:`Short hold`,gain:`Unsold seats return quickly`,cost:`People lose seats while paying`},{choice:`Choose your own seat`,gain:`People like it`,cost:`Lots of conflicts on the same seats. Assigning best available avoids this`}],interview:[{q:`How do you stop people losing their place by refreshing?`,a:`Give each person a signed token with their queue position, stored client-side or in the edge layer. Refreshing simply re-presents the same token.`},{q:`Why not scale the database for the spike?`,a:`The spike is huge and short, and it comes down to many writes on a small set of rows. Hot-row contention can't be solved by adding machines, so limiting concurrency works much better.`},{q:`How do you release expired holds?`,a:`Treat a hold as valid only if its expiry is in the future, so nothing has to happen at the exact moment. A background job then tidies up rows for availability counts.`},{q:`What if the payment succeeds after the hold expires?`,a:`Avoid this by extending the hold when checkout starts. If it still happens, the seat might be gone, so you refund automatically. Handle it explicitly, and reconcile.`}],mistakes:[`Designing for average traffic, in a system defined by its peak.`,`Not protecting the database from the spike.`,`Using one long-running database lock to hold a seat during payment.`]};export{d as default};