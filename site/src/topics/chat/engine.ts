// Message ordering, sync after reconnecting, and presence from heartbeats.
import type { Rng } from '../../core/rng';

export interface Message {
  seq: number; // assigned once by the server, so everyone agrees on the order
  from: number;
  clientTime: number; // the sender's clock, which can be wrong
}

export interface Member {
  id: number;
  connected: boolean;
  server: number;
  reconnectAt: number;
  cursor: number; // highest seq this device has received
  lastBeatSent: number;
  lastBeatSeen: number;
}

export class Channel {
  messages: Message[] = [];
  private nextSeq = 1;

  /** The server stamps the order. Clients don't get a say. */
  append(from: number, clientTime: number): Message {
    const message = { seq: this.nextSeq++, from, clientTime };
    this.messages.push(message);
    return message;
  }

  /** Everything this device missed. It only needs to remember one number to ask for it. */
  since(cursor: number): Message[] {
    return this.messages.slice(cursor);
  }

  get latestSeq() {
    return this.nextSeq - 1;
  }
}

export function deliverLive(member: Member, message: Message) {
  if (message.seq === member.cursor + 1) member.cursor = message.seq;
}

/** Fetches what's missing after a reconnect. Returns how many messages were caught up. */
export function sync(member: Member, channel: Channel): number {
  const missed = channel.since(member.cursor);
  if (missed.length) member.cursor = missed[missed.length - 1].seq;
  return missed.length;
}

/** Sends a heartbeat when one is due. The network may lose it. */
export function heartbeat(member: Member, now: number, interval: number, lossRate: number, rng: Rng) {
  if (now - member.lastBeatSent < interval) return;
  member.lastBeatSent = now;
  if (member.connected && !rng.chance(lossRate)) member.lastBeatSeen = now;
}

/** A user counts as online if a heartbeat arrived recently. It's only ever an inference. */
export function isOnline(member: Member, now: number, timeout: number): boolean {
  return now - member.lastBeatSeen <= timeout;
}
