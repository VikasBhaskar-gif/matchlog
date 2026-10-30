/**
 * A minimal sliding-window rate limiter. football-data.org's free tier
 * allows 10 requests/minute — we throttle to 8/minute to leave headroom for
 * clock skew and any other process sharing the same token, rather than
 * riding right up against the documented limit.
 */
export class RateLimiter {
  private timestamps: number[] = [];

  constructor(private maxRequests: number, private windowMs: number) {}

  async acquire(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      const oldest = this.timestamps[0];
      const waitMs = this.windowMs - (now - oldest) + 50; // small buffer
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return this.acquire();
    }

    this.timestamps.push(Date.now());
  }
}
