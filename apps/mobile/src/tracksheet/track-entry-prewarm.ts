// ─── PREDICTIVE PREWARM (G-PREWARM, R3) ──────────────────────────────────────
//
// The warm-before-navigate law, moved to the LIVE path: when a switch to a
// cold entry is PREDICTABLE — the finger is already DOWN on a tab but has not
// released — the host begins resolving that entry's leg (chrome elements,
// skeleton renderer, resident-leg mount, list-parts cells) BEFORE the switch
// commits, so the cold window the [PERF] probe measures starts earlier than
// press-up. Two laws bound it:
//
//   • HOST-OWNED + DATA-DRIVEN: the trigger side only names a SCENE
//     (requestTrackScenePrewarm); WHAT prewarming means is decided here, from
//     the same residency data the host already owns (RESIDENT scenes mount
//     their leg early; everything else is a no-op — child entries have no
//     entryId before their push mints one, so there is nothing entry-keyed to
//     warm). No per-scene special case may ever live at a call site.
//   • NEVER AT THE SWITCH'S EXPENSE: prewarm work happens in its own commit,
//     strictly BEFORE the presentation frame flips. The switch commit itself
//     is untouched — one frame, always.
//
// The store is a module singleton because the trigger (the bottom nav) and
// the consumer (the track host) live in different trees; the signal is a
// scene name, nothing more.

export type TrackScenePrewarmDecision =
  /** Mount the scene's resident leg now (first visit happens early). */
  | { kind: 'mountResidentLeg' }
  /** Nothing host-owned to warm ahead of the commit. */
  | { kind: 'none' };

/** The PURE decision (the falsifier home): given what the host knows about a
 * scene, what does a prewarm request mean? Residents not yet visited mount
 * early; already-visited residents are warm by definition; non-residents have
 * no pre-push identity to warm. */
export const planScenePrewarm = (args: {
  isResidentScene: boolean;
  alreadyVisited: boolean;
}): TrackScenePrewarmDecision =>
  args.isResidentScene && !args.alreadyVisited ? { kind: 'mountResidentLeg' } : { kind: 'none' };

type Listener = () => void;

/** Pending scene names + subscribers. Dedupes: a held press must not queue
 * the same scene twice. */
class TrackScenePrewarmSignal {
  private pending = new Set<string>();
  private listeners = new Set<Listener>();

  request(sceneKey: string): void {
    if (this.pending.has(sceneKey)) {
      return;
    }
    this.pending.add(sceneKey);
    this.listeners.forEach((listener) => listener());
  }

