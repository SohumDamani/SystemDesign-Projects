// Real Reed-Solomon erasure coding over GF(256): split data, add parity, rebuild after loss.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function buildTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // the field's reduction polynomial
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
const inv = (a: number) => {
  if (a === 0) throw new Error('Division by zero in GF(256)');
  return EXP[255 - LOG[a]];
};

/** An encoding matrix: identity on top, Cauchy below, so any k rows can be inverted. */
function encodingMatrix(k: number, m: number): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i < k; i++) rows.push(Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)));
  for (let i = 0; i < m; i++) rows.push(Array.from({ length: k }, (_, j) => inv((k + i) ^ j)));
  return rows;
}

/** Gauss-Jordan elimination, using GF(256) arithmetic. */
function invert(matrix: number[][]): number[][] {
  const n = matrix.length;
  const a = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    while (pivot < n && a[pivot][col] === 0) pivot++;
    if (pivot === n) throw new Error('Matrix is not invertible');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const scale = inv(a[col][col]);
    for (let j = 0; j < 2 * n; j++) a[col][j] = mul(a[col][j], scale);
    for (let row = 0; row < n; row++) {
      if (row === col || a[row][col] === 0) continue;
      const f = a[row][col];
      for (let j = 0; j < 2 * n; j++) a[row][j] ^= mul(f, a[col][j]);
    }
  }
  return a.map((row) => row.slice(n));
}

export interface Encoded {
  k: number;
  m: number;
  length: number; // original byte length
  shards: Uint8Array[];
}

/** Splits data into k shards, and computes m parity shards from them. */
export function encode(data: Uint8Array, k: number, m: number): Encoded {
  const shardSize = Math.max(1, Math.ceil(data.length / k));
  const matrix = encodingMatrix(k, m);
  const shards = Array.from({ length: k + m }, () => new Uint8Array(shardSize));
  for (let i = 0; i < data.length; i++) shards[Math.floor(i / shardSize)][i % shardSize] = data[i];
  for (let p = 0; p < m; p++) {
    for (let d = 0; d < k; d++) {
      const f = matrix[k + p][d];
      for (let b = 0; b < shardSize; b++) shards[k + p][b] ^= mul(f, shards[d][b]);
    }
  }
  return { k, m, length: data.length, shards };
}

/** Rebuilds the original from any k surviving shards. Returns null with fewer than k. */
export function decode(enc: Encoded, alive: boolean[]): Uint8Array | null {
  const { k, m, shards, length } = enc;
  const usable = alive.map((a, i) => (a ? i : -1)).filter((i) => i >= 0).slice(0, k);
  if (usable.length < k) return null;
  const matrix = encodingMatrix(k, m);
  const decoder = invert(usable.map((i) => matrix[i]));
  const size = shards[0].length;
  const out = new Uint8Array(length);
  for (let d = 0; d < k; d++) {
    const piece = new Uint8Array(size);
    usable.forEach((shardIndex, col) => {
      const f = decoder[d][col];
      if (!f) return;
      for (let b = 0; b < size; b++) piece[b] ^= mul(f, shards[shardIndex][b]);
    });
    for (let b = 0; b < size && d * size + b < length; b++) out[d * size + b] = piece[b];
  }
  return out;
}

/** A group of disks holding one object's shards. It's lost once too many fail before repair. */
export interface DiskGroup {
  failedUntil: number[]; // repair finish time per disk, 0 when healthy
  lost: boolean;
}

export function failuresNow(group: DiskGroup, now: number): number {
  return group.failedUntil.filter((t) => t > now).length;
}
