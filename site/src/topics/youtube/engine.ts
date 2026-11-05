// The video player's adaptive bitrate logic, and an LRU cache standing in for a CDN edge.
export const RENDITIONS = [
  { name: '240p', mbps: 0.4 },
  { name: '360p', mbps: 0.75 },
  { name: '480p', mbps: 1.5 },
  { name: '720p', mbps: 3 },
  { name: '1080p', mbps: 5 },
  { name: '4K', mbps: 16 },
];

export const CHUNK_SECONDS = 4;
export const MAX_BUFFER_SECONDS = 30;
const LOW_BUFFER_SECONDS = 8;
const SAFETY = 0.8;

export type Mode = 'adaptive' | 'fixed';

export interface Player {
  buffer: number; // seconds of video downloaded but not yet watched
  estimate: number; // Mbps, a smoothed estimate of download speed
  current: number; // index into RENDITIONS of the chunk being fetched
  chunkLeftMb: number; // megabits still to download
  downloadTime: number;
  chunkMb: number;
  watched: number;
  stalled: number;
  bitrateSeconds: number;
  switches: number;
  lowest: number;
}

export function createPlayer(): Player {
  return { buffer: 0, estimate: 1.5, current: 2, chunkLeftMb: 0, downloadTime: 0, chunkMb: 0, watched: 0, stalled: 0, bitrateSeconds: 0, switches: 0, lowest: RENDITIONS.length - 1 };
}

/** Pick the best quality the connection can sustain, with a margin. Be more careful when the buffer is low. */
export function chooseRendition(p: Player): number {
  const margin = p.buffer < LOW_BUFFER_SECONDS ? SAFETY * 0.7 : SAFETY;
  let best = 0;
  RENDITIONS.forEach((r, i) => {
    if (r.mbps <= p.estimate * margin) best = i;
  });
  return best;
}

/** Advances the player by dt seconds on a connection of `bandwidth` Mbps. */
export function advancePlayer(p: Player, bandwidth: number, dt: number, mode: Mode, fixedIndex: number) {
  // Download.
  if (p.chunkLeftMb <= 0 && p.buffer + CHUNK_SECONDS <= MAX_BUFFER_SECONDS) {
    const next = mode === 'adaptive' ? chooseRendition(p) : fixedIndex;
    if (next !== p.current) p.switches++;
    p.current = next;
    p.lowest = Math.min(p.lowest, next);
    p.chunkMb = RENDITIONS[next].mbps * CHUNK_SECONDS;
    p.chunkLeftMb = p.chunkMb;
    p.downloadTime = 0;
  }
  if (p.chunkLeftMb > 0) {
    p.chunkLeftMb -= bandwidth * dt;
    p.downloadTime += dt;
    if (p.chunkLeftMb <= 0) {
      p.buffer += CHUNK_SECONDS;
      p.chunkLeftMb = 0;
      // Learn real throughput from how long the chunk actually took.
      p.estimate = p.estimate * 0.6 + (p.chunkMb / p.downloadTime) * 0.4;
    }
  }
  // Play.
  if (p.buffer >= dt) {
    p.buffer -= dt;
    p.watched += dt;
    p.bitrateSeconds += RENDITIONS[p.current].mbps * dt;
  } else {
    p.stalled += dt;
  }
}

/** A CDN edge. A hit is served nearby at low cost. A miss must come from origin. */
export class Edge {
  private map = new Map<number, true>();
  constructor(private capacity: number) {}

  request(video: number): boolean {
    if (this.map.delete(video)) {
      this.map.set(video, true);
      return true;
    }
    if (this.map.size >= this.capacity) this.map.delete(this.map.keys().next().value!);
    this.map.set(video, true);
    return false;
  }
}
