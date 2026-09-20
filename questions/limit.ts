const WINDOW_MS = 60_000;

export interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimit {
  private readonly buckets = new Map<string, Bucket>();
  private readonly salt = crypto.randomUUID();

  constructor(private readonly perMinute: number) {}

  private key(address: string): string {
    return Bun.hash(this.salt + address).toString(36);
  }

  take(address: string, now = Date.now()): boolean {
    const key = this.key(address);
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      this.sweep(now);
      return true;
    }

    if (bucket.count >= this.perMinute) return false;
    bucket.count += 1;
    return true;
  }

  private sweep(now: number): void {
    if (this.buckets.size < 5000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
