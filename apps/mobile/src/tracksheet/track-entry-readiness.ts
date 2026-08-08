// ─── THE READINESS AXIS (G-READY + OA6.1, R2) ────────────────────────────────
//
// "Readiness is an axis, not a branch order" (contract Part 1). Every entry's
// body resolves to one of three lanes each commit, and the DECISION of what to
// paint is pure — extractable, falsifiable, and never allowed to return
// "nothing" (the switch commit must always paint a body: skeleton or content,
// never an empty frame and never a wait).
//
// WHAT "READY" MEANS (R2 re-derivation, deliberate): an entry is ready when a
// concrete body RESOLUTION exists — a published list spec, a list-parts spec,
// or a registered mounted body. NOT "rowCount > 0": a published list with zero
// rows is the scene SPEAKING (polls' leg-4 bare-white toggle gap, the §6
// promise card, every declared ListEmptyComponent are owner-ratified empty
// faces). Gating readiness on rows would replace those with a host skeleton —
// a regression the charter forbids. Rows-exist is still tracked separately
// (`hasRealRows`) because the two-phase cold-flip PERF probe measures rows
// arrival, not lane arrival.
//
// R8/OA8 (2026-08-08): the READINESS LEDGER that used to live here is DELETED.
// Its latch ("has shown content") existed only to pick frozen-vs-skeleton on a
// resolution gap, and OA8 made that decision the one paint resolver's job
// (track-paint-resolver.ts) keyed on "a frozen body EXISTS" — the store that
// has the body is the latch. What remains here are the resolution FACTS.

export type TrackEntryBodyResolution =
  /** No lane produced a body for this entry this commit. */
  | { kind: 'none' }
  /** A mounted-registry body component exists for the scene. */
  | { kind: 'mounted' }
  /** A list body spec (published lane or list-parts hook) with rowCount rows. */
  | { kind: 'list'; rowCount: number };

/** Ready = a concrete resolution exists (see the header for why not rows). */
export const isResolutionReady = (resolution: TrackEntryBodyResolution): boolean =>
  resolution.kind !== 'none';

/** The two-phase flip's SECOND phase fact: real rows exist on screen. Mounted
 * bodies count as rows (the component is the scene's own content, and its
 * internal loading is the scene's declared state — the host does not reach in). */
export const resolutionHasRealRows = (resolution: TrackEntryBodyResolution): boolean =>
  resolution.kind === 'mounted' || (resolution.kind === 'list' && resolution.rowCount > 0);
