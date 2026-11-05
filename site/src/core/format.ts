const trim = (x: number, digits = 2) => {
  const s = x.toFixed(digits);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
};

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** 1,234 / 12.3k / 4.5M / 7.8bn */
export function fmtCount(n: number): string {
  if (!Number.isFinite(n)) return 'n/a';
  const a = Math.abs(n);
  if (a >= 1e12) return trim(n / 1e12) + 'tn';
  if (a >= 1e9) return trim(n / 1e9) + 'bn';
  if (a >= 1e6) return trim(n / 1e6) + 'M';
  if (a >= 1e4) return trim(n / 1e3, 1) + 'k';
  if (a >= 100) return fmtInt(n);
  if (a >= 1 || a === 0) return trim(n, 1);
  return trim(n, 3);
}

/** Decimal units, which is what back-of-the-envelope math uses. */
export function fmtBytes(b: number): string {
  if (!Number.isFinite(b)) return 'n/a';
  const a = Math.abs(b);
  if (a >= 1e18) return trim(b / 1e18) + ' EB';
  if (a >= 1e15) return trim(b / 1e15) + ' PB';
  if (a >= 1e12) return trim(b / 1e12) + ' TB';
  if (a >= 1e9) return trim(b / 1e9) + ' GB';
  if (a >= 1e6) return trim(b / 1e6) + ' MB';
  if (a >= 1e3) return trim(b / 1e3) + ' KB';
  return fmtInt(b) + ' B';
}

export function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'forever';
  const a = Math.abs(seconds);
  if (a < 0.001) return trim(seconds * 1e6, 0) + ' µs';
  if (a < 1) return trim(seconds * 1000, 1) + ' ms';
  if (a < 120) return trim(seconds, 1) + ' s';
  if (a < 7200) return trim(seconds / 60, 1) + ' min';
  if (a < 172800) return trim(seconds / 3600, 1) + ' h';
  if (a < 63072000) return trim(seconds / 86400, 1) + ' days';
  return trim(seconds / 31536000, 1) + ' years';
}

export function fmtPct(fraction: number, digits = 0): string {
  if (!Number.isFinite(fraction)) return 'n/a';
  return trim(fraction * 100, digits) + '%';
}

export function signed(n: number): string {
  const r = Math.round(n);
  if (r > 0) return '+' + fmtInt(r);
  if (r < 0) return '−' + fmtInt(-r);
  return '0';
}

const MULT: Record<string, number> = {
  '': 1, k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, t: 1e12, tn: 1e12, trillion: 1e12,
};
const BYTES: Record<string, number> = {
  b: 1, byte: 1, bytes: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, pb: 1e15, eb: 1e18,
};

/** Reads what people type: "10M", "2.5 billion", "5 TB", "1,200". Null when it can't. */
export function parseHuman(raw: string, unit: 'bytes' | 'number' = 'number'): number | null {
  const m = raw.trim().replace(/,/g, '').match(/^(-?\d*\.?\d+)\s*([a-zA-Z]*)$/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const u = m[2].toLowerCase();
  if (unit === 'bytes' && u in BYTES) return v * BYTES[u];
  if (u in MULT) return v * MULT[u];
  if (u in BYTES) return v * BYTES[u];
  return null;
}
