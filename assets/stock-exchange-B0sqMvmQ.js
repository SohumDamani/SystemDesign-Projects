import{n as e}from"./rolldown-runtime-WkwZ5CU-.js";import{a as t,b as n,f as r,g as i,u as a}from"./index-n79SFkCo.js";var o=e(n(),1),s=`// A real price-time priority matching engine, driven by a sequenced log of inputs.
export type Side = 'buy' | 'sell';

export interface Order {
  seq: number;
  id: number;
  owner: string;
  side: Side;
  type: 'limit' | 'market';
  price: number; // in cents, ignored for market orders
  quantity: number;
}

export interface Trade {
  seq: number;
  price: number;
  quantity: number;
  buyOwner: string;
  sellOwner: string;
  makerOrder: number;
}

interface Level {
  price: number;
  queue: Order[]; // first in the list arrived first, and is matched first
}

/** Keeps price levels sorted, so the best price is always at the front. */
class BookSide {
  levels: Level[] = [];
  constructor(private side: Side) {}

  private better(a: number, b: number) {
    return this.side === 'buy' ? a > b : a < b;
  }

  add(order: Order) {
    let i = 0;
    while (i < this.levels.length && this.better(this.levels[i].price, order.price)) i++;
    if (i < this.levels.length && this.levels[i].price === order.price) this.levels[i].queue.push(order);
    else this.levels.splice(i, 0, { price: order.price, queue: [order] });
  }

  best(): Level | undefined {
    return this.levels[0];
  }

  removeBestIfEmpty() {
    if (this.levels[0] && this.levels[0].queue.length === 0) this.levels.shift();
  }

  remove(orderId: number): boolean {
    for (let i = 0; i < this.levels.length; i++) {
      const at = this.levels[i].queue.findIndex((o) => o.id === orderId);
      if (at >= 0) {
        this.levels[i].queue.splice(at, 1);
        if (!this.levels[i].queue.length) this.levels.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  get depth() {
    return this.levels.reduce((sum, l) => sum + l.queue.reduce((a, o) => a + o.quantity, 0), 0);
  }
}

export type Input = { kind: 'new'; order: Omit<Order, 'seq'> } | { kind: 'cancel'; orderId: number };

export class MatchingEngine {
  bids = new BookSide('buy');
  asks = new BookSide('sell');
  /** Only the most recent trades are kept, so a long run can't use unbounded memory. */
  trades: Trade[] = [];
  tradeCount = 0;
  /** The sequencer: everything is numbered and logged before it runs. */
  log: Input[] = [];
  private seq = 0;

  handle(input: Input): Trade[] {
    this.log.push(input);
    this.seq++;
    if (input.kind === 'cancel') {
      if (!this.bids.remove(input.orderId)) this.asks.remove(input.orderId);
      return [];
    }
    return this.match({ ...input.order, seq: this.seq });
  }

  private match(order: Order): Trade[] {
    const opposite = order.side === 'buy' ? this.asks : this.bids;
    const fills: Trade[] = [];
    let remaining = order.quantity;
    while (remaining > 0) {
      const level = opposite.best();
      if (!level) break;
      const crosses = order.type === 'market' || (order.side === 'buy' ? order.price >= level.price : order.price <= level.price);
      if (!crosses) break;
      // Time priority: always the oldest order at the best price.
      const maker = level.queue[0];
      const quantity = Math.min(remaining, maker.quantity);
      const trade: Trade = {
        seq: order.seq,
        price: level.price,
        quantity,
        buyOwner: order.side === 'buy' ? order.owner : maker.owner,
        sellOwner: order.side === 'sell' ? order.owner : maker.owner,
        makerOrder: maker.id,
      };
      fills.push(trade);
      this.trades.push(trade);
      this.tradeCount++;
      if (this.trades.length > 4000) this.trades.splice(0, 2000);
      remaining -= quantity;
      maker.quantity -= quantity;
      if (maker.quantity === 0) level.queue.shift();
      opposite.removeBestIfEmpty();
    }
    // Whatever a limit order couldn't fill rests in the book. Market orders never rest.
    if (remaining > 0 && order.type === 'limit') (order.side === 'buy' ? this.bids : this.asks).add({ ...order, quantity: remaining });
    return fills;
  }

  /** A fingerprint of the complete state, to compare two engines. */
  fingerprint(): string {
    const side = (s: BookSide) => s.levels.map((l) => \`\${l.price}:\${l.queue.map((o) => \`\${o.id}/\${o.quantity}\`).join(',')}\`).join('|');
    return \`\${side(this.bids)}#\${side(this.asks)}#\${this.tradeCount}\`;
  }
}

/** Determinism: the same inputs in the same order always give the same state. */
export function replay(log: Input[]): MatchingEngine {
  const engine = new MatchingEngine();
  for (const input of log) engine.handle(input);
  return engine;
}
`,c=class{side;levels=[];constructor(e){this.side=e}better(e,t){return this.side===`buy`?e>t:e<t}add(e){let t=0;for(;t<this.levels.length&&this.better(this.levels[t].price,e.price);)t++;t<this.levels.length&&this.levels[t].price===e.price?this.levels[t].queue.push(e):this.levels.splice(t,0,{price:e.price,queue:[e]})}best(){return this.levels[0]}removeBestIfEmpty(){this.levels[0]&&this.levels[0].queue.length===0&&this.levels.shift()}remove(e){for(let t=0;t<this.levels.length;t++){let n=this.levels[t].queue.findIndex(t=>t.id===e);if(n>=0)return this.levels[t].queue.splice(n,1),this.levels[t].queue.length||this.levels.splice(t,1),!0}return!1}get depth(){return this.levels.reduce((e,t)=>e+t.queue.reduce((e,t)=>e+t.quantity,0),0)}},l=class{bids=new c(`buy`);asks=new c(`sell`);trades=[];tradeCount=0;log=[];seq=0;handle(e){return this.log.push(e),this.seq++,e.kind===`cancel`?(this.bids.remove(e.orderId)||this.asks.remove(e.orderId),[]):this.match({...e.order,seq:this.seq})}match(e){let t=e.side===`buy`?this.asks:this.bids,n=[],r=e.quantity;for(;r>0;){let i=t.best();if(!i||!(e.type===`market`||(e.side===`buy`?e.price>=i.price:e.price<=i.price)))break;let a=i.queue[0],o=Math.min(r,a.quantity),s={seq:e.seq,price:i.price,quantity:o,buyOwner:e.side===`buy`?e.owner:a.owner,sellOwner:e.side===`sell`?e.owner:a.owner,makerOrder:a.id};n.push(s),this.trades.push(s),this.tradeCount++,this.trades.length>4e3&&this.trades.splice(0,2e3),r-=o,a.quantity-=o,a.quantity===0&&i.queue.shift(),t.removeBestIfEmpty()}return r>0&&e.type===`limit`&&(e.side===`buy`?this.bids:this.asks).add({...e,quantity:r}),n}fingerprint(){let e=e=>e.levels.map(e=>`${e.price}:${e.queue.map(e=>`${e.id}/${e.quantity}`).join(`,`)}`).join(`|`);return`${e(this.bids)}#${e(this.asks)}#${this.tradeCount}`}};function u(e){let t=new l;for(let n of e)t.handle(n);return t}var d=i(),f=.1,p=e=>`$${(e/100).toFixed(2)}`;function m({state:e,rerender:t}){let[n,i]=(0,o.useState)(`buy`),[a,s]=(0,o.useState)(`100.00`),[c,l]=(0,o.useState)(`100`),[u,f]=(0,o.useState)(``),{bids:m,asks:h}=e.engine,g=h.levels.slice(0,7).reverse(),_=m.levels.slice(0,7),v=e=>e.queue.reduce((e,t)=>e+t.quantity,0),y=Math.max(1,...g.map(v),..._.map(v)),b=()=>{let r=Math.round(parseFloat(a)*100),i=parseInt(c,10);if(!(r>0)||!(i>0)){f(`Enter a price and a quantity above 0.`);return}f(``);let o=e.nextId++,s=e.engine.handle({kind:`new`,order:{id:o,owner:`you`,side:n,type:`limit`,price:r,quantity:i}}),l=s.reduce((e,t)=>e+t.quantity,0);e.mine=[{text:l?`${n===`buy`?`Bought`:`Sold`} ${l} at ${p(s[0].price)}${l<i?`, with ${i-l} resting in the book`:``}`:`${i} resting at ${p(r)}`},...e.mine].slice(0,4),t()},x=(e,t)=>(0,d.jsxs)(`div`,{className:`bar-row`,style:{gridTemplateColumns:`70px minmax(0, 1fr) 64px`},children:[(0,d.jsx)(`span`,{className:`bar-label`,style:{color:t===`ask`?`var(--bad)`:`var(--good)`},children:p(e.price)}),(0,d.jsx)(`div`,{className:`bar-track`,children:(0,d.jsx)(`div`,{className:`bar-fill tone-bg-`+(t===`ask`?`bad`:`good`),style:{width:`${v(e)/y*100}%`}})}),(0,d.jsx)(`span`,{className:`bar-value`,children:r(v(e))})]},`${t}${e.price}`);return(0,d.jsxs)(`div`,{className:`lab-panel`,children:[(0,d.jsx)(`h4`,{children:`The live order book. Place your own order.`}),(0,d.jsxs)(`div`,{className:`ref-grid`,children:[(0,d.jsxs)(`div`,{className:`bars`,children:[g.map(e=>x(e,`ask`)),(0,d.jsx)(`div`,{className:`small muted`,style:{textAlign:`center`},children:m.best()&&h.best()?`Spread ${p(h.best().price-m.best().price)}`:`No spread yet`}),_.map(e=>x(e,`bid`))]}),(0,d.jsxs)(`div`,{children:[(0,d.jsxs)(`div`,{className:`seg`,role:`group`,"aria-label":`Order side`,style:{marginBottom:8},children:[(0,d.jsx)(`button`,{"aria-pressed":n===`buy`,onClick:()=>i(`buy`),children:`Buy`}),(0,d.jsx)(`button`,{"aria-pressed":n===`sell`,onClick:()=>i(`sell`),children:`Sell`})]}),(0,d.jsxs)(`div`,{className:`est-assumptions`,style:{marginBottom:8},children:[(0,d.jsxs)(`label`,{className:`est-field`,children:[(0,d.jsx)(`span`,{children:`Limit price ($)`}),(0,d.jsx)(`input`,{value:a,onChange:e=>s(e.target.value),"aria-invalid":!!u})]}),(0,d.jsxs)(`label`,{className:`est-field`,children:[(0,d.jsx)(`span`,{children:`Quantity`}),(0,d.jsx)(`input`,{value:c,onChange:e=>l(e.target.value),"aria-invalid":!!u})]})]}),(0,d.jsx)(`button`,{onClick:b,children:`Send order`}),u&&(0,d.jsx)(`p`,{className:`field-error`,children:u}),(0,d.jsxs)(`div`,{className:`log`,style:{marginTop:8},role:`log`,children:[e.mine.length===0&&(0,d.jsx)(`div`,{className:`muted`,children:`Your fills appear here`}),e.mine.map((e,t)=>(0,d.jsx)(`div`,{children:e.text},t))]})]})]})]})}var h={problem:[`A stock exchange matches buyers and sellers. The rules are simple and strict, and the engineering is remarkable: orders go through in microseconds, in a provably fair sequence, and the system must never lose an order or disagree about what happened.`,`That pushes the design far from typical web systems. Everything critical runs on one thread on one machine, in memory, with no network hops in the fast path. Reliability comes from a sequenced log, and a hot standby replaying it. You can place orders into the real matching engine below.`],functional:[`Accept limit and market orders, and cancellations`,`Match orders by price, then by time`,`Publish market data in real time`],nonFunctional:[`Very low latency, measured in microseconds at the high percentiles`,`Fair and deterministic`,`Availability and fault tolerance, with fast failover`],diagram:{nodes:[{id:`b`,label:`Brokers`,col:0,row:1,kind:`client`,note:`Send orders on behalf of traders, through a dedicated gateway.`},{id:`g`,label:`Order gateway`,col:1,row:1,note:`Validates, and applies rate limits and risk checks.`},{id:`s`,label:`Sequencer`,col:2,row:1,kind:`queue`,note:`Gives each input a number, and logs it. This sequence is the source of truth.`},{id:`m`,label:`Matching engine`,col:3,row:1,note:`One thread, in memory, with no locks. Deterministic, so it can be replayed.`},{id:`h`,label:`Hot standby`,col:3,row:2,note:`Replays the same log, so it can take over quickly with an identical state.`},{id:`d`,label:`Market data`,col:3,row:0,note:`Builds order book views and candlestick charts from the stream of trades.`},{id:`r`,label:`Reporting`,col:2,row:2,kind:`store`,note:`Records trades for settlement and regulators, away from the fast path.`}],edges:[{from:`b`,to:`g`},{from:`g`,to:`s`},{from:`s`,to:`m`},{from:`m`,to:`d`},{from:`s`,to:`h`,dashed:!0},{from:`m`,to:`r`,dashed:!0}]},ideas:[{title:`Order book`,body:`Buy and sell orders are sorted by price, and within a price, by time. A new order matches against the best opposite price, and anything left over rests in the book.`},{title:`Sequencer`,body:`Everything gets a number before it runs. The sequence is the single fair ordering of events, and the input log lets you rebuild any state.`},{title:`Single-threaded core`,body:`Locks and context switches are too slow and unpredictable. One pinned thread, on a ring buffer, avoids them. It also gives you determinism for free.`},{title:`Fault tolerance`,body:`Hot standbys process the same log. If the primary dies, one takes over within milliseconds. Consensus protocols like Raft can decide who's in charge.`}],estimator:{vars:[{key:`ordersDay`,label:`Orders per day`,unit:`count`},{key:`tradingHours`,label:`Trading hours per day`,unit:`plain`,assume:6.5},{key:`peakFactor`,label:`Peak over average`,unit:`plain`,assume:5},{key:`eventBytes`,label:`Bytes per input event`,unit:`plain`,assume:100},{key:`avg`,label:`Average order rate`,unit:`qps`},{key:`peak`,label:`Peak order rate`,unit:`qps`},{key:`logDay`,label:`Log per day`,unit:`bytes`}],eqs:[{out:`avg`,terms:[[`ordersDay`,1],[`tradingHours`,-1],[3600,-1]]},{out:`peak`,terms:[[`avg`,1],[`peakFactor`,1]]},{out:`logDay`,terms:[[`ordersDay`,1],[`eventBytes`,1]]}],starts:[{key:`ordersDay`,value:1e9},{key:`peak`,value:2e5},{key:`logDay`,value:1e11}]},lab:{secondsPerTick:f,params:[{key:`ordersPerSec`,label:`Orders`,kind:`range`,min:10,max:2e3,step:10,unit:`per s`},{key:`marketShare`,label:`Market orders`,kind:`range`,min:0,max:.9,step:.05,format:e=>`${Math.round(e*100)}%`},{key:`cancelShare`,label:`Cancels`,kind:`range`,min:0,max:.6,step:.05,format:e=>`${Math.round(e*100)}%`},{key:`spreadCents`,label:`Where traders quote, around the mid`,kind:`range`,min:1,max:50,step:1,unit:`cents`},{key:`maxQty`,label:`Largest order`,kind:`range`,min:10,max:1e3,step:10,unit:`shares`}],defaults:{ordersPerSec:200,marketShare:.2,cancelShare:.2,spreadCents:10,maxQty:200},create(e,t){let n=new l,r={engine:n,mid:1e4,nextId:1,open:[],tradesEma:0,spreadEma:0,depthEma:0,fifoWinner:``,replayMatch:null,mine:[]};for(let i=0;i<100;i++){let a=i%2?`buy`:`sell`,o=1+t.int(e.spreadCents*3);n.handle({kind:`new`,order:{id:r.nextId,owner:`trader`,side:a,type:`limit`,price:a===`buy`?r.mid-o:r.mid+o,quantity:10+t.int(e.maxQty)}}),r.open.push(r.nextId++)}return r},step(e,t,n){e.engine.log.length>3e4&&(e.engine=new l,e.open=[]),e.mid+=n.int(3)-1;let r=e.engine.tradeCount;for(let r=n.poisson(t.ordersPerSec*f);r>0;r--){if(n.next()<t.cancelShare&&e.open.length){let t=n.int(e.open.length);e.engine.handle({kind:`cancel`,orderId:e.open[t]}),e.open[t]=e.open[e.open.length-1],e.open.pop();continue}let r=n.chance(.5)?`buy`:`sell`,i=n.chance(t.marketShare),a=1+n.int(t.spreadCents*3),o=e.nextId++;e.engine.handle({kind:`new`,order:{id:o,owner:`trader`,side:r,type:i?`market`:`limit`,price:r===`buy`?e.mid-a:e.mid+a,quantity:10+n.int(t.maxQty)}}),i||e.open.push(o)}e.open.length>5e3&&(e.open=e.open.slice(-2500));let i=e.engine.tradeCount-r;e.lastTrade=e.engine.trades[e.engine.trades.length-1],e.tradesEma=e.tradesEma*.9+i/f*.1;let{bids:a,asks:o}=e.engine,s=a.best()&&o.best()?o.best().price-a.best().price:t.spreadCents*4;e.spreadEma=e.spreadEma*.95+Math.max(0,s)*.05,e.depthEma=e.depthEma*.9+(a.depth+o.depth)*.1},sample:e=>({trades:e.tradesEma,spread:e.spreadEma,depth:e.depthEma}),charts:[{title:`Shares resting in the book`,series:[{key:`depth`,label:`Measured`,role:`measured`}]},{title:`Bid-ask spread`,unit:`cents`,series:[{key:`spread`,label:`Measured`,role:`measured`}]}],metrics(e){let{bids:t,asks:n}=e.engine;return[{label:`Best bid`,value:t.best()?p(t.best().price):`None`,role:`measured`},{label:`Best ask`,value:n.best()?p(n.best().price):`None`,role:`measured`},{label:`Trades per second`,value:a(e.tradesEma),role:`measured`},{label:`Orders in log`,value:a(e.engine.log.length),role:`measured`}]},math(e,t){let n=t.ordersPerSec*(1-t.cancelShare)*(1-t.marketShare),i=t.ordersPerSec*(1-t.cancelShare)*t.marketShare,o=10+t.maxQty/2;return[{expr:`Liquidity added: ${r(n)} limit orders/s × ${r(o)} shares`,result:`${a(n*o)} shares/s`},{expr:`Liquidity taken: ${r(i)} market orders/s × ${r(o)} shares`,result:`${a(i*o)} shares/s`,tone:i>n?`bad`:void 0},{expr:`Matching budget at ${r(t.ordersPerSec)} orders/s`,result:`${r(1e6/t.ordersPerSec)} µs per order`}]},View:m,views:e=>[{kind:`note`,title:`Last experiment you ran`,text:[e.fifoWinner&&`Time priority: the buyer was filled by ${e.fifoWinner}.`,e.sweep&&`Huge market buy: ${r(e.sweep.filled)} shares across ${e.sweep.levels} price levels, averaging ${p(e.sweep.average)} against a best price of ${p(e.sweep.best)}.`].filter(Boolean).join(` `)||`Use the actions on the left to try time priority or a huge market order.`},{kind:`log`,title:`Latest trades`,lines:e.engine.trades.slice(-5).reverse().map(e=>({text:`${e.quantity} at ${p(e.price)}`}))},{kind:`note`,title:`Determinism check`,text:e.replayMatch===null?`Replay the input log on a brand new engine and compare.`:e.replayMatch?`The replayed engine is identical to the live one, in every order and every trade.`:`The replayed engine differs from the live one.`}],actions:[{key:`fifo`,label:`Time priority test: two sellers at one price`,run:e=>{let t=new l;t.handle({kind:`new`,order:{id:1,owner:`Seller A, first`,side:`sell`,type:`limit`,price:1e4,quantity:100}}),t.handle({kind:`new`,order:{id:2,owner:`Seller B, second`,side:`sell`,type:`limit`,price:1e4,quantity:100}}),e.fifoWinner=t.handle({kind:`new`,order:{id:3,owner:`Buyer`,side:`buy`,type:`market`,price:0,quantity:50}})[0].sellOwner}},{key:`sweep`,label:`Send a huge market buy`,run:e=>{let t=e.engine.asks.best()?.price??0,n=e.engine.handle({kind:`new`,order:{id:e.nextId++,owner:`whale`,side:`buy`,type:`market`,price:0,quantity:5e3}}),r=n.reduce((e,t)=>e+t.quantity,0),i=n.reduce((e,t)=>e+t.quantity*t.price,0);e.sweep={best:t,average:r?i/r:0,levels:new Set(n.map(e=>e.price)).size,filled:r}}},{key:`replay`,label:`Replay the input log`,run:e=>{e.replayMatch=u(e.engine.log).fingerprint()===e.engine.fingerprint()}}],trace:e=>({values:{seq:a(e.engine.log.length),best:e.engine.asks.best()?p(e.engine.asks.best().price):``,fill:e.lastTrade?`${e.lastTrade.quantity} at ${p(e.lastTrade.price)}`:``}}),experiments:[{title:`Who gets filled first?`,act:[`fifo`],actAt:1,ticks:3,question:`Two sellers offer at the same price, A first and then B. A market buy for 50 shares arrives. Who sells?`,options:[`Seller A, who was first`,`Seller B`,`They split it evenly`],answer:0,explain:`At each price, orders queue in the order they arrived. It's called price-time priority, and it's why trading firms spend fortunes to be microseconds earlier. Being first in line at the best price is worth real money.`,check:e=>e.fifoWinner.startsWith(`Seller A`)},{title:`A huge market order`,set:{ordersPerSec:200,marketShare:.1,cancelShare:.1},act:[`sweep`],actAt:100,ticks:102,question:`A market buy for 5,000 shares arrives, far more than is available at the best price. What price does it pay?`,options:[`The best ask for all of it`,`Worse and worse, as it eats through price levels`],answer:1,explain:`It fills everything at the best price, then moves up to the next level, and so on. That's slippage. It's why large traders split their orders, and it's why a market order doesn't guarantee a price.`,check:e=>!!(e.sweep&&e.sweep.levels>1&&e.sweep.average>e.sweep.best)},{title:`Too many takers`,set:{marketShare:.85,cancelShare:.1,ordersPerSec:500},ticks:300,question:`If 85% of orders are market orders that take liquidity, and only 15% add it, what happens to the book?`,options:[`It stays deep`,`It drains, and the spread gets wider`],answer:1,explain:`Limit orders supply liquidity, and market orders consume it. With far more being taken than added, the book empties. Exchanges pay rebates to liquidity providers to avoid exactly this.`,check:(e,n,r)=>t(r,`depth`,60)<1500},{title:`Plenty of makers`,set:{marketShare:.1,cancelShare:.1,ordersPerSec:500},ticks:300,question:`If only 10% of orders are market orders, what happens to the book?`,options:[`It stays thin`,`It builds up, with a tight spread`],answer:1,explain:`More liquidity is added than taken, so the book gets deep and spreads stay narrow. A tight spread means trading is cheap, which attracts more traders. That's the virtuous cycle every exchange wants.`,check:(e,n,r)=>t(r,`depth`,60)>5e3},{title:`Replay the day`,set:{ordersPerSec:500},act:[`replay`],actAt:99,ticks:100,question:`You feed the exact input log into a brand-new matching engine. Does it end up the same?`,options:[`Yes, identical to the last order`,`Close, but not exact`],answer:0,explain:`The engine is deterministic: same inputs in the same order, same output. So a hot standby can follow the log and take over instantly, and any day can be replayed for audit. That's why the sequencer sits in front of everything.`,check:e=>e.replayMatch===!0}]},pseudocode:[{code:`handle(input):`},{code:`  number it and write it to the log`,id:`seq`},{code:`  while order has quantity left:`},{code:`    level = best opposite price`,id:`best`},{code:`    if order's price doesn't reach level: stop`},{code:`    maker = oldest order at that level`},{code:`    trade min(order, maker) at the maker's price`,id:`fill`},{code:`  rest what's left in the book, if it's a limit order`}],sources:[{name:`engine.ts`,code:s,lang:`ts`}],tradeoffs:[{choice:`Single-threaded matching`,gain:`Fast and deterministic, with no locks`,cost:`Limited to one core, so you shard by symbol`},{choice:`All in memory`,gain:`Microsecond latency`,cost:`Reliability has to come from the log and standbys`},{choice:`Multicast market data`,gain:`Everyone receives it at the same moment`,cost:`Unreliable delivery, so clients handle gaps`},{choice:`Colocation`,gain:`Lowest latency for traders`,cost:`Fairness concerns, which exchanges address carefully`}],interview:[{q:`How do you keep latency this low?`,a:`Remove everything between you and the work. Put critical parts on one machine, communicate through shared memory, pin threads to CPU cores, avoid garbage collection, and pre-allocate memory.`},{q:`How is it fault tolerant with a single thread?`,a:`The log is the state. Standbys replay it, and one takes over on failure. Because matching is deterministic, all replicas are guaranteed to be identical.`},{q:`How do you ensure fairness in market data?`,a:`Multicast delivers to all subscribers at once, with sequence numbers and a retransmit channel for gaps. Exchanges sometimes equalize cable lengths in colocation, so that no one gets data sooner because of their rack position.`},{q:`How do you scale past one core?`,a:`Shard by symbol: each stock gets its own matching engine and order book. Since orders for different stocks don't interact, this splits the load cleanly.`}],mistakes:[`Designing it like a normal web service, with many network hops.`,`Using locks across threads in the matching path.`,`Using floating point for prices.`]};export{h as default};