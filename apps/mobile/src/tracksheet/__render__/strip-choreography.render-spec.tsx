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
// RED-PROVEN BY MUTATION (executed 2026-08-08; counts are what the runs printed):
//   M-A width dropped from rendererForSkeleton's SceneLoadingSurface
//        -> 1 RED (the flip commit's skeleton has no declared width — its
//           holes would wait a layout round-trip, the pre-fix blank plate)
//   M-B the SceneSkeletonWidthHintContext provider's value forced null
//        -> 1 RED (the gate skeleton that replaces the handoff skeleton
//           measures from zero — the remount seam, reintroduced)
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

  it('THE GATE SKELETON THAT REPLACES IT INHERITS THE SAME DECLARED GEOMETRY — the two skeleton phases are pixel-continuous, no measuring blank between (fix 2a/2c)', async () => {
    harness.world.mountedBodyPendingScenes.add('userProfile');
    harness.world.routeState.overlayRouteStack = [{ entryId: 'u1' }];
    await setFrame({ presentedSceneKey: 'userProfile', presentedEntryId: 'u1' });

    // Flip commit: one skeleton (the handoff surface), declared width.
    expect(findAllByType(renderer, 'scene-loading-surface')).toHaveLength(1);
    const mountsAtFlip = sceneLoadingSurfaceMounts.count;

    // Release commit: the pending mounted body's gate paints its skeleton IN
    // THE SAME COMMIT the handoff surface leaves — and it is born with the
    // host's width hint, so its first frame has holes too. No observable
    // commit is ever skeleton-less while the body is pending.
    await flushFrame();
    const gateSkeletons = findAllByType(renderer, 'scene-loading-surface');
    expect(gateSkeletons).toHaveLength(1);
    expect(gateSkeletons[0].props.rowType).toBe('profile');
    expect(gateSkeletons[0].props.widthHint).toBe(EXPECTED_BODY_LANE_WIDTH);
    expect(sceneLoadingSurfaceMounts.count).toBe(mountsAtFlip + 1);

    // ...and the gate surface then PERSISTS (no churn across unrelated ticks).
    await publish('restaurant', listPublication(['unrelated'], 'zz'));
    expect(sceneLoadingSurfaceMounts.count).toBe(mountsAtFlip + 1);

    // The reveal: pending clears, content replaces the skeleton in one commit.
    harness.world.mountedBodyPendingScenes.delete('userProfile');
    await setFrame({}); // any commit re-renders the body with pending=false
    expect(
      renderer.root.findAll(
        (node) => node.type === 'mounted-body' && node.props.scene === 'userProfile'
      )
    ).toHaveLength(1);
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
