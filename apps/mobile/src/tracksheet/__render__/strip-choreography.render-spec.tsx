// ─── FALSIFIERS: strip choreography (fixes 2 + 3, 2026-08-08) ────────────────
//
// THE REVEAL LAW (transition-endstate-contract.md, OA9/OA11 era): the skeleton
// covers everything from the flip commit until content is ready IN THE SAME
// FRAME; a white gap between skeleton and content may never exist. The pre-fix
// shape violated it by construction: the handoff skeleton's first commit was a
// hole-less plate (width discovered via onLayout, one commit late), its
// lifetime was one bare rAF, and the release remounted a SECOND surface that
// restarted the measure loop — three blank-white factories in a row.
//
// §2.5 (toggle-primitive rederivation, 2026-08-08) SUPERSEDED the twins: the
// two identical skeleton phases (handoff surface -> gate surface) collapsed to
// ONE owner — the leg cell's persistent overlay (TrackLegPendingOverlay in
// use-track-leg-resolver.tsx). The gate is a REPORTER on the track: it renders
// NOTHING while pending and reports the fact to the overlay. The old M-B
// falsifier (gate-skeleton widthHint continuity) is retired WITH its subject:
// there is no second skeleton instance to keep pixel-continuous anymore —
// continuity is now INSTANCE identity, asserted below via the mount counter.
//
// RED-PROVEN BY MUTATION (original set executed 2026-08-08; §2.5 set executed
// same day — counts are what the runs printed):
//   M-A width dropped from the overlay's SceneLoadingSurface
//        -> 1 RED (the flip commit's skeleton has no declared width — its
//           holes would wait a layout round-trip, the pre-fix blank plate)
//   M-B (§2.5) the resolver's mounted skeleton branch returns the old
//       rendererForSkeleton cell (the remount seam, reintroduced)
//        -> 2 RED (the release swaps cells: the mount counter ticks and the
//           flip surface dies — one-instance continuity broken)
//   M-B2 (§2.5) the gate's reporter arm ignored (painter face restored on the
//        track)
//        -> 1 RED (a SECOND SceneLoadingSurface mounts inside the body while
//           the overlay stands — the twins, reborn)
//   M-B3 (§2.5) styles.legPendingOverlay's minHeight dropped
//        -> 1 RED (the pending cell silently collapses — the leg no longer
//           owns pending height)
//   M-C planTrackHandoffRelease made `flipHasPainted` only (the bare-rAF
//       schedule restored)
//        -> 1 RED here (the [HANDOFF] release-law bark fires: the release
//           committed into a 'none' resolution — printed verbatim in the run)
//           + 1 RED in the pure spec (track-handoff-release.spec.ts)
//   M-D chromeHeight prop dropped from the chromeContent TrackShellSlot
//        -> 1 RED (the commit payload no longer carries the band geometry —
//           the mask is back on the addUIBlock clock alone)
//
// The existing expensive-body falsifier (track-host-handoff.render-spec) must
// stay green through all of this: press-up still commits in one frame.

import type { ReactTestRenderer } from 'react-test-renderer';
import { act } from 'react-test-renderer';

import {
  OVERLAY_HEADER_ROW_SPACED_MARGIN_BOTTOM,
  OVERLAY_TAB_HEADER_HEIGHT,
} from '../../overlays/overlay-chrome-metrics';
import { TOGGLE_STRIP_BAND_HEIGHT } from '../../toggles/toggle-strip-metrics';
import {
  findAllByType,
  flushFrame,
  harness,
  listPublication,
  renderHost,
  resetHarness,
  setFrame,
} from './render-utils';
import { sceneLoadingSurfaceMounts } from './mocks/surfaces-mock';

// The mock window is 390 wide; mounted (non-edge-to-edge) bodies and the track
// skeleton sit inside the OVERLAY_HORIZONTAL_PADDING(20) inset on each side.
const EXPECTED_BODY_LANE_WIDTH = 390 - 40;

const publish = async (scene: string, snapshot: unknown): Promise<void> => {
  await act(async () => {
    harness.world.publishSceneInput(
      scene,
      snapshot as Parameters<typeof harness.world.publishSceneInput>[1]
    );
  });
};

