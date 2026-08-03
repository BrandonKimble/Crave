import { SetMetadata } from '@nestjs/common';
import type { SignalKind } from './signals.service';

/**
 * "DOES THIS ACT REACH THE LEDGER?" — DECLARED AT THE ROUTE, CHECKED AT BOOT.
 *
 * §3: the signals ledger is THE record of a user act. But `record()` returns
 * `void` and is called as a bare fire-and-forget statement by seven services,
 * so nothing structurally connected an ACT to its ledger row. A new surface
 * that performs a user act simply does not call it, and the omission is
 * invisible FOREVER — no test fails, no metric moves, and the aggregate
 * faithfully derives from a ledger that never heard about the act. The
 * controller's own doc already stated the intended law ("every other act kind
 * records at its own chokepoint"), but "chokepoint" meant "a line of code
 * someone remembered to write in the right place", which is precisely the
 * level this codebase has rejected everywhere else.
 *
 * Honest scope (F203): no MISSING writer was found on 2026-08-02 — the seven
 * sites cover the nine declared kinds. This is a REPRESENTATION defect, not a
 * live bug, which by this repo's own precedent is exactly when it is cheapest
 * to fix.
 *
 * So every user-act route declares one of two things, and boot refuses on a
 * route that declares neither:
 *
 *   @RecordsSignal('poll_vote')  — this act reaches the ledger, as this kind.
 *   @NoSignal('reason')          — this act deliberately does not, because…
 *
 * THE DECLARATION IS A FLOOR, NOT A CEILING (red-team note, binding). This
 * proves a route SAID something, not that the kind is the RIGHT kind, and a
 * lazy `@NoSignal('n/a')` defeats it entirely. Declarations are reviewed like
 * any other code. What it buys is that the omission is LOUD at boot instead of
 * silent forever, and that a non-recording act has its reason written down.
 */

export const RECORDS_SIGNAL_KEY = 'records-signal';
export const NO_SIGNAL_KEY = 'no-signal';

/** This route's act is recorded in the ledger under the given kind(s). */
export const RecordsSignal = (...kinds: SignalKind[]) =>
  SetMetadata(RECORDS_SIGNAL_KEY, kinds);

/**
 * This route deliberately records no signal. The reason is the point — it must
 * say WHY this act is not one the ledger is the record of, in words a reviewer
 * can disagree with.
 */
export const NoSignal = (reason: string) => SetMetadata(NO_SIGNAL_KEY, reason);
