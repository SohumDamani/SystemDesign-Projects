// Block-level sync on real bytes: split a file, hash each block, upload only what's new.
import type { Rng } from '../../core/rng';

export interface Block {
  start: number;
  length: number;
  hash: string;
}

/** A 64-bit hash built from two 32-bit FNV runs. A real system would use SHA-256. */
export function hashBytes(data: Uint8Array, start: number, end: number): string {
  let a = 0x811c9dc5;
  let b = 0xcbf29ce4;
  for (let i = start; i < end; i++) {
    a = Math.imul(a ^ data[i], 0x01000193);
    b = Math.imul(b ^ data[i], 0x100001b3);
  }
  return (a >>> 0).toString(16) + (b >>> 0).toString(16);
}

/** Cut at every fixed offset. Simple, but one inserted byte shifts every later block. */
export function fixedChunks(data: Uint8Array, size: number): Block[] {
  const blocks: Block[] = [];
  for (let start = 0; start < data.length; start += size) {
    const end = Math.min(start + size, data.length);
    blocks.push({ start, length: end - start, hash: hashBytes(data, start, end) });
  }
  return blocks;
}

const GEAR = (() => {
  // A fixed table of random numbers, so everyone cuts at the same content.
  const table = new Uint32Array(256);
  let x = 0x9e3779b9;
  for (let i = 0; i < 256; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    table[i] = x >>> 0;
  }
  return table;
})();

/**
 * Cut where a rolling hash of recent bytes hits a pattern. Boundaries now depend on the
 * content rather than the offset, so an insert only affects the blocks next to it.
 */
export function contentDefinedChunks(data: Uint8Array, average: number): Block[] {
  const bits = Math.max(1, Math.round(Math.log2(average)));
  const mask = ((1 << bits) - 1) << (32 - bits);
  const min = average >> 2;
  const max = average * 4;
  const blocks: Block[] = [];
  let start = 0;
  let h = 0;
  for (let i = 0; i < data.length; i++) {
    h = ((h << 1) + GEAR[data[i]]) | 0;
    const length = i - start + 1;
    if ((length >= min && (h & mask) === 0) || length >= max) {
      blocks.push({ start, length, hash: hashBytes(data, start, i + 1) });
      start = i + 1;
      h = 0;
    }
  }
  if (start < data.length) blocks.push({ start, length: data.length - start, hash: hashBytes(data, start, data.length) });
  return blocks;
}

/** Storage keeps one copy of each block, found by its hash. */
export class BlockStore {
  private hashes = new Set<string>();
  storedBytes = 0;

  /** Uploads only unknown blocks, and returns the bytes that crossed the network. */
  sync(blocks: Block[]): { uploaded: number; newBlocks: Set<string> } {
    let uploaded = 0;
    const newBlocks = new Set<string>();
    for (const block of blocks) {
      if (!this.hashes.has(block.hash)) {
        this.hashes.add(block.hash);
        uploaded += block.length;
        this.storedBytes += block.length;
        newBlocks.add(block.hash);
      }
    }
    return { uploaded, newBlocks };
  }
}

export function randomFile(size: number, rng: Rng): Uint8Array {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) data[i] = rng.int(256);
  return data;
}

export function overwrite(data: Uint8Array, at: number, length: number, rng: Rng): Uint8Array {
  const out = data.slice();
  for (let i = 0; i < length && at + i < out.length; i++) out[at + i] = rng.int(256);
  return out;
}

export function insert(data: Uint8Array, at: number, length: number, rng: Rng): Uint8Array {
  const out = new Uint8Array(data.length + length);
  out.set(data.subarray(0, at));
  for (let i = 0; i < length; i++) out[at + i] = rng.int(256);
  out.set(data.subarray(at), at + length);
  return out;
}

export const removeBytes = (data: Uint8Array, length: number): Uint8Array => data.slice(0, Math.max(0, data.length - length));
