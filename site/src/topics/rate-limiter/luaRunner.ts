// Runs a real Redis Lua script in the browser: Fengari is a Lua VM written in JS,
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

const TRACE_HELPERS = `
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
`;

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
        return lauxlib.luaL_error(L, to_luastring(`FakeRedis has no command ${cmd}`));
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
