/**
 * OA12 falsifier suite — variant A baked into the toggle primitive.
 *
 * The law: a content-toggle's awaiting window paints the scene's declared REFETCH
 * skeleton under the live strip, and the primitive itself mints that face — no
 * surface can opt out because no API exists to suppress or replace it (the OA9 A/B
 * flag and the bare-white arm are dead).
 *
 * Each falsifier is RED-provable by the named mutation.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

import { resolveSceneLoadingMaterial } from '../navigation/runtime/scene-foundation-spec';
import { resolveToggleAwaitingMaterial } from './toggle-awaiting-face';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The skeletons barrel pulls .tsx component modules, which this hermetic node lane
// deliberately cannot resolve (moduleFileExtensions omits 'tsx' — see jest.config.js).
// The mock replaces the barrel with a marker component so the hook's element can be
// asserted by identity and props without loading react-native rendering code.
const SceneLoadingSurfaceMock: React.FC<Record<string, unknown>> = () => null;
jest.mock('../components/skeletons', () => ({
  SceneLoadingSurface: SceneLoadingSurfaceMock,
}));

// jest.mock hoists above imports, so importing the subject after the mock declaration
// is safe; the placement documents intent.
import { useContentToggle } from './use-content-toggle';

type HookOut = ReturnType<typeof useContentToggle<'k'>>;

const renderContentToggle = (scene: 'polls' | 'listDetail') => {
  const out: { current: HookOut | null } = { current: null };
  const Probe: React.FC = () => {
    out.current = useContentToggle<'k'>({ surfaceName: 'spec', scene, settleMs: 0 });
    return null;
  };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Probe));
  });
  return { out, renderer };
};

describe('resolveToggleAwaitingMaterial (the one face resolver)', () => {
  // Falsifier: the face is the REFETCH seam of the one material path — the live
  // strip stays above it, so holes are never minted regardless of strip basis.
  // RED by mutating the resolver's seam argument to 'cold' (listDetail is 'in-list',
  // whose cold face DOES mint holes) or its return to null.
  it('is the scene refetch material, for header and in-list strips alike', () => {
    expect(resolveToggleAwaitingMaterial('polls')).toEqual(
      resolveSceneLoadingMaterial('polls', 'refetch')
    );
    expect(resolveToggleAwaitingMaterial('listDetail')).toEqual(
      resolveSceneLoadingMaterial('listDetail', 'refetch')
    );
    expect(resolveToggleAwaitingMaterial('polls')?.withStripHoles).toBe(false);
    expect(resolveToggleAwaitingMaterial('listDetail')?.withStripHoles).toBe(false);
  });
});

describe('useContentToggle awaitingFace (OA12 — the primitive mints the face)', () => {
  // Falsifier: the awaiting window carries a NON-NULL face bearing the resolved
  // material. RED by mutating the hook's awaitingFace memo to return null while
  // awaiting — the resurrected bare-white arm.
  it('awaiting: the face is the scene refetch skeleton; settled: null', async () => {
    const { out, renderer } = renderContentToggle('polls');
    expect(out.current?.phase).toBe('settled');
    expect(out.current?.awaitingFace).toBeNull();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    act(() => {
      out.current?.seam.scheduleCommit(() => gate, { kind: 'k' });
    });
    expect(out.current?.phase).toBe('awaiting');
    const face = out.current?.awaitingFace;
    expect(face).not.toBeNull();
    expect(face?.type).toBe(SceneLoadingSurfaceMock);
    const material = resolveSceneLoadingMaterial('polls', 'refetch');
    expect(face?.props).toEqual({
      rowType: material?.rowType,
      withFilterStripHoles: false,
    });

    await act(async () => {
      release();
      await gate;
    });
    expect(out.current?.phase).toBe('settled');
    expect(out.current?.awaitingFace).toBeNull();
    // F9985: unmount INSIDE act. React flushes passive unmount effects on the
    // scheduler's Immediate, so a bare `renderer.unmount()` lets the hook's
    // cleanup (which disposes the consequence seam and logs) run AFTER the suite
    // ends — an escaped handle that force-exits the jest worker on a slow runner.
    act(() => {
      renderer.unmount();
    });
  });

  // Falsifier: the in-list case (list detail) never mints strip holes on the face —
  // the real strip is mounted and live above it. RED by mutating the resolver's
  // seam to 'cold'.
  it('an in-list strip surface gets a hole-free face (the live strip stays)', async () => {
    const { out, renderer } = renderContentToggle('listDetail');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    act(() => {
      out.current?.seam.scheduleCommit(() => gate, { kind: 'k' });
    });
    expect(
      (out.current?.awaitingFace?.props as { withFilterStripHoles?: boolean } | undefined)
        ?.withFilterStripHoles
    ).toBe(false);
    await act(async () => {
      release();
      await gate;
    });
    // F9985: see above — unmount inside act so the seam's dispose runs in-test.
    act(() => {
      renderer.unmount();
    });
  });
});
