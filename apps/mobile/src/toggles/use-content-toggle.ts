import React from 'react';

import {
  createToggleStripConsequenceSeam,
  type ToggleStripConsequenceDeclaration,
  type ToggleStripConsequenceSeam,
  type ToggleStripContentPhase,
} from './toggle-strip-consequence';

/**
 * THE CONTENT-TOGGLE HOOK (leg 4 — audit D5; charter Part 3). The React face of the
 * `consequence: 'content'` seam for a surface whose consequence owner is a hook
 * (polls feed controller). Declaring a content toggle stays trivial:
 * `useContentToggle({ surfaceName, settleMs? })` — choreography, coalescing and the
 * press-up→ready instrumentation are inherited; the caller only supplies runners.
 *
 * - `seam.scheduleCommit(runner, { kind })` is the press edge: old cards exit NOW
 *   (`phase` flips to 'awaiting' synchronously — same React batch as the control's
 *   optimistic flip), the runner fires once per tap burst, and the runner's
 *   resolution snaps the new cards in (`phase` back to 'settled').
 * - The body renders NOTHING while `phase === 'awaiting'` — bare white under the
 *   strip; never a skeleton, never a stale empty-state message.
 * - Module-scope surfaces whose press edge lives in chrome components (bookmarks)
 *   use `createToggleStripConsequenceSeam` directly and, if their slice is
 *   synchronous (`settleMs: 0`), never observably leave 'settled'.
 */
export const useContentToggle = <TKind extends string>(
  declaration: Omit<
    Extract<ToggleStripConsequenceDeclaration<TKind>, { consequence: 'content' }>,
    'consequence'
  >
): { seam: ToggleStripConsequenceSeam<TKind>; phase: ToggleStripContentPhase } => {
  const declarationRef = React.useRef(declaration);
  declarationRef.current = declaration;
  const seam = React.useMemo(
    () =>
      createToggleStripConsequenceSeam<TKind>({
        consequence: 'content',
        surfaceName: declarationRef.current.surfaceName,
        ...(declarationRef.current.settleMs != null
          ? { settleMs: declarationRef.current.settleMs }
          : {}),
        onInteractionState: (state) => declarationRef.current.onInteractionState?.(state),
        onLifecycle: (event) => declarationRef.current.onLifecycle?.(event),
        ...(declarationRef.current.captureControlBaseline != null
          ? {
              captureControlBaseline: () => {
                const capture = declarationRef.current.captureControlBaseline;
                // The seam captures at creation; a surface that declares the hook always
                // provides it, so this stub only guards a (dev-error) removal mid-life.
                return capture != null ? capture() : () => undefined;
              },
            }
          : {}),
      }),
    []
  );
  React.useEffect(() => () => seam.dispose(), [seam]);
  const phase = React.useSyncExternalStore(
    seam.subscribeContentPhase,
    seam.getContentPhase,
    seam.getContentPhase
  );
  return { seam, phase };
};
