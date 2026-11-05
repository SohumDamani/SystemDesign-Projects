// A social graph with real feeds, and the three ways of getting posts into them.
import { Rng, zipfSampler } from '../../core/rng';

export type Strategy = 'write' | 'read' | 'hybrid';

export interface Post {
  id: number;
  author: number;
  at: number;
}

export interface Network {
  followers: number[][]; // who follows this user
  following: number[][]; // who this user follows
  timelines: Post[][]; // each user's own recent posts
  feeds: Post[][]; // precomputed home feeds
}

const FEED_LENGTH = 50;

/** Popularity follows a power law, so user 0 is a celebrity and most users have few followers. */
export function buildNetwork(users: number, averageFollows: number, rng: Rng): Network {
  const sample = zipfSampler(users, 1);
  const followers: number[][] = Array.from({ length: users }, () => []);
  const following: number[][] = Array.from({ length: users }, () => []);
  for (let u = 0; u < users; u++) {
    const chosen = new Set<number>();
    for (let i = 0; i < averageFollows; i++) {
      const target = sample(rng);
      if (target !== u) chosen.add(target);
    }
    for (const t of chosen) {
      following[u].push(t);
      followers[t].push(u);
    }
  }
  return { followers, following, timelines: Array.from({ length: users }, () => []), feeds: Array.from({ length: users }, () => []) };
}

export const isCelebrity = (n: Network, user: number, threshold: number) => n.followers[user].length >= threshold;

export interface FanoutJob {
  follower: number;
  post: Post;
}

/** Writes the post to the author's timeline, and returns the feed writes it still needs. */
export function publish(n: Network, post: Post, strategy: Strategy, threshold: number): FanoutJob[] {
  n.timelines[post.author].unshift(post);
  if (n.timelines[post.author].length > FEED_LENGTH) n.timelines[post.author].pop();
  if (strategy === 'read') return [];
  if (strategy === 'hybrid' && isCelebrity(n, post.author, threshold)) return [];
  return n.followers[post.author].map((follower) => ({ follower, post }));
}

export function applyFanout(n: Network, job: FanoutJob) {
  const feed = n.feeds[job.follower];
  feed.unshift(job.post);
  if (feed.length > FEED_LENGTH) feed.pop();
}

export interface FeedResult {
  posts: Post[];
  /** Cache or database reads this took. */
  reads: number;
}

/** Builds a user's feed, and counts the reads it costs under each strategy. */
export function readFeed(n: Network, user: number, strategy: Strategy, threshold: number): FeedResult {
  if (strategy === 'write') return { posts: n.feeds[user], reads: 1 };
  const sources = strategy === 'read' ? n.following[user] : n.following[user].filter((f) => isCelebrity(n, f, threshold));
  const merged: Post[] = strategy === 'hybrid' ? [...n.feeds[user]] : [];
  for (const followee of sources) merged.push(...n.timelines[followee].slice(0, 10));
  merged.sort((a, b) => b.at - a.at);
  return { posts: merged.slice(0, FEED_LENGTH), reads: sources.length + (strategy === 'hybrid' ? 1 : 0) };
}
