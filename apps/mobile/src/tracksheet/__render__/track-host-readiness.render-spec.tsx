// ─── F3 falsifiers: READINESS / SKELETON / PREWARM / ENTRY-STAMP / LIVENESS ──
//
// Pins: the cold-entry skeleton painted in the switch commit (variant from the
// foundation-spec resolver, never hardcoded), the readiness flip to real rows,
// the OA6.1 frozen last-good body, the entry-stamp rejection of an alien
// publication, the prewarm signal mounting a cold resident leg pre-switch, and
// the liveness audit + activation bridge (delivered activity, not re-derived).

import type { ReactTestRenderer } from 'react-test-renderer';
import { act } from 'react-test-renderer';

import { requestTrackScenePrewarm } from '../track-entry-prewarm';
import {
  findAllByType,
  flushFrame,
  harness,
  listPublication,
  renderHost,
  resetHarness,
  setFrame,
} from './render-utils';

const publish = async (scene: string, snapshot: unknown): Promise<void> => {
  await act(async () => {
    harness.world.publishSceneInput(
      scene,
      snapshot as Parameters<typeof harness.world.publishSceneInput>[1]
    );
  });
};

describe('readiness / skeleton / prewarm / entry-stamp / liveness — host wiring', () => {
  let renderer: ReactTestRenderer;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(async () => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    resetHarness();
    renderer = await renderHost();
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  const livenessErrors = () =>
    errorSpy.mock.calls.filter((call) => String(call[0]).includes('[LIVENESS]'));

  it('a cold entry paints THE skeleton in the switch commit, with the scene variant from the foundation-spec resolver', async () => {
    harness.world.routeState.overlayRouteStack = [{ entryId: 'r1' }];
    await setFrame({ presentedSceneKey: 'restaurant', presentedEntryId: 'r1' });
    const skeletons = findAllByType(renderer, 'scene-loading-surface');
    expect(skeletons).toHaveLength(1);
    expect(skeletons[0].props.rowType).toBe('restaurant');
    expect(skeletons[0].props.withFilterStripHoles).toBe(false);
    expect(findAllByType(renderer, 'published-row')).toHaveLength(0);
  });

  it('the skeleton VARIANT is per-scene data: a cold polls leg gets rowType poll + strip holes', async () => {
    harness.world.partsStore.set({
      ...harness.world.partsStore.get(),
      polls: { sceneBodyContent: { surfaceKind: 'placeholder' }, sceneBodyTransport: {} },
    });
    await setFrame({ presentedSceneKey: 'polls', activeSceneKey: 'polls' });
    const skeletons = findAllByType(renderer, 'scene-loading-surface');
    expect(skeletons).toHaveLength(1);
    expect(skeletons[0].props.rowType).toBe('poll');
    expect(skeletons[0].props.withFilterStripHoles).toBe(true);
  });

  it('readiness flips the same entry from skeleton to real rows, and a later publication gap presents the FROZEN last-good body (OA6.1), never a skeleton', async () => {
    harness.world.routeState.overlayRouteStack = [{ entryId: 'r1' }];
    await setFrame({ presentedSceneKey: 'restaurant', presentedEntryId: 'r1' });
    expect(findAllByType(renderer, 'scene-loading-surface')).toHaveLength(1);
    // Phase two: the publication lane produces rows.
    await publish('restaurant', listPublication(['dish-a', 'dish-b']));
    expect(findAllByType(renderer, 'scene-loading-surface')).toHaveLength(0);
    expect(findAllByType(renderer, 'published-row')).toHaveLength(2);
    // The lane momentarily resolves to nothing: frozen last-good, no skeleton.
    await publish('restaurant', null);
    expect(findAllByType(renderer, 'scene-loading-surface')).toHaveLength(0);
    expect(findAllByType(renderer, 'published-row')).toHaveLength(2);
  });

  it('THE ENTRY STAMP: a publication stamped for a different entry is REJECTED — the presented entry paints its skeleton, never the alien rows', async () => {
    harness.world.routeState.overlayRouteStack = [{ entryId: 'r1' }, { entryId: 'r2' }];
    await setFrame({ presentedSceneKey: 'restaurant', presentedEntryId: 'r1' });
    await publish('restaurant', listPublication(['r1-row'], 'r1'));
    expect(findAllByType(renderer, 'published-row')).toHaveLength(1);
    // Same-scene pop/push: r2 presented while the lane still carries r1's rows.
    await setFrame({ presentedSceneKey: 'restaurant', presentedEntryId: 'r2' });
    expect(findAllByType(renderer, 'published-row')).toHaveLength(0);
    expect(findAllByType(renderer, 'scene-loading-surface')).toHaveLength(1);
    // The writer republishes for r2 → rows accepted.
    await publish('restaurant', listPublication(['r2-row'], 'r2'));
    expect(findAllByType(renderer, 'published-row')).toHaveLength(1);
    expect(findAllByType(renderer, 'published-row')[0].props.id).toBe('r2-row');
  });

  it("a PENDING mounted body paints its SceneBodyReadyGate face on the track, never blank (the host provides SceneBodySceneKeyContext with the LEG's scene)", async () => {
    // The mock userProfile body renders the REAL SceneBodyReadyGate with an
    // unready query. The gate resolves its material ONLY through
    // SceneBodySceneKeyContext — with no provider it renders NULL (the
    // blank-pending bug this pins). RED-proven by mutation: removing the
    // provider from rendererForMountedEntry fails the surface assertion below.
    harness.world.mountedBodyPendingScenes.add('userProfile');
    harness.world.routeState.overlayRouteStack = [{ entryId: 'u1' }];
    await setFrame({ presentedSceneKey: 'userProfile', presentedEntryId: 'u1' });
    // The mounted destination has "real rows", so the switch defers (handoff
    // frame); release the real body at the paint boundary.
    await flushFrame();
    const pendingFaces = findAllByType(renderer, 'scene-loading-surface');
    expect(pendingFaces).toHaveLength(1);
    // The variant is the scene's declared material, resolved from the LEG's own
    // scene key — not a hardcoded rowType and not the presented-scene shortcut.
    expect(pendingFaces[0].props.rowType).toBe('profile');
    // While pending, the gate replaces the body content (no blank, no rows).
    expect(findAllByType(renderer, 'mounted-body')).toHaveLength(0);
    // The gate must not have barked "could not resolve a foundation skeleton".
    expect(
      errorSpy.mock.calls.filter((call) => String(call[0]).includes('[FOUNDATION]'))
    ).toHaveLength(0);
  });

  it('G-PREWARM: the press-down signal mounts a cold resident leg BEFORE the switch commits (chrome built early, presented body unchanged)', async () => {
    const pollsTitle = () =>
      renderer.root.findAll((node) => node.type === 'leg-title' && node.props.scene === 'polls');
    expect(pollsTitle()).toHaveLength(0);
    await act(async () => {
      requestTrackScenePrewarm('polls');
    });
    // The polls leg's chrome exists in the resident chrome stack pre-switch…
    expect(pollsTitle()).toHaveLength(1);
    // …while the presented body is still home's (the switch commit untouched).
    expect(
      renderer.root.findAll((node) => node.type === 'leg-title' && node.props.scene === 'home')
    ).toHaveLength(1);
  });

  it('the activation bridge delivers presentation-derived activity to the presented mounted body, and the liveness audit stays quiet', async () => {
    harness.world.routeState.overlayRouteStack = [{ entryId: 'u1' }];
    await setFrame({ presentedSceneKey: 'userProfile', presentedEntryId: 'u1' });
    // Step past THE PRESS-UP HANDOFF frame (track-entry-handoff.ts): a
    // first-ever paint hands the flip a skeleton and renders the real body in
    // the next commit — the activation bridge is a fact about THAT commit.
    await flushFrame();
    const delivered = harness.world.deliveredActivity.get('userProfile#u1') as Record<
      string,
      unknown
    >;
    expect(delivered).toMatchObject({
      shouldRunDataLane: true,
      shouldSubscribeDataLane: true,
      shouldRenderExpandedContent: true,
      isActive: true,
    });
    // The audit judged the delivered samples of this commit: no violations.
    // (Mutating the host to deliver suspended lanes to a presented body —
    // e.g. deriveTrackEntryBodyActivity(legScene, false) — turns BOTH the
    // assertion above and this audit silence RED.)
    expect(livenessErrors()).toEqual([]);
  });
});
