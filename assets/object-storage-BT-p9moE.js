import{a as e,h as t,i as n,o as r,p as i,s as a,u as o}from"./index-ar0glIxf.js";import{n as s,t as c}from"./stats-SinZlVt1.js";var l=t(i(),1),u=`// Real Reed-Solomon erasure coding over GF(256): split data, add parity, rebuild after loss.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function buildTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // the field's reduction polynomial
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
const inv = (a: number) => {
  if (a === 0) throw new Error('Division by zero in GF(256)');
  return EXP[255 - LOG[a]];
};

/** An encoding matrix: identity on top, Cauchy below, so any k rows can be inverted. */
function encodingMatrix(k: number, m: number): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i < k; i++) rows.push(Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)));
  for (let i = 0; i < m; i++) rows.push(Array.from({ length: k }, (_, j) => inv((k + i) ^ j)));
  return rows;
}

/** Gauss-Jordan elimination, using GF(256) arithmetic. */
function invert(matrix: number[][]): number[][] {
  const n = matrix.length;
  const a = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    while (pivot < n && a[pivot][col] === 0) pivot++;
    if (pivot === n) throw new Error('Matrix is not invertible');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const scale = inv(a[col][col]);
    for (let j = 0; j < 2 * n; j++) a[col][j] = mul(a[col][j], scale);
    for (let row = 0; row < n; row++) {
      if (row === col || a[row][col] === 0) continue;
      const f = a[row][col];
      for (let j = 0; j < 2 * n; j++) a[row][j] ^= mul(f, a[col][j]);
    }
  }
  return a.map((row) => row.slice(n));
}

export interface Encoded {
  k: number;
  m: number;
  length: number; // original byte length
  shards: Uint8Array[];
}

/** Splits data into k shards, and computes m parity shards from them. */
export function encode(data: Uint8Array, k: number, m: number): Encoded {
  const shardSize = Math.max(1, Math.ceil(data.length / k));
  const matrix = encodingMatrix(k, m);
  const shards = Array.from({ length: k + m }, () => new Uint8Array(shardSize));
  for (let i = 0; i < data.length; i++) shards[Math.floor(i / shardSize)][i % shardSize] = data[i];
  for (let p = 0; p < m; p++) {
    for (let d = 0; d < k; d++) {
      const f = matrix[k + p][d];
      for (let b = 0; b < shardSize; b++) shards[k + p][b] ^= mul(f, shards[d][b]);
    }
  }
  return { k, m, length: data.length, shards };
}

/** Rebuilds the original from any k surviving shards. Returns null with fewer than k. */
export function decode(enc: Encoded, alive: boolean[]): Uint8Array | null {
  const { k, m, shards, length } = enc;
  const usable = alive.map((a, i) => (a ? i : -1)).filter((i) => i >= 0).slice(0, k);
  if (usable.length < k) return null;
  const matrix = encodingMatrix(k, m);
  const decoder = invert(usable.map((i) => matrix[i]));
  const size = shards[0].length;
  const out = new Uint8Array(length);
  for (let d = 0; d < k; d++) {
    const piece = new Uint8Array(size);
    usable.forEach((shardIndex, col) => {
      const f = decoder[d][col];
      if (!f) return;
      for (let b = 0; b < size; b++) piece[b] ^= mul(f, shards[shardIndex][b]);
    });
    for (let b = 0; b < size && d * size + b < length; b++) out[d * size + b] = piece[b];
  }
  return out;
}

/** A group of disks holding one object's shards. It's lost once too many fail before repair. */
export interface DiskGroup {
  failedUntil: number[]; // repair finish time per disk, 0 when healthy
  lost: boolean;
}

export function failuresNow(group: DiskGroup, now: number): number {
  return group.failedUntil.filter((t) => t > now).length;
}
`,d=new Uint8Array(512),f=new Uint8Array(256);(function(){let e=1;for(let t=0;t<255;t++)d[t]=e,f[e]=t,e<<=1,e&256&&(e^=285);for(let e=255;e<512;e++)d[e]=d[e-255]})();var p=(e,t)=>e===0||t===0?0:d[f[e]+f[t]],m=e=>{if(e===0)throw Error(`Division by zero in GF(256)`);return d[255-f[e]]};function h(e,t){let n=[];for(let t=0;t<e;t++)n.push(Array.from({length:e},(e,n)=>+(t===n)));for(let r=0;r<t;r++)n.push(Array.from({length:e},(t,n)=>m(e+r^n)));return n}function g(e){let t=e.length,n=e.map((e,n)=>[...e,...Array.from({length:t},(e,t)=>+(n===t))]);for(let e=0;e<t;e++){let r=e;for(;r<t&&n[r][e]===0;)r++;if(r===t)throw Error(`Matrix is not invertible`);[n[e],n[r]]=[n[r],n[e]];let i=m(n[e][e]);for(let r=0;r<2*t;r++)n[e][r]=p(n[e][r],i);for(let r=0;r<t;r++){if(r===e||n[r][e]===0)continue;let i=n[r][e];for(let a=0;a<2*t;a++)n[r][a]^=p(i,n[e][a])}}return n.map(e=>e.slice(t))}function _(e,t,n){let r=Math.max(1,Math.ceil(e.length/t)),i=h(t,n),a=Array.from({length:t+n},()=>new Uint8Array(r));for(let t=0;t<e.length;t++)a[Math.floor(t/r)][t%r]=e[t];for(let e=0;e<n;e++)for(let n=0;n<t;n++){let o=i[t+e][n];for(let i=0;i<r;i++)a[t+e][i]^=p(o,a[n][i])}return{k:t,m:n,length:e.length,shards:a}}function v(e,t){let{k:n,m:r,shards:i,length:a}=e,o=t.map((e,t)=>e?t:-1).filter(e=>e>=0).slice(0,n);if(o.length<n)return null;let s=h(n,r),c=g(o.map(e=>s[e])),l=i[0].length,u=new Uint8Array(a);for(let e=0;e<n;e++){let t=new Uint8Array(l);o.forEach((n,r)=>{let a=c[e][r];if(a)for(let e=0;e<l;e++)t[e]^=p(a,i[n][e])});for(let n=0;n<l&&e*l+n<a;n++)u[e*l+n]=t[n]}return u}function y(e,t){return e.failedUntil.filter(e=>e>t).length}var b=o(),x=`Object storage keeps bytes safe by spreading them across many independent failure domains.`,S=30,C=3e3,w=new TextEncoder,T=new TextDecoder,E=e=>e.mode===`replication`?{data:1,parity:e.copies-1}:{data:e.k,parity:e.m},D=e=>{let t=E(e);return t.parity/t.data};function O(e){let t=E(e),n=t.data+t.parity,r=e.afr*e.repairDays/365,i=1-c(n-1,t.parity-1,r);return Math.min(1,n*e.afr*i)}var k=e=>e<=0?`12+`:Math.min(15,Math.max(0,-Math.log10(e))).toFixed(1);function A(e){let t=E(e);return Array.from({length:C},()=>({failedUntil:Array(t.data+t.parity).fill(0),lost:!1}))}function j({state:e,act:t,rerender:n}){let[r,i]=(0,l.useState)(``),{demo:a,alive:o}=e,s=t=>{e.alive=e.alive.map((e,n)=>n===t?!e:e),i(``),n()},c=o.filter(e=>!e).length;return(0,b.jsxs)(`div`,{className:`lab-panel`,children:[(0,b.jsxs)(`h4`,{children:[`Destroy shards of a real object. `,a.k,` data and `,a.m,` parity shards, so any `,a.k,` are enough.`]}),(0,b.jsx)(`div`,{className:`cells`,style:{marginBottom:8},children:a.shards.map((e,t)=>(0,b.jsxs)(`button`,{className:`cell tone-`+(o[t]?t<a.k?`neutral`:`warn`:`bad`),onClick:()=>s(t),"aria-pressed":!o[t],style:{textAlign:`left`},children:[(0,b.jsx)(`span`,{children:t<a.k?`Data ${t+1}`:`Parity ${t-a.k+1}`}),(0,b.jsx)(`b`,{children:o[t]?[...e.slice(0,2)].map(e=>e.toString(16).padStart(2,`0`)).join(``):`Lost`})]},t))}),(0,b.jsxs)(`div`,{className:`row`,style:{marginBottom:8},children:[(0,b.jsx)(`button`,{onClick:()=>{t(`reconstruct`),i(e.result===x?`Rebuilt perfectly from the surviving shards.`:e.result===null?`Too many shards lost, so the data is gone.`:`Rebuilt text does not match.`)},children:`Rebuild the object`}),(0,b.jsxs)(`span`,{className:`small muted`,children:[c,` lost, `,a.m,` can be tolerated`]})]}),r&&(0,b.jsx)(`p`,{className:`small`,style:{marginBottom:4},children:r}),e.result&&(0,b.jsxs)(`p`,{className:`small`,style:{margin:0,overflowWrap:`anywhere`},children:[`"`,e.result,`"`]})]})}var M={problem:[`Object storage, such as S3, keeps files of any size behind a simple API: put, get, delete. It doesn't have folders or in-place edits, and in exchange it can scale to exabytes and offer a promise of 11 nines of durability, which means you'd statistically lose one object in 100 billion per year.`,`Most of the design is about how to get that durability affordably. Keeping three copies of everything works, but it's expensive at this scale. Erasure coding uses math to get better durability from far less disk, as you can try in the lab with real bytes.`],functional:[`Create buckets, upload and download objects`,`Object versioning`,`List objects, and support multipart upload of large files`],nonFunctional:[`Extremely high durability, of 11 nines`,`High availability`,`Low storage cost at huge scale`],diagram:{nodes:[{id:`c`,label:`Client`,col:0,row:1,kind:`client`,note:`Uses HTTP PUT and GET. Large files upload in parts, in parallel.`},{id:`a`,label:`API service`,col:1,row:1,note:`Stateless. It authenticates, then coordinates metadata and data operations.`},{id:`i`,label:`Auth service`,col:1,row:0,note:`Checks whether this caller may access this bucket.`},{id:`m`,label:`Metadata store`,col:2,row:0,kind:`store`,note:`Maps bucket and name to an object ID. Small but critical, and heavily queried.`},{id:`p`,label:`Placement service`,col:2,row:1,note:`Chooses data nodes across failure domains, using a cluster map and heartbeats.`},{id:`d`,label:`Data nodes`,col:3,row:1,kind:`store`,note:`Store shards on disk, in large files with many small objects packed together.`}],edges:[{from:`c`,to:`a`},{from:`a`,to:`i`},{from:`a`,to:`m`},{from:`a`,to:`p`},{from:`a`,to:`d`},{from:`p`,to:`d`,dashed:!0}]},ideas:[{title:`Separate metadata and data`,body:`Data is huge, immutable blobs, and metadata is small lookups. They have opposite needs, so keep them in separate systems. A data node only needs to look up by ID.`},{title:`Erasure coding`,body:`Split an object into k data shards, and compute m parity shards. Any k of them can rebuild it. 8+4 survives 4 failures with 50% overhead, whereas 3 copies survive 2 failures with 200%.`},{title:`Failure domains`,body:`Durability math assumes independent failures. Spread shards across disks, racks and data centers, so that one power failure doesn't take several shards at once.`},{title:`Small objects`,body:`Millions of tiny files waste disk blocks and inodes. Pack many small objects into one large file, and keep an index of each object's offset.`}],estimator:{vars:[{key:`storage`,label:`Data stored`,unit:`bytes`},{key:`avgObject`,label:`Bytes per object`,unit:`plain`,assume:5e6},{key:`overheadFactor`,label:`Size multiple for redundancy`,unit:`plain`,assume:1.5},{key:`diskBytes`,label:`Bytes per disk`,unit:`plain`,assume:2e13},{key:`metaBytes`,label:`Metadata bytes per object`,unit:`plain`,assume:1e3},{key:`objects`,label:`Objects`,unit:`count`},{key:`raw`,label:`Raw disk needed`,unit:`bytes`},{key:`disks`,label:`Disks`,unit:`count`},{key:`metadata`,label:`Metadata size`,unit:`bytes`}],eqs:[{out:`objects`,terms:[[`storage`,1],[`avgObject`,-1]]},{out:`raw`,terms:[[`storage`,1],[`overheadFactor`,1]]},{out:`disks`,terms:[[`raw`,1],[`diskBytes`,-1]]},{out:`metadata`,terms:[[`objects`,1],[`metaBytes`,1]]}],starts:[{key:`storage`,value:0x16345785d8a0000},{key:`objects`,value:1e10},{key:`disks`,value:1e4}]},lab:{secondsPerTick:S*86400,params:[{key:`mode`,label:`Redundancy`,kind:`choice`,rebuild:!0,options:[{value:`erasure`,label:`Erasure coding`},{value:`replication`,label:`Replication`}]},{key:`copies`,label:`Copies, for replication`,kind:`range`,min:1,max:5,step:1,rebuild:!0},{key:`k`,label:`Data shards, for erasure coding`,kind:`range`,min:2,max:12,step:1,rebuild:!0},{key:`m`,label:`Parity shards, for erasure coding`,kind:`range`,min:1,max:6,step:1,rebuild:!0},{key:`afr`,label:`Disk failures per year`,kind:`range`,min:.01,max:1,step:.01,format:e=>a(e)},{key:`repairDays`,label:`Repair time`,kind:`range`,min:1,max:60,step:1,unit:`days`}],defaults:{mode:`erasure`,copies:3,k:8,m:4,afr:.02,repairDays:5},create(e){let t=_(w.encode(x),e.k,e.m);return{now:0,groups:A(e),lostGroups:0,demo:t,alive:t.shards.map(()=>!0),result:null}},step(e,t,n){let r=S,i=E(t),a=t.afr*r/365;e.now+=r;for(let o of e.groups)if(!o.lost){for(let i=0;i<o.failedUntil.length;i++)o.failedUntil[i]<=e.now&&n.chance(a)&&(o.failedUntil[i]=e.now-n.next()*r+t.repairDays);y(o,e.now)>i.parity&&(o.lost=!0,e.lostGroups++)}},sample:e=>({lost:e.lostGroups,share:e.lostGroups/C*100}),charts:[{title:`Object groups lost, of 3,000`,series:[{key:`lost`,label:`Measured`,role:`measured`}]}],metrics(t,n){let i=E(n),o=O(n);return[{label:`Storage overhead`,value:`+${a(D(n))}`,role:`predicted`},{label:`Disks to lose before data loss`,value:String(i.parity+1),role:`predicted`},{label:`Durability`,value:`${k(o)} nines`,role:`predicted`,tone:`good`},{label:`Groups lost`,value:r(t.lostGroups),role:`measured`,tone:t.lostGroups?`bad`:`good`},{label:`Simulated time`,value:e(t.now*86400)}]},math(e,t){let r=E(t),i=r.data+r.parity;return[{expr:`Stores ${i} units for every ${r.data} of data`,result:`${(i/r.data).toFixed(2)}× size`},{expr:`Chance one more disk fails during repair: ${a(t.afr)} × ${t.repairDays} ÷ 365`,result:a(t.afr*t.repairDays/365,3)},{expr:`Ways for ${r.parity+1} of ${i} disks to fail`,result:n(s(i,r.parity+1))},{expr:`Loss per object group per year, about`,result:O(t).toExponential(1)}]},View:j,actions:[{key:`reconstruct`,label:`Rebuild the object`,run:e=>{let t=v(e.demo,e.alive);e.result=t?T.decode(t):null}},{key:`kill-parity-count`,label:`Destroy as many shards as parity allows`,run:e=>{e.alive=e.demo.shards.map((t,n)=>n>=e.demo.m)}},{key:`kill-too-many`,label:`Destroy one shard too many`,run:e=>{e.alive=e.demo.shards.map((t,n)=>n>e.demo.m)}},{key:`restore`,label:`Restore all shards`,run:e=>{e.alive=e.demo.shards.map(()=>!0),e.result=null}}],trace:(e,t)=>({values:{k:`${t.k} data + ${t.m} parity`,alive:`${e.alive.filter(Boolean).length} alive`,out:e.result===null?`not rebuilt`:`rebuilt`}}),experiments:[{title:`Half the storage`,set:{mode:`erasure`,k:8,m:4},ticks:5,question:`Three-way replication uses 200% extra storage. What does 8+4 erasure coding use, while surviving more failures?`,options:[`200%`,`100%`,`50%`],answer:2,explain:`4 parity shards for 8 data shards adds 50%, and you can lose any 4. Across exabytes, that saves a fortune. The tradeoff is CPU to encode and rebuild, and more disks involved on each read.`,check:(e,t)=>Math.abs(D(t)-.5)<.01},{title:`Lose four shards`,set:{mode:`erasure`,k:8,m:4},act:[`kill-parity-count`,`reconstruct`],actAt:1,ticks:3,question:`You destroy 4 of the 12 shards, including data shards. Can the original object be rebuilt?`,options:[`Yes, byte for byte`,`Only partly`,`No`],answer:0,explain:`Any 8 of the 12 shards are enough, whichever they are. That really happened here: the bytes above were rebuilt with Gaussian elimination over GF(256). Each parity shard is an independent equation in the 8 unknown data shards.`,check:e=>e.result===x},{title:`Lose five shards`,set:{mode:`erasure`,k:8,m:4},act:[`kill-too-many`,`reconstruct`],actAt:1,ticks:3,question:`Now 5 of the 12 are gone. What happens?`,options:[`Most of the data comes back`,`Nothing can be recovered`],answer:1,explain:`Seven equations can't solve for eight unknowns. It's a sharp cliff, not gradual decay. That's why repair speed matters: the contest is to rebuild before the next failure.`,check:e=>e.result===null},{title:`Compare on a bad fleet`,set:{mode:`replication`,copies:2,afr:.3,repairDays:30},ticks:60,question:`Disks are failing 30% a year, with 30-day repairs. Keeping only 2 copies, do you lose data within 5 years?`,options:[`No`,`Yes, many objects`],answer:1,explain:`With only one spare copy and slow repairs, two overlapping failures are common. Durability depends on failure rate, repair time and redundancy together, and only the combination gives you those nines.`,check:e=>e.lostGroups>20},{title:`Same fleet, better coding`,set:{mode:`erasure`,k:8,m:4,afr:.3,repairDays:30},ticks:60,question:`Same awful fleet, using 8+4. How many objects are lost?`,options:[`Almost none, with less overhead than 3 copies`,`About the same as 2 copies`],answer:0,explain:`It takes 5 overlapping failures among 12 disks to lose anything, which is rare even here. And it uses less extra storage than 2 copies. That's why cold data at large scale is almost always erasure coded.`,check:e=>e.lostGroups<20}]},pseudocode:[{code:`put(object):`},{code:`  split into k data shards`,id:`k`},{code:`  parity = encoding_matrix × data shards, in GF(256)`},{code:`  place all shards in different failure domains`},{code:``},{code:`get(object):`},{code:`  read any k shards`,id:`alive`},{code:`  data = inverse(matrix for those shards) × shards`,id:`out`}],sources:[{name:`engine.ts`,code:u,lang:`ts`}],tradeoffs:[{choice:`Replication`,gain:`Fast reads and simple repair`,cost:`High storage cost`},{choice:`Erasure coding`,gain:`Much cheaper, and more durable`,cost:`CPU for encoding, and rebuilds touch many disks`},{choice:`More parity`,gain:`More durable`,cost:`More storage, and more work on writes`},{choice:`Multi-region`,gain:`Survives region loss`,cost:`Much higher cost and latency`}],interview:[{q:`How do you detect silent corruption?`,a:`Store checksums alongside shards, and verify on each read. Background scrubbing re-reads everything periodically, because some corruption occurs on data nobody is reading.`},{q:`How does multipart upload work?`,a:`The client gets an upload ID, sends parts independently, and calls complete at the end. A failed part retries alone, and parts upload in parallel. Unfinished uploads need garbage collecting.`},{q:`How do you list objects when metadata is sharded?`,a:`Listing by prefix across shards is hard. It's common to keep a separate listing table per bucket, or merge sorted results across shards with pagination.`},{q:`How does versioning work?`,a:`Instead of overwriting, add a new row with a new version for the same name, and mark deletes with a delete marker. Old data is kept until a lifecycle rule removes it.`}],mistakes:[`Treating metadata and data as one system.`,`Claiming durability numbers without considering repair time.`,`Placing shards with no regard for failure domains.`]};export{M as default};