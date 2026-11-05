// A Snowflake-style ID generator: a 64-bit number built from time, machine and a counter.
export interface Layout {
  timestampBits: number;
  machineBits: number;
  sequenceBits: number;
}

export function makeLayout(machineBits: number, sequenceBits: number): Layout {
  // One bit is reserved for the sign, leaving 63 to divide up.
  return { timestampBits: 63 - machineBits - sequenceBits, machineBits, sequenceBits };
}

export function compose(l: Layout, timestampMs: number, machine: number, sequence: number): bigint {
  return (BigInt(timestampMs) << BigInt(l.machineBits + l.sequenceBits)) | (BigInt(machine) << BigInt(l.sequenceBits)) | BigInt(sequence);
}

export function decompose(l: Layout, id: bigint) {
  const sequence = id & ((1n << BigInt(l.sequenceBits)) - 1n);
  const machine = (id >> BigInt(l.sequenceBits)) & ((1n << BigInt(l.machineBits)) - 1n);
  const timestamp = id >> BigInt(l.machineBits + l.sequenceBits);
  return { timestamp, machine, sequence };
}

/** How long until the timestamp bits run out. */
export function lifetimeYears(l: Layout): number {
  return 2 ** l.timestampBits / (1000 * 60 * 60 * 24 * 365.25);
}

export type NextResult = { kind: 'ok'; timestampMs: number; sequence: number } | { kind: 'overflow' } | { kind: 'clock-moved-back' };

export class Generator {
  private lastMs = -1;
  private sequence = 0;
  constructor(public readonly machine: number, private layout: Layout, private refuseBackwardClock: boolean) {}

  next(nowMs: number): NextResult {
    if (nowMs < this.lastMs && this.refuseBackwardClock) return { kind: 'clock-moved-back' };
    if (nowMs === this.lastMs) {
      const mask = 2 ** this.layout.sequenceBits - 1;
      if (this.sequence >= mask) return { kind: 'overflow' }; // used every ID in this millisecond
      this.sequence++;
    } else {
      this.sequence = 0;
    }
    this.lastMs = nowMs;
    return { kind: 'ok', timestampMs: nowMs, sequence: this.sequence };
  }
}
