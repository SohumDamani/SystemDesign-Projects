// Seats with expiring holds, and a waiting room in front of a limited database.
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
