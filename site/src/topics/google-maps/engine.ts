// Real shortest-path search on a road graph: Dijkstra, and A* with an adjustable heuristic.
import type { Rng } from '../../core/rng';

export interface Edge {
  to: number;
  meters: number;
  speed: number; // meters per second, free flowing
  traffic: number; // travel-time multiplier, 1 when clear
}

export interface RoadGraph {
  width: number;
  height: number;
  edges: Edge[][];
  xs: Float64Array;
  ys: Float64Array;
  maxSpeed: number;
}

export const edgeTime = (e: Edge) => (e.meters / e.speed) * e.traffic;

/** A street grid with fast arterial roads every few blocks. */
export function buildGraph(width: number, height: number, rng: Rng): RoadGraph {
  const n = width * height;
  const edges: Edge[][] = Array.from({ length: n }, () => []);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const BLOCK = 200;
  let maxSpeed = 0;
  const id = (x: number, y: number) => y * width + x;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      xs[id(x, y)] = x * BLOCK + rng.range(-30, 30);
      ys[id(x, y)] = y * BLOCK + rng.range(-30, 30);
    }
  }
  const connect = (a: number, b: number, speed: number) => {
    const meters = Math.hypot(xs[a] - xs[b], ys[a] - ys[b]);
    edges[a].push({ to: b, meters, speed, traffic: 1 });
    edges[b].push({ to: a, meters, speed, traffic: 1 });
    maxSpeed = Math.max(maxSpeed, speed);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x + 1 < width) connect(id(x, y), id(x + 1, y), y % 6 === 0 ? 25 : rng.range(8, 14));
      if (y + 1 < height) connect(id(x, y), id(x, y + 1), x % 6 === 0 ? 25 : rng.range(8, 14));
    }
  }
  return { width, height, edges, xs, ys, maxSpeed };
}

/** A minimal binary heap, ordered by priority. */
class Heap {
  private items: { node: number; priority: number }[] = [];

  get size() {
    return this.items.length;
  }

  push(node: number, priority: number) {
    const a = this.items;
    a.push({ node, priority });
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].priority <= a[i].priority) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }

  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < a.length && a[l].priority < a[smallest].priority) smallest = l;
        if (r < a.length && a[r].priority < a[smallest].priority) smallest = r;
        if (smallest === i) break;
        [a[smallest], a[i]] = [a[i], a[smallest]];
        i = smallest;
      }
    }
    return top.node;
  }
}

export interface Route {
  path: number[];
  seconds: number;
  visited: number[];
}

/**
 * Explores nodes in order of known time + estimated time remaining.
 * heuristicWeight = 0 is Dijkstra, 1 is A*, and above 1 is faster but no longer optimal.
 */
export function shortestPath(g: RoadGraph, from: number, to: number, heuristicWeight: number): Route {
  const n = g.edges.length;
  const best = new Float64Array(n).fill(Infinity);
  const previous = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const heap = new Heap();
  const visited: number[] = [];
  const remaining = (node: number) => (Math.hypot(g.xs[node] - g.xs[to], g.ys[node] - g.ys[to]) / g.maxSpeed) * heuristicWeight;

  best[from] = 0;
  heap.push(from, remaining(from));
  while (heap.size) {
    const node = heap.pop();
    if (done[node]) continue;
    done[node] = 1;
    visited.push(node);
    if (node === to) break;
    for (const edge of g.edges[node]) {
      const time = best[node] + edgeTime(edge);
      if (time < best[edge.to]) {
        best[edge.to] = time;
        previous[edge.to] = node;
        heap.push(edge.to, time + remaining(edge.to));
      }
    }
  }
  const path: number[] = [];
  for (let at = to; at !== -1; at = previous[at]) path.unshift(at);
  return { path, seconds: best[to], visited };
}

/** Slows every road along the middle stretch of a route. */
export function addTraffic(g: RoadGraph, path: number[], factor: number) {
  const start = Math.floor(path.length / 3);
  const end = Math.max(Math.ceil((2 * path.length) / 3), start + 2);
  for (let i = start; i < end - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    for (const e of g.edges[a]) if (e.to === b) e.traffic = factor;
    for (const e of g.edges[b]) if (e.to === a) e.traffic = factor;
  }
}

export function clearTraffic(g: RoadGraph) {
  for (const list of g.edges) for (const e of list) e.traffic = 1;
}
