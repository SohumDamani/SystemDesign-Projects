import { describe, expect, it } from 'vitest';
import { evaluateBuild, type Algorithm, type BuildNode } from '../src/topics/rate-limiter/build';

function node(kind: BuildNode['kind'], id: string, algorithm: Algorithm = 'fixed'): BuildNode {
  return { kind, id, label: id, algorithm, x: 0, y: 0 };
}

function build(algorithm: Algorithm, shared: boolean) {
  const nodes = [node('client', 'client'), node('balancer', 'lb'), node('store', 'store')];
  const edges = [{ from: 'client', to: 'lb' }];
  for (let i = 1; i <= 3; i++) {
    nodes.push(node('api', `api ${i}`), node('limiter', `limiter ${i}`, algorithm));
    edges.push({ from: 'lb', to: `limiter ${i}` }, { from: `limiter ${i}`, to: `api ${i}` });
    if (shared) edges.push({ from: `limiter ${i}`, to: 'store' });
  }
  return { nodes, edges };
}

describe('distributed rate limiter challenge', () => {
  it('exposes independent counters even with an exact algorithm on each server', () => {
    const { nodes, edges } = build('sliding', false);
    const check = evaluateBuild(nodes, edges).checks?.[0];
    expect(check).toMatchObject({ allowed: 102, rejected: 0, peak: 102 });
    expect(check?.firstFailure).toContain('Request 101');
  });

  it('isolates the boundary failure after sharing a fixed-window counter', () => {
    const { nodes, edges } = build('fixed', true);
    const checks = evaluateBuild(nodes, edges).checks;
    expect(checks?.[0]).toMatchObject({ allowed: 100, rejected: 2, peak: 100 });
    expect(checks?.[0].firstFailure).toBeUndefined();
    expect(checks?.[1]).toMatchObject({ allowed: 120, rejected: 0, peak: 120 });
    expect(checks?.[1].firstFailure).toContain('Request 101 at 61s');
  });

  it('passes all scenarios using a shared sliding log and keeps accounts independent', () => {
    const { nodes, edges } = build('sliding', true);
    const checks = evaluateBuild(nodes, edges).checks;
    expect(checks?.map((check) => [check.allowed, check.rejected, check.peak, check.firstFailure])).toEqual([
      [100, 2, 100, undefined], [100, 20, 100, undefined], [102, 1, 100, undefined],
    ]);
  });

  it('also accepts a single exact limiter before the load balancer', () => {
    const { nodes } = build('sliding', false);
    const edges = [{ from: 'client', to: 'limiter 1' }, { from: 'limiter 1', to: 'lb' }];
    for (let i = 1; i <= 3; i++) edges.push({ from: 'lb', to: `api ${i}` });
    expect(evaluateBuild(nodes, edges).checks?.map((check) => check.firstFailure)).toEqual([undefined, undefined, undefined]);
  });

  it('reports an incomplete path and detects a connected bypass', () => {
    const { nodes, edges } = build('sliding', true);
    const disconnected = edges.filter(({ to }) => to !== 'api 2');
    expect(evaluateBuild(nodes, disconnected).error).toContain('limiter 2');
    const bypass = edges.filter(({ to, from }) => to !== 'limiter 2' && from !== 'limiter 2');
    bypass.push({ from: 'lb', to: 'api 2' });
    expect(evaluateBuild(nodes, bypass).checks?.[0].firstFailure).toContain('bypasses the limiter');
  });
});
