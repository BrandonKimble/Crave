// ─── THE PRESS-SPAN PHASE SPLIT (touch-latency attribution, 2026-08-05) ───────
//
// The press span (track-entry-prewarm.ts) says HOW LONG the finger waited. It
// cannot say WHERE the time went, and the device measurement that motivated this
// module is exactly a "where" question:
//
//   home->polls (revisit) press->first-paint=267ms commit->paint=91ms deferred=true
//   polls->home                                    commit->paint=29ms
//
// The flip frame no longer paints the destination's LIVE resolution (the handoff
// defers it), yet the switch to polls still costs ~90ms of commit->paint and
// ~170ms before the commit even starts. Two unknowns, one number. This module
// splits the one number into the five spans that compose it, each anchored on a
// clock reading taken at the moment it names:
//
//   press            the finger released (track-entry-prewarm's anchor)
//   route-committed  the route txn's own committedAt mark (transition-transaction)
//   host-render      the track host's render for THIS switch began
//   parts            the polls/home parts hooks ran inside that render
//   legs-built       the legs memo finished (the host subtree's own render tail
//                    is what remains between here and layout-effect)
//   layout-effect    the ack bridge armed (the txn's 'amended' edge)
//   paint            rAF after the commit — what reached the screen
//
// HONESTY RULES, so no span can be structurally green:
//   • Every mark is a real clock reading at the named event. Nothing is derived
//     from another mark, so a span that is genuinely zero and a span that was
//     never marked are DIFFERENT outputs ('0.0ms' vs '?').
//   • A phase never seen prints '?'. A report is never fabricated from a
//     partial span — but a partial span IS printed (with '?' holes), because a
//     switch that never reached a phase is the loudest possible evidence.
//   • First-write-wins per phase: a re-render inside the same switch cannot
//     push a mark later and shrink the span in front of it.
//   • The span expires (same TTL as the press span). A press that landed
//     nowhere reports nothing rather than a fabricated multi-second phase.
//
// CLOCKS. The press anchor is Date.now(); the transition txn's marks are
// performance.now(). They have different epochs, so this module converts once,
// at the reading site, via a live offset sample (drift over a sub-second switch
// is far below the resolution of anything measured here). Every stored mark is
// Date-epoch ms.
//
// Dev-only bookkeeping. RN-free (pure jest lane).

export const TRACK_PRESS_PHASES = [
  'press',
  'route-committed',
  'host-render',
  'parts',
  'legs-built',
  'layout-effect',
  // The txn's OWN revealedAt mark, converted into this clock. The tail between
  // layout-effect and passive-effect holds every other layout effect, every
  // passive effect, AND the join/reveal choreography — reading the engine's
  // existing mark says which of those the tail is, instead of assuming.
  'reveal',
  'passive-effect',
  'paint',
] as const;

export type TrackPressPhase = (typeof TRACK_PRESS_PHASES)[number];

export type TrackPressPhaseSpan = {
  sceneKey: string;
  /** Date-epoch ms, first-write-wins, only for phases actually observed. */
  marks: Partial<Record<TrackPressPhase, number>>;
  /** Measured directly (not a mark delta): the parts hooks' own cost. */
  partsMs: number | null;
  // ── THE COUNTED FACTS (round 2) ───────────────────────────────────────────
  // layout-effect->paint was 115-155ms on polls and 27-30ms on home, and the
  // 155ms frame painted a SKELETON — so "the body is expensive" cannot be
  // asserted from the timings alone. These four say WHAT the frame actually
  // did, so the span is attributable instead of merely large. Each is written
  // where the thing happens; none is derived from a timing.
  /** React commits between the span opening and the paint. >1 means
   *  layout-effect->paint contains ANOTHER render pass, not native mount. */
  commits: number;
  /** Leg chrome elements BUILT (cache misses) in this switch. The resident
   *  chrome stack's cost, counted at the miss branch — 0 proves the cache hit
   *  and takes the chrome stack off the table for this switch. */
  chromeBuilds: number;
  /** Rows the presented leg handed the page's one FlashList this frame. */
  rows: number | null;
  /** Which body the flip frame painted. */
  body: string | null;
  /** The dev row A/B mode this span was measured under ('full' | 'bare'). A
   *  measurement filed under the wrong mode is worse than no measurement. */
  rowProbeMode: string;
  // ── THE SUBTREE LEDGER (round 4) ──────────────────────────────────────────
  // Round 3 profiled the ROW and got ZERO on the 159ms frame. Zero is a
  // measurement, and it falsifies the row hypothesis outright — but it does not
  // say where the 159ms went, and one probe reporting nothing is exactly when
  // to add more, not to start guessing again.
  //
  // So the ledger is now per-SUBTREE and named at the call site: the page's
  // whole tree, the list, the resident chrome stack, the row. Nesting is
  // deliberate and stated rather than corrected for — React's actualDuration
  // INCLUDES descendants, so an inner id's number is contained in its outer
  // id's number, and the interesting quantity is the DIFFERENCE (page minus
  // list = everything in the page that is not the list). Reported side by side
  // so the subtraction is the reader's, done on numbers that were each measured
  // rather than on one number that was apportioned.
  subtrees: Map<string, TrackSubtreeTally>;
  /** Cell-renderer INVOCATIONS at the page's funnel (see noteTrackPressRowInvoke). */
  rowInvokes: number;
  /**
   * DISTINCT row indices invoked. The load-bearing number: 23 invocations can
   * be 23 different rows (an over-wide render window) or ~9 rows re-invoked
   * across the progressive-convergence loop's passes, and those two facts have
   * completely different fixes. Invocations alone cannot tell them apart.
   */
  rowIndices: Set<number>;
  /**
   * Whether the presented leg handed the list the SAME data array object it
   * handed it the last time this entry presented ('same'), a different one
   * ('new'), or this is the first presentation ('first'). A 'new' identity for
   * unchanged content would make FlashList redo its whole data path on every
   * switch for nothing — an upstream identity bug, not a list bug. Recorded by
   * object identity, which is the only thing the list itself can see.
   */
  dataIdentity: string | null;
  /**
   * Whether the CONTENT is the same as last presentation (element-wise
   * identity), independent of the array's identity. This is the fact that says
   * whether a 'new' array is a BUG or just new data — an assumption I was one
   * step from acting on, and the same assumption that has been wrong three
   * times already in this attribution.
   */
  dataContent: string | null;
};

