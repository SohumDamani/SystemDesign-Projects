// Moving money between accounts on different shards, three ways, plus a replayable event log.
import type { Rng } from '../../core/rng';

export type Mode = 'naive' | 'two-phase' | 'saga';

export interface WalletEvent {
  kind: 'debit' | 'credit';
  account: number;
  amount: number;
}

export interface Wallets {
  balances: number[];
  locked: Set<number>; // accounts held by an unfinished two-phase commit
  log: WalletEvent[];
  inDoubt: { from: number; to: number; amount: number; recoverAt: number }[];
  compensations: { account: number; amount: number; at: number }[];
}

export function createWallets(accounts: number, startingBalance: number): Wallets {
  return { balances: Array(accounts).fill(startingBalance), locked: new Set(), log: [], inDoubt: [], compensations: [] };
}

function apply(w: Wallets, event: WalletEvent) {
  w.log.push(event);
  w.balances[event.account] += event.kind === 'credit' ? event.amount : -event.amount;
}

export type TransferOutcome = 'done' | 'no-funds' | 'blocked' | 'crashed';

/**
 * Two separate writes with nothing tying them together. A crash between
 * them removes the money from one account without ever adding it to the other.
 */
export function transferNaive(w: Wallets, from: number, to: number, amount: number, crash: boolean): TransferOutcome {
  if (w.balances[from] < amount) return 'no-funds';
  apply(w, { kind: 'debit', account: from, amount });
  if (crash) return 'crashed';
  apply(w, { kind: 'credit', account: to, amount });
  return 'done';
}

/**
 * Prepare both sides, then commit. No money is lost in a crash, but both accounts stay
 * locked until the coordinator recovers, and anything touching them has to wait.
 */
export function transferTwoPhase(w: Wallets, from: number, to: number, amount: number, crash: boolean, now: number, recoverySeconds: number): TransferOutcome {
  if (w.locked.has(from) || w.locked.has(to)) return 'blocked';
  if (w.balances[from] < amount) return 'no-funds';
  w.locked.add(from);
  w.locked.add(to);
  if (crash) {
    w.inDoubt.push({ from, to, amount, recoverAt: now + recoverySeconds });
    return 'crashed';
  }
  apply(w, { kind: 'debit', account: from, amount });
  apply(w, { kind: 'credit', account: to, amount });
  w.locked.delete(from);
  w.locked.delete(to);
  return 'done';
}

export function recoverCoordinator(w: Wallets, now: number) {
  w.inDoubt = w.inDoubt.filter((t) => {
    if (t.recoverAt > now) return true;
    apply(w, { kind: 'debit', account: t.from, amount: t.amount });
    apply(w, { kind: 'credit', account: t.to, amount: t.amount });
    w.locked.delete(t.from);
    w.locked.delete(t.to);
    return false;
  });
}

/**
 * No locks. Each step commits on its own. If a later step fails, a compensating
 * transaction undoes the earlier one. Others can see the in-between state.
 */
export function transferSaga(w: Wallets, from: number, to: number, amount: number, crash: boolean, now: number, recoverySeconds: number): TransferOutcome {
  if (w.balances[from] < amount) return 'no-funds';
  apply(w, { kind: 'debit', account: from, amount });
  if (crash) {
    w.compensations.push({ account: from, amount, at: now + recoverySeconds });
    return 'crashed';
  }
  apply(w, { kind: 'credit', account: to, amount });
  return 'done';
}

export function runCompensations(w: Wallets, now: number): number {
  let ran = 0;
  w.compensations = w.compensations.filter((c) => {
    if (c.at > now) return true;
    apply(w, { kind: 'credit', account: c.account, amount: c.amount });
    ran++;
    return false;
  });
  return ran;
}

/** Event sourcing: the log is the truth, and balances can be rebuilt from it at any time. */
export function replay(log: WalletEvent[], accounts: number, startingBalance: number): number[] {
  const balances = Array(accounts).fill(startingBalance);
  for (const e of log) balances[e.account] += e.kind === 'credit' ? e.amount : -e.amount;
  return balances;
}

export const pickAccount = (accounts: number, rng: Rng) => rng.int(accounts);
