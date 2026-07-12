import React from 'react';
import { makeMutable, type SharedValue } from 'react-native-reanimated';

// Phase B of the sheet-scroll primitive (plans/sheet-scroll-primitive.md §3.3): the
// short-content sheet-elastic tug. With the structural no-overscroll pin, a page whose content
// fits the viewport cannot move at all — it reads as "scroll disabled". The fix is NOT list
// bounce (that broke both handoff invariants — see sheetBodyScrollDefaults): when the presented
// scene's content FITS, an up-drag at expanded elastically tugs the WHOLE SHEET (existing
// applyElasticBounds) and springs back — cutouts/plate/content move as one, so desync is
// unrepresentable by construction.
//
// Scene-keyed by design: multiple sheet legs stay mounted (profile, bookmarks, …) and their
// layout/content-size events keep firing on data changes — a single writer SV would be clobbered
// by hidden legs. Each scene's container reports its metrics here; the ONE UI-thread flag is
// recomputed only from the PRESENTED scene's entry (presented key synced by the sheet-host
// authority controller, same site as the snapLock literal). Unknown/absent metrics → 0
// (fail-open to the normal handoff — e.g. the search scene and static dmSession never report).

/** UI-thread flag: 1 while the PRESENTED scene's body content fits its viewport, else 0. */
export const overlaySheetContentFitsValue: SharedValue<number> = makeMutable(0);

// The tug OUTPUT (Phase B v2): the captured up-drag drives a BODY-LANE translate — the content
// (plate + cutout holes + list, all inside the page-frame body layer) slides up under the
// stationary header with rubber-band damping and springs back, exactly like an iOS bottom
// over-scroll. The sheet itself (sheetY, header, grab handle) never moves — moving the whole
// sheet reads as a grab, not a scroll (owner, 2026-07-11). Written by the expand pan's tug mode;
// consumed by BottomSheetSceneStackPageFrame's body layer.
/** UI-thread translateY (px, <= 0) applied to the presented scene's body lane during a tug. */
export const overlaySheetBodyTugOffsetValue: SharedValue<number> = makeMutable(0);
/** UI-thread flag: 1 while the expand pan is in tug mode (driving the body-lane translate). */
export const overlaySheetBodyTugActiveValue: SharedValue<number> = makeMutable(0);

type SheetBodyContentMetrics = {
  contentHeight: number | null;
  viewportHeight: number | null;
};

const metricsBySceneKey = new Map<string, SheetBodyContentMetrics>();
let presentedSceneKey: string | null = null;

const FIT_EPSILON_PX = 1;

const recomputeContentFits = (): void => {
  const metrics = presentedSceneKey != null ? metricsBySceneKey.get(presentedSceneKey) : null;
  const fits =
    metrics != null &&
    metrics.contentHeight != null &&
    metrics.viewportHeight != null &&
    metrics.contentHeight > 0 &&
    metrics.viewportHeight > 0 &&
    metrics.contentHeight <= metrics.viewportHeight + FIT_EPSILON_PX;
  const nextValue = fits ? 1 : 0;
  if (overlaySheetContentFitsValue.value !== nextValue) {
    overlaySheetContentFitsValue.value = nextValue;
  }
};

export const setOverlaySheetPresentedSceneForContentFits = (sceneKey: string | null): void => {
  if (presentedSceneKey === sceneKey) {
    return;
  }
  presentedSceneKey = sceneKey;
  recomputeContentFits();
};

export const reportSheetBodyContentMetrics = (
  sceneKey: string,
  partial: Partial<SheetBodyContentMetrics>
): void => {
  const previous = metricsBySceneKey.get(sceneKey) ?? { contentHeight: null, viewportHeight: null };
  const next: SheetBodyContentMetrics = {
    contentHeight: partial.contentHeight ?? previous.contentHeight,
    viewportHeight: partial.viewportHeight ?? previous.viewportHeight,
  };
  if (
    previous.contentHeight === next.contentHeight &&
    previous.viewportHeight === next.viewportHeight
  ) {
    return;
  }
  metricsBySceneKey.set(sceneKey, next);
  if (sceneKey === presentedSceneKey) {
    recomputeContentFits();
  }
};

// Scene identity for the container's metric reports. Provided per sheet leg by
// useBottomSheetSceneStackBodyContentRuntime (which knows sceneKey); null outside a scene-stack
// leg (legacy sheets, search bundle) → the container simply doesn't report and the tug stays off.
export const SheetSceneContentMetricsContext = React.createContext<string | null>(null);