export type TrackSubtreeTally = {
  mounts: number;
  updates: number;
  totalMs: number;
  maxMs: number;
};

const emptyTally = (): TrackSubtreeTally => ({ mounts: 0, updates: 0, totalMs: 0, maxMs: 0 });

const addToTally = (tally: TrackSubtreeTally, phase: string, durationMs: number): void => {
  if (phase === 'mount') {
    tally.mounts += 1;
  } else {
    tally.updates += 1;
  }
  tally.totalMs += durationMs;
  tally.maxMs = Math.max(tally.maxMs, durationMs);
};

const formatTally = (tally: TrackSubtreeTally): string =>
  `${tally.totalMs.toFixed(1)}ms/max${tally.maxMs.toFixed(1)}/${tally.mounts}m${tally.updates}u`;

/** Same generosity as the press span: longer than any honest transition, so the
 *  only spans it drops are the ones that never landed. */
export const TRACK_PRESS_PHASE_TTL_MS = 4000;

let live: TrackPressPhaseSpan | null = null;

/** Date-epoch equivalent of a performance.now() reading (the transition engine's
 *  clock). Sampled at the call, never cached — a cached offset would silently
 *  encode drift into every later span. */
export const trackPerfToEpochMs = (perfMs: number, nowEpochMs: number, nowPerfMs: number): number =>
  nowEpochMs - (nowPerfMs - perfMs);

/** Open a span. Called at the first host render that sees a new switch; the
 *  press anchor comes from the press stamp (null when the switch had no press —
 *  a deep link, a programmatic push — in which case 'press' prints '?'). */
export const beginTrackPressPhaseSpan = (sceneKey: string, pressAtMs: number | null): void => {
  live = {
    sceneKey,
    marks: {},
    partsMs: null,
    commits: 0,
    chromeBuilds: 0,
    rows: null,
    body: null,
    subtrees: new Map(),
    rowInvokes: 0,
    rowIndices: new Set(),
    dataIdentity: null,
    dataContent: null,
    rowProbeMode: 'full',
  };
  if (pressAtMs != null) {
    live.marks.press = pressAtMs;
  }
};

const isStale = (span: TrackPressPhaseSpan, nowMs: number): boolean => {
  const anchor = span.marks.press ?? span.marks['route-committed'] ?? span.marks['host-render'];
  return anchor != null && nowMs - anchor > TRACK_PRESS_PHASE_TTL_MS;
};

/** Record a phase. Ignored when there is no live span, when the scene does not
 *  match, when the phase was already marked, or when the span went stale. */
export const noteTrackPressPhase = (
  sceneKey: string,
  phase: TrackPressPhase,
  atMs: number
): void => {
  if (live == null || live.sceneKey !== sceneKey) {
    return;
  }
  if (isStale(live, atMs)) {
    live = null;
    return;
  }
  if (live.marks[phase] != null) {
    return;
  }
  live.marks[phase] = atMs;
};

