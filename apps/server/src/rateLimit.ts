/**
 * Per-sender token bucket for chat rate limiting.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.lastRefill = now();
  }

  /** Try to spend one token. Returns false when the bucket is empty. */
  tryConsume(): boolean {
    const now = this.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.lastRefill = now;
    if (this.tokens < 1) {
      return false;
    }
    this.tokens -= 1;
    return true;
  }
}

/** Keeps one bucket per key, so no sender can starve another. */
export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
  ) {}

  allow(key: string): boolean {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(this.capacity, this.refillPerSecond, this.now);
      this.buckets.set(key, bucket);
    }
    return bucket.tryConsume();
  }

  remove(key: string): void {
    this.buckets.delete(key);
  }
}
