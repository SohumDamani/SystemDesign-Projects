// Real geohash encoding and a real quadtree, both answering "what's near me?"
export interface Place {
  id: number;
  lat: number;
  lng: number;
}

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Repeatedly halves longitude and latitude, one bit at a time. Nearby places share a prefix. */
export function geohash(lat: number, lng: number, precision: number): string {
  let latLow = -90;
  let latHigh = 90;
  let lngLow = -180;
  let lngHigh = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngLow + lngHigh) / 2;
      if (lng >= mid) {
        ch = (ch << 1) | 1;
        lngLow = mid;
      } else {
        ch <<= 1;
        lngHigh = mid;
      }
    } else {
      const mid = (latLow + latHigh) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latLow = mid;
      } else {
        ch <<= 1;
        latHigh = mid;
      }
    }
    even = !even;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

/** Height and width of a geohash cell, in degrees. */
export function cellSize(precision: number): { lat: number; lng: number } {
  const bits = precision * 5;
  const lngBits = Math.ceil(bits / 2);
  const latBits = Math.floor(bits / 2);
  return { lat: 180 / 2 ** latBits, lng: 360 / 2 ** lngBits };
}

/** Bounds of the cell containing a point. */
export function cellBounds(lat: number, lng: number, precision: number) {
  const size = cellSize(precision);
  const south = Math.floor((lat + 90) / size.lat) * size.lat - 90;
  const west = Math.floor((lng + 180) / size.lng) * size.lng - 180;
  return { south, west, north: south + size.lat, east: west + size.lng };
}

/** The cell a point falls in, plus its 8 neighbors. */
export function cellsAround(lat: number, lng: number, precision: number, includeNeighbors: boolean): string[] {
  if (!includeNeighbors) return [geohash(lat, lng, precision)];
  const size = cellSize(precision);
  const out = new Set<string>();
  for (const dLat of [-1, 0, 1]) for (const dLng of [-1, 0, 1]) out.add(geohash(lat + dLat * size.lat, lng + dLng * size.lng, precision));
  return [...out];
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLng = (bLng - aLng) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** The smallest precision whose cell is still at least as tall as the search radius. */
export function precisionForRadius(radiusKm: number): number {
  for (let p = 8; p >= 1; p--) {
    const heightKm = cellSize(p).lat * 111;
    if (heightKm >= radiusKm) return p;
  }
  return 1;
}

export class GeohashIndex {
  private cells = new Map<number, Map<string, Place[]>>();
  constructor(private places: Place[]) {}

  private level(precision: number): Map<string, Place[]> {
    let map = this.cells.get(precision);
    if (!map) {
      map = new Map();
      for (const place of this.places) {
        const key = geohash(place.lat, place.lng, precision);
        const list = map.get(key);
        if (list) list.push(place);
        else map.set(key, [place]);
      }
      this.cells.set(precision, map);
    }
    return map;
  }

  candidates(cellKeys: string[], precision: number): Place[] {
    const level = this.level(precision);
    return cellKeys.flatMap((key) => level.get(key) ?? []);
  }
}

export interface Bounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

/** Splits any cell holding too many places into four. Dense cities get small cells. */
export class QuadTree {
  private items: Place[] = [];
  private kids: QuadTree[] | null = null;
  constructor(readonly bounds: Bounds, private capacity: number) {}

  insert(place: Place): void {
    if (this.kids) {
      this.childFor(place).insert(place);
      return;
    }
    this.items.push(place);
    if (this.items.length > this.capacity && this.bounds.north - this.bounds.south > 1e-4) {
      const { south, north, west, east } = this.bounds;
      const midLat = (south + north) / 2;
      const midLng = (west + east) / 2;
      this.kids = [
        new QuadTree({ south, north: midLat, west, east: midLng }, this.capacity),
        new QuadTree({ south, north: midLat, west: midLng, east }, this.capacity),
        new QuadTree({ south: midLat, north, west, east: midLng }, this.capacity),
        new QuadTree({ south: midLat, north, west: midLng, east }, this.capacity),
      ];
      const moved = this.items;
      this.items = [];
      for (const item of moved) this.childFor(item).insert(item);
    }
  }

  private childFor(place: Place): QuadTree {
    const { south, north, west, east } = this.bounds;
    const top = place.lat >= (south + north) / 2 ? 2 : 0;
    const right = place.lng >= (west + east) / 2 ? 1 : 0;
    return this.kids![top + right];
  }

  /** Visits only cells overlapping the box, and collects the places inside them. */
  search(box: Bounds, out: Place[], visitedLeaves: Bounds[]) {
    const b = this.bounds;
    if (b.north < box.south || b.south > box.north || b.east < box.west || b.west > box.east) return;
    if (this.kids) {
      for (const kid of this.kids) kid.search(box, out, visitedLeaves);
      return;
    }
    visitedLeaves.push(b);
    out.push(...this.items);
  }
}