describe('strip choreography — skeleton continuity + the commit-clocked chrome height', () => {
  let renderer: ReactTestRenderer;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(async () => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    resetHarness();
    sceneLoadingSurfaceMounts.count = 0;
    renderer = await renderHost();
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  const handoffBarks = () =>
    errorSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.startsWith('[HANDOFF]'));

  it('THE FLIP COMMIT SKELETON CARRIES ITS DECLARED WIDTH — holes exist on commit 1, never after a layout round-trip (fix 2a)', async () => {
    harness.world.mountedBodyPendingScenes.add('userProfile');
    harness.world.routeState.overlayRouteStack = [{ entryId: 'u1' }];
    await setFrame({ presentedSceneKey: 'userProfile', presentedEntryId: 'u1' });

    // The finger's frame: the handoff skeleton, WITH declared geometry.
    const skeletons = findAllByType(renderer, 'scene-loading-surface');
    expect(skeletons).toHaveLength(1);
    expect(skeletons[0].props.rowType).toBe('profile');
    expect(skeletons[0].props.width).toBe(EXPECTED_BODY_LANE_WIDTH);
  });

  it('ONE SKELETON INSTANCE FROM FLIP TO REVEAL (§2.5): the release mounts the body UNDER the persistent overlay — no remount, no seam, and the gate renders NOTHING while pending', async () => {
    harness.world.mountedBodyPendingScenes.add('userProfile');
    harness.world.routeState.overlayRouteStack = [{ entryId: 'u1' }];
    await setFrame({ presentedSceneKey: 'userProfile', presentedEntryId: 'u1' });

    // Flip commit: one skeleton (the leg's overlay), body withheld.
    expect(findAllByType(renderer, 'scene-loading-surface')).toHaveLength(1);
    expect(harness.world.deliveredActivity.has('userProfile#u1')).toBe(false);
    const mountsAtFlip = sceneLoadingSurfaceMounts.count;

    // Release commit: the body mounts UNDER the overlay (it renders — its
    // activity contexts were delivered — so it can fetch), the gate reports
    // pending instead of painting a twin (still exactly ONE surface), and the
    // instance is THE SAME ONE the flip mounted: the mount counter did not
    // tick. Identity, not pixel-equivalence — the remount seam is
    // unrepresentable (mutation M-B: restore the cell swap -> RED here).
    await flushFrame();
    const pendingSurfaces = findAllByType(renderer, 'scene-loading-surface');
    expect(pendingSurfaces).toHaveLength(1);
    expect(pendingSurfaces[0].props.rowType).toBe('profile');
    expect(pendingSurfaces[0].props.width).toBe(EXPECTED_BODY_LANE_WIDTH);
    expect(sceneLoadingSurfaceMounts.count).toBe(mountsAtFlip);
    // The body IS mounted (fetch-on-mount lives) — the reporter did not
    // deadlock it — while the gate renders none of its content (mutation
    // M-B2: restore the gate's painter face -> a second surface, RED).
    expect(harness.world.deliveredActivity.has('userProfile#u1')).toBe(true);
    expect(findAllByType(renderer, 'mounted-body')).toHaveLength(0);

    // ...and the one surface PERSISTS across unrelated ticks (no churn).
    await publish('restaurant', listPublication(['unrelated'], 'zz'));
    expect(sceneLoadingSurfaceMounts.count).toBe(mountsAtFlip);
    expect(findAllByType(renderer, 'scene-loading-surface')).toHaveLength(1);

    // The reveal: pending clears; content renders and the overlay unmounts in
    // the SAME commit (render-phase report, later-sibling read) — the
    // skeleton's unmount IS the reveal commit.
    harness.world.mountedBodyPendingScenes.delete('userProfile');
    await setFrame({}); // any commit re-renders the body with pending=false
    expect(
      renderer.root.findAll(
        (node) => node.type === 'mounted-body' && node.props.scene === 'userProfile'
      )
    ).toHaveLength(1);
    expect(findAllByType(renderer, 'scene-loading-surface')).toHaveLength(0);
  });

  it('PENDING HEIGHT IS OWNED BY THE LEG (§2.5): the overlay participates in layout with the declared floor — a collapsed pending cell is unrepresentable', async () => {
    harness.world.mountedBodyPendingScenes.add('userProfile');
    harness.world.routeState.overlayRouteStack = [{ entryId: 'u1' }];
    await setFrame({ presentedSceneKey: 'userProfile', presentedEntryId: 'u1' });
    await flushFrame();

    // Post-release, body pending: the gate renders nothing, so the ONLY
    // height in the cell is the overlay's floor. Dropping the provision
    // (mutation M-B3) collapses the cell silently — this is the RED for it.
    const overlays = renderer.root.findAll(
      (node) => (node.props as { testID?: string }).testID === 'track-leg-pending-overlay'
    );
    expect(overlays.length).toBeGreaterThanOrEqual(1);
    const style = overlays[0].props.style as { minHeight?: number };
    expect(style.minHeight).toBeGreaterThanOrEqual(320);
  });

  it('THE RELEASE WAITS FOR THE DESTINATION (fix 2b): a publication withdrawn mid-handoff leaves the handoff skeleton STANDING, and the release lands on the commit readiness returns — no [HANDOFF] bark on the fixed path', async () => {
    harness.world.routeState.overlayRouteStack = [{ entryId: 'r1' }];
    await publish('restaurant', listPublication(['d1', 'd2'], 'r1'));
    await setFrame({ presentedSceneKey: 'restaurant', presentedEntryId: 'r1' });
    // Deferred flip frame: the skeleton (first visit, no frozen body).
    expect(findAllByType(renderer, 'scene-loading-surface')).toHaveLength(1);

    // The destination's lane is WITHDRAWN inside the handoff window
    // (staleTime-0 churn shape): the resolution is 'none' at the paint boundary.
    await publish('restaurant', { sceneBodyContent: null, sceneBodyForEntryId: null });
    await flushFrame();
    // WITHHELD: the handoff skeleton persists — it is not evicted into nothing.
    expect(findAllByType(renderer, 'scene-loading-surface')).toHaveLength(1);
    expect(findAllByType(renderer, 'published-row')).toHaveLength(0);

    // Readiness returns: THAT commit is the release.
    await publish('restaurant', listPublication(['d1', 'd2'], 'r1'));
    expect(findAllByType(renderer, 'published-row')).toHaveLength(2);
    expect(findAllByType(renderer, 'scene-loading-surface')).toHaveLength(0);

    // The release-law bark is SILENT on the fixed path (it goes RED when the
    // bare-rAF schedule is restored — mutation M-C).
    expect(handoffBarks()).toHaveLength(0);
  });

  it('CHROME GEOMETRY RIDES THE COMMIT PAYLOAD (fix 3): the chromeContent slot carries chromeHeight, and a none<->strip switch changes it IN the flip commit', async () => {
    const chromeSlot = () =>
      renderer.root.findAll(
        (node) => node.type === 'TrackShellSlot' && node.props.slotRole === 'chromeContent'
      );

    // home: plain header — 68.25.
    await setFrame({ presentedSceneKey: 'home', activeSceneKey: 'home', presentedEntryId: null });
    expect(chromeSlot()).toHaveLength(1);
    expect(chromeSlot()[0].props.chromeHeight).toBe(OVERLAY_TAB_HEADER_HEIGHT);

    // polls: strip scene — the height changes in the SAME commit as the flip
    // (the payload Fabric mounts alongside the chrome opacity flip), never on
    // a later native queue flush.
    await setFrame({ presentedSceneKey: 'polls', activeSceneKey: 'polls', presentedEntryId: null });
    expect(chromeSlot()[0].props.chromeHeight).toBe(
      OVERLAY_TAB_HEADER_HEIGHT + TOGGLE_STRIP_BAND_HEIGHT + OVERLAY_HEADER_ROW_SPACED_MARGIN_BOTTOM
    );
  });
});
