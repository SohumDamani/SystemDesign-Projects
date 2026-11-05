// A real price-time priority matching engine, driven by a sequenced log of inputs.
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
    const side = (s: BookSide) => s.levels.map((l) => `${l.price}:${l.queue.map((o) => `${o.id}/${o.quantity}`).join(',')}`).join('|');
    return `${side(this.bids)}#${side(this.asks)}#${this.tradeCount}`;
  }
}

/** Determinism: the same inputs in the same order always give the same state. */
export function replay(log: Input[]): MatchingEngine {
  const engine = new MatchingEngine();
  for (const input of log) engine.handle(input);
  return engine;
}
