import { FixedWindow, SlidingLog, TokenBucket, type Limiter } from './engine';

export const LIMIT = 100;
export const WINDOW = 60;
export const COMPONENTS = {
  client: { label: 'Client', max: 1, x: 90, y: 150 },
  balancer: { label: 'Load balancer', max: 1, x: 245, y: 150 },
  limiter: { label: 'Rate limiter', max: 3, x: 400, y: 78 },
  api: { label: 'API server', max: 3, x: 555, y: 78 },
  store: { label: 'Shared store', max: 1, x: 400, y: 310 },
} as const;

export const ALGORITHMS = {
  fixed: { label: 'Fixed window', create: () => new FixedWindow(LIMIT, WINDOW) },
  sliding: { label: 'Sliding log', create: () => new SlidingLog(LIMIT, WINDOW) },
  token: { label: 'Token bucket', create: () => new TokenBucket(LIMIT, WINDOW) },
} as const;

export type Component = keyof typeof COMPONENTS;
export type Algorithm = keyof typeof ALGORITHMS;
export interface BuildNode {
  id: string;
  kind: Component;
  label: string;
  x: number;
  y: number;
  algorithm: Algorithm;
}
export interface BuildEdge {
  from: string;
  to: string;
}

const destinations: Record<Component, Component[]> = {
  client: ['balancer', 'limiter'],
  balancer: ['limiter', 'api'],
  limiter: ['balancer', 'api', 'store'],
  api: [],
  store: [],
};

export function canConnect(from: BuildNode, to: BuildNode, edges: BuildEdge[]) {
  return from.id !== to.id && destinations[from.kind].includes(to.kind)
    && !edges.some((edge) => edge.from === from.id && edge.to === to.id);
}

interface Request {
  at: number;
  account: string;
}

function batch(count: number, at: number, account = 'A'): Request[] {
  return Array.from({ length: count }, () => ({ at, account }));
}

const scenarios = [
  {
    title: 'One account across three servers',
    description: '102 requests from account A within one minute, split evenly across the servers.',
    requests: batch(102, 10),
  },
  {
    title: 'Burst across a window boundary',
    description: 'Account A sends 60 requests at 59s and 60 more at 61s.',
    requests: [...batch(60, 59), ...batch(60, 61)],
  },
  {
    title: 'Independent quotas and recovery',
    description: 'A reaches its limit, B sends one request, and A tries again after its window expires.',
    requests: [...batch(101, 0), ...batch(1, 1, 'B'), ...batch(1, 60)],
  },
];

interface Route {
  api: BuildNode;
  limiter?: BuildNode;
  store?: string;
}

function findRoutes(nodes: BuildNode[], edges: BuildEdge[]): { routes: Route[] } | { error: string } {
  const client = nodes.find((node) => node.kind === 'client');
  const servers = nodes.filter((node) => node.kind === 'api');
  if (!client || !nodes.some((node) => node.kind === 'balancer') || servers.length !== 3) {
    return { error: 'Add a client, a load balancer, and three API servers.' };
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const routes = new Map<string, Route>();
  const storeAlgorithms = new Map<string, Algorithm>();
  function visit(node: BuildNode, path: BuildNode[]): string | undefined {
    if (path.includes(node)) return 'A request connection loops back. Remove the loop.';
    if (node.kind === 'api') {
      if (routes.has(node.id)) return `${node.label} has multiple request paths. Give it one path.`;
      if (!path.some((item) => item.kind === 'balancer')) return `Route ${node.label} through the load balancer.`;
      const limiters = path.filter((item) => item.kind === 'limiter');
      if (limiters.length > 1) return `Use at most one limiter on the path to ${node.label}.`;
      const limiter = limiters[0];
      const store = edges.find((edge) => edge.from === limiter?.id && byId.get(edge.to)?.kind === 'store')?.to;
      if (limiter && store) {
        const existing = storeAlgorithms.get(store);
        if (existing && existing !== limiter.algorithm) return 'Limiters using the same store must use the same algorithm.';
        storeAlgorithms.set(store, limiter.algorithm);
      }
      routes.set(node.id, { api: node, limiter, store });
      return;
    }

    const next = edges.filter((edge) => edge.from === node.id)
      .map((edge) => byId.get(edge.to)).filter((item) => item && item.kind !== 'store');
    if (!next.length) return `${node.label} needs an outgoing request connection.`;
    if (node.kind !== 'balancer' && next.length > 1) return `Let the load balancer split traffic. Give ${node.label} one request destination.`;
    for (const destination of next) {
      if (!destination) continue;
      const error = visit(destination, [...path, node]);
      if (error) return error;
    }
  }

  const error = visit(client, []);
  if (error) return { error };
  const missing = servers.find((server) => !routes.has(server.id));
  if (missing) return { error: `${missing.label} is unreachable. Connect it to the request path.` };
  return { routes: servers.map((server) => routes.get(server.id)!) };
}

function runScenario(routes: Route[], scenario: typeof scenarios[number]) {
  const counters = new Map<string, Map<string, Limiter>>();
  const admitted = new Map<string, number[]>();
  const expected = new Map<string, SlidingLog>();
  let allowed = 0;
  let peak = 0;
  let firstFailure: string | undefined;

  scenario.requests.forEach(({ at, account }, index) => {
    const route = routes[index % routes.length];
    const limiter = route.limiter;
    let passes = true;
    if (limiter) {
      const stateId = route.store ?? limiter.id;
      const accounts = counters.get(stateId) ?? new Map<string, Limiter>();
      const counter = accounts.get(account) ?? ALGORITHMS[limiter.algorithm].create();
      passes = counter.check(at, false).allowed;
      accounts.set(account, counter);
      counters.set(stateId, accounts);
    }

    const reference = expected.get(account) ?? new SlidingLog(LIMIT, WINDOW);
    const shouldPass = reference.check(at).allowed;
    expected.set(account, reference);
    const recent = admitted.get(account) ?? [];
    while (recent.length && recent[0] <= at - WINDOW) recent.shift();
    if (passes) {
      recent.push(at);
      admitted.set(account, recent);
      allowed++;
      peak = Math.max(peak, recent.length);
    }

    if (!firstFailure && (!limiter || passes !== shouldPass)) {
      const where = `Request ${index + 1} at ${at}s for account ${account} → ${route.api.label}.`;
      const reason = !limiter
        ? 'This route bypasses the limiter.'
        : passes
          ? `Allowed at ${limiter.label} when the rolling quota required a 429.`
          : `Rejected at ${limiter.label} with a 429 while the rolling quota still had room.`;
      firstFailure = `${where} ${reason}`;
    }
  });

  return {
    title: scenario.title,
    description: scenario.description,
    allowed,
    rejected: scenario.requests.length - allowed,
    peak,
    firstFailure,
  };
}

export function evaluateBuild(nodes: BuildNode[], edges: BuildEdge[]):
  { error: string; checks?: never } | { checks: ReturnType<typeof runScenario>[]; error?: never } {
  const result = findRoutes(nodes, edges);
  if ('error' in result) return result;
  return { checks: scenarios.map((scenario) => runScenario(result.routes, scenario)) };
}
