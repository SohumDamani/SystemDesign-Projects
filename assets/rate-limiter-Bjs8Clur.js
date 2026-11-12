import{f as e,l as t,p as n}from"./index-n79SFkCo.js";import{a as r,i,n as a,r as o,t as s}from"./engine-D_KAkp68.js";var c=`-- Atomic sliding-window-counter rate limiter.
--
-- KEYS[1] = base key, e.g. "ratelimit:user123:/api/data"
-- ARGV[1] = window_size_seconds (e.g. 60)
-- ARGV[2] = limit (max requests allowed per window)
--
-- Returns: { allowed (1/0), estimated_count, limit, retry_after_seconds }

local base_key = KEYS[1]
local window_size = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])

-- redis.call('TIME') is the deterministic way to get wall-clock time
-- inside a Lua script (safe for replication, no client clock skew).
local time_result = redis.call('TIME')
local now = tonumber(time_result[1])

local current_window_id = math.floor(now / window_size)
local previous_window_id = current_window_id - 1

local current_key = base_key .. ':' .. current_window_id
local previous_key = base_key .. ':' .. previous_window_id

-- tonumber(...) or 0 handles the case where the key doesn't exist yet (GET returns false/nil).
local current_count = tonumber(redis.call('GET', current_key)) or 0
local previous_count = tonumber(redis.call('GET', previous_key)) or 0

-- How far into the current window are we? (0 = just started, window_size = about to roll over)
local elapsed = now % window_size
local weight = 1 - (elapsed / window_size)

local estimated_count = (previous_count * weight) + current_count

-- Time left until the current window closes -- useful for the Retry-After header.
local retry_after = window_size - elapsed

if estimated_count + 1 > limit then
    -- Reject: do NOT increment, so a rejected request never counts against the limit.
    return { 0, math.floor(estimated_count), limit, retry_after }
else
    -- Allow: increment the current window's counter, and (re)set its expiry.
    -- TTL is 2x window_size so the key survives long enough to be read as
    -- the "previous" window on the next rotation, then expires on its own.
    local new_count = redis.call('INCR', current_key)
    redis.call('EXPIRE', current_key, window_size * 2)
    return { 1, new_count, limit, retry_after }
end
`,l=`// Five rate limiting algorithms behind one interface. The sliding window counter is the
// real rate_limit.lua (see luaRunner.ts). The others are written out here to compare.
import { FakeRedis, LuaScript } from './luaRunner';

export interface Decision {
  allowed: boolean;
  /** Variables from inside the algorithm, shown beside the code. */
  vars: Record<string, string>;
  /** Lines that executed, when the algorithm is a real script. */
  lines?: number[];
}

export interface Limiter {
  check(now: number, trace: boolean): Decision;
  /** Requests released to the backend since the last call. Only a queue delays them. */
  drain?(now: number): number;
  /** How many numbers this algorithm must store per client right now. */
  storedValues(): number;
}

/** Counts per fixed time slot. Cheap, but allows double the limit across a boundary. */
export class FixedWindow implements Limiter {
  private id = -1;
  private count = 0;
  constructor(private limit: number, private windowSec: number) {}

  check(now: number): Decision {
    const id = Math.floor(now / this.windowSec);
    if (id !== this.id) {
      this.id = id;
      this.count = 0;
    }
    const allowed = this.count < this.limit;
    if (allowed) this.count++;
    return { allowed, vars: { window: String(id), count: String(this.count), test: \`\${this.count} of \${this.limit}\` } };
  }

  storedValues() {
    return 2;
  }
}

/** Remembers every timestamp. Exact, but memory grows with the limit. */
export class SlidingLog implements Limiter {
  private log: number[] = [];
  constructor(private limit: number, private windowSec: number) {}

  check(now: number): Decision {
    const cutoff = now - this.windowSec;
    while (this.log.length && this.log[0] <= cutoff) this.log.shift();
    const allowed = this.log.length < this.limit;
    if (allowed) this.log.push(now);
    return { allowed, vars: { cutoff: cutoff.toFixed(2), count: String(this.log.length), test: \`\${this.log.length} of \${this.limit}\` } };
  }

  storedValues() {
    return Math.max(1, this.log.length);
  }
}

/** A bucket refills at a steady rate, and each request takes one token. Bursts are allowed. */
export class TokenBucket implements Limiter {
  private tokens: number;
  private last = 0;
  private refillPerSec: number;
  constructor(private capacity: number, windowSec: number) {
    this.tokens = capacity;
    this.refillPerSec = capacity / windowSec;
  }

  check(now: number): Decision {
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.refillPerSec);
    this.last = now;
    const allowed = this.tokens >= 1;
    if (allowed) this.tokens -= 1;
    return { allowed, vars: { refill: \`\${this.refillPerSec.toFixed(2)}/s\`, tokens: this.tokens.toFixed(1) } };
  }

  storedValues() {
    return 2;
  }
}

/** Requests wait in a queue that drains at a constant rate, so the backend sees a smooth flow. */
export class LeakyBucket implements Limiter {
  private queue = 0;
  private last = 0;
  private drained = 0;
  private drainPerSec: number;
  constructor(private capacity: number, windowSec: number) {
    this.drainPerSec = capacity / windowSec;
  }

  drain(now: number): number {
    this.drained += (now - this.last) * this.drainPerSec;
    this.last = now;
    const released = Math.min(this.queue, Math.floor(this.drained));
    this.queue -= released;
    this.drained = this.queue === 0 ? 0 : this.drained - released;
    return released;
  }

  check(): Decision {
    const allowed = this.queue < this.capacity;
    if (allowed) this.queue++;
    return { allowed, vars: { queue: \`\${this.queue} of \${this.capacity}\`, drain: \`\${this.drainPerSec.toFixed(2)}/s\` } };
  }

  storedValues() {
    return 2;
  }
}

/** The real script. Each request runs rate_limit.lua on the Lua VM against FakeRedis. */
export class LuaSlidingCounter implements Limiter {
  private redis = new FakeRedis();
  private script: LuaScript;
  constructor(source: string, private limit: number, private windowSec: number) {
    this.script = new LuaScript(source, this.redis);
  }

  check(now: number, trace: boolean): Decision {
    this.redis.now = Math.floor(now);
    const { reply, locals, lines } = this.script.run(['ratelimit:demo'], [this.windowSec, this.limit], trace);
    const vars: Record<string, string> = {};
    for (const [name, value] of Object.entries(locals)) {
      vars[name] = typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(3) : String(value);
    }
    return { allowed: reply[0] === 1, vars, lines };
  }

  storedValues() {
    return this.redis.size();
  }
}
`,u=`// Runs a real Redis Lua script in the browser: Fengari is a Lua VM written in JS,
// and FakeRedis answers the few commands the script calls. The Lua file isn't
// translated or edited, so the code you read is the code making the decision.
import fengari from 'fengari-web';

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

export class FakeRedis {
  /** Whole seconds, returned by TIME. Set by whoever drives the clock. */
  now = 0;
  private data = new Map<string, { value: string; expiresAt: number | null }>();

  private live(key: string) {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  get(key: string): string | false {
    return this.live(key)?.value ?? false;
  }

  incr(key: string): number {
    const entry = this.live(key);
    const next = (entry ? parseInt(entry.value, 10) : 0) + 1;
    this.data.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
    return next;
  }

  expire(key: string, ttl: number): number {
    const entry = this.live(key);
    if (!entry) return 0;
    entry.expiresAt = this.now + ttl;
    return 1;
  }

  /** How many keys are alive right now. */
  size(): number {
    for (const key of [...this.data.keys()]) this.live(key);
    return this.data.size;
  }
}

export interface LuaRun {
  reply: number[];
  /** Local variables of the script at the moment it returned. */
  locals: Record<string, number | string>;
  /** Line numbers that actually executed, in order. */
  lines: number[];
}

const TRACE_HELPERS = \`
__locals = {}
__lines = {}
function __hook(event, line)
  local info = debug.getinfo(2, "S")
  if info.what ~= "main" then return end
  if event == "line" then __lines[#__lines + 1] = line end
  local i = 1
  while true do
    local name, value = debug.getlocal(2, i)
    if not name then break end
    if name:sub(1, 1) ~= "(" then __locals[name] = value end
    i = i + 1
  end
end
function __trace_on()
  __locals = {}
  __lines = {}
  debug.sethook(__hook, "lr")
end
function __trace_off() debug.sethook() end
\`;

export class LuaScript {
  private L: any;
  private ref: number;

  constructor(source: string, private redis: FakeRedis) {
    const L = lauxlib.luaL_newstate();
    this.L = L;
    lualib.luaL_openlibs(L);

    lua.lua_newtable(L);
    lua.lua_pushcfunction(L, (state: any) => this.redisCall(state));
    lua.lua_setfield(L, -2, to_luastring('call'));
    lua.lua_setglobal(L, to_luastring('redis'));

    if (lauxlib.luaL_dostring(L, to_luastring(TRACE_HELPERS)) !== lua.LUA_OK) {
      throw new Error('Trace helpers failed: ' + lua.lua_tojsstring(L, -1));
    }
    if (lauxlib.luaL_loadstring(L, to_luastring(source)) !== lua.LUA_OK) {
      throw new Error('Lua compile error: ' + lua.lua_tojsstring(L, -1));
    }
    this.ref = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
  }

  private redisCall(L: any): number {
    const argc = lua.lua_gettop(L);
    const args: string[] = [];
    for (let i = 1; i <= argc; i++) args.push(lua.lua_tojsstring(L, i));
    const cmd = args[0].toUpperCase();
    switch (cmd) {
      case 'GET': {
        const v = this.redis.get(args[1]);
        if (v === false) lua.lua_pushboolean(L, 0);
        else lua.lua_pushstring(L, to_luastring(v));
        return 1;
      }
      case 'INCR':
        lua.lua_pushinteger(L, this.redis.incr(args[1]));
        return 1;
      case 'EXPIRE':
        lua.lua_pushinteger(L, this.redis.expire(args[1], parseInt(args[2], 10)));
        return 1;
      case 'TIME':
        lua.lua_newtable(L);
        lua.lua_pushstring(L, to_luastring(String(this.redis.now)));
        lua.lua_rawseti(L, -2, 1);
        lua.lua_pushstring(L, to_luastring('0'));
        lua.lua_rawseti(L, -2, 2);
        return 1;
      default:
        return lauxlib.luaL_error(L, to_luastring(\`FakeRedis has no command \${cmd}\`));
    }
  }

  private setStringArray(name: string, values: string[]) {
    const L = this.L;
    lua.lua_newtable(L);
    values.forEach((v, i) => {
      lua.lua_pushstring(L, to_luastring(v));
      lua.lua_rawseti(L, -2, i + 1);
    });
    lua.lua_setglobal(L, to_luastring(name));
  }

  private callGlobal(name: string) {
    const L = this.L;
    lua.lua_getglobal(L, to_luastring(name));
    lua.lua_call(L, 0, 0);
  }

  private readTraceTable(name: string): Record<string, number | string> {
    const L = this.L;
    const out: Record<string, number | string> = {};
    lua.lua_getglobal(L, to_luastring(name));
    lua.lua_pushnil(L);
    while (lua.lua_next(L, -2) !== 0) {
      const type = lua.lua_type(L, -1);
      const keyType = lua.lua_type(L, -2);
      const key = keyType === lua.LUA_TNUMBER ? String(lua.lua_tonumber(L, -2)) : to_jsstring(lua.lua_tostring(L, -2));
      if (type === lua.LUA_TNUMBER) out[key] = lua.lua_tonumber(L, -1);
      else if (type === lua.LUA_TSTRING) out[key] = to_jsstring(lua.lua_tostring(L, -1));
      lua.lua_pop(L, 1);
    }
    lua.lua_pop(L, 1);
    return out;
  }

  /** Mirrors EVALSHA: keys and args arrive as KEYS and ARGV, numbers truncate on return. */
  run(keys: string[], args: (string | number)[], trace = false): LuaRun {
    const L = this.L;
    this.setStringArray('KEYS', keys);
    this.setStringArray('ARGV', args.map(String));
    if (trace) this.callGlobal('__trace_on');
    lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, this.ref);
    const status = lua.lua_pcall(L, 0, 1, 0);
    if (trace) this.callGlobal('__trace_off');
    if (status !== lua.LUA_OK) {
      const message = lua.lua_tojsstring(L, -1);
      lua.lua_pop(L, 1);
      throw new Error('Lua error: ' + message);
    }
    const reply: number[] = [];
    const n = lua.lua_rawlen(L, -1);
    for (let i = 1; i <= n; i++) {
      lua.lua_rawgeti(L, -1, i);
      reply.push(Math.trunc(lua.lua_tonumber(L, -1)));
      lua.lua_pop(L, 1);
    }
    lua.lua_pop(L, 1);
    if (!trace) return { reply, locals: {}, lines: [] };
    const lineTable = this.readTraceTable('__lines');
    const lines = Object.keys(lineTable)
      .map(Number)
      .sort((a, b) => a - b)
      .map((k) => lineTable[k] as number);
    return { reply, locals: this.readTraceTable('__locals'), lines };
  }
}
`,d=.25;function f(e){switch(e.algo){case`fixed-window`:return new s(e.limit,e.window);case`sliding-log`:return new i(e.limit,e.window);case`token-bucket`:return new r(e.limit,e.window);case`leaky-bucket`:return new a(e.limit,e.window);default:return new o(c,e.limit,e.window)}}function p(e,t,n){if(t.pattern===`steady`)return n(t.rate*d);let r=Math.floor(e.t/t.window),i=e.t-r*t.window,a=i>t.window-d-1e-9,o=i<.249999999;return r%2==0&&a||r%2==1&&o?t.limit:0}function m(e,t,n){let r=0;for(let i=0;i<t;i++){let a=e.limiter.check(e.t,n&&i===t-1);a.allowed?(r++,e.allowed++,e.limiter.drain||e.hits.push(e.t)):e.rejected++,n&&i===t-1&&(e.last=a)}return r}var h={secondsPerTick:d,params:[{key:`algo`,label:`Algorithm`,kind:`choice`,rebuild:!0,options:[{value:`sliding-counter`,label:`Sliding counter (real Lua)`},{value:`fixed-window`,label:`Fixed window`},{value:`sliding-log`,label:`Sliding log`},{value:`token-bucket`,label:`Token bucket`},{value:`leaky-bucket`,label:`Leaky bucket`}]},{key:`limit`,label:`Limit per window`,kind:`range`,min:5,max:100,step:5,unit:`requests`,rebuild:!0},{key:`window`,label:`Window size`,kind:`range`,min:5,max:60,step:5,unit:`s`,rebuild:!0},{key:`pattern`,label:`Traffic shape`,kind:`choice`,rebuild:!0,options:[{value:`steady`,label:`Steady random traffic`},{value:`edge`,label:`Bursts at the window edge`}]},{key:`rate`,label:`Steady traffic rate`,kind:`range`,min:0,max:20,step:.5,unit:`req/s`}],defaults:{algo:`sliding-counter`,limit:20,window:10,rate:3,pattern:`steady`},create:e=>({t:0,limiter:f(e),hits:[],worst:0,allowed:0,rejected:0,allowedNow:0,offeredNow:0,burstAllowed:0}),step(e,t,n){e.t+=d;let r=p(e,t,e=>n.poisson(e)),i=m(e,r,!0);if(e.limiter.drain){i=e.limiter.drain(e.t);for(let t=0;t<i;t++)e.hits.push(e.t)}for(;e.hits.length&&e.hits[0]<=e.t-t.window;)e.hits.shift();e.worst=Math.max(e.worst,e.hits.length),e.offeredNow=e.offeredNow*.9+r/d*.1,e.allowedNow=e.allowedNow*.9+i/d*.1},sample:(e,t)=>({rolling:e.hits.length,limit:t.limit,offered:e.offeredNow,allowed:e.allowedNow,cap:t.limit/t.window}),charts:[{title:`Requests reaching the backend in the last window`,series:[{key:`rolling`,label:`Measured`,role:`measured`},{key:`limit`,label:`Limit`,role:`predicted`}]},{title:`Throughput`,unit:`req/s`,series:[{key:`allowed`,label:`Passed`,role:`measured`},{key:`cap`,label:`Limit ÷ window`,role:`predicted`},{key:`offered`,label:`Offered`,role:`other`}]}],metrics(r,i){let a=r.allowed+r.rejected;return[{label:`Limit per window`,value:e(i.limit),role:`predicted`},{label:`Worst window`,value:e(r.worst),role:`measured`,tone:r.worst>i.limit*1.25?`bad`:void 0},{label:`Rejected`,value:a?n(r.rejected/a):`0%`,role:`measured`},{label:`Memory per client`,value:t(r.limiter.storedValues()*8),role:`measured`}]},math(e,t){let r=t.limit/t.window,i=[{expr:`Sustained cap: ${t.limit} ÷ ${t.window} s`,result:`${r.toFixed(1)} req/s`}];return i.push(t.pattern===`steady`?{expr:`Rejected share if traffic stays at ${t.rate} req/s`,result:t.rate>r?n(1-r/t.rate):`0%`}:{expr:`Worst case for a fixed window: 2 × ${t.limit}`,result:`${t.limit*2} requests`}),i},actions:[{key:`one`,label:`Send one request`,run:e=>{e.burstAllowed=m(e,1,!0),e.limiter.drain&&e.hits.push(e.t)}},{key:`burst`,label:`Send a burst of 50`,run:e=>{e.burstAllowed=m(e,50,!0)}}],trace(e,t){let n=e.last,r={...n?.vars??{}};return n&&(r.outcome=n.allowed?`allowed`:`rejected`),t.algo===`sliding-counter`&&n&&(r.test=`${(Number(n.vars.estimated_count??0)+1).toFixed(2)} > ${t.limit} is ${!n.allowed}`),{values:r,active:n?[n.allowed?`allow`:`reject`]:[],lines:n?.lines}},experiments:[{title:`The window edge`,set:{algo:`fixed-window`,pattern:`edge`,limit:20,window:10},ticks:200,question:`A fixed window allows 20 requests per 10 seconds. A client sends 20 just before a boundary and 20 just after. How many reach the backend inside a single 10-second span?`,options:[`20, since that is the limit`,`40, double the limit`,`30, because some get rejected`],answer:1,explain:`The counter resets at the boundary, so both bursts pass, and 40 requests arrive within half a second. The limit only holds per slot, not per any 10 seconds. That gap is what the sliding approaches close.`,check:(e,t)=>e.worst>=t.limit*2-1},{title:`Fix it with your Lua script`,set:{algo:`sliding-counter`,pattern:`edge`,limit:20,window:10},ticks:200,question:"Same bursts, now through `rate_limit.lua`, which weights the previous window by how much of it still overlaps. What is the worst 10-second span?",options:[`Still 40`,`About 20`,`Close to 0, it blocks everything`],answer:1,explain:`Right after the boundary the previous count carries a weight near 1, so the estimate is already at the limit and the second burst is rejected. You pay for this accuracy with just two counters per client, not a full log.`,check:(e,t)=>e.worst<=t.limit*1.25},{title:`Sustained overload`,set:{algo:`sliding-counter`,pattern:`steady`,rate:6,limit:20,window:10},ticks:480,question:`Traffic holds at 6 req/s against a limit of 20 per 10 seconds. What throughput gets through?`,options:[`About 6 req/s`,`About 2 req/s`,`About 4 req/s`],answer:1,explain:`The sustained cap is limit ÷ window, or 2 req/s. The remaining two-thirds of traffic is rejected, which matches the math: 1 − 2/6 = 67%.`,check:(e,t,n)=>{let r=n.slice(-200),i=r.reduce((e,t)=>e+t.allowed,0)/r.length;return i>1.5&&i<2.6}},{title:`A burst into a full bucket`,set:{algo:`token-bucket`,pattern:`steady`,rate:0,limit:20,window:10},act:[`burst`],actAt:80,ticks:84,question:`A token bucket holds 20 tokens. The client has been quiet for 20 seconds, then fires 50 requests at once. How many pass immediately?`,options:[`All 50`,`About 20`,`Only 2`],answer:1,explain:`Idle time fills the bucket up to its capacity, and the burst spends all of it at once. That's the point of a token bucket: it tolerates short bursts while still enforcing an average. The bucket size sets how big a burst you're willing to accept.`,check:e=>e.burstAllowed>=19&&e.burstAllowed<=22}]},g={"sliding-counter":[{code:`now = redis TIME`},{code:`cur = count in this window`,id:`current_count`},{code:`prev = count in the previous window`,id:`previous_count`},{code:`elapsed = seconds into this window`,id:`elapsed`},{code:`weight = share of previous window still in view`,id:`weight`},{code:`estimate = prev × weight + cur`,id:`estimated_count`},{code:`if estimate + 1 > limit:`,id:`test`},{code:`  reject, and say when to retry`,id:`reject`},{code:`else:`},{code:`  cur = cur + 1, allow the request`,id:`allow`},{code:`result`,id:`outcome`}],"fixed-window":[{code:`window = floor(now / window_size)`,id:`window`},{code:`if window changed: count = 0`},{code:`if count < limit:`,id:`test`},{code:`  count = count + 1, allow`,id:`allow`},{code:`else:`},{code:`  reject`,id:`reject`},{code:`result`,id:`outcome`}],"sliding-log":[{code:`drop timestamps older than now - window`,id:`cutoff`},{code:`if len(log) < limit:`,id:`test`},{code:`  append now to log, allow`,id:`allow`},{code:`else:`},{code:`  reject`,id:`reject`},{code:`result`,id:`outcome`}],"token-bucket":[{code:`tokens += elapsed × refill_rate, up to capacity`,id:`refill`},{code:`if tokens >= 1:`,id:`tokens`},{code:`  tokens = tokens - 1, allow`,id:`allow`},{code:`else:`},{code:`  reject`,id:`reject`},{code:`result`,id:`outcome`}],"leaky-bucket":[{code:`release queued requests at drain_rate`,id:`drain`},{code:`if queue is not full:`,id:`queue`},{code:`  add request to queue, accept`,id:`allow`},{code:`else:`},{code:`  reject`,id:`reject`},{code:`result`,id:`outcome`}]},_={problem:[`A rate limiter caps how many requests a client can make in a period of time. It protects your service from abuse and runaway clients, keeps one customer from hurting the others, and controls cost when each call has a real price.`,"It sits in the path of every request, so it has to be fast, and it usually runs across many servers, so its counters have to live somewhere shared and be updated atomically. The lab below runs the actual `rate_limit.lua` from this project, not a copy."],functional:[`Limit requests per user, IP or API key, with configurable rules`,"Reject excess requests with HTTP 429 and a `Retry-After` header",`Work correctly across many application servers`],nonFunctional:[`Adds only about a millisecond to each request`,`Uses little memory per client`,`If the limiter fails, the API keeps working, known as failing open`],diagram:{nodes:[{id:`c`,label:`Client`,col:0,row:1,kind:`client`,note:`Receives 429 with Retry-After when over the limit.`},{id:`g`,label:`API gateway`,col:1,row:1,note:`Runs the limiter check before a request reaches any service.`},{id:`r`,label:`Redis counters`,col:2,row:0,kind:`store`,note:`Shared counters. A Lua script makes check-and-increment atomic, with no race between servers.`},{id:`a`,label:`API servers`,col:2,row:1,note:`Only see traffic that passed the limiter.`},{id:`u`,label:`Rules config`,col:1,row:2,kind:`store`,note:`Limits per endpoint and plan, cached in memory and refreshed on a schedule.`}],edges:[{from:`c`,to:`g`},{from:`g`,to:`r`,label:`EVALSHA`},{from:`g`,to:`a`,label:`allowed`},{from:`u`,to:`g`,dashed:!0}]},ideas:[{title:`Why a Lua script`,body:`If servers read a counter and then write it back, two can read the same value and both let a request through. Redis runs a Lua script as one atomic step, which removes that race without any locks.`},{title:`Sliding window counter`,body:"Keep one counter per window and estimate the rolling count as `previous × overlap + current`. It uses two integers per client and gets very close to an exact log."},{title:`Token and leaky buckets`,body:`A token bucket allows bursts up to its size while enforcing an average rate. A leaky bucket queues requests and releases them evenly, which protects a fragile backend at the cost of added delay.`},{title:`Where it runs`,body:`Client-side limits can be bypassed, so enforce on the server. An API gateway is the usual place, as it stops excess traffic before any of your code runs.`}],estimator:{vars:[{key:`users`,label:`Active users`,unit:`count`},{key:`requests`,label:`Requests per user per day`,unit:`plain`,assume:100},{key:`peakFactor`,label:`Peak over average`,unit:`plain`,assume:3},{key:`bytesPerUser`,label:`Bytes per user in Redis`,unit:`plain`,assume:200},{key:`nodeOps`,label:`Ops per second per Redis node`,unit:`plain`,assume:1e5},{key:`avg`,label:`Average checks`,unit:`qps`},{key:`peak`,label:`Peak checks`,unit:`qps`},{key:`memory`,label:`Redis memory`,unit:`bytes`},{key:`nodes`,label:`Redis nodes for throughput`,unit:`count`}],eqs:[{out:`avg`,terms:[[`users`,1],[`requests`,1],[86400,-1]]},{out:`peak`,terms:[[`avg`,1],[`peakFactor`,1]]},{out:`memory`,terms:[[`users`,1],[`bytesPerUser`,1]]},{out:`nodes`,terms:[[`peak`,1],[`nodeOps`,-1]]}],starts:[{key:`users`,value:1e7},{key:`memory`,value:4e9},{key:`peak`,value:5e4}]},lab:h,pseudocode:e=>g[e.algo??`sliding-counter`],sources:[{name:`rate_limit.lua`,code:c,lang:`lua`},{name:`engine.ts`,code:l,lang:`ts`},{name:`luaRunner.ts`,code:u,lang:`ts`}],tradeoffs:[{choice:`Fixed window`,gain:`Simplest, one counter`,cost:`Allows double the limit across a boundary`},{choice:`Sliding log`,gain:`Exact`,cost:`Stores a timestamp per request, so memory grows with the limit`},{choice:`Sliding window counter`,gain:`Nearly exact with two counters`,cost:`An estimate, assuming even traffic in the previous window`},{choice:`Token bucket`,gain:`Allows controlled bursts`,cost:`Two values per client, and bucket size needs tuning`},{choice:`Fail open`,gain:`A limiter outage doesn't take the API down`,cost:`No protection during the outage`}],interview:[{q:`How do you keep limits accurate across data centers?`,a:`A single global Redis adds latency. Commonly each region enforces a share of the limit locally and syncs counters asynchronously, accepting slight overshoot in exchange for speed.`},{q:`What goes wrong with a read-then-write counter?`,a:"Two servers read 19, both decide it's under 20, and both write 20, so 21 requests pass. A Lua script or `INCR` makes the check and the increment one atomic step."},{q:`Does this script work on Redis Cluster?`,a:"Not as written: it builds its window keys inside the script instead of declaring them in `KEYS`, and Redis Cluster needs declared keys to route correctly. Pass both window keys in `KEYS` with a shared hash tag like `{user123}` so they land on one shard."},{q:`What should the client see when it's limited?`,a:"HTTP 429 with `Retry-After`, plus `X-RateLimit-Remaining` and `X-RateLimit-Limit` so well-behaved clients can slow down before they hit the wall."}],mistakes:[`Using read-then-write logic with no atomicity.`,`Giving every endpoint the same limit, when costs differ hugely.`,`Never saying what happens when the limiter itself is down.`]};export{_ as default};