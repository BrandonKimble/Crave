// ─── THE WORLD-JOIN CONTRACT (OA1, R7) ────────────────────────────────────────
//
// OA1 (transition-endstate-contract): on a world-join flow the reveal joins
// {map items ready, cards ready} and both surface at the exact same instant —
// "a world-join scene revealing cards before map items (or vice versa) is a RED
// violation." The MECHANISM is the episode TransitionTxn (joinInputs
// ['paint','mapFrame',...]): while the join is open, `canAdmitResultsBody` holds
// the cards AND `canStartMarkerEnterForSurface` holds the native ramp, so a split
// reveal is unrepresentable THROUGH the gate. The remaining split class is a
// reveal that fires while a residency fact is absent — a plan that dropped an
// input (mutation), a producer that offered falsely, or a liveness-degrade forced
// reveal. This audit is the RED for exactly that class: at the episode's
// 'revealed' edge, a world revise must hold BOTH residency facts.
//
// Pure decision — jest-falsifiable (world-join-contract.spec.ts proves it RED by
// suppressing each fact); the runtime bark lives at the one admission edge
// (SearchSurfaceRuntime.completeRedrawAtEpisodeReveal, dev-only [WORLD-JOIN]).
// A join_liveness_degrade reveal legitimately trips this audit too — that is the
// designed behavior: a degraded reveal IS a split reveal, and it must be RED
// (attributable), never silent.

export type WorldJoinRevealFacts = {
  /** Was this episode a WORLD revise (new data — the T4 joint: reveal joins
   *  {paint, mapFrame})? Toggles are exempt by design: their cards swap IS the
   *  reveal ({paint} only) and the marker crossfade lands as the settle. */
  isWorldRevise: boolean;
  /** Cards residency: the mounted store last published with a non-null identity. */
  rowsResident: boolean;
  /** Map-items residency: native holds the episode's frame (wire ack / dedupe). */
  mapFrameClean: boolean;
};

export type WorldJoinViolation = {
  missing: ReadonlyArray<'cards' | 'mapItems'>;
  detail: string;
};

/** RED iff a world revise reveals with either side of the joint absent. */
export const auditWorldJoinAtReveal = (facts: WorldJoinRevealFacts): WorldJoinViolation | null => {
  if (!facts.isWorldRevise) {
    return null;
  }
  const missing: Array<'cards' | 'mapItems'> = [];
  if (!facts.rowsResident) {
    missing.push('cards');
  }
  if (!facts.mapFrameClean) {
    missing.push('mapItems');
  }
  if (missing.length === 0) {
    return null;
  }
  return {
    missing,
    detail:
      `world-join episode revealed with [${missing.join(',')}] not ready — cards and map ` +
      `items must reveal at the same instant (OA1); a degrade reveal reaching here is the ` +
      `designed RED, attribute the missing producer`,
  };
};
