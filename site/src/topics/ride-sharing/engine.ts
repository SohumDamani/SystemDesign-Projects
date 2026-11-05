// A live city: drivers in a grid index, and two ways of matching them with riders.
export const CITY_METERS = 10000;
export const CELL_METERS = 500;
export const SPEED = 10; // meters per second

export interface Driver {
  id: number;
  x: number;
  y: number;
  /** Where the system last heard this driver was. It can be out of date. */
  knownX: number;
  knownY: number;
  busyUntil: number;
}

export interface Rider {
  id: number;
  x: number;
  y: number;
  requestedAt: number;
}

const cellOf = (v: number) => Math.min(Math.floor(CITY_METERS / CELL_METERS) - 1, Math.max(0, Math.floor(v / CELL_METERS)));
const key = (cx: number, cy: number) => cy * 1000 + cx;

/** Maps each grid cell to the idle drivers last seen there. */
export class GridIndex {
  private cells = new Map<number, Set<Driver>>();
  /** Drivers looked at, across all searches. */
  visited = 0;

  add(d: Driver) {
    const k = key(cellOf(d.knownX), cellOf(d.knownY));
    let cell = this.cells.get(k);
    if (!cell) this.cells.set(k, (cell = new Set()));
    cell.add(d);
  }

  remove(d: Driver) {
    this.cells.get(key(cellOf(d.knownX), cellOf(d.knownY)))?.delete(d);
  }

  /** Searches outward one ring of cells at a time, and stops when nothing nearer can exist. */
  nearest(x: number, y: number): Driver | undefined {
    const cx = cellOf(x);
    const cy = cellOf(y);
    const maxRing = Math.ceil(CITY_METERS / CELL_METERS);
    let best: Driver | undefined;
    let bestDist = Infinity;
    for (let ring = 0; ring <= maxRing; ring++) {
      if (best && (ring - 1) * CELL_METERS > bestDist) break;
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const cell = this.cells.get(key(cx + dx, cy + dy));
          if (!cell) continue;
          for (const d of cell) {
            this.visited++;
            const dist = Math.hypot(d.knownX - x, d.knownY - y);
            if (dist < bestDist) {
              bestDist = dist;
              best = d;
            }
          }
        }
      }
    }
    return best;
  }
}

export interface Match {
  rider: Rider;
  driver: Driver;
}

/**
 * Batched matching: collect riders for a few seconds, then assign the closest pairs first
 * across everyone. A global view avoids giving one rider the driver that another needed.
 */
export function matchBatch(riders: Rider[], drivers: Driver[]): Match[] {
  const pairs: { r: Rider; d: Driver; dist: number }[] = [];
  for (const r of riders) for (const d of drivers) pairs.push({ r, d, dist: Math.hypot(d.knownX - r.x, d.knownY - r.y) });
  pairs.sort((a, b) => a.dist - b.dist);
  const usedRiders = new Set<number>();
  const usedDrivers = new Set<number>();
  const matches: Match[] = [];
  for (const p of pairs) {
    if (usedRiders.has(p.r.id) || usedDrivers.has(p.d.id)) continue;
    usedRiders.add(p.r.id);
    usedDrivers.add(p.d.id);
    matches.push({ rider: p.r, driver: p.d });
  }
  return matches;
}
