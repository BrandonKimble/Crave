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
 * - Module-scope surfaces whose press edge lives in chrome components (lists)
 *   use `createToggleStripConsequenceSeam` directly and, if their slice is
 *   synchronous (`settleMs: 0`), never observably leave 'settled'.
 */
type ContentToggleDeclaration<TKind extends string> = Omit<
  Extract<ToggleStripConsequenceDeclaration<TKind>, { consequence: 'content' }>,
  'consequence'
>;

// F1559 (2026-08-04): `surfaceName` and `settleMs` are CREATION ARGUMENTS, not live
// declaration fields — the seam is built once (`useMemo(…, [])`) and these two are read
// only at that build, so a later change to either is silently ignored. That used to be
// emergent (both were read through the SAME latest-value ref the three live callbacks
// use, so nothing distinguished "frozen" from "live" in the types or a comment). Naming
// them here states the freeze instead of leaving it to be discovered by whoever tries to
// vary one.
type ContentToggleCreationArgs<TKind extends string> = Pick<
  ContentToggleDeclaration<TKind>,
  'surfaceName' | 'settleMs'
>;

export const useContentToggle = <TKind extends string>(
  declaration: ContentToggleDeclaration<TKind>
): { seam: ToggleStripConsequenceSeam<TKind>; phase: ToggleStripContentPhase } => {
  // LIVE fields: forwarded through a latest-value ref, so a caller may swap these
  // callbacks across renders and the seam picks up the new one on its next invocation.
  const declarationRef = React.useRef(declaration);
  declarationRef.current = declaration;

  // FROZEN fields: captured ONCE, at creation, into their own ref — never re-read from
  // `declarationRef` inside the seam builder, so nothing here can look live by accident.
  const creationArgsRef = React.useRef<ContentToggleCreationArgs<TKind> | null>(null);
  if (creationArgsRef.current == null) {
    creationArgsRef.current = {
      surfaceName: declaration.surfaceName,
      ...(declaration.settleMs != null ? { settleMs: declaration.settleMs } : {}),
    };
  }
  const creationArgs = creationArgsRef.current;

  const seam = React.useMemo(
    () =>
      createToggleStripConsequenceSeam<TKind>({
        consequence: 'content',
        surfaceName: creationArgs.surfaceName,
        ...(creationArgs.settleMs != null ? { settleMs: creationArgs.settleMs } : {}),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- creationArgs is a ref-frozen
    // snapshot by design (F1559): re-running this memo when it "changes" would defeat the
    // freeze it exists to document.
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
