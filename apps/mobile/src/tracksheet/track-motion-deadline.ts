// ─── THE LIVENESS BACKSTOP (G-APPSTATE, rederived) ───────────────────────────
//
// WHAT A TIMER IS FOR, from first principles.
//
// Every OTHER time-shaped thing in this system is now an ENGINE FACT: the
// spring states its own settle (trackDidSettle), the excursion states its
// screen-edge crossing (generation-stamped), snapTo states its own refusal, and
// the motion authority stamps every one of them with an EPISODE IDENTITY. So a
// wall clock has exactly one job left, and it is not a motion fact:
//
//   A TIMER IS A LIVENESS BACKSTOP AGAINST A FACT THAT NEVER ARRIVED.
//
// Three consequences follow, and they are this module's whole law:
//
//   (a) EPISODE-SCOPED. A backstop armed for episode N may only ever end
//       episode N. (The authority already enforces this on the way in; here it
//       is enforced on the way out too — a superseded arm CANCELS the schedule
//       instead of leaving an OS timer alive to fire against a live episode.)
//
//   (b) SUSPENDED-TIME-AWARE. iOS freezes the JS runloop when the app leaves
//       the foreground; a naive setTimeout fires LATE (or several fire at once)
//       on resume, against a world that moved on. Background time is not time
//       the engine had to produce its fact, so it must not count. This module
//       stops the budget at suspend and, on resume, re-schedules on a FRESH
//       budget — the spring itself restarts after suspension, so the observation
//       window restarts with it. Every schedule carries a scheduleId, so an OS
//       timer that survives a suspend/resume cycle is REJECTED on arrival
//       rather than trusted for having fired.
//
//   (c) IT MAY NOT MANUFACTURE A FACT. This is the sharp one. The deadline used
//       to hand the authority a rest (`rest: true`) — i.e. JS inventing "the
//       sheet settled" for a settle nobody observed. It cannot know that. What
//       it legitimately knows is: "the fact is overdue; consumers waiting on it
//       must be RELEASED so nothing wedges." So the deadline DEGRADES the
//       episode — it ends it with rest:false, degraded:true. Consumers that
//       need liveness (the R7 fence restore, the motion plane's settle token)
//       release on a degrade; consumers that need the FACT (posture memory, the
//       world join's at-reveal audit) see that no settle happened. A degrade
//       barks in dev, because a degrade is always a defect upstream.
//
// A backstop is NOT bounded on a DRAG. The finger owns τ for as long as a human
// wants; a deadline over a drag would release consumers mid-gesture. A drag's
// rest fact always arrives (the engine emits settle on dragEnd/decelerate rest),
// so the adapter disarms the moment an episode becomes a drag.
//
// RN-free on purpose (same law as track-motion-authority.ts): the decisions are
// pure and jest-falsifiable; the React/AppState/setTimeout adapter is thin and
// lives in use-track-motion-controller.ts.

/** PROVENANCE (F874, 2026-08-03; re-homed here 2026-08-05): 700ms is a
 * DEADLINE, not a duration — deliberately longer than any real spring so it
 * never PREEMPTS a genuine settle, short enough that a lost fact costs one
 * visible beat rather than a wedged transition. Not measured against the
 * spring; sized to be safely past it. */
export const SETTLE_DEADLINE_MS = 700;

/** On resume the engine's spring restarts from wherever the suspend froze it,
 * so the backstop restarts too: the resumed schedule is at least a full fresh
 * budget, never the sliver that happened to be left. (Foreground accrual is
 * still tracked — remainingMs is the honest "time the engine actually had".) */
export const RESUME_GRACE_MS = SETTLE_DEADLINE_MS;

export type MotionDeadlineArmed = {
  episodeId: number;
  /** Identity of the CURRENT schedule. A fired timer must name it. */
  scheduleId: number;
  budgetMs: number;
  /** Foreground-only time left in the budget. Background never decrements it. */
  remainingMs: number;
  /** Wall clock at which the current foreground run began; null while suspended. */
  runningSinceMs: number | null;
};

export type MotionDeadlineState = {
  armed: MotionDeadlineArmed | null;
  /** The app is in the foreground — the only state in which time counts. */
  foreground: boolean;
  nextScheduleId: number;
};

export const initialMotionDeadlineState: MotionDeadlineState = {
  armed: null,
  foreground: true,
  nextScheduleId: 1,
};

export type MotionDeadlineEvent =
  /** An episode that owes a rest fact opened (flight / excursion — never a drag). */
  | { type: 'arm'; episodeId: number; budgetMs: number; atMs: number }
  /** The episode ended by a REAL fact, or became a drag: the backstop is moot. */
  | { type: 'disarm'; episodeId: number }
  /** AppState left 'active' — the JS runloop may be frozen from here. */
  | { type: 'app-suspended'; atMs: number }
  /** AppState returned to 'active'. */
  | { type: 'app-resumed'; atMs: number }
  /** An OS timer fired. Its scheduleId is what makes a stale one recognisable. */
  | { type: 'timer-fired'; scheduleId: number; atMs: number };

