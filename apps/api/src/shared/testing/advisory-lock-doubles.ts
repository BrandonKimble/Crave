import type {
  AdvisoryLockOutcome,
  AdvisoryLockService,
} from '../advisory-lock/advisory-lock.service';

/**
 * Test doubles for the advisory lock.
 *
 * A unit spec is not testing Postgres — it is testing what the service does
 * WHEN it holds the lock and when it does not. Those are the only two shapes,
 * and naming them here keeps every spec from inventing its own `as never`
 * (which is how the real service ended up constructible with a logger in the
 * lock's slot). The lock's own mechanism is proven against a live database in
 * advisory-lock.integration.spec.ts — that is the only place it can be.
 */

/** The lock is free: `fn` runs, and the keys taken are recorded. */
export function grantingAdvisoryLock(): AdvisoryLockService & {
  keys: number[];
} {
  const keys: number[] = [];
  const double = {
    keys,
    async withAdvisoryLock<T>(
      key: number,
      fn: () => Promise<T>,
    ): Promise<AdvisoryLockOutcome<T>> {
      keys.push(key);
      return { acquired: true, result: await fn() };
    },
  };
  return double as unknown as AdvisoryLockService & { keys: number[] };
}

/** Another process holds the lock: `fn` NEVER runs. */
export function heldAdvisoryLock(): AdvisoryLockService & { keys: number[] } {
  const keys: number[] = [];
  const double = {
    keys,
    async withAdvisoryLock<T>(key: number): Promise<AdvisoryLockOutcome<T>> {
      keys.push(key);
      return await Promise.resolve({ acquired: false });
    },
  };
  return double as unknown as AdvisoryLockService & { keys: number[] };
}
