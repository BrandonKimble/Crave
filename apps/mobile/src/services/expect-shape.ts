/**
 * THE BOUNDARY LAW: a wire response either has the shape the contract says, or it THROWS.
 *
 * F835 (2026-08-03): this codebase had TWO POLICIES FOR ONE WIRE and no stated rule for
 * choosing between them. `polls.ts` normalized everything and threw on a bad shape;
 * `photos.ts` / `messaging.ts` / `user-lists.ts` handed back `response.data` raw. Then the
 * same files sprinkled `?? []` two lines from the "trust the DTO" style — which is a THIRD
 * policy, and the worst of them: it converts a broken contract into "you have no data",
 * silently, in a surface the user reads as truth (the F838 class — an empty list a user
 * cannot distinguish from a real one). Each new endpoint was a coin flip.
 *
 * ONE LAW: validate at the boundary. A response that does not match the contract is a
 * DEFECT, and a defect must be loud — the failure surface the app already has (the
 * system-status banner, the crash-reporting seam) is a far better answer than an empty
 * list that looks like a fact.
 *
 * SCOPE OF THIS PASS, stated honestly: the three `?? []` sites the finding names are gone,
 * and this helper exists as the shared expression of the law. Converting every raw
 * `response.data` return in the four services to a validated one is a larger, per-endpoint
 * job (each needs its own predicate) and is NOT done here — but a new endpoint now has one
 * obvious thing to reach for instead of a coin flip.
 */

export class WireShapeError extends Error {
  constructor(what: string) {
    super(`unexpected wire shape: ${what}`);
    this.name = 'WireShapeError';
  }
}

/**
 * Asserts the response body is an ARRAY and returns it.
 *
 * Note what this deliberately does NOT do: it does not turn a missing body into `[]`. An
 * endpoint that returns nothing when it promised a list is broken, and "broken" and "empty"
 * must not render the same.
 */
export const expectArray = <T>(value: unknown, what: string): T[] => {
  if (!Array.isArray(value)) {
    throw new WireShapeError(
      `${what} (expected an array, got ${value === null ? 'null' : typeof value})`
    );
  }
  return value as T[];
};

/** Asserts the response body is an object and that `key` holds an array; returns it. */
export const expectArrayAt = <T>(value: unknown, key: string, what: string): T[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WireShapeError(`${what} (expected an object with '${key}')`);
  }
  return expectArray<T>((value as Record<string, unknown>)[key], `${what}.${key}`);
};
