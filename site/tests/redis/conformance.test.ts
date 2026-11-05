import { describe, expect, it } from 'vitest';
import { createClient } from 'redis';
import source from '../../../Rate Limiter/app/rate_limit.lua?raw';
import { FakeRedis, LuaScript } from '../../src/topics/rate-limiter/luaRunner';

// Requires: docker run -d --rm --name sdlab-redis-test -p 6390:6379 redis:7-alpine
// Sends the same requests to real Redis and to the browser's Lua VM and FakeRedis.
// A lab is only allowed to say "real code" while these two give identical answers.
describe('rate_limit.lua in the browser matches real Redis', () => {
  it('returns identical replies across window boundaries', async () => {
    const client = createClient({ url: 'redis://localhost:6390' });
    await client.connect();
    await client.flushAll();
    const fake = new FakeRedis();
    const script = new LuaScript(source, fake);
    const key = 'ratelimit:conformance';
    const windowSize = 5;
    const limit = 8;
    const burstBySecond = [3, 1, 6, 0, 2, 9, 1, 4, 0, 12, 2, 3, 7, 0, 1, 5, 10, 2];
    let compared = 0;

    const redisSecond = async () => parseInt(((await client.sendCommand(['TIME'])) as string[])[0], 10);

    for (const burst of burstBySecond) {
      // Line up with the start of a Redis second so one burst stays inside one second.
      const startSecond = await redisSecond();
      let second = startSecond;
      while (second === startSecond) {
        await new Promise((r) => setTimeout(r, 15));
        second = await redisSecond();
      }
      fake.now = second;

      for (let i = 0; i < burst; i++) {
        const real = (await client.eval(source, { keys: [key], arguments: [String(windowSize), String(limit)] })) as number[];
        const ours = script.run([key], [windowSize, limit]).reply;
        expect(ours).toEqual(real);
        compared++;
      }
      expect(await redisSecond()).toBe(fake.now);
    }
    expect(compared).toBeGreaterThan(50);
    await client.quit();
  });
});
