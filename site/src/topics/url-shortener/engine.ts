// Two real ways to make a short code, a real store, and a real LRU cache for lookups.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function toBase62(value: number): string {
  if (value === 0) return ALPHABET[0];
  let out = '';
  let n = value;
  while (n > 0) {
    out = ALPHABET[n % 62] + out;
    n = Math.floor(n / 62);
  }
  return out;
}

/** A 53-bit string hash (cyrb53). Salting lets us retry after a collision. */
export function hash53(text: string, salt = 0): number {
  let h1 = 0xdeadbeef ^ salt;
  let h2 = 0x41c6ce57 ^ salt;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function hashCode(url: string, length: number, salt: number): string {
  return toBase62(hash53(url, salt) % 62 ** length).padStart(length, '0');
}

export type Method = 'counter' | 'hash';

export interface Shortened {
  code: string;
  url: string;
  collisions: number;
  method: Method;
  id?: number;
}

export class Shortener {
  private byCode = new Map<string, string>();
  private byUrl = new Map<string, string>();
  private nextId = 1;
  collisions = 0;

  get size() {
    return this.byCode.size;
  }

  shorten(url: string, method: Method, length: number): Shortened {
    const existing = this.byUrl.get(url);
    if (existing) return { code: existing, url, collisions: 0, method };
    if (method === 'counter') {
      // A unique ID always makes a unique code, so collisions can't happen.
      const id = this.nextId++;
      const code = toBase62(id);
      this.save(code, url);
      return { code, url, collisions: 0, method, id };
    }
    // Hash, then keep re-salting until the code is free.
    let salt = 0;
    let code = hashCode(url, length, salt);
    while (this.byCode.has(code)) {
      salt++;
      this.collisions++;
      code = hashCode(url, length, salt);
    }
    this.save(code, url);
    return { code, url, collisions: salt, method };
  }

  private save(code: string, url: string) {
    this.byCode.set(code, url);
    this.byUrl.set(url, code);
  }

  resolve(code: string): string | undefined {
    return this.byCode.get(code);
  }
}

/** A Map remembers insertion order, so its first key is the least recently used. */
export class LruCache {
  private map = new Map<number, true>();
  constructor(private capacity: number) {}

  /** Returns true on a hit. A miss loads the key, as a real read path would. */
  access(key: number): boolean {
    if (this.map.delete(key)) {
      this.map.set(key, true);
      return true;
    }
    if (this.map.size >= this.capacity) this.map.delete(this.map.keys().next().value!);
    this.map.set(key, true);
    return false;
  }
}