/** The parts hooks' cost is MEASURED, not inferred from neighbouring marks —
 *  they run inside the host render, so no pair of marks brackets them. */
export const noteTrackPressPartsCost = (sceneKey: string, durationMs: number): void => {
  if (live == null || live.sceneKey !== sceneKey || live.partsMs != null) {
    return;
  }
  live.partsMs = durationMs;
};

/** One React commit of the track host landed while this span was open. */
export const noteTrackPressRowProbeMode = (sceneKey: string, mode: string): void => {
  if (live == null || live.sceneKey !== sceneKey) {
    return;
  }
  live.rowProbeMode = mode;
};

export const noteTrackPressCommit = (sceneKey: string): void => {
  if (live == null || live.sceneKey !== sceneKey) {
    return;
  }
  live.commits += 1;
};

/** A leg's chrome element MISSED its cache and was rebuilt. Counted where the
 *  build happens (TrackSheetPage's chrome element cache), never inferred. */
export const noteTrackPressChromeBuild = (sceneKey: string): void => {
  if (live == null || live.sceneKey !== sceneKey) {
    return;
  }
  live.chromeBuilds += 1;
};

/** What the flip frame handed the page's one FlashList. First-write-wins: the
 *  flip frame's body is the claim, not whatever a later commit swapped in. */
export const noteTrackPressBodyFact = (
  sceneKey: string,
  rows: number,
  body: string,
  dataIdentity: string,
  dataContent: string
): void => {
  if (live == null || live.sceneKey !== sceneKey || live.body != null) {
    return;
  }
  live.rows = rows;
  live.body = body;
  live.dataIdentity = dataIdentity;
  live.dataContent = dataContent;
};

/**
 * One named subtree rendered. `phase` is React's own ('mount' | 'update') and
 * `durationMs` is React's actualDuration for that subtree — neither is derived
 * from a wall-clock bracket the probe drew around it.
 *
 * Row renders ALSO feed the row window below, which outlives this span: the
 * flip's span closes at the flip's paint, so anything FlashList mounts in a
 * LATER commit is outside it by construction — the exact way round 3's row
 * probe could report zero while rows were being mounted a moment later.
 */
export const noteTrackPressSubtreeRender = (
  sceneKey: string,
  id: string,
  phase: string,
  durationMs: number
): void => {
  if (live != null && live.sceneKey === sceneKey) {
    const tally = live.subtrees.get(id) ?? emptyTally();
    addToTally(tally, phase, durationMs);
    live.subtrees.set(id, tally);
  }
  if (rowWindow != null && rowWindow.sceneKey === sceneKey && id === 'row') {
    addToTally(rowWindow.tally, phase, durationMs);
  }
};

/**
 * A CELL RENDERER WAS INVOKED. Counted at the page's single renderItem funnel
 * (rendererForLeg), which every lane goes through — published, parts and
 * mounted alike. This is deliberately INDEPENDENT of the row Profiler: the
 * Profiler sits inside the parts lane's row wrapper, so "no row profiled" has
 * two possible meanings — the list rendered no cells, or the wrapper is not on
 * the path these cells take. One counter at the funnel separates them, and no
 * amount of reading the list's source can.
 */
export const noteTrackPressRowInvoke = (sceneKey: string, index: number): void => {
  // TWO INDEPENDENT GUARDS, not one nested pair. Written the nested way first,
  // and the row-window spec caught it: the window must OUTLIVE the phase span,
  // so gating the window's count on the span being live reintroduces exactly
  // the blind spot that made round 3's row probe report zero.
  if (live != null && live.sceneKey === sceneKey) {
    live.rowInvokes += 1;
    live.rowIndices.add(index);
  }
  if (rowWindow != null && rowWindow.sceneKey === sceneKey) {
    rowWindow.invokes += 1;
    rowWindow.indices.add(index);
  }
};

// ── THE ROW WINDOW ───────────────────────────────────────────────────────────
// A SECOND record with a LONGER life than the phase span: opened with the
// switch, closed at press->real-rows. It answers the question the flip-frame
// span cannot — how many rows the list eventually mounted and what they cost —
// and therefore also answers what drawDistance=SCREEN.height over an
// absoluteFill list actually decides to render.

let rowWindow: {
  sceneKey: string;
  tally: TrackSubtreeTally;
  invokes: number;
  indices: Set<number>;
} | null = null;

export const beginTrackPressRowWindow = (sceneKey: string): void => {
  rowWindow = { sceneKey, tally: emptyTally(), invokes: 0, indices: new Set() };
};

