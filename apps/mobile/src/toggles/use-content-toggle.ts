import React from 'react';

import { SceneLoadingSurface } from '../components/skeletons';
import type { OverlayKey } from '../overlays/types';
import { resolveToggleAwaitingMaterial } from './toggle-awaiting-face';
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
 * `useContentToggle({ surfaceName, scene, settleMs? })` — choreography, coalescing and
 * the press-up→ready instrumentation are inherited; the caller only supplies runners.
 *
 * - `seam.scheduleCommit(runner, { kind })` is the press edge: old cards exit NOW
 *   (`phase` flips to 'awaiting' synchronously — same React batch as the control's
 *   optimistic flip), the runner fires once per tap burst, and the runner's
 *   resolution snaps the new cards in (`phase` back to 'settled').
 * - THE AWAITING FACE IS THE PRIMITIVE'S (OA12, 2026-08-08 — variant A is the law):
 *   while `phase === 'awaiting'` the results region paints `awaitingFace` — the
 *   scene's declared refetch skeleton under the live strip — never bare white and
 *   never a stale empty-state message. The declaration exposes NO way to suppress or
 *   replace it: a strip surface cannot render a bare-white awaiting window because
 *   this hook does not mint one. `scene` is therefore REQUIRED — a new content-toggle
 *   surface cannot compile without joining the law.
 * - Module-scope surfaces whose press edge lives in chrome components (lists home)
 *   use `createToggleStripConsequenceSeam` directly ONLY for the degenerate
 *   synchronous case (`settleMs: 0` — 'awaiting' is set and cleared in one call
 *   stack, so no face is ever observable; variant A holds vacuously). A surface
 *   whose slice ever becomes async must move onto this hook.
 */
type ContentToggleDeclaration<TKind extends string> = Omit<
  Extract<ToggleStripConsequenceDeclaration<TKind>, { consequence: 'content' }>,
  'consequence'
> & {
  /** The scene whose declared material paints the awaiting face (frozen at creation). */
  scene: OverlayKey;
};

// F1559 (2026-08-04): `surfaceName` and `settleMs` are CREATION ARGUMENTS, not live
// declaration fields — the seam is built once (`useMemo(…, [])`) and these two are read
// only at that build, so a later change to either is silently ignored. That used to be
// emergent (both were read through the SAME latest-value ref the three live callbacks
// use, so nothing distinguished "frozen" from "live" in the types or a comment). Naming
// them here states the freeze instead of leaving it to be discovered by whoever tries to
// vary one. `scene` (OA12) joins them: the awaiting face's material home is a
// declaration of the surface's identity, not a live knob.
type ContentToggleCreationArgs<TKind extends string> = Pick<
  ContentToggleDeclaration<TKind>,
  'surfaceName' | 'settleMs' | 'scene'
>;

export const useContentToggle = <TKind extends string>(
  declaration: ContentToggleDeclaration<TKind>
): {
  seam: ToggleStripConsequenceSeam<TKind>;
  phase: ToggleStripContentPhase;
  /**
   * THE ONE AWAITING FACE (OA12): non-null exactly while the seam is 'awaiting' (and
   * the scene declares a foundation material) — the refetch skeleton the surface
   * renders where its results land. Built here, from the one material path, so no
   * surface re-decides (or forgets) it.
   */
  awaitingFace: React.ReactElement | null;
} => {
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
      scene: declaration.scene,
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
    // creationArgs is a ref-frozen snapshot by design (F1559): re-running this memo
    // when it "changes" would defeat the freeze it exists to document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  React.useEffect(() => () => seam.dispose(), [seam]);
  const phase = React.useSyncExternalStore(
    seam.subscribeContentPhase,
    seam.getContentPhase,
    seam.getContentPhase
  );
  // The awaiting face, minted by the primitive (OA12). React.createElement (not JSX)
  // keeps this module in the hermetic .ts lane; the element is memoized per awaiting
  // window so consumers' memos see a stable identity.
  const awaitingFace = React.useMemo<React.ReactElement | null>(() => {
    if (phase !== 'awaiting') {
      return null;
    }
    const material = resolveToggleAwaitingMaterial(creationArgs.scene);
    if (material == null) {
      return null;
    }
    return React.createElement(SceneLoadingSurface, {
      rowType: material.rowType,
      withFilterStripHoles: material.withStripHoles,
    });
  }, [creationArgs.scene, phase]);
  return { seam, phase, awaitingFace };
};
