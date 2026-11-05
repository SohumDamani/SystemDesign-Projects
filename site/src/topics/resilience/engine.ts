// A client that retries, a service that can fall behind, and a circuit breaker between them.

export interface Attempt {
  requestId: number;
  number: number; // 1 for the first try
  sentAt: number;
  served: boolean;
  givenUp: boolean;
}

/** Stops sending to a service that's mostly failing, then cautiously tries again. */
export class CircuitBreaker {
  state: 'closed' | 'open' | 'half-open' = 'closed';
  private openUntil = 0;
  private successes = 0;
  private failures = 0;
  private probes = 0;
  opens = 0;

  constructor(private failureThreshold: number, private cooldownSeconds: number, private windowSize: number) {}

  /** May this request go out at all? */
  allow(now: number): boolean {
    if (this.state === 'open') {
      if (now < this.openUntil) return false;
      this.state = 'half-open';
      this.probes = 0;
    }
    if (this.state === 'half-open') {
      // Let only a trickle through, to see if the service has recovered.
      if (this.probes >= 20) return false;
      this.probes++;
    }
    return true;
  }

  onSuccess() {
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= 10) this.close();
      return;
    }
    this.successes++;
    this.roll();
  }

  onFailure(now: number) {
    if (this.state === 'half-open') {
      this.trip(now);
      return;
    }
    this.failures++;
    if (this.failures + this.successes >= this.windowSize && this.failures / (this.failures + this.successes) >= this.failureThreshold) this.trip(now);
    this.roll();
  }

  private roll() {
    if (this.failures + this.successes >= this.windowSize) {
      this.failures = 0;
      this.successes = 0;
    }
  }

  private close() {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
  }

  private trip(now: number) {
    this.state = 'open';
    this.openUntil = now + this.cooldownSeconds;
    this.failures = 0;
    this.successes = 0;
    this.opens++;
  }
}

/** Each failure waits twice as long, with randomness so clients don't retry in sync. */
export function retryDelay(attempt: number, base: number, exponential: boolean, random: () => number): number {
  if (!exponential) return 0;
  return base * 2 ** (attempt - 1) * (0.5 + random());
}

/** Caps retries to a share of normal traffic, so a failure can't multiply the load. */
export class RetryBudget {
  private tokens = 0;
  constructor(private ratio: number, private max: number) {}

  onRequest() {
    this.tokens = Math.min(this.max, this.tokens + this.ratio);
  }

  tryRetry(): boolean {
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
