/**
 * THE ONE vocabulary-registry cache (red-team L3 F7): dietary and cuisine
 * used to carry two copy-pasted cache blocks, and the cuisine copy's error
 * path returned a degraded value WITHOUT installing it — during a DB blip
 * every search re-ran the failed query with no backoff, and with a cold
 * cache each returned a fresh empty set.
 *
 * This class makes the degrade a real cache entry: on load failure the
 * policy-chosen degraded value is INSTALLED with a short error TTL, so a
 * blip is retried on a backoff, not per request. The degrade policy stays
 * per-registry (cuisine fails open to stale-or-empty; dietary fails closed
 * — stale beats empty, empty is forbidden) by throwing or returning.
 */
export class RegistryCache<T> {
  private entry: { value: T; expiresAt: number } | null = null;

  constructor(
    private readonly opts: {
      /** Healthy-value TTL. */
      ttlMs: number;
      /** Backoff TTL installed with a DEGRADED value after a failed load. */
      errorTtlMs: number;
      load: () => Promise<T>;
      /** Failure policy: return the degraded value to serve (installed
       *  with errorTtlMs), or throw to fail closed (nothing installed —
       *  the next request retries immediately, which is what a hard
       *  refusal wants). `stale` is the last good value, if any. */
      degrade: (error: unknown, stale: T | null) => T;
    },
  ) {}

  async get(): Promise<T> {
    const now = Date.now();
    if (this.entry && this.entry.expiresAt > now) {
      return this.entry.value;
    }
    try {
      const value = await this.opts.load();
      this.entry = { value, expiresAt: now + this.opts.ttlMs };
      return value;
    } catch (error) {
      const degraded = this.opts.degrade(error, this.entry?.value ?? null);
      this.entry = { value: degraded, expiresAt: now + this.opts.errorTtlMs };
      return degraded;
    }
  }
}
