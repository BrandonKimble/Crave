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

// ─── THE PRESS STAMP (touch-latency instrument) ──────────────────────────────
//
// The [PERF] switch probe measures commit->paint, which STARTS at the React
// commit — after everything the finger already waited through. A metric that
// begins after the delay can never show the delay (the composite law). This
// stamps the press itself so the honest span, press-up -> painted, is
// measurable. Dev-only bookkeeping; nothing reads it in production.
let lastNavPressAtMs: number | null = null;
let lastNavPressScene: string | null = null;

/** Trigger side: the nav tab's onPress, BEFORE the switch is requested. */
export const markTrackNavPress = (sceneKey: string, atMs: number): void => {
  lastNavPressAtMs = atMs;
  lastNavPressScene = sceneKey;
};

/** Consumer side: the paint probe. Returns ms since the press that asked for
 *  this scene, or null when this paint did not come from a nav press. */
export const consumeTrackNavPressLatency = (sceneKey: string, nowMs: number): number | null => {
  if (lastNavPressAtMs == null || lastNavPressScene !== sceneKey) {
    return null;
  }
  const elapsed = nowMs - lastNavPressAtMs;
  lastNavPressAtMs = null;
  lastNavPressScene = null;
  return elapsed;
};
