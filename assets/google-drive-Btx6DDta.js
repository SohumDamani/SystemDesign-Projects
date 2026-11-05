import{o as e,r as t,s as n}from"./index-ar0glIxf.js";var r=`// Block-level sync on real bytes: split a file, hash each block, upload only what's new.
import type { Rng } from '../../core/rng';

export interface Block {
  start: number;
  length: number;
  hash: string;
}

/** A 64-bit hash built from two 32-bit FNV runs. A real system would use SHA-256. */
export function hashBytes(data: Uint8Array, start: number, end: number): string {
  let a = 0x811c9dc5;
  let b = 0xcbf29ce4;
  for (let i = start; i < end; i++) {
    a = Math.imul(a ^ data[i], 0x01000193);
    b = Math.imul(b ^ data[i], 0x100001b3);
  }
  return (a >>> 0).toString(16) + (b >>> 0).toString(16);
}

/** Cut at every fixed offset. Simple, but one inserted byte shifts every later block. */
export function fixedChunks(data: Uint8Array, size: number): Block[] {
  const blocks: Block[] = [];
  for (let start = 0; start < data.length; start += size) {
    const end = Math.min(start + size, data.length);
    blocks.push({ start, length: end - start, hash: hashBytes(data, start, end) });
  }
  return blocks;
}

const GEAR = (() => {
  // A fixed table of random numbers, so everyone cuts at the same content.
  const table = new Uint32Array(256);
  let x = 0x9e3779b9;
  for (let i = 0; i < 256; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    table[i] = x >>> 0;
  }
  return table;
})();

/**
 * Cut where a rolling hash of recent bytes hits a pattern. Boundaries now depend on the
 * content rather than the offset, so an insert only affects the blocks next to it.
 */
export function contentDefinedChunks(data: Uint8Array, average: number): Block[] {
  const bits = Math.max(1, Math.round(Math.log2(average)));
  const mask = ((1 << bits) - 1) << (32 - bits);
  const min = average >> 2;
  const max = average * 4;
  const blocks: Block[] = [];
  let start = 0;
  let h = 0;
  for (let i = 0; i < data.length; i++) {
    h = ((h << 1) + GEAR[data[i]]) | 0;
    const length = i - start + 1;
    if ((length >= min && (h & mask) === 0) || length >= max) {
      blocks.push({ start, length, hash: hashBytes(data, start, i + 1) });
      start = i + 1;
      h = 0;
    }
  }
  if (start < data.length) blocks.push({ start, length: data.length - start, hash: hashBytes(data, start, data.length) });
  return blocks;
}

/** Storage keeps one copy of each block, found by its hash. */
export class BlockStore {
  private hashes = new Set<string>();
  storedBytes = 0;

  /** Uploads only unknown blocks, and returns the bytes that crossed the network. */
  sync(blocks: Block[]): { uploaded: number; newBlocks: Set<string> } {
    let uploaded = 0;
    const newBlocks = new Set<string>();
    for (const block of blocks) {
      if (!this.hashes.has(block.hash)) {
        this.hashes.add(block.hash);
        uploaded += block.length;
        this.storedBytes += block.length;
        newBlocks.add(block.hash);
      }
    }
    return { uploaded, newBlocks };
  }
}

export function randomFile(size: number, rng: Rng): Uint8Array {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) data[i] = rng.int(256);
  return data;
}

export function overwrite(data: Uint8Array, at: number, length: number, rng: Rng): Uint8Array {
  const out = data.slice();
  for (let i = 0; i < length && at + i < out.length; i++) out[at + i] = rng.int(256);
  return out;
}

export function insert(data: Uint8Array, at: number, length: number, rng: Rng): Uint8Array {
  const out = new Uint8Array(data.length + length);
  out.set(data.subarray(0, at));
  for (let i = 0; i < length; i++) out[at + i] = rng.int(256);
  out.set(data.subarray(at), at + length);
  return out;
}

export const removeBytes = (data: Uint8Array, length: number): Uint8Array => data.slice(0, Math.max(0, data.length - length));
`;function i(e,t,n){let r=2166136261,i=3421674724;for(let a=t;a<n;a++)r=Math.imul(r^e[a],16777619),i=Math.imul(i^e[a],268435891);return(r>>>0).toString(16)+(i>>>0).toString(16)}function a(e,t){let n=[];for(let r=0;r<e.length;r+=t){let a=Math.min(r+t,e.length);n.push({start:r,length:a-r,hash:i(e,r,a)})}return n}var o=(()=>{let e=new Uint32Array(256),t=2654435769;for(let n=0;n<256;n++)t^=t<<13,t^=t>>>17,t^=t<<5,e[n]=t>>>0;return e})();function s(e,t){let n=Math.max(1,Math.round(Math.log2(t))),r=(1<<n)-1<<32-n,a=t>>2,s=t*4,c=[],l=0,u=0;for(let t=0;t<e.length;t++){u=(u<<1)+o[e[t]]|0;let n=t-l+1;(n>=a&&(u&r)===0||n>=s)&&(c.push({start:l,length:n,hash:i(e,l,t+1)}),l=t+1,u=0)}return l<e.length&&c.push({start:l,length:e.length-l,hash:i(e,l,e.length)}),c}var c=class{hashes=new Set;storedBytes=0;sync(e){let t=0,n=new Set;for(let r of e)this.hashes.has(r.hash)||(this.hashes.add(r.hash),t+=r.length,this.storedBytes+=r.length,n.add(r.hash));return{uploaded:t,newBlocks:n}}};function l(e,t){let n=new Uint8Array(e);for(let r=0;r<e;r++)n[r]=t.int(256);return n}function u(e,t,n,r){let i=e.slice();for(let e=0;e<n&&t+e<i.length;e++)i[t+e]=r.int(256);return i}function d(e,t,n,r){let i=new Uint8Array(e.length+n);i.set(e.subarray(0,t));for(let e=0;e<n;e++)i[t+e]=r.int(256);return i.set(e.subarray(t),t+n),i}var f=(e,t)=>e.slice(0,Math.max(0,e.length-t)),p=.5,m=8,h=(e,t)=>t.chunking===`fixed`?a(e,t.blockKb*1024):s(e,t.blockKb*1024),g=e=>e.edits?e.shareSum/e.edits:0,_={problem:[`A cloud drive keeps your files in sync across devices and lets you share them. The hard requirement is that it can never lose or corrupt a file. People will forgive a slow sync, but they won't forgive a missing document.`,`The clever part is what uploads. Sending a whole file for each small edit wastes huge amounts of bandwidth and storage. By splitting files into blocks and identifying each by a hash, you upload only what changed, and store identical blocks just once.`],functional:[`Upload and download files`,`Sync across devices`,`See version history, and share with others`],nonFunctional:[`Never lose data`,`Fast sync, with minimal bandwidth`,`Scales to huge storage, with reasonable cost`],diagram:{nodes:[{id:`c`,label:`Client`,col:0,row:1,kind:`client`,note:`Watches for changes, splits files into blocks, and hashes them.`},{id:`b`,label:`Block servers`,col:1,row:0,note:`Receive new blocks, then compress and encrypt them before storing.`},{id:`s`,label:`Cloud storage`,col:2,row:0,kind:`store`,note:`Holds blocks by hash, replicated for durability, and moved to cold storage if unused.`},{id:`a`,label:`API servers`,col:1,row:1,note:`Handle file metadata, sharing and permissions.`},{id:`m`,label:`Metadata database`,col:2,row:1,kind:`store`,note:`Maps a file version to its list of block hashes. Needs strong consistency.`},{id:`n`,label:`Notification service`,col:1,row:2,note:`Holds long polls open, so other devices hear about changes quickly.`},{id:`q`,label:`Offline queue`,col:2,row:2,kind:`queue`,note:`Keeps changes for devices that are offline, until they come back.`}],edges:[{from:`c`,to:`b`,label:`new blocks`},{from:`b`,to:`s`},{from:`c`,to:`a`},{from:`a`,to:`m`},{from:`a`,to:`n`},{from:`n`,to:`c`,dashed:!0,label:`long poll`},{from:`n`,to:`q`}]},ideas:[{title:`Blocks and hashes`,body:`Split files into blocks and name each by a hash of its contents. A file version is just a list of hashes, so the client needs to upload only unknown blocks.`},{title:`Deduplication`,body:`Identical blocks are stored once, even across users. It's a big saving for common files. You also get version history cheaply, since new versions share most of their blocks.`},{title:`Metadata needs strong consistency`,body:`Blob storage can be eventually consistent, but the metadata can't. Two devices must never disagree on which blocks make up a file, so a relational database with ACID transactions fits well.`},{title:`Conflicts`,body:`With two offline edits to the same file, the first to sync wins, and the other gets saved as a conflict copy. You keep both, and let the user sort it out.`}],estimator:{vars:[{key:`users`,label:`Registered users`,unit:`count`},{key:`dauShare`,label:`Daily active share (0 to 1)`,unit:`plain`,assume:.2},{key:`filesPerDay`,label:`Uploads per active user per day`,unit:`plain`,assume:2},{key:`fileBytes`,label:`Bytes per file`,unit:`plain`,assume:5e5},{key:`quota`,label:`Average bytes used per user`,unit:`plain`,assume:2e9},{key:`dau`,label:`Daily active users`,unit:`count`},{key:`uploadQps`,label:`Upload rate`,unit:`qps`},{key:`dailyBytes`,label:`New data per day`,unit:`bytes`},{key:`totalBytes`,label:`Total storage`,unit:`bytes`}],eqs:[{out:`dau`,terms:[[`users`,1],[`dauShare`,1]]},{out:`uploadQps`,terms:[[`dau`,1],[`filesPerDay`,1],[86400,-1]]},{out:`dailyBytes`,terms:[[`dau`,1],[`filesPerDay`,1],[`fileBytes`,1]]},{out:`totalBytes`,terms:[[`users`,1],[`quota`,1]]}],starts:[{key:`users`,value:5e7},{key:`totalBytes`,value:0x6f05b59d3b20000},{key:`uploadQps`,value:240}]},lab:{secondsPerTick:p,params:[{key:`fileKb`,label:`File size`,kind:`range`,min:256,max:8192,step:256,rebuild:!0,format:e=>t(e*1024)},{key:`blockKb`,label:`Block size`,kind:`range`,min:4,max:1024,step:4,rebuild:!0,format:e=>t(e*1024)},{key:`chunking`,label:`How to split the file`,kind:`choice`,rebuild:!0,options:[{value:`fixed`,label:`Fixed-size blocks`},{value:`content`,label:`Content-defined blocks`}]},{key:`editType`,label:`Type of edit`,kind:`choice`,options:[{value:`overwrite`,label:`Overwrite bytes in place`},{value:`insert`,label:`Insert bytes`}]},{key:`editBytes`,label:`Edit size`,kind:`range`,min:16,max:65536,step:16,format:e=>t(e)},{key:`collaborators`,label:`People editing`,kind:`range`,min:1,max:8,step:1},{key:`editsPerMin`,label:`Edits per person per minute`,kind:`range`,min:1,max:30,step:1},{key:`syncDelay`,label:`Sync delay`,kind:`range`,min:.5,max:30,step:.5,unit:`s`}],defaults:{fileKb:2048,blockKb:64,chunking:`fixed`,editType:`overwrite`,editBytes:1024,collaborators:2,editsPerMin:4,syncDelay:2},create(e,t){let n=l(e.fileKb*1024,t),r=new c,i=h(n,e);return r.sync(i),{now:0,data:n,store:r,blocks:i,fresh:new Set,edits:0,uploadedTotal:0,lastUpload:0,shareNow:0,shareSum:0,commits:0,conflicts:0,lastCommit:-100}},step(e,t,n){if(e.now+=p,Math.round(e.now/p)%m===0){let r=n.int(Math.max(1,e.data.length-t.editBytes)),i=t.editType===`overwrite`?u(e.data,r,t.editBytes,n):d(e.data,r,t.editBytes,n);i.length>t.fileKb*1024*1.2&&(i=f(i,i.length-t.fileKb*1024)),e.data=i,e.blocks=h(e.data,t);let{uploaded:a,newBlocks:o}=e.store.sync(e.blocks);e.fresh=o,e.lastUpload=a,e.uploadedTotal+=a,e.shareNow=a/e.data.length,e.shareSum+=e.shareNow,e.edits++}for(let r=n.poisson(t.collaborators*t.editsPerMin*p/60);r>0;r--)t.collaborators>1&&e.now-e.lastCommit<t.syncDelay&&e.conflicts++,e.commits++,e.lastCommit=e.now},sample:(e,t)=>{let n=(t.collaborators-1)*t.editsPerMin/60;return{upload:e.lastUpload/1024,whole:e.data.length/1024,conflict:e.commits?e.conflicts/e.commits*100:0,conflictMath:(1-Math.exp(-(n+t.editsPerMin/60)*t.syncDelay))*100}},charts:[{title:`Uploaded by the latest edit`,unit:`KB`,series:[{key:`upload`,label:`Measured`,role:`measured`},{key:`whole`,label:`Whole file`,role:`other`}]},{title:`Saves that create a conflict`,unit:`%`,series:[{key:`conflict`,label:`Measured`,role:`measured`},{key:`conflictMath`,label:`Math`,role:`predicted`}]}],metrics(r,i){let a=i.blockKb*1024,o=i.editType===`overwrite`||i.chunking===`content`?Math.min(r.data.length,(Math.ceil(i.editBytes/a)+1)*a):r.data.length/2;return[{label:`Upload per edit`,value:t(o),role:`predicted`},{label:`Latest upload`,value:t(r.lastUpload),role:`measured`},{label:`Share of file re-sent`,value:n(g(r),1),role:`measured`},{label:`Blocks in the file`,value:e(r.blocks.length),role:`measured`},{label:`Conflicts`,value:e(r.conflicts),role:`measured`,tone:r.conflicts?`warn`:void 0}]},math(r,i){let a=i.blockKb*1024,o=i.collaborators*i.editsPerMin/60;return[{expr:`Blocks: ${t(r.data.length)} ÷ ${t(a)}`,result:e(r.data.length/a)},{expr:i.editType===`insert`&&i.chunking===`fixed`?`An insert shifts every block after it`:`Edit touches ${Math.ceil(i.editBytes/a)} to ${Math.ceil(i.editBytes/a)+1} blocks`,result:i.editType===`insert`&&i.chunking===`fixed`?`half the file on average`:t((Math.ceil(i.editBytes/a)+1)*a),tone:i.editType===`insert`&&i.chunking===`fixed`?`bad`:`good`},{expr:`Conflict chance: 1 − e^(−${o.toFixed(2)} saves/s × ${i.syncDelay} s)`,result:n(1-Math.exp(-o*i.syncDelay))}]},views:e=>[{kind:`cells`,title:`First blocks of the file: orange ones were uploaded by the last edit`,items:e.blocks.slice(0,32).map((n,r)=>({label:`#${r+1}`,value:t(n.length),tone:e.fresh.has(n.hash)?`warn`:`neutral`}))}],trace:n=>({values:{blocks:e(n.blocks.length),upload:t(n.lastUpload),kept:e(n.blocks.length-n.fresh.size),conflicts:e(n.conflicts)}}),experiments:[{title:`A small edit`,set:{chunking:`fixed`,editType:`overwrite`,blockKb:64,fileKb:2048,editBytes:1024},ticks:160,question:`You change 1 KB in the middle of a 2 MB file, split into 64 KB blocks. How much actually uploads?`,options:[`Just 1 KB`,`About 64 KB`,`The whole 2 MB`],answer:1,explain:`Only the blocks containing the change have new hashes, so only those upload. That's one block, or occasionally two. It's about 3% of the file, and that's the whole reason for block-level sync.`,check:e=>g(e)<.07},{title:`Insert some bytes`,set:{chunking:`fixed`,editType:`insert`,blockKb:64,fileKb:2048,editBytes:100},ticks:160,question:`Now you insert 100 bytes instead of overwriting. With fixed-size blocks, how much uploads?`,options:[`About 64 KB, like before`,`A large part of the file`],answer:1,explain:`Inserting shifts every later byte, so every later block now contains different bytes and has a new hash. On average, half the file re-uploads for a 100-byte change. Fixed-size blocks are fragile in exactly this way.`,check:e=>g(e)>.25},{title:`Cut by content`,set:{chunking:`content`,editType:`insert`,blockKb:64,fileKb:2048,editBytes:100},ticks:160,question:`Same insert, but block boundaries now depend on the content rather than position. How much uploads?`,options:[`A block or two`,`Half the file`,`The whole file`],answer:0,explain:`After the insert, the rolling hash soon finds the same cut points as before, so later blocks come out identical. Only the blocks around the change differ. It costs more CPU, but rsync, backup tools and dedup systems all rely on the idea.`,check:e=>g(e)<.1},{title:`Edit at the same time`,set:{collaborators:5,editsPerMin:12,syncDelay:5},ticks:800,question:`Five people each save 12 times a minute, and sync takes 5 seconds. How often does a save conflict with one the person hadn't seen yet?`,options:[`Rarely, under 5%`,`About half the time`,`Nearly always`],answer:2,explain:`That's one save per second across the group, so within any 5-second window another save almost always lands: 1 − e^(−5) ≈ 99%. Whole-file sync with first-write-wins suits occasional edits. Real-time collaboration needs operational transforms or CRDTs.`,check:e=>e.commits>50&&e.conflicts/e.commits>.8}]},pseudocode:[{code:`on_file_changed(file):`},{code:`  blocks = split file into chunks`,id:`blocks`},{code:`  for each block: hash = sha256(block)`},{code:`  ask server which hashes it doesn't have`},{code:`  upload only those blocks`,id:`upload`},{code:`  blocks reused without uploading`,id:`kept`},{code:`  commit new version = list of hashes`},{code:`  if base version is stale: save as conflict copy`,id:`conflicts`}],sources:[{name:`engine.ts`,code:r,lang:`ts`}],tradeoffs:[{choice:`Small blocks`,gain:`Less re-upload per edit, and better dedup`,cost:`More hashes and metadata, and more requests`},{choice:`Content-defined blocks`,gain:`Resists inserts`,cost:`More CPU, and variable block sizes`},{choice:`Cold storage for old blocks`,gain:`Much lower cost`,cost:`Slow retrieval`},{choice:`Long polling`,gain:`Simple and enough for sync`,cost:`Less immediate than a WebSocket`}],interview:[{q:`Why are uploads separate from metadata?`,a:`They have very different needs. Blocks are large, slow and can go straight to storage, while metadata is small and needs strong consistency. Separating them lets each scale independently.`},{q:`How do you avoid losing data?`,a:`Replicate across regions, store checksums and verify on read, keep old versions, and only commit metadata after every block is safely stored.`},{q:`How do you save storage cost?`,a:`Dedup blocks, limit versions kept per file, move inactive data to cold storage, and compress. Don't compress blocks that are already compressed, like video.`},{q:`How is real-time collaborative editing different?`,a:`Syncing whole-file versions isn't enough. Google Docs-style editing sends individual operations and merges them with operational transforms or CRDTs, which is a different system.`}],mistakes:[`Uploading whole files each time.`,`Using eventually consistent storage for metadata.`,`Silently overwriting one user's edits on conflict.`]};export{_ as default};