export const finishTrackPressRowWindow = (
  sceneKey: string
): (TrackSubtreeTally & { invokes: number; distinct: number }) | null => {
  if (rowWindow == null || rowWindow.sceneKey !== sceneKey) {
    return null;
  }
  const { tally, invokes, indices } = rowWindow;
  rowWindow = null;
  return { ...tally, invokes, distinct: indices.size };
};

export const formatTrackPressRowWindow = (
  sceneKey: string,
  tally: TrackSubtreeTally & { invokes: number; distinct: number }
): string =>
  `[PERF] rowwindow ${sceneKey} invokes=${tally.invokes} distinct=${tally.distinct} ` +
  `mounts=${tally.mounts} updates=${tally.updates} ` +
  `ms=${tally.totalMs.toFixed(1)} max=${tally.maxMs.toFixed(1)} ` +
  `avg=${
    tally.mounts + tally.updates === 0
      ? '?'
      : (tally.totalMs / (tally.mounts + tally.updates)).toFixed(1)
  }`;

/** Test seam only. */
export const peekTrackPressRowWindow = (): Readonly<TrackSubtreeTally> | null =>
  rowWindow?.tally ?? null;

/** Test seam only. */
export const peekTrackPressRowInvokes = (): number => rowWindow?.invokes ?? 0;

/** Close and take the span (once). Returns null when nothing is live or the span
 *  belongs to another scene — never a fabricated record. */
export const finishTrackPressPhaseSpan = (
  sceneKey: string,
  atMs: number
): TrackPressPhaseSpan | null => {
  if (live == null || live.sceneKey !== sceneKey) {
    return null;
  }
  if (isStale(live, atMs)) {
    live = null;
    return null;
  }
  live.marks.paint = live.marks.paint ?? atMs;
  const span = live;
  live = null;
  return span;
};

const gap = (span: TrackPressPhaseSpan, from: TrackPressPhase, to: TrackPressPhase): string => {
  const a = span.marks[from];
  const b = span.marks[to];
  if (a == null || b == null) {
    return '?';
  }
  return `${(b - a).toFixed(0)}ms`;
};

/**
 * ONE LINE, the five spans in order plus the measured parts cost. Read it as a
 * decomposition of press->paint: adjacent gaps chain, so they sum to the total
 * whenever every phase was seen (and visibly do not when one is '?').
 */
export const formatTrackPressPhases = (span: TrackPressPhaseSpan): string =>
  `[PERF] phases ${span.sceneKey} ` +
  `press->committed=${gap(span, 'press', 'route-committed')} ` +
  `committed->host-render=${gap(span, 'route-committed', 'host-render')} ` +
  `host-render->parts=${gap(span, 'host-render', 'parts')} ` +
  `parts->legs=${gap(span, 'parts', 'legs-built')} ` +
  `legs->layout-effect=${gap(span, 'legs-built', 'layout-effect')} ` +
  // THE SPLIT OF THE BIG ONE: everything left in JS after the host's layout
  // effect (other layout effects, passive effects, any SECOND commit) vs the
  // remainder — the native mount/layout that reaches the screen.
  `layout-effect->reveal=${gap(span, 'layout-effect', 'reveal')} ` +
  `reveal->passive=${gap(span, 'reveal', 'passive-effect')} ` +
  `layout-effect->passive=${gap(span, 'layout-effect', 'passive-effect')} ` +
  `passive->paint=${gap(span, 'passive-effect', 'paint')} ` +
  `partsCost=${span.partsMs == null ? '?' : `${span.partsMs.toFixed(1)}ms`} ` +
  `commits=${span.commits} chromeBuilds=${span.chromeBuilds} ` +
  `rows=${span.rows ?? '?'} body=${span.body ?? '?'} rowInvokes=${span.rowInvokes} ` +
  `rowDistinct=${span.rowIndices.size} rowProbe=${span.rowProbeMode} ` +
  `dataIdentity=${span.dataIdentity ?? '?'} dataContent=${span.dataContent ?? '?'} ` +
  // Each named subtree, measured independently. Nested ids CONTAIN each other
  // (React's actualDuration includes descendants) — 'page' minus 'list' is the
  // page's own render, 'list' minus 'chromeStack' minus 'row' is the list's.
  // A subtree that never rendered is ABSENT, not zero.
  `${
    span.subtrees.size === 0
      ? 'subtrees=none '
      : `${[...span.subtrees.entries()].map(([id, t]) => `sub:${id}=${formatTally(t)}`).join(' ')} `
  }` +
  `total=${gap(span, 'press', 'paint')}`;

/** Test seam only. */
export const peekTrackPressPhaseSpan = (): Readonly<TrackPressPhaseSpan> | null => live;

/** Test seam only: specs share the module singleton. */
export const resetTrackPressPhaseSpan = (): void => {
  live = null;
};
