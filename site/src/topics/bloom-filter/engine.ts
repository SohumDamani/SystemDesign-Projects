// A real Bloom filter: a bit array and k hash functions, in a few lines.
function fnv(text: string, seed: number): number {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

export class BloomFilter {
  readonly bits: Uint8Array;
  setBits = 0;
  inserted = 0;

  constructor(readonly size: number, readonly hashes: number) {
    this.bits = new Uint8Array(Math.ceil(size / 8));
  }

  /** Two real hashes can stand in for k independent ones, which saves a lot of computing. */
  positions(item: string): number[] {
    const a = fnv(item, 0x12345);
    const b = fnv(item, 0x9e3779b9) | 1;
    return Array.from({ length: this.hashes }, (_, i) => ((a + Math.imul(i, b)) >>> 0) % this.size);
  }

  add(item: string) {
    for (const p of this.positions(item)) {
      if (!this.isSet(p)) {
        this.bits[p >> 3] |= 1 << (p & 7);
        this.setBits++;
      }
    }
    this.inserted++;
  }

  isSet(position: number): boolean {
    return (this.bits[position >> 3] & (1 << (position & 7))) !== 0;
  }

  /** False means definitely not added. True means probably added. */
  mightContain(item: string): boolean {
    return this.positions(item).every((p) => this.isSet(p));
  }
}

/** (1 − e^(−kn/m))^k: the chance all k bits of a new item are already set. */
export function falsePositiveRate(bits: number, hashes: number, items: number): number {
  return Math.pow(1 - Math.exp((-hashes * items) / bits), hashes);
}

export const bestHashCount = (bitsPerItem: number) => Math.max(1, Math.round(bitsPerItem * Math.LN2));
