// News spreading with no coordinator, and finding differences between replicas cheaply.
import { hash32 } from '../consistent-hashing/engine';
import type { Rng } from '../../core/rng';

/** One round of gossip. Everyone who knows the news tells `fanout` random peers. */
export function gossipRound(informed: Uint8Array, count: number, fanout: number, lossRate: number, rng: Rng): { newlyInformed: number; messages: number } {
  const n = informed.length;
  const newly: number[] = [];
  let messages = 0;
  for (let i = 0; i < n; i++) {
    if (!informed[i]) continue;
    for (let f = 0; f < fanout; f++) {
      messages++;
      if (rng.chance(lossRate)) continue; // the message got lost
      const peer = rng.int(n);
      if (!informed[peer]) newly.push(peer);
    }
  }
  let added = 0;
  for (const peer of newly) {
    if (!informed[peer]) {
      informed[peer] = 1;
      added++;
    }
  }
  return { newlyInformed: added, messages: count ? messages : 0 };
}

/** The textbook estimate of how many nodes will know after one more round. */
export function predictNextRound(informed: number, n: number, fanout: number, lossRate: number): number {
  const reach = fanout * (1 - lossRate);
  return n - (n - informed) * Math.exp((-reach * informed) / n);
}

/** Replicas compare hashes from the top down, and only descend where they differ. */
export class MerkleTree {
  levels: number[][]; // levels[0] is the leaves, the last level is the root

  constructor(leaves: number[]) {
    this.levels = [leaves.map((v, i) => hash32(`${i}:${v}`))];
    while (this.levels[this.levels.length - 1].length > 1) {
      const below = this.levels[this.levels.length - 1];
      const level: number[] = [];
      for (let i = 0; i < below.length; i += 2) level.push(hash32(`${below[i]}:${below[i + 1] ?? 0}`));
      this.levels.push(level);
    }
  }
}

/** Walks two trees, and returns the differing leaves and how many hashes had to be compared. */
export function diffTrees(a: MerkleTree, b: MerkleTree): { differing: number[]; comparisons: number } {
  let comparisons = 0;
  const differing: number[] = [];
  const walk = (level: number, index: number) => {
    comparisons++;
    if (a.levels[level][index] === b.levels[level][index]) return;
    if (level === 0) {
      differing.push(index);
      return;
    }
    walk(level - 1, index * 2);
    if (index * 2 + 1 < a.levels[level - 1].length) walk(level - 1, index * 2 + 1);
  };
  walk(a.levels.length - 1, 0);
  return { differing, comparisons };
}