  /** Drains the queue — the consumer decides per scene via planScenePrewarm. */
  consume(): string[] {
    const drained = [...this.pending];
    this.pending.clear();
    return drained;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get pendingCount(): number {
    return this.pending.size;
  }
}

const signal = new TrackScenePrewarmSignal();

/** Trigger side (nav press-DOWN, a resolved child push, …): name the scene. */
export const requestTrackScenePrewarm = (sceneKey: string): void => signal.request(sceneKey);

/** Consumer side (the track host). */
export const subscribeTrackScenePrewarm = (listener: Listener): (() => void) =>
  signal.subscribe(listener);

export const consumeTrackScenePrewarmRequests = (): string[] => signal.consume();

/** Test seam: the class, not the singleton. */
export { TrackScenePrewarmSignal };

// ─── THE PRESS SPAN (touch-latency instrument) ───────────────────────────────
//
// The [PERF] switch probe measures commit->paint, which STARTS at the React
// commit — after everything the finger already waited through. A metric that
// begins after the delay can never show the delay (the composite law). This
// stamps the press itself so the honest span is measurable.
//
// CORRECTION 2026-08-05 (audit defect 2). The first cut consumed the stamp at
// the FIRST paint after the flip. With the press-up handoff armed, that paint is
// the deferred one — a skeleton or a frozen body — so the number the rung exists
// to move would have improved BY DEFINITION while the span the user actually
// feels (press -> the destination's real rows) went unmeasured. Two probes, two
// different anchors, never summed: an always-green metric, the exact disease.
//
// So the span is ONE record with ONE anchor (the press) and TWO marks off it,
// reported as ONE line:
//
//   [PERF] press <entry> press->first-paint=<a>ms press->real-rows=<b>ms
//          first-paint-real-rows=<bool> (deferred=<b>a>)
//
// The skeleton is a PHASE of this span, not its result: press->real-rows can
// only be stamped by a commit that actually painted real rows, so no amount of
// fast skeleton makes it go green.
//
// EXPIRY IS PART OF THE INSTRUMENT. A press that lands nowhere (a rejected
// switch, a scene that never presents) used to leave the stamp set forever, and
// the next unrelated paint of that scene — minutes later — reported a fabricated
// multi-second latency. A span older than the TTL is DROPPED, never reported.
// Lazily evaluated (checked on every touch) so there is no timer to fake.
//
// Dev-only bookkeeping; nothing reads it in production.

/** Beyond this, a pending press is stale evidence and is discarded unreported.
 *  Generous on purpose: it must exceed any honest transition, so the only spans
 *  it drops are the ones that never landed. */
export const TRACK_PRESS_SPAN_TTL_MS = 4000;

type TrackPressSpan = {
  sceneKey: string;
  pressAtMs: number;
  entryKey: string | null;
  firstPaintMs: number | null;
  firstPaintHadRealRows: boolean;
};

export type TrackPressSpanReport = {
  entryKey: string;
  pressToFirstPaintMs: number;
  pressToRealRowsMs: number;
  firstPaintHadRealRows: boolean;
};

let pendingPress: TrackPressSpan | null = null;

const dropIfStale = (nowMs: number): void => {
  if (pendingPress != null && nowMs - pendingPress.pressAtMs > TRACK_PRESS_SPAN_TTL_MS) {
    pendingPress = null;
  }
};

/** Trigger side: a nav tab's onPress or a child reveal, BEFORE the switch is
 *  requested. A previous unlanded press is replaced, never inherited. */
export const markTrackNavPress = (sceneKey: string, atMs: number): void => {
  pendingPress = {
    sceneKey,
    pressAtMs: atMs,
    entryKey: null,
    firstPaintMs: null,
    firstPaintHadRealRows: false,
  };
};

/**
 * Consumer side, mark 1: the first paint after the flip commit — whatever body
 * it carried. Does NOT consume the span; the press anchor stays alive so mark 2
 * measures from the same zero.
 */
export const noteTrackPressFirstPaint = (
  sceneKey: string,
  entryKey: string,
  nowMs: number,
  paintedRealRows: boolean
): number | null => {
  dropIfStale(nowMs);
  if (pendingPress == null || pendingPress.sceneKey !== sceneKey) {
    return null;
  }
  if (pendingPress.firstPaintMs != null) {
    return null;
  }
  pendingPress.entryKey = entryKey;
  pendingPress.firstPaintMs = nowMs - pendingPress.pressAtMs;
  pendingPress.firstPaintHadRealRows = paintedRealRows;
  return pendingPress.firstPaintMs;
};

/**
 * Consumer side, mark 2 and the close: the first paint carrying the
 * destination's REAL ROWS. Returns the whole span, once, or null when this paint
 * did not come from a tracked press (no stamp, wrong scene, expired, or the flip
 * frame was never marked).
 */
export const noteTrackPressRealRows = (
  sceneKey: string,
  entryKey: string,
  nowMs: number
): TrackPressSpanReport | null => {
  dropIfStale(nowMs);
  const span = pendingPress;
  if (span == null || span.sceneKey !== sceneKey || span.firstPaintMs == null) {
    return null;
  }
  pendingPress = null;
  return {
    entryKey: span.entryKey ?? entryKey,
    pressToFirstPaintMs: span.firstPaintMs,
    pressToRealRowsMs: nowMs - span.pressAtMs,
    firstPaintHadRealRows: span.firstPaintHadRealRows,
  };
};

/** THE ONE LINE. Both marks, one anchor, one place that decides the wording. */
export const formatTrackPressSpan = (report: TrackPressSpanReport): string =>
  `[PERF] press ${report.entryKey} ` +
  `press->first-paint=${report.pressToFirstPaintMs}ms ` +
  `press->real-rows=${report.pressToRealRowsMs}ms ` +
  `first-paint-real-rows=${report.firstPaintHadRealRows} ` +
  `deferred=${!report.firstPaintHadRealRows}`;

/** Test seam only: the pending span (or null), without touching expiry. */
export const peekTrackPressSpan = (): Readonly<TrackPressSpan> | null => pendingPress;

/** Test seam only: forget any pending press (specs share the module singleton). */
export const resetTrackPressSpan = (): void => {
  pendingPress = null;
};
