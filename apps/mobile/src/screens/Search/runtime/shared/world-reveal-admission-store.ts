/**
 * WORLD REVEAL ADMISSION (§Q redo T4 — ledger N-2/P-13, design §4.3's joint for
 * world-backed pages).
 *
 * The reveal joint's JS tick: flushPendingMarkerEnterStart admits the cards AND fires
 * the native enter-start token in one place (the [REVEALSYNC] cardsAdmit tick). The
 * results surface already gates on it; world-backed PAGES (listDetail's world-read
 * seam) did not — they painted rows the moment the world COMMITTED, minutes of frames
 * before the pins began their fade (screenshot-proven: full cards, zero pins).
 *
 * This store records the admitted request keys so any world-content consumer can hold
 * its skeleton until ITS world's admit tick — cards land as the ramp starts, per-mouth,
 * with zero per-surface choreography. Admission is monotonic per key (a re-presented
 * already-admitted world shows immediately — it has been seen; the ramp re-run is the
 * map's own affair).
 */

type Listener = () => void;

const ADMITTED_KEY_CAP = 16;

const admittedRequestKeys: string[] = [];
const listeners = new Set<Listener>();

export const recordWorldRevealAdmission = (requestKey: string): void => {
  if (admittedRequestKeys.includes(requestKey)) {
    return;
  }
  admittedRequestKeys.push(requestKey);
  if (admittedRequestKeys.length > ADMITTED_KEY_CAP) {
    admittedRequestKeys.shift();
  }
  listeners.forEach((listener) => listener());
};

export const isWorldRevealAdmitted = (requestKey: string | null): boolean =>
  requestKey != null && admittedRequestKeys.includes(requestKey);

export const subscribeWorldRevealAdmission = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