export type MotionDeadlineEffect =
  | { type: 'none' }
  /** Cancel any live OS timer, then schedule this one. */
  | { type: 'schedule'; scheduleId: number; delayMs: number }
  /** Cancel any live OS timer; schedule nothing. */
  | { type: 'cancel' }
  /** The budget is spent in the foreground: DEGRADE this episode. */
  | { type: 'expire'; episodeId: number };

export type MotionDeadlineTransition = {
  state: MotionDeadlineState;
  effect: MotionDeadlineEffect;
};

const elapsedForeground = (armed: MotionDeadlineArmed, atMs: number): number =>
  armed.runningSinceMs == null ? 0 : Math.max(0, atMs - armed.runningSinceMs);

export const reduceMotionDeadline = (
  state: MotionDeadlineState,
  event: MotionDeadlineEvent
): MotionDeadlineTransition => {
  switch (event.type) {
    case 'arm': {
      // A new arm SUPERSEDES whatever was armed: the previous schedule is
      // cancelled, not merely ignored, so no OS timer outlives its episode.
      const scheduleId = state.nextScheduleId;
      const armed: MotionDeadlineArmed = {
        episodeId: event.episodeId,
        scheduleId,
        budgetMs: event.budgetMs,
        remainingMs: event.budgetMs,
        runningSinceMs: state.foreground ? event.atMs : null,
      };
      return {
        state: { ...state, armed, nextScheduleId: scheduleId + 1 },
        // Armed while suspended: nothing is scheduled until the app resumes —
        // a timer set now would be exactly the stale-fire this module deletes.
        effect: state.foreground
          ? { type: 'schedule', scheduleId, delayMs: armed.remainingMs }
          : { type: 'cancel' },
      };
    }
    case 'disarm': {
      if (state.armed == null || state.armed.episodeId !== event.episodeId) {
        // A stale disarm may never cancel a LIVE episode's backstop.
        return { state, effect: { type: 'none' } };
      }
      return { state: { ...state, armed: null }, effect: { type: 'cancel' } };
    }
    case 'app-suspended': {
      if (!state.foreground) {
        return { state, effect: { type: 'none' } };
      }
      if (state.armed == null) {
        return { state: { ...state, foreground: false }, effect: { type: 'none' } };
      }
      // Bank the foreground time spent, stop the clock, and INVALIDATE the
      // schedule: a timer that survives the freeze must not be trusted.
      const remainingMs = Math.max(
        0,
        state.armed.remainingMs - elapsedForeground(state.armed, event.atMs)
      );
      return {
        state: {
          ...state,
          foreground: false,
          armed: {
            ...state.armed,
            remainingMs,
            runningSinceMs: null,
            scheduleId: state.nextScheduleId,
          },
          nextScheduleId: state.nextScheduleId + 1,
        },
        effect: { type: 'cancel' },
      };
    }
    case 'app-resumed': {
      if (state.foreground) {
        return { state, effect: { type: 'none' } };
      }
      if (state.armed == null) {
        return { state: { ...state, foreground: true }, effect: { type: 'none' } };
      }
      const scheduleId = state.nextScheduleId;
      const delayMs = Math.max(state.armed.remainingMs, RESUME_GRACE_MS);
      return {
        state: {
          ...state,
          foreground: true,
          armed: { ...state.armed, scheduleId, runningSinceMs: event.atMs, remainingMs: delayMs },
          nextScheduleId: scheduleId + 1,
        },
        effect: { type: 'schedule', scheduleId, delayMs },
      };
    }
    case 'timer-fired': {
      if (state.armed == null || !state.foreground) {
        return { state, effect: { type: 'none' } };
      }
      if (state.armed.scheduleId !== event.scheduleId) {
        // A superseded / suspend-invalidated schedule. This is the resume
        // stampede's landing site: rejected, never acted on.
        return { state, effect: { type: 'none' } };
      }
      return {
        state: { ...state, armed: null },
        effect: { type: 'expire', episodeId: state.armed.episodeId },
      };
    }
    default: {
      const exhaustive: never = event;
      return { state, effect: exhaustive };
    }
  }
};

// F9402 DISPOSITION (R8, the finding's "annotate" arm): the two selectors
// below have NO live consumer — they are the falsifier suite's OBSERVATION
// PORT (the spec asserts suspension/episode semantics through them, and
// elapsedForeground is deliberately private). Deleting them would force the
// spec to re-implement the arithmetic it exists to falsify. If a live
// consumer ever arrives it uses these; nothing else may re-derive them.

/** Foreground-only time left before the backstop degrades the episode. */
export const motionDeadlineRemainingMs = (
  state: MotionDeadlineState,
  atMs: number
): number | null =>
  state.armed == null
    ? null
    : Math.max(0, state.armed.remainingMs - elapsedForeground(state.armed, atMs));

/** The armed episode, for consumers that must not confuse it with a live one. */
export const motionDeadlineArmedEpisodeId = (state: MotionDeadlineState): number | null =>
  state.armed?.episodeId ?? null;
