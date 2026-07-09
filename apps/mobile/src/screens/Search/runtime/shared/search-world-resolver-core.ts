// The RESOLVER CORE (charter §3) — pure generation/supersession logic, separated from the
// network tier so it is model-testable. The resolver observes desired-tuple generations;
// each resolution is stamped with the generation that started it. Rules:
//
// - Only the LATEST generation may present. A resolution landing for an older generation
//   COMPLETES INTO CACHE (its world is committed and reusable) but never presents —
//   A→B→A retoggle then finds B and A both cached.
// - In-flight dedupe by world key: a second request for a key already resolving attaches
//   to the in-flight resolution instead of double-fetching.
// - The ladder (cache → derivation → network) is the CALLER's tiering; this core only
//   answers "should this landed resolution present?" and tracks in-flight keys.

export type ResolutionTicket = {
  generation: number;
  worldKey: string;
};

export type ResolverCore = {
  /** Register the desired generation (monotonic; from the bus). */
  observeGeneration: (generation: number) => void;
  /** Begin resolving a key for a generation; returns false if already in flight (attach). */
  begin: (ticket: ResolutionTicket) => boolean;
  /** A resolution landed. Returns the disposition: present (latest generation wants this
   *  key) or cache_only (superseded — commit, never present). Always clears in-flight. */
  land: (
    ticket: ResolutionTicket,
    isKeyStillDesired: (worldKey: string) => boolean
  ) => 'present' | 'cache_only';
  /** A resolution failed terminally. Clears in-flight so a retry can begin. */
  fail: (ticket: ResolutionTicket) => void;
  inFlightKeys: () => string[];
  latestGeneration: () => number;
};

export const createResolverCore = (): ResolverCore => {
  let latest = 0;
  const inFlight = new Map<string, number>();
  return {
    observeGeneration: (generation) => {
      if (generation > latest) {
        latest = generation;
      }
    },
    begin: ({ generation, worldKey }) => {
      if (generation > latest) {
        latest = generation;
      }
      if (inFlight.has(worldKey)) {
        // Attach: the newer generation adopts the in-flight resolution's landing. Track
        // the NEWEST generation interested in this key so landing can present for it.
        inFlight.set(worldKey, Math.max(inFlight.get(worldKey) ?? 0, generation));
        return false;
      }
      inFlight.set(worldKey, generation);
      return true;
    },
    land: ({ worldKey }, isKeyStillDesired) => {
      inFlight.delete(worldKey);
      // Presentation is decided by CURRENT desire, not by the generation that started the
      // fetch — a resolution that took long enough for desire to move on and come BACK
      // (A→B→A) still presents. The tuple is the single source of "still desired".
      return isKeyStillDesired(worldKey) ? 'present' : 'cache_only';
    },
    fail: ({ worldKey }) => {
      inFlight.delete(worldKey);
    },
    inFlightKeys: () => Array.from(inFlight.keys()),
    latestGeneration: () => latest,
  };
};
