let activeConfig: unknown = null;
const loggedEvents: Array<Record<string, unknown>> = [];

jest.mock('../../perf/perf-scenario-runtime-store', () => ({
  usePerfScenarioRuntimeStore: {
    getState: () => ({ activeConfig }),
  },
}));

jest.mock('../../perf/perf-scenario-attribution', () => ({
  isPerfScenarioAttributionActive: (config: unknown) => config != null,
  logPerfScenarioAttributionEvent: (
    _kind: string,
    _config: unknown,
    payload: Record<string, unknown>
  ) => {
    loggedEvents.push(payload);
  },
}));

import { createAppRouteOverlayHostAuthorityController } from './app-route-overlay-host-authority-controller';

describe('app-route-overlay-host-authority-controller — F1362', () => {
  it('bumps the publication version when the restaurant authority swaps with an unchanged searchInteractionRef', () => {
    const controller = createAppRouteOverlayHostAuthorityController();
    const { authoritySurface, publicationLane } = controller;

    const ref = { id: 'stable-ref' } as unknown as Parameters<
      typeof publicationLane.publishSearchInteractionRef
    >[0];
    publicationLane.publishSearchInteractionRef(ref);

    const versionBefore = authoritySurface.getOverlayHostPublicationVersionSnapshot();
    let notified = false;
    const unsubscribe = authoritySurface.subscribeOverlayHostPublicationVersion(() => {
      notified = true;
    });

    const nextAuthority = {
      getSnapshot: () => null,
      subscribe: () => () => {},
    } as unknown as Parameters<
      typeof publicationLane.publishOverlayRestaurantHostAuthorities
    >[0]['overlayLocalRestaurantSheetHostAuthority'];

    publicationLane.publishOverlayRestaurantHostAuthorities({
      overlayLocalRestaurantSheetHostAuthority: nextAuthority,
    });

    // The ref itself never changed — proving a consumer subscribed ONLY to
    // getSearchInteractionRefSnapshot would bail out (Object.is(ref, ref)).
    expect(authoritySurface.getSearchInteractionRefSnapshot()).toBe(ref);
    // But the publication version — the channel that forces the host boundary to
    // re-read the live authority getter — must have moved, and the listener must fire.
    expect(authoritySurface.getOverlayHostPublicationVersionSnapshot()).toBe(versionBefore + 1);
    expect(notified).toBe(true);
    expect(authoritySurface.overlayLocalRestaurantSheetHostAuthority).toBe(nextAuthority);

    unsubscribe();
  });
});

// ─── F5411 — THE SLOT-PUBLISH WORK SPAN MEASURES SOMETHING ────────────────────────────────
//
// `logOverlayChromeSlotScenarioPublish` emitted `durationMs: 0` HARD-CODED. The report
// consumer (scripts/perf-scenario-report.js) sorts WorkSpans by durationMs for its
// `worstByDuration` list and sums them per owner — so this owner was pinned to the bottom of
// the worst list forever and contributed nothing to any total, however slow the publish got.
//
// The mutation the finding names IS this spec: a subscribed listener that blocks
// synchronously. Before the fix the emitted event still read 0; it now reads the block.
describe('F5411 — the slot-publish WorkSpan reports the fan-out it brackets', () => {
  const scenarioConfig = {
    requestId: 'req-1',
    scenario: 'spec',
    runId: 'run-1',
    durationMs: 0,
    signature: 'sig',
  } as never;

  beforeEach(() => {
    jest.resetModules();
    loggedEvents.length = 0;
    activeConfig = scenarioConfig;
  });

  afterEach(() => {
    activeConfig = null;
  });

  it('a listener that blocks for ~50ms produces a span of ~50ms, not 0', () => {
    const controller = createAppRouteOverlayHostAuthorityController();
    const unsubscribe = controller.authoritySurface.overlayGateHostAuthority.subscribe(() => {
      const blockUntil = performance.now() + 50;
      while (performance.now() < blockUntil) {
        // deliberate synchronous block — the cost the span exists to attribute
      }
    });

    controller.publicationLane.publishOverlayGateSnapshot({
      shouldRenderSearchOverlay: true,
    } as never);

    const span = loggedEvents.find((event) =>
      String(event.owner).startsWith('overlay_chrome_slot_publish:gate')
    );
    expect(span).toBeDefined();
    expect(span?.durationMs).toBeGreaterThanOrEqual(45);

    unsubscribe();
  });

  it('the two slots that used to be unnamed are attributed — instrumentation is not opt-in', () => {
    // `gateSlot` and `localRestaurantSheetSlot` passed no slotName, and the logger
    // early-returned on null: two of four publication slots invisible by omission.
    const controller = createAppRouteOverlayHostAuthorityController();
    controller.publicationLane.publishOverlayGateSnapshot({
      shouldRenderSearchOverlay: true,
    } as never);
    expect(loggedEvents.some((event) => event.owner === 'overlay_chrome_slot_publish:gate')).toBe(
      true
    );
  });
});
