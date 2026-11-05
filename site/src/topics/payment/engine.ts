// A payment service, a payment provider that times out, a double-entry ledger, and reconciliation.
import type { Rng } from '../../core/rng';

export interface ProviderBehavior {
  requestLoss: number; // the request never arrives, so no charge happens
  responseLoss: number; // the charge happens, but the reply never arrives
}

/** The outside provider. It's the source of truth about what was really charged. */
export class Provider {
  charges: { orderId: number; amount: number; key: string }[] = [];
  /** Running totals, so reading them costs nothing however long the lab runs. */
  chargeCount = 0;
  doubled = 0;
  private perOrder = new Map<number, number>();

  timesCharged(orderId: number) {
    return this.perOrder.get(orderId) ?? 0;
  }
  private seenKeys = new Set<string>();

  /** With an idempotency key, a repeat is recognized and not charged again. */
  charge(orderId: number, amount: number, key: string, honorKey: boolean, behavior: ProviderBehavior, rng: Rng): 'ok' | 'timeout' {
    if (rng.chance(behavior.requestLoss)) return 'timeout';
    if (!honorKey || !this.seenKeys.has(key)) {
      this.charges.push({ orderId, amount, key });
      this.chargeCount++;
      const times = (this.perOrder.get(orderId) ?? 0) + 1;
      this.perOrder.set(orderId, times);
      if (times === 2) this.doubled++;
      this.seenKeys.add(key);
    }
    if (rng.chance(behavior.responseLoss)) return 'timeout';
    return 'ok';
  }
}

export interface LedgerEntry {
  orderId: number;
  account: string;
  debit: number;
  credit: number;
}

/** Double-entry: every movement writes two sides, so debits always equal credits. */
export class Ledger {
  entries: LedgerEntry[] = [];

  record(orderId: number, amount: number, from = 'customer', to = 'merchant') {
    this.debitTotal += amount;
    this.creditTotal += amount;
    this.entries.push({ orderId, account: from, debit: amount, credit: 0 });
    this.entries.push({ orderId, account: to, debit: 0, credit: amount });
  }

  debitTotal = 0;
  creditTotal = 0;

  get totals() {
    return { debit: this.debitTotal, credit: this.creditTotal };
  }
}

export interface PayResult {
  status: 'paid' | 'unknown';
  attempts: number;
}

/** Calls the provider, retrying on timeout. The key stays the same across all retries. */
export function pay(provider: Provider, ledger: Ledger, orderId: number, amount: number, retries: number, useKey: boolean, behavior: ProviderBehavior, rng: Rng): PayResult {
  const key = `order-${orderId}`;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    if (provider.charge(orderId, amount, key, useKey, behavior, rng) === 'ok') {
      ledger.record(orderId, amount);
      return { status: 'paid', attempts: attempt };
    }
  }
  // A timeout doesn't mean failure. It means we don't know.
  return { status: 'unknown', attempts: retries + 1 };
}

export interface Reconciliation {
  chargedButNotRecorded: number[];
  chargedTwice: number[];
}

/** Compares the provider's statement with our books, line by line. */
export function reconcile(provider: Provider, ledger: Ledger): Reconciliation {
  const counts = new Map<number, number>();
  for (const c of provider.charges) counts.set(c.orderId, (counts.get(c.orderId) ?? 0) + 1);
  const recorded = new Set(ledger.entries.map((e) => e.orderId));
  const chargedButNotRecorded: number[] = [];
  const chargedTwice: number[] = [];
  for (const [orderId, n] of counts) {
    if (!recorded.has(orderId)) chargedButNotRecorded.push(orderId);
    if (n > 1) chargedTwice.push(orderId);
  }
  return { chargedButNotRecorded, chargedTwice };
}
