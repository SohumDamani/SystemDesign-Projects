import{a as e,c as t,f as n,o as r,p as i}from"./index-n79SFkCo.js";var a=`// The video player's adaptive bitrate logic, and an LRU cache standing in for a CDN edge.
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

/** Advances the player by dt seconds on a connection of \`bandwidth\` Mbps. */
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
`,o=[{name:`240p`,mbps:.4},{name:`360p`,mbps:.75},{name:`480p`,mbps:1.5},{name:`720p`,mbps:3},{name:`1080p`,mbps:5},{name:`4K`,mbps:16}],s=8,c=.8;function l(){return{buffer:0,estimate:1.5,current:2,chunkLeftMb:0,downloadTime:0,chunkMb:0,watched:0,stalled:0,bitrateSeconds:0,switches:0,lowest:o.length-1}}function u(e){let t=e.buffer<s?c*.7:c,n=0;return o.forEach((r,i)=>{r.mbps<=e.estimate*t&&(n=i)}),n}function d(e,t,n,r,i){if(e.chunkLeftMb<=0&&e.buffer+4<=30){let t=r===`adaptive`?u(e):i;t!==e.current&&e.switches++,e.current=t,e.lowest=Math.min(e.lowest,t),e.chunkMb=o[t].mbps*4,e.chunkLeftMb=e.chunkMb,e.downloadTime=0}e.chunkLeftMb>0&&(e.chunkLeftMb-=t*n,e.downloadTime+=n,e.chunkLeftMb<=0&&(e.buffer+=4,e.chunkLeftMb=0,e.estimate=e.estimate*.6+e.chunkMb/e.downloadTime*.4)),e.buffer>=n?(e.buffer-=n,e.watched+=n,e.bitrateSeconds+=o[e.current].mbps*n):e.stalled+=n}var f=class{capacity;map=new Map;constructor(e){this.capacity=e}request(e){return this.map.delete(e)?(this.map.set(e,!0),!0):(this.map.size>=this.capacity&&this.map.delete(this.map.keys().next().value),this.map.set(e,!0),!1)}},p=.5,m=2e4,h=.9,g=.5,_=1e7,v=.02,y=.09,b=e=>{let t=e.watched+e.stalled;return t?e.stalled/t:0},x={problem:[`A video platform really has two separate systems. The upload path takes a raw video file and turns it into many formats, a large and failure-prone batch job. The streaming path delivers those formats to viewers smoothly, whatever their connection.`,`The numbers are huge, and bandwidth dominates the cost. So design decisions are mostly about two things: making transcoding reliable and parallel, and serving as much as possible from a CDN while still handling the long tail of rarely watched videos cheaply.`],functional:[`Upload videos of many formats and sizes`,`Stream smoothly on any device or connection`,`Change quality automatically`],nonFunctional:[`Fast startup and little buffering`,`High availability, and low cost per view`,`Uploads survive failures and can resume`],diagram:{nodes:[{id:`u`,label:`Creator`,col:0,row:0,kind:`client`,note:`Uploads in parts, so a broken connection only retries one part.`},{id:`o`,label:`Original storage`,col:1,row:0,kind:`store`,note:`Blob storage holding the untouched source file.`},{id:`t`,label:`Transcoding workers`,col:2,row:0,note:`Split the video into segments and encode them in parallel, as a graph of tasks.`},{id:`s`,label:`Encoded storage`,col:3,row:0,kind:`store`,note:`Every resolution and codec for every segment.`},{id:`c`,label:`CDN`,col:3,row:1,kind:`external`,note:`Serves the popular videos from locations near viewers.`},{id:`v`,label:`Viewer`,col:2,row:1,kind:`client`,note:`Downloads a manifest, then chooses a quality for each chunk.`},{id:`a`,label:`API and metadata`,col:1,row:1,note:`Handles video details, comments and user data, separately from the bytes themselves.`}],edges:[{from:`u`,to:`o`},{from:`o`,to:`t`},{from:`t`,to:`s`},{from:`s`,to:`c`},{from:`v`,to:`c`},{from:`v`,to:`a`}]},ideas:[{title:`Adaptive bitrate`,body:`Each video is cut into short chunks, each encoded at several qualities. The player picks one per chunk based on speed and buffer level, so quality follows the connection.`},{title:`Transcoding as a graph`,body:`Split a video into chunks, then run steps like encoding, thumbnails and watermarking as a directed graph of tasks across many workers. Parallelism turns hours into minutes, and failed tasks retry individually.`},{title:`The CDN is the bill`,body:`Most of your cost is bandwidth. Serve popular videos from a CDN, and consider serving unpopular ones from your own servers, encoding them less, or encoding on demand.`},{title:`Resumable uploads`,body:`Split uploads into parts with checksums. A dropped connection only loses one part, and clients can upload directly to storage, skipping your API servers.`}],estimator:{vars:[{key:`dau`,label:`Daily active users`,unit:`count`},{key:`viewsPerUser`,label:`Videos watched per user per day`,unit:`plain`,assume:5},{key:`uploadShare`,label:`Share who upload daily (0 to 1)`,unit:`plain`,assume:.1},{key:`videoBytes`,label:`Bytes per video`,unit:`plain`,assume:3e8},{key:`copies`,label:`Size multiple after transcoding`,unit:`plain`,assume:3},{key:`costPerByte`,label:`CDN cost per GB in dollars`,unit:`plain`,assume:.02},{key:`uploadsDay`,label:`Uploads per day`,unit:`count`},{key:`viewQps`,label:`Video views`,unit:`qps`},{key:`storageDay`,label:`Storage added per day`,unit:`bytes`},{key:`egressDay`,label:`Bytes served per day`,unit:`bytes`},{key:`costDay`,label:`CDN dollars per day`,unit:`count`}],eqs:[{out:`uploadsDay`,terms:[[`dau`,1],[`uploadShare`,1]]},{out:`viewQps`,terms:[[`dau`,1],[`viewsPerUser`,1],[86400,-1]]},{out:`storageDay`,terms:[[`uploadsDay`,1],[`videoBytes`,1],[`copies`,1]]},{out:`egressDay`,terms:[[`dau`,1],[`viewsPerUser`,1],[`videoBytes`,1]]},{out:`costDay`,terms:[[`egressDay`,1],[`costPerByte`,1],[1e9,-1]]}],starts:[{key:`dau`,value:5e6},{key:`storageDay`,value:0x5af3107a4000},{key:`costDay`,value:1e5}]},lab:{secondsPerTick:p,params:[{key:`mode`,label:`Quality selection`,kind:`choice`,rebuild:!0,options:[{value:`adaptive`,label:`Adaptive bitrate`},{value:`fixed`,label:`Always one quality`}]},{key:`fixed`,label:`Fixed quality`,kind:`range`,min:0,max:o.length-1,step:1,format:e=>`${o[e].name}, ${o[e].mbps} Mbps`},{key:`bandwidth`,label:`Connection speed`,kind:`range`,min:.5,max:25,step:.5,unit:`Mbps`},{key:`jitter`,label:`Connection variability`,kind:`range`,min:0,max:.5,step:.05,format:e=>i(e)},{key:`cdnPercent`,label:`CDN holds this share of videos`,kind:`range`,min:1,max:50,step:1,unit:`%`,rebuild:!0}],defaults:{mode:`adaptive`,fixed:4,bandwidth:3,jitter:.15,cdnPercent:5},create:e=>({player:l(),edge:new f(Math.round(m*e.cdnPercent/100)),zipf:t(m,h),drop:0,bandwidthNow:e.bandwidth,hitRate:0}),step(e,t,n){let r=e.drop>0?.25:1;e.drop>0&&(e.drop-=p),e.bandwidthNow=Math.max(.1,t.bandwidth*r*(1+n.gaussian(0,t.jitter))),d(e.player,e.bandwidthNow,p,t.mode,t.fixed);let i=0;for(let t=0;t<200;t++)e.edge.request(e.zipf(n))&&i++;e.hitRate=e.hitRate*.97+i/200*.03},sample:(e,t)=>({buffer:e.player.buffer,bitrate:o[e.player.current].mbps,bandwidth:e.bandwidthNow,stall:b(e.player)*100,hit:e.hitRate*100,bestHit:r(Math.round(m*t.cdnPercent/100),m,h)*100}),charts:[{title:`Seconds of video in the buffer`,series:[{key:`buffer`,label:`Measured`,role:`measured`}]},{title:`Video quality against connection`,unit:`Mbps`,series:[{key:`bitrate`,label:`Video bitrate`,role:`measured`},{key:`bandwidth`,label:`Connection`,role:`other`}]},{title:`CDN hit rate`,unit:`%`,series:[{key:`hit`,label:`Measured`,role:`measured`},{key:`bestHit`,label:`Best possible`,role:`predicted`}]}],metrics(e,t){let r=e.player,a=r.watched?r.bitrateSeconds/r.watched:0,s=t.mode===`fixed`?Math.max(0,1-t.bandwidth/o[t.fixed].mbps):0,c=g*_*(e.hitRate*v+(1-e.hitRate)*y);return[{label:`Time spent buffering`,value:i(s,1),role:`predicted`},{label:`Time spent buffering`,value:i(b(r),1),role:`measured`,tone:b(r)>.03?`bad`:`good`},{label:`Average bitrate`,value:`${a.toFixed(1)} Mbps`,role:`measured`},{label:`Quality switches`,value:n(r.switches),role:`measured`},{label:`Delivery cost per day`,value:`$${n(c)}`,role:`measured`}]},math(e,t){let r=o[e.player.current].mbps,a=g*_;return[{expr:`Buffer drains if bitrate > speed: ${r} vs ${t.bandwidth} Mbps`,result:r>t.bandwidth?`stalls ${i(1-t.bandwidth/r)} of the time`:`keeps up`,tone:r>t.bandwidth?`bad`:`good`},{expr:`No CDN: ${n(a)} GB/day × an assumed $${y} per GB`,result:`$${n(a*y)}`},{expr:`All from a CDN: ${n(a)} GB/day × an assumed $${v} per GB`,result:`$${n(a*v)}`}]},views:e=>[{kind:`bars`,title:`Buffer`,max:30,items:[{label:`Buffered`,value:e.player.buffer,display:`${e.player.buffer.toFixed(0)} s`}]},{kind:`cells`,title:`Renditions`,items:o.map((t,n)=>({label:t.name,value:`${t.mbps} Mbps`,tone:n===e.player.current?`good`:`neutral`}))}],actions:[{key:`drop`,label:`Enter a tunnel: speed falls for 30 s`,run:e=>{e.drop=30}}],trace:e=>({values:{est:`${e.player.estimate.toFixed(2)} Mbps`,pick:o[e.player.current].name,buf:`${e.player.buffer.toFixed(0)} s`}}),experiments:[{title:`Insist on 1080p`,set:{mode:`fixed`,fixed:4,bandwidth:3,jitter:0},ticks:400,question:`A 1080p stream needs 5 Mbps, and your connection gives 3. If you force 1080p, what share of the time will you spend staring at a spinner?`,options:[`None, the buffer handles it`,`About 40%`,`About 80%`],answer:1,explain:`You download 3 seconds of video per 5 seconds of real time, so only 60% of the time can be playback. No buffer size can fix a sustained shortfall. It only delays when you first notice.`,check:e=>b(e.player)>.25&&b(e.player)<.52},{title:`Let the player adapt`,set:{mode:`adaptive`,bandwidth:3,jitter:.15},ticks:400,question:`Same connection, but the player chooses quality for each chunk based on recent speed. What happens?`,options:[`Still about 40% buffering`,`Almost no buffering, at 720p or lower`,`It stays at 240p forever`],answer:1,explain:`Because each chunk comes in several qualities, the player can pick one the connection can sustain, leaving a margin for variability. Viewers much prefer a slightly softer picture to a pause. This is why videos are encoded many times over.`,check:e=>b(e.player)<.03&&e.player.bitrateSeconds/e.player.watched<3.05&&e.player.bitrateSeconds/e.player.watched>1},{title:`Into a tunnel`,set:{mode:`adaptive`,bandwidth:10,jitter:.1},act:[`drop`],actAt:120,ticks:300,question:`You're watching in high quality at 10 Mbps when speed drops by 75% for 30 seconds. What should a good player do?`,options:[`Pause until speed comes back`,`Drop quality and keep playing, using its buffer as a cushion`],answer:1,explain:`The buffer buys time for the estimate to catch up, then the player steps down. Once speed recovers, it climbs again. This is why a player likes to keep a full buffer before it needs one.`,check:e=>e.player.lowest<4&&b(e.player)<.08},{title:`A small CDN`,set:{cdnPercent:5},ticks:500,question:`The CDN only holds 5% of the videos. What share of views can it serve?`,options:[`About 5%`,`About half`,`Nearly all`],answer:1,explain:`Video popularity is very skewed: a small share of videos gets most of the views. So a small cache removes much of the cost, and the long tail can be served from origin. That's also why rarely-watched videos don't need copies on every edge.`,check:(t,n,r)=>{let i=e(r,`hit`,100);return i>35&&i<70}}]},pseudocode:[{code:`for each chunk:`},{code:`  estimate = smoothed recent download speed`,id:`est`},{code:`  margin = 0.8, or lower if the buffer is low`,id:`buf`},{code:`  quality = highest bitrate ≤ estimate × margin`,id:`pick`},{code:`  download the chunk and add it to the buffer`},{code:`  estimate from how long it really took`},{code:``},{code:`playback: consume the buffer, or stall when it's empty`}],sources:[{name:`engine.ts`,code:a,lang:`ts`}],tradeoffs:[{choice:`More renditions`,gain:`Smoother adaptation across devices`,cost:`More transcoding and storage per video`},{choice:`Bigger client buffer`,gain:`Survives longer dips`,cost:`Slower to adapt, and wasted data if the viewer leaves`},{choice:`CDN everything`,gain:`The best experience for all videos`,cost:`Pays for the long tail no one watches`},{choice:`Better codecs`,gain:`Less bandwidth for the same quality`,cost:`Much more compute, and older devices can't play them`}],interview:[{q:`How do you reduce cost?`,a:`Serve only popular videos from the CDN, encode unpopular videos on demand, skip high resolutions for short or low-view videos, and use better codecs for videos with many views.`},{q:`How do you handle a transcoding failure?`,a:`Store the original safely and treat each graph step as a retryable task, using a queue. A failure re-runs one chunk, not the whole video.`},{q:`How do you protect videos from being stolen?`,a:`DRM encrypts content so only licensed players can decode it, AES encryption with signed URLs raises the bar, and visible or hidden marks in the video help trace leaks. None of this makes copying impossible.`},{q:`How do you do live streaming differently?`,a:`It has a hard latency budget, so chunks must be smaller and it can't buffer much. There's also no second chance at encoding, and everyone wants the same chunk at the same moment.`}],mistakes:[`Proxying video bytes through your API servers.`,`Treating video data and metadata as one store.`,`Assuming every video deserves the same treatment.`]};export{x as default};