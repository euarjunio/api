type State = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitBreaker {
  private state: State = "CLOSED";
  private failures = 0;
  private lastFailTime = 0;

  constructor(
    private readonly threshold = 5,
    private readonly resetTimeoutMs = 30_000,
  ) {}

  get isOpen(): boolean {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailTime >= this.resetTimeoutMs) {
        this.state = "HALF_OPEN";
        return false;
      }
      return true;
    }
    return false;
  }

  getState(): State {
    return this.state;
  }

  recordSuccess(): void {
    if (this.state === "HALF_OPEN" || this.failures > 0) {
      this.failures = 0;
      this.state = "CLOSED";
    }
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailTime = Date.now();
    if (this.failures >= this.threshold) {
      this.state = "OPEN";
      console.error(
        `[CIRCUIT-BREAKER] PostgreSQL circuit OPEN after ${this.failures} consecutive failures. ` +
        `Will retry in ${this.resetTimeoutMs / 1000}s.`,
      );
    }
  }
}

const CONNECTION_ERROR_PATTERNS = [
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "connection terminated",
  "Connection terminated",
  "Connection refused",
  "the database system is starting up",
  "too many clients",
  "remaining connection slots",
  "socket disconnected",
  "TLS connection",
  "socket hang up",
  "Client network socket disconnected",
];

export function isConnectionError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? "";
  return CONNECTION_ERROR_PATTERNS.some((p) => msg.includes(p));
}
