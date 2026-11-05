import { describe, expect, it } from 'vitest';
import source from '../../Rate Limiter/app/rate_limit.lua?raw';
import { FakeRedis, LuaScript } from '../src/topics/rate-limiter/luaRunner';

describe('LuaScript', () => {
  it('runs rate_limit.lua and exposes its real local variables', () => {
    const fake = new FakeRedis();
    fake.now = 1000;
    const script = new LuaScript(source, fake);
    for (let i = 0; i < 3; i++) expect(script.run(['k'], [10, 3]).reply[0]).toBe(1);
    const rejected = script.run(['k'], [10, 3], true);
    expect(rejected.reply[0]).toBe(0);
    expect(rejected.locals.current_count).toBe(3);
    expect(rejected.locals.weight).toBe(1);
    expect(rejected.lines).toContain(39);
    expect(rejected.lines).not.toContain(44);
  });

  it('expires the window keys on the TTL the script set', () => {
    const fake = new FakeRedis();
    fake.now = 1000;
    const script = new LuaScript(source, fake);
    script.run(['k'], [10, 3]);
    expect(fake.size()).toBe(1);
    fake.now = 1021;
    expect(fake.size()).toBe(0);
  });
});
