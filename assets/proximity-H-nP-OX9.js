import{a as e,f as t,g as n,p as r,u as i}from"./index-n79SFkCo.js";var a=`// Real geohash encoding and a real quadtree, both answering "what's near me?"
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

/**
 * The smallest precision whose cell is at least as tall AND as wide as the search radius,
 * so the cell and its 8 neighbors always cover it. Cells get narrower away from the equator.
 */
export function precisionForRadius(radiusKm: number, latitude = 38): number {
  const shrink = Math.cos((latitude * Math.PI) / 180);
  for (let p = 8; p >= 1; p--) {
    const size = cellSize(p);
    if (Math.min(size.lat * 111, size.lng * 111 * shrink) >= radiusKm) return p;
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
`,o=`0123456789bcdefghjkmnpqrstuvwxyz`;function s(e,t,n){let r=-90,i=90,a=-180,s=180,c=``,l=0,u=0,d=!0;for(;c.length<n;){if(d){let e=(a+s)/2;t>=e?(u=u<<1|1,a=e):(u<<=1,s=e)}else{let t=(r+i)/2;e>=t?(u=u<<1|1,r=t):(u<<=1,i=t)}d=!d,++l===5&&(c+=o[u],l=0,u=0)}return c}function c(e){let t=e*5,n=Math.ceil(t/2);return{lat:180/2**Math.floor(t/2),lng:360/2**n}}function l(e,t,n){let r=c(n),i=Math.floor((e+90)/r.lat)*r.lat-90,a=Math.floor((t+180)/r.lng)*r.lng-180;return{south:i,west:a,north:i+r.lat,east:a+r.lng}}function u(e,t,n,r){if(!r)return[s(e,t,n)];let i=c(n),a=new Set;for(let r of[-1,0,1])for(let o of[-1,0,1])a.add(s(e+r*i.lat,t+o*i.lng,n));return[...a]}function d(e,t,n,r){let i=Math.PI/180,a=(n-e)*i,o=(r-t)*i,s=Math.sin(a/2)**2+Math.cos(e*i)*Math.cos(n*i)*Math.sin(o/2)**2;return 12742*Math.asin(Math.sqrt(s))}function f(e,t=38){let n=Math.cos(t*Math.PI/180);for(let t=8;t>=1;t--){let r=c(t);if(Math.min(r.lat*111,r.lng*111*n)>=e)return t}return 1}var p=class{places;cells=new Map;constructor(e){this.places=e}level(e){let t=this.cells.get(e);if(!t){t=new Map;for(let n of this.places){let r=s(n.lat,n.lng,e),i=t.get(r);i?i.push(n):t.set(r,[n])}this.cells.set(e,t)}return t}candidates(e,t){let n=this.level(t);return e.flatMap(e=>n.get(e)??[])}},m=class e{bounds;capacity;items=[];kids=null;constructor(e,t){this.bounds=e,this.capacity=t}insert(t){if(this.kids)this.childFor(t).insert(t);else if(this.items.push(t),this.items.length>this.capacity&&this.bounds.north-this.bounds.south>1e-4){let{south:t,north:n,west:r,east:i}=this.bounds,a=(t+n)/2,o=(r+i)/2;this.kids=[new e({south:t,north:a,west:r,east:o},this.capacity),new e({south:t,north:a,west:o,east:i},this.capacity),new e({south:a,north:n,west:r,east:o},this.capacity),new e({south:a,north:n,west:o,east:i},this.capacity)];let s=this.items;this.items=[];for(let e of s)this.childFor(e).insert(e)}}childFor(e){let{south:t,north:n,west:r,east:i}=this.bounds,a=e.lat>=(t+n)/2?2:0,o=+(e.lng>=(r+i)/2);return this.kids[a+o]}search(e,t,n){let r=this.bounds;if(!(r.north<e.south||r.south>e.north||r.east<e.west||r.west>e.east)){if(this.kids)for(let r of this.kids)r.search(e,t,n);else n.push(r),t.push(...this.items)}}},h=n(),g=.5,_={south:37.2,north:37.95,west:-122.65,east:-121.75};function v(e,t){let{lat:n,lng:r}=e.center,i=t.radiusKm,a=e.places.filter(e=>d(n,r,e.lat,e.lng)<=i),o=e.places;if(e.cells=[],e.label=`full table`,t.index===`geohash`){let a=f(i),d=u(n,r,a,t.neighbors);o=e.geo.candidates(d,a),e.label=`${d.length} cells at precision ${a}, center ${s(n,r,a)}`;let p=c(a),m=t.neighbors?[-1,0,1]:[0];for(let t of m)for(let i of m)e.cells.push(l(n+t*p.lat,r+i*p.lng,a))}else if(t.index===`quadtree`){let t=i/111,a=i/(111*Math.cos(n*Math.PI/180));o=[],e.tree.search({south:n-t,north:n+t,west:r-a,east:r+a},o,e.cells),e.label=`${e.cells.length} quadtree leaves`}e.results=o.filter(e=>d(n,r,e.lat,e.lng)<=i),e.scanned=o.length,e.missedLast=a.length-e.results.length,e.missedTotal+=e.missedLast,e.searches++,e.scannedEma=e.scannedEma*.85+e.scanned*.15}function y({state:e,params:t,rerender:n}){let r=e=>(e-_.west)/(_.east-_.west)*520,i=e=>(_.north-e)/(_.north-_.south)*400,a=e.places.length>1500?e.places.filter((t,n)=>n%Math.ceil(e.places.length/1500)===0):e.places,o=t.radiusKm/(111*Math.cos(e.center.lat*Math.PI/180))/(_.east-_.west)*520,s=t.radiusKm/111/(_.north-_.south)*400;return(0,h.jsxs)(`div`,{className:`lab-panel`,children:[(0,h.jsxs)(`h4`,{children:[`Businesses on a map. Click to search from there. `,e.label,`.`]}),(0,h.jsxs)(`svg`,{viewBox:`0 0 520 400`,className:`lab-svg`,onClick:r=>{let i=r.currentTarget.getBoundingClientRect();e.center={lat:_.north-(r.clientY-i.top)/i.height*(_.north-_.south),lng:_.west+(r.clientX-i.left)/i.width*(_.east-_.west)},e.holdUntil=e.tick+40,v(e,t),n()},style:{cursor:`crosshair`},role:`img`,"aria-label":`Map with ${e.places.length} places. The search found ${e.results.length} within ${t.radiusKm} km after scanning ${e.scanned}.`,children:[a.map(e=>(0,h.jsx)(`circle`,{cx:r(e.lng),cy:i(e.lat),r:`1.1`,fill:`var(--ink-3)`},e.id)),e.cells.map((e,t)=>(0,h.jsx)(`rect`,{x:r(e.west),y:i(e.north),width:r(e.east)-r(e.west),height:i(e.south)-i(e.north),fill:`var(--measured)`,fillOpacity:`0.14`,stroke:`var(--measured)`,strokeWidth:`0.8`},t)),e.results.slice(0,400).map(e=>(0,h.jsx)(`circle`,{cx:r(e.lng),cy:i(e.lat),r:`2`,fill:`#4cc98a`},e.id)),(0,h.jsx)(`ellipse`,{cx:r(e.center.lng),cy:i(e.center.lat),rx:o,ry:s,fill:`none`,stroke:`var(--predicted)`,strokeWidth:`1.5`,strokeDasharray:`5 3`}),(0,h.jsx)(`circle`,{cx:r(e.center.lng),cy:i(e.center.lat),r:`3.5`,fill:`var(--predicted)`})]})]})}function b(e,t){if(t.index===`scan`)return e.places.length;let n=(_.north-_.south)*(_.east-_.west);if(t.index===`quadtree`){let r=t.radiusKm/111,i=t.radiusKm/88;return Math.min(e.places.length,e.places.length*(4*r*i/n))}let r=c(f(t.radiusKm));return Math.min(e.places.length,e.places.length*((t.neighbors?9:1)*r.lat*r.lng/n))}var x={problem:[`"Find restaurants near me" looks like a simple filter on latitude and longitude. But a database index works on one dimension at a time, so filtering on both still ends up examining a huge number of rows. At thousands of searches per second, that won't work.`,`The trick is to turn two dimensions into one. A geohash encodes a location as a string in which nearby places usually share a prefix, so an ordinary database index can find everything in an area. Business data changes rarely, which makes this easy to cache and replicate.`],functional:[`Return businesses within a radius of a location`,`Show details for a business`,`Business owners can add or update listings, with changes taking effect the next day`],nonFunctional:[`Low latency for searches`,`Handles spikes of thousands of searches per second`,`Location data is treated as private`],diagram:{nodes:[{id:`u`,label:`Mobile app`,col:0,row:0,kind:`client`,note:`Sends latitude, longitude and radius.`},{id:`l`,label:`Load balancer`,col:1,row:0,note:`Routes to the correct service by path.`},{id:`s`,label:`Location service`,col:2,row:0,note:`Stateless and read-only, so it scales simply.`},{id:`r`,label:`Geo index replicas`,col:3,row:0,kind:`store`,note:`Maps geohash to business IDs. Data is small enough to fit in memory on one machine.`},{id:`b`,label:`Business service`,col:2,row:1,note:`Serves business details, and accepts updates from owners.`},{id:`c`,label:`Business cache`,col:3,row:1,kind:`store`,note:`Details rarely change, so they cache very well.`},{id:`d`,label:`Primary database`,col:3,row:2,kind:`store`,note:`Holds the source of truth. A nightly job refreshes the geo index.`}],edges:[{from:`u`,to:`l`},{from:`l`,to:`s`},{from:`l`,to:`b`},{from:`s`,to:`r`},{from:`b`,to:`c`},{from:`b`,to:`d`},{from:`d`,to:`r`,dashed:!0}]},ideas:[{title:`Geohash`,body:`Split the world in half repeatedly, alternating longitude and latitude, and record each choice as a bit. Each extra character narrows the cell by about 32 times. Shared prefixes usually mean nearby.`},{title:`Boundary issues`,body:`Two places can be side by side yet have totally different prefixes, if a cell boundary runs between them. So search the current cell and its 8 neighbors, then filter by true distance.`},{title:`Quadtree`,body:`Recursively split cells that contain too many places. It handles uneven density nicely, since a city gets tiny cells while the ocean gets one big one, but it's an in-memory structure you must keep updated.`},{title:`Why scaling is easy here`,body:`Businesses rarely change and the index is small enough to fit in memory, so read replicas and caches go a long way. Sharding is often unnecessary.`}],estimator:{vars:[{key:`dau`,label:`Daily active users`,unit:`count`},{key:`searches`,label:`Searches per user per day`,unit:`plain`,assume:5},{key:`places`,label:`Businesses`,unit:`count`,assume:2e8},{key:`entryBytes`,label:`Bytes per index entry`,unit:`plain`,assume:21},{key:`detailBytes`,label:`Bytes per business record`,unit:`plain`,assume:1e3},{key:`nodeQps`,label:`Searches per second per replica`,unit:`plain`,assume:2e3},{key:`qps`,label:`Search rate`,unit:`qps`},{key:`replicas`,label:`Read replicas`,unit:`count`},{key:`index`,label:`Geo index size`,unit:`bytes`},{key:`details`,label:`Business data`,unit:`bytes`}],eqs:[{out:`qps`,terms:[[`dau`,1],[`searches`,1],[86400,-1]]},{out:`replicas`,terms:[[`qps`,1],[`nodeQps`,-1]]},{out:`index`,terms:[[`places`,1],[`entryBytes`,1]]},{out:`details`,terms:[[`places`,1],[`detailBytes`,1]]}],starts:[{key:`dau`,value:1e8},{key:`qps`,value:5e3},{key:`replicas`,value:10}]},lab:{secondsPerTick:g,params:[{key:`index`,label:`Index`,kind:`choice`,options:[{value:`geohash`,label:`Geohash`},{value:`quadtree`,label:`Quadtree`},{value:`scan`,label:`None, scan everything`}]},{key:`places`,label:`Businesses`,kind:`range`,min:1e3,max:4e4,step:1e3,rebuild:!0},{key:`radiusKm`,label:`Search radius`,kind:`range`,min:.5,max:20,step:.5,unit:`km`},{key:`neighbors`,label:`Include the 8 neighboring cells`,kind:`toggle`}],defaults:{index:`geohash`,places:2e4,radiusKm:2,neighbors:!0},create(e,t){let n=Array.from({length:8},()=>({lat:t.range(_.south+.1,_.north-.1),lng:t.range(_.west+.1,_.east-.1),spread:t.range(.02,.07)})),r=[];for(let i=0;i<e.places;i++)if(t.chance(.75)){let e=n[t.int(n.length)];r.push({id:i,lat:Math.min(_.north,Math.max(_.south,t.gaussian(e.lat,e.spread))),lng:Math.min(_.east,Math.max(_.west,t.gaussian(e.lng,e.spread)))})}else r.push({id:i,lat:t.range(_.south,_.north),lng:t.range(_.west,_.east)});let i=new m(_,100);for(let e of r)i.insert(e);let a={places:r,geo:new p(r),tree:i,center:{lat:r[0].lat,lng:r[0].lng},holdUntil:0,tick:0,scanned:0,results:[],cells:[],missedLast:0,missedTotal:0,searches:0,scannedEma:0,label:``};return v(a,e),a},step(e,t,n){if(e.tick++,e.tick>=e.holdUntil&&e.tick%4==0){let t=e.places[n.int(e.places.length)];e.center={lat:t.lat,lng:t.lng}}v(e,t)},sample:(e,t)=>({scanned:e.scannedEma,math:b(e,t),found:e.results.length}),charts:[{title:`Records examined per search`,series:[{key:`scanned`,label:`Measured`,role:`measured`},{key:`math`,label:`Uniform estimate`,role:`predicted`},{key:`found`,label:`Results found`,role:`other`}]}],metrics:(e,n)=>[{label:`Share of table examined`,value:r(b(e,n)/e.places.length,2),role:`predicted`},{label:`Share of table examined`,value:r(e.scannedEma/e.places.length,2),role:`measured`},{label:`Results found`,value:t(e.results.length),role:`measured`},{label:`Results missed`,value:t(e.missedTotal),role:`measured`,tone:e.missedTotal?`bad`:`good`}],math(e,t){let n=f(t.radiusKm),r=c(n);return[{expr:`Radius ${t.radiusKm} km needs geohash precision`,result:String(n)},{expr:`Cell at precision ${n}`,result:`${(r.lat*111).toFixed(2)} × ${(r.lng*88).toFixed(2)} km`},{expr:`Search covers ${t.neighbors?9:1} of those cells, of ${i(e.places.length)} records`,result:`≈ ${i(b(e,t))} examined`}]},View:y,trace:e=>({values:{cells:e.label,scan:t(e.scanned),found:t(e.results.length)}}),experiments:[{title:`Skip almost everything`,set:{index:`geohash`,radiusKm:2,places:2e4},ticks:60,question:`You search within 2 km across 20,000 businesses, using a geohash. Roughly how much of the table must be examined?`,options:[`All of it`,`About half`,`Just a few percent`],answer:2,explain:`Only the 9 cells around you are read, a tiny part of the region. It takes an index lookup per cell, and then a distance check on what comes back. Dense neighborhoods cost more than sparse ones, as the gap against the uniform estimate shows.`,check:(t,n,r)=>e(r,`scanned`,40)<3e3},{title:`The boundary problem`,set:{index:`geohash`,radiusKm:2,neighbors:!1},ticks:60,question:`To save work, you read only the one cell you're in. Standing near its edge, a coffee shop is 100 meters away, across the boundary. What happens?`,options:[`You still find it`,`It gets missed, even though it's close`],answer:1,explain:`Places on either side of a boundary can have completely different prefixes, even when they're right next to each other. That's why you always search the eight neighboring cells as well. It's the classic geohash gotcha.`,check:e=>e.missedTotal>0},{title:`Try a quadtree`,set:{index:`quadtree`,radiusKm:2,places:4e4},ticks:60,question:`A quadtree splits cells until each holds at most 100 places, so dense areas get small cells. Does it also avoid most of the table?`,options:[`Yes, and it adapts to density`,`No, it reads most of the table`],answer:0,explain:`Unlike a fixed grid, a quadtree shapes itself around the data. The catch is that it lives in memory, must be rebuilt when servers start, and is trickier to update than a simple geohash column.`,check:(t,n,r)=>e(r,`scanned`,40)<4e3&&t.missedTotal===0}]},pseudocode:[{code:`search(lat, lng, radius):`},{code:`  precision = geohash length that fits radius`},{code:`  cells = cell of (lat, lng) and its 8 neighbors`,id:`cells`},{code:`  candidates = index lookup for those cells`,id:`scan`},{code:`  keep those within radius by true distance`,id:`found`},{code:`  sort by distance and return`}],sources:[{name:`engine.ts`,code:a,lang:`ts`}],tradeoffs:[{choice:`Geohash`,gain:`Simple, and a plain database index works`,cost:`Fixed cell sizes, and boundary handling`},{choice:`Quadtree`,gain:`Adapts to density`,cost:`In memory, slower to build, and harder to update`},{choice:`Google S2`,gain:`Accurate coverage of arbitrary shapes`,cost:`Complex to explain and implement`},{choice:`Precompute by cell`,gain:`Very fast reads`,cost:`New businesses take a while to appear`}],interview:[{q:`How do you handle areas with too few results?`,a:`Remove the last character of the geohash, which makes the cell about 32 times larger, and search again. Keep expanding until you have enough or hit a limit.`},{q:`Do you need to shard this?`,a:`Often not. Index entries are small, so 200 million of them fit on one machine. Replicas handle read volume, and that's simpler than sharding.`},{q:`How would you add filters like rating or open now?`,a:`Filter the candidates after the location search, since nearby sets are small. If filters become complex, use a search engine such as Elasticsearch with geo support.`},{q:`How does a new business appear?`,a:`Writes go to the primary database, and the geo index refreshes in a nightly batch. Requirements accept next-day updates, and that keeps the read path very simple.`}],mistakes:[`Forgetting to search neighboring cells.`,`Using a two-dimensional range query and calling it done.`,`Sharding by default, when replicas would be enough.`]};export{x as default};