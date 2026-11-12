import{n as e}from"./rolldown-runtime-WkwZ5CU-.js";import{b as t,f as n,g as r,l as i,u as a}from"./index-n79SFkCo.js";var o=e(t(),1),s=`// Three ways to merge concurrent edits. Only the CRDT gets it right without a server deciding.

/** A character's permanent identity. It never changes, so it never needs adjusting. */
export interface CharId {
  site: number;
  clock: number;
}

export interface CrdtChar {
  id: CharId;
  after: CharId | null; // the character this was typed after
  value: string;
  deleted: boolean;
}

const same = (a: CharId | null, b: CharId | null) => (a === null || b === null ? a === b : a.site === b.site && a.clock === b.clock);
const newer = (a: CharId, b: CharId) => a.clock > b.clock || (a.clock === b.clock && a.site > b.site);

export type CrdtOp = { kind: 'insert'; char: CrdtChar } | { kind: 'delete'; id: CharId };

/**
 * A sequence CRDT, in the style of RGA. Each insert says "after this character", not
 * "at this position". Concurrent inserts at one spot are ordered by ID, so every
 * replica sorts them the same way, no matter what order they arrived in.
 */
export class CrdtDoc {
  chars: CrdtChar[] = [];
  private clock = 0;
  private pending: CrdtOp[] = [];

  constructor(readonly site: number) {}

  get text(): string {
    return this.chars.filter((c) => !c.deleted).map((c) => c.value).join('');
  }

  get tombstones(): number {
    return this.chars.filter((c) => c.deleted).length;
  }

  /** Types a character after the visible position \`index\`. */
  insert(index: number, value: string): CrdtOp {
    const visible = this.chars.filter((c) => !c.deleted);
    const after = index > 0 ? visible[index - 1].id : null;
    const char: CrdtChar = { id: { site: this.site, clock: ++this.clock }, after, value, deleted: false };
    const op: CrdtOp = { kind: 'insert', char };
    this.integrate(op);
    return op;
  }

  delete(index: number): CrdtOp | null {
    const visible = this.chars.filter((c) => !c.deleted);
    if (!visible[index]) return null;
    const op: CrdtOp = { kind: 'delete', id: visible[index].id };
    this.integrate(op);
    return op;
  }

  private position(id: CharId): number {
    return this.chars.findIndex((c) => same(c.id, id));
  }

  /** Applies an op, or holds it until the character it refers to has arrived. */
  integrate(op: CrdtOp) {
    if (op.kind === 'insert') this.clock = Math.max(this.clock, op.char.id.clock);
    if (!this.apply(op)) {
      this.pending.push(op);
      return;
    }
    let progress = true;
    while (progress) {
      progress = false;
      this.pending = this.pending.filter((p) => {
        if (this.apply(p)) {
          progress = true;
          return false;
        }
        return true;
      });
    }
  }

  private apply(op: CrdtOp): boolean {
    if (op.kind === 'delete') {
      const at = this.position(op.id);
      if (at < 0) return false;
      // A deleted character stays as a tombstone, since later inserts may point at it.
      this.chars[at].deleted = true;
      return true;
    }
    if (this.position(op.char.id) >= 0) return true; // already have it
    let at = 0;
    if (op.char.after) {
      const parent = this.position(op.char.after);
      if (parent < 0) return false;
      at = parent + 1;
    }
    // Skip past anything newer that was also typed at this spot.
    while (at < this.chars.length && newer(this.chars[at].id, op.char.id)) at++;
    this.chars.splice(at, 0, { ...op.char });
    return true;
  }
}

/** The naive way: send "insert at position 5". Fine until two people type at once. */
export class IndexDoc {
  text = '';

  insert(index: number, value: string) {
    this.text = this.text.slice(0, index) + value + this.text.slice(index);
  }

  apply(index: number, value: string) {
    this.insert(Math.min(index, this.text.length), value);
  }

  delete(index: number) {
    this.text = this.text.slice(0, index) + this.text.slice(index + 1);
  }
}
`,c=(e,t)=>e===null||t===null?e===t:e.site===t.site&&e.clock===t.clock,l=(e,t)=>e.clock>t.clock||e.clock===t.clock&&e.site>t.site,u=class{site;chars=[];clock=0;pending=[];constructor(e){this.site=e}get text(){return this.chars.filter(e=>!e.deleted).map(e=>e.value).join(``)}get tombstones(){return this.chars.filter(e=>e.deleted).length}insert(e,t){let n=this.chars.filter(e=>!e.deleted),r=e>0?n[e-1].id:null,i={kind:`insert`,char:{id:{site:this.site,clock:++this.clock},after:r,value:t,deleted:!1}};return this.integrate(i),i}delete(e){let t=this.chars.filter(e=>!e.deleted);if(!t[e])return null;let n={kind:`delete`,id:t[e].id};return this.integrate(n),n}position(e){return this.chars.findIndex(t=>c(t.id,e))}integrate(e){if(e.kind===`insert`&&(this.clock=Math.max(this.clock,e.char.id.clock)),!this.apply(e)){this.pending.push(e);return}let t=!0;for(;t;)t=!1,this.pending=this.pending.filter(e=>!this.apply(e)||(t=!0,!1))}apply(e){if(e.kind===`delete`){let t=this.position(e.id);return t<0?!1:(this.chars[t].deleted=!0,!0)}if(this.position(e.char.id)>=0)return!0;let t=0;if(e.char.after){let n=this.position(e.char.after);if(n<0)return!1;t=n+1}for(;t<this.chars.length&&l(this.chars[t].id,e.char.id);)t++;return this.chars.splice(t,0,{...e.char}),!0}},d=class{text=``;insert(e,t){this.text=this.text.slice(0,e)+t+this.text.slice(e)}apply(e,t){this.insert(Math.min(e,this.text.length),t)}delete(e){this.text=this.text.slice(0,e)+this.text.slice(e+1)}},f=r(),p=.1,m=100,h=55,g=5,_=(e,t,n)=>t===`crdt`?e.crdt[n].text:t===`index`?e.plain[n].text:e.whole[n].text,v=[`abcdefghij`,`KLMNOPQRST`,`0123456789`,`uvwxyz!?#&`,`ABCDEFGHIJ`];function y(e,t,n,r,i){for(let a=0;a<t.editors;a++)a!==n&&e.network.push({...r,to:a,at:e.now+i});e.sent++}function b(e,t,n,r,i){let a=t.latencyMs/1e3+Math.max(0,e.offlineUntil-e.now);if(t.mode===`crdt`){let o=e.crdt[n];y(e,t,n,{op:o.insert(Math.min(i,o.text.length),r)},a)}else if(t.mode===`index`){let o=e.plain[n],s=Math.min(i,o.text.length);o.insert(s,r),y(e,t,n,{index:s,value:r},a)}else{let o=e.whole[n],s=Math.min(i,o.text.length);o.text=o.text.slice(0,s)+r+o.text.slice(s),o.version=e.now+ ++e.versionTicks*1e-7,y(e,t,n,{doc:o.text,version:o.version},a)}e.typed++}function x(e,t,n,r){let i=t.latencyMs/1e3+Math.max(0,e.offlineUntil-e.now);if(t.mode===`crdt`){let a=e.crdt[n].delete(r);a&&(y(e,t,n,{op:a},i),e.deleted++)}else if(t.mode===`index`){let a=e.plain[n];r<a.text.length&&(a.delete(r),y(e,t,n,{index:r,remove:!0},i),e.deleted++)}else{let a=e.whole[n];r<a.text.length&&(a.text=a.text.slice(0,r)+a.text.slice(r+1),a.version=e.now+ ++e.versionTicks*1e-7,y(e,t,n,{doc:a.text,version:a.version},i),e.deleted++)}}function S(e){e.network=e.network.filter(t=>t.at>e.now||(t.op?e.crdt[t.to].integrate(t.op):t.doc===void 0?t.remove?e.plain[t.to].delete(Math.min(t.index??0,Math.max(0,e.plain[t.to].text.length-1))):e.plain[t.to].apply(t.index??0,t.value??``):(t.version??0)>e.whole[t.to].version&&(e.whole[t.to]={text:t.doc,version:t.version??0}),!1))}function C({state:e,params:t,rerender:n}){let[r,i]=(0,o.useState)(`hi`),a=i=>{for(let n of r)b(e,t,i,n,Math.floor(_(e,t.mode,i).length/2));n()};return(0,f.jsxs)(`div`,{className:`lab-panel`,children:[(0,f.jsx)(`h4`,{children:`Each editor's copy. Each person types different letters, so you can see who typed what.`}),(0,f.jsxs)(`div`,{className:`lab-input`,children:[(0,f.jsx)(`input`,{value:r,onChange:e=>i(e.target.value),"aria-label":`Text to type`,placeholder:`Type some text`}),Array.from({length:t.editors},(e,t)=>(0,f.jsxs)(`button`,{onClick:()=>a(t),children:[`As editor `,t+1]},t))]}),(0,f.jsx)(`div`,{className:`log`,style:{maxHeight:`none`},children:Array.from({length:t.editors},(n,r)=>{let i=_(e,t.mode,r);return(0,f.jsxs)(`div`,{style:{overflowWrap:`anywhere`},children:[`Editor `,r+1,`: `,i.length>140?`…${i.slice(-140)}`:i||`(empty)`]},r)})})]})}var w={problem:[`A shared document feels simple: people type, and everyone sees it. The problem appears when two people edit at the same moment, each on their own copy. Messages cross on the wire, and each person applies the edits in a different order.`,`If you're careless, copies silently diverge, or someone's work disappears. The two established solutions are operational transformation, used by Google Docs, and CRDTs. This lab runs a real sequence CRDT, against the simpler approaches it replaces.`],functional:[`Several people edit one document at the same time`,`See each other's edits within moments`,`Keep working offline, and merge afterwards`],nonFunctional:[`All copies end up identical`,`Nobody's typing is lost`,`Your own typing feels instant, regardless of network speed`],diagram:{nodes:[{id:`a`,label:`Editor A`,col:0,row:0,kind:`client`,note:`Applies your keystrokes locally right away, then sends them on.`},{id:`b`,label:`Editor B`,col:0,row:2,kind:`client`,note:`Might be offline, and sync everything when it returns.`},{id:`s`,label:`Collaboration server`,col:1,row:1,note:`Relays edits over WebSockets. With OT it also transforms them, while with CRDTs it just passes them on.`},{id:`l`,label:`Operation log`,col:2,row:1,kind:`store`,note:`Every edit, in order. It gives you history, and lets people catch up.`},{id:`d`,label:`Snapshots`,col:2,row:2,kind:`store`,note:`Periodic full copies, so loading doesn't have to replay everything.`}],edges:[{from:`a`,to:`s`,label:`ops`},{from:`b`,to:`s`,label:`ops`},{from:`s`,to:`l`},{from:`l`,to:`d`,dashed:!0}]},ideas:[{title:`Why positions fail`,body:`"Insert at position 5" is only true for the document you were looking at. If someone else has typed before that spot, 5 now means something different, so your edit lands in the wrong place.`},{title:`Operational transformation`,body:`A central server orders all edits, and each is transformed against the ones it didn't know about. It's well proven in Google Docs, but it needs a server, and getting it right is famously difficult.`},{title:`CRDTs`,body:`Give each character a permanent ID, and refer to IDs rather than positions. Merging becomes automatic and doesn't depend on order, so peers and offline editing just work. The cost is memory.`},{title:`Local first`,body:`Apply edits to your own copy immediately, and send them afterwards. Typing feels instant on any network, because the network is never in the way of a keystroke.`}],estimator:{vars:[{key:`docs`,label:`Documents open at once`,unit:`count`},{key:`editorsPerDoc`,label:`Editors per document`,unit:`plain`,assume:3},{key:`keystrokes`,label:`Edits per second per editor`,unit:`plain`,assume:2},{key:`opBytes`,label:`Bytes per edit`,unit:`plain`,assume:50},{key:`connPerServer`,label:`Connections per server`,unit:`plain`,assume:1e5},{key:`connections`,label:`Connections`,unit:`count`},{key:`editQps`,label:`Edits arriving`,unit:`qps`},{key:`servers`,label:`Collaboration servers`,unit:`count`},{key:`ingest`,label:`Edit bandwidth`,unit:`bytesPerSec`}],eqs:[{out:`connections`,terms:[[`docs`,1],[`editorsPerDoc`,1]]},{out:`editQps`,terms:[[`connections`,1],[`keystrokes`,1]]},{out:`servers`,terms:[[`connections`,1],[`connPerServer`,-1]]},{out:`ingest`,terms:[[`editQps`,1],[`opBytes`,1]]}],starts:[{key:`docs`,value:1e6},{key:`servers`,value:30},{key:`editQps`,value:5e5}]},lab:{secondsPerTick:p,params:[{key:`mode`,label:`How edits merge`,kind:`choice`,rebuild:!0,options:[{value:`crdt`,label:`CRDT: characters with IDs`},{value:`index`,label:`Send "insert at position N"`},{value:`last-write`,label:`Last write wins, whole file`}]},{key:`editors`,label:`People editing`,kind:`range`,min:2,max:5,step:1,rebuild:!0},{key:`typingPerSec`,label:`Letters per second, per person`,kind:`range`,min:1,max:20,step:1},{key:`latencyMs`,label:`Network delay`,kind:`range`,min:0,max:2500,step:50,unit:`ms`},{key:`deleteShare`,label:`Keystrokes that delete`,kind:`range`,min:0,max:.5,step:.05,format:e=>`${Math.round(e*100)}%`}],defaults:{mode:`crdt`,editors:3,typingPerSec:3,latencyMs:500,deleteShare:.1},create:e=>({tick:0,now:0,crdt:Array.from({length:e.editors},(e,t)=>new u(t+1)),plain:Array.from({length:e.editors},()=>new d),whole:Array.from({length:e.editors},()=>({text:``,version:0})),network:[],typed:0,deleted:0,offlineUntil:0,converged:null,lost:0,checks:0,divergedChecks:0,nextLetter:0,sent:0,versionTicks:0}),step(e,t,n){e.tick++,e.now+=p,S(e);let r=e.tick%m;if(r>0&&r<=h)for(let r=0;r<t.editors;r++)for(let i=n.poisson(t.typingPerSec*p);i>0;i--){let i=_(e,t.mode,r).length,a=n.int(i+1);if(i&&n.chance(t.deleteShare))x(e,t,r,Math.min(a,i-1));else{let n=v[r%v.length];b(e,t,r,n[e.nextLetter++%n.length],a)}}if(r===0&&!e.network.length){let n=Array.from({length:t.editors},(n,r)=>_(e,t.mode,r));e.converged=n.every(e=>e===n[0]),e.checks++,e.converged||e.divergedChecks++;let r=e.typed-e.deleted;e.lost=Math.max(0,r-n[0].length)}},sample:(e,t)=>({length:_(e,t.mode,0).length,expected:Math.max(0,e.typed-e.deleted),inFlight:e.network.length}),charts:[{title:`Letters in the document`,series:[{key:`length`,label:`Editor 1 has`,role:`measured`},{key:`expected`,label:`Should have`,role:`predicted`}]},{title:`Edits still in transit`,series:[{key:`inFlight`,label:`Measured`,role:`measured`}]}],metrics(e,t){let r=e.crdt[0];return[{label:`Copies match`,value:e.converged===null?`Checked at next pause`:e.converged?`Yes`:`No`,role:`measured`,tone:e.converged===null?void 0:e.converged?`good`:`bad`},{label:`Letters lost`,value:n(e.lost),role:`measured`,tone:e.lost?`bad`:`good`},{label:`Letters typed`,value:a(e.typed),role:`measured`},{label:`Metadata per letter`,value:t.mode===`crdt`?`24 bytes`:`None`,role:`predicted`},{label:`Deleted but kept`,value:t.mode===`crdt`?n(r.tombstones):`0`,role:`measured`}]},math(e,t){let r=t.editors*t.typingPerSec*(t.latencyMs/1e3),o=e.crdt[0];return[{expr:`Letters typed before others see them: ${t.editors} × ${t.typingPerSec}/s × ${t.latencyMs} ms`,result:`${r.toFixed(1)} at a time`,tone:r>1?`warn`:`good`},{expr:`CRDT storage: ${n(o.chars.length)} characters × (1 + 24 bytes)`,result:i(o.chars.length*25)},{expr:`Messages: each keystroke goes to ${t.editors-1} others`,result:`${a(e.sent*(t.editors-1))} so far`}]},View:C,actions:[{key:`offline`,label:`Go offline for 5 s, keep typing`,run:e=>{e.offlineUntil=e.now+g}}],trace:(e,t)=>({values:{len:`${n(_(e,t.mode,0).length)} letters`,net:`${n(e.network.length)} in transit`,ok:e.converged===null?`not checked yet`:e.converged?`all copies match`:`copies differ`}}),experiments:[{title:`Insert at position N`,set:{mode:`index`,editors:3,typingPerSec:5,latencyMs:500},ticks:200,question:`Each edit is sent as "insert this at position N". Others apply it when it arrives. People are typing at the same time. Do all copies end up matching?`,options:[`Yes`,`No, the copies end up different`],answer:1,explain:`By the time your "position 5" arrives, the other person has already added text before position 5, so it lands in the wrong place. Nothing crashes, yet everyone sees a different document. Fixing this with transforms is called operational transformation.`,check:e=>e.divergedChecks>0},{title:`Last write wins`,set:{mode:`last-write`,editors:3,typingPerSec:5,latencyMs:500,deleteShare:0},ticks:200,question:`Instead, send the whole document with a timestamp, and the newest replaces all others. Do copies match? Is anything lost?`,options:[`They match, and nothing is lost`,`They match, but people's letters get lost`],answer:1,explain:`Everyone converges on a single version, but concurrent typing is simply discarded. This is what a simple file sync does, and it's fine for whole-file edits that rarely overlap. It's useless for a shared document.`,check:e=>e.converged===!0&&e.lost>5},{title:`Give characters identities`,set:{mode:`crdt`,editors:3,typingPerSec:5,latencyMs:500},ticks:200,question:`Now every character has a permanent ID, and inserts say "after that character". Concurrent inserts are ordered by ID. Same heavy typing. What happens?`,options:[`They match, and nothing is lost`,`They still diverge`],answer:0,explain:`Positions change but identities don't. "After character 3:17" means the same thing on every replica, and the tie-break is the same everywhere, so arrival order stops mattering. No server has to decide anything.`,check:e=>e.converged===!0&&e.lost===0&&e.divergedChecks===0},{title:`Work offline`,set:{mode:`crdt`,editors:3,typingPerSec:3,latencyMs:200},act:[`offline`],actAt:10,ticks:200,question:`Everyone keeps typing, while the network is down for 5 seconds. When it returns, can the copies merge, with no conflict dialog?`,options:[`Yes, they merge automatically`,`Someone has to choose a version`],answer:0,explain:`Offline work is just very high latency, so CRDTs handle it automatically. This is why they're popular for local-first apps. Text from different people can end up interleaved, though. CRDTs guarantee a consistent result, not necessarily a sensible one.`,check:e=>e.converged===!0&&e.lost===0},{title:`The cost of deleting`,set:{mode:`crdt`,editors:2,typingPerSec:8,latencyMs:100,deleteShare:.45},ticks:300,question:`If half of keystrokes delete, does the data structure shrink?`,options:[`Yes, deleted letters are removed`,`No, deleted letters are kept as tombstones`],answer:1,explain:`Another replica might still insert "after" a deleted letter, so it can't simply disappear. Tombstones and IDs mean a document can take far more memory than its visible text. Real systems compact this history once everyone has seen it.`,check:e=>e.crdt[0].tombstones>20}]},pseudocode:[{code:`on_keystroke(letter):`},{code:`  id = (my_site, ++clock)`},{code:`  after = ID of the character before the cursor`},{code:`  apply locally now, and send to everyone`,id:`len`},{code:``},{code:`on_receive(op):`},{code:`  wait until op.after has arrived`,id:`net`},{code:`  insert after it, skipping newer IDs at that spot`},{code:`every copy ends up the same`,id:`ok`}],sources:[{name:`engine.ts`,code:s,lang:`ts`}],tradeoffs:[{choice:`Operational transformation`,gain:`Compact, and proven at huge scale`,cost:`Needs a central server, and it's hard to get right`},{choice:`CRDT`,gain:`Works offline and peer to peer`,cost:`Metadata and tombstones use lots of memory`},{choice:`Last write wins`,gain:`Trivial`,cost:`Throws away concurrent work`},{choice:`Locking sections`,gain:`No conflicts at all`,cost:`People get blocked from editing`}],interview:[{q:`Why does Google Docs use OT and not CRDTs?`,a:`It predates practical CRDTs, and a central server is natural for it. OT also keeps metadata small. Newer local-first tools built on Yjs or Automerge use CRDTs, and Figma's multiplayer is CRDT-inspired but server-authoritative.`},{q:`How do you show other people's cursors?`,a:`Treat them as lightweight, disposable messages that aren't saved. Send them through the same connection, and throttle them. A cursor position that's lost doesn't matter.`},{q:`How do you store history and load documents quickly?`,a:`Keep an operation log, plus periodic snapshots. Loading means reading the latest snapshot and replaying the few operations since. History comes from the log.`},{q:`How do you shrink tombstones?`,a:`Once every replica has seen a delete, the tombstone can be removed safely. It requires knowing what everyone has seen, which is harder when people can be offline for months.`}],mistakes:[`Sending edits by position, without any transformation.`,`Waiting for the server before showing a keystroke.`,`Assuming convergence means the text will read sensibly.`]};export{w as default};