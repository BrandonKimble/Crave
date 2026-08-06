import type {
  SceneStackBodyContentActivity,
  SceneStackBodyContentLayerProps,
} from './bottomSheetSceneStackBodyLayerContract';
import { isSceneBodyDataActivityKey } from '../navigation/runtime/app-route-scene-input-registry';
import type { OverlayKey } from './types';
import { areSceneEntryMountUnitArraysEqual } from '../navigation/runtime/app-route-scene-entry-mounts';
import { createShapeEquality, sameFieldRef, type FieldComparators } from './shape-equality';

// The React.memo SKIP decision for the scene-stack body CONTENT layer.
//
// F1453: this lived inside BottomSheetSceneStackBodyLayer.tsx, where the hermetic jest lane
// (*.spec.ts, no react-native) could not reach it — a memo skip fn is exactly the kind of
// thing that must be able to show RED, since its failure mode is silence. It is pure; it now
// lives in a .ts with a spec.
//
// F980: every skip fn below is DERIVED from its props shape (shape-equality.ts). Forget a
// new prop and tsc names it, instead of the leg silently never re-rendering again.
// A field this scope deliberately does NOT compare says so, here, out loud — an
// intentional omission and a forgotten one must not look the same.
const ignoreField = (): boolean => true;

/** Does this scene publish the body DATA-activity context? (Also the conditional arm of the
 *  skip fn below — one home for the predicate and its comparison.) */
export const shouldPublishSceneBodyDataActivity = (sceneKey: OverlayKey): boolean =>
  isSceneBodyDataActivityKey(sceneKey);

// The activity lanes a scene RENDERS from. 'search' reads fewer of them (its body is the
// never-null results bundle), so it gets its own map — but BOTH maps must name every field
// of SceneStackBodyContentActivity, so a new activity lane cannot be missed by either.
//
// F1453: `isActive` used to be `ignoreField` in BOTH maps, with the comment "the leg's own
// visibility lane owns this; not render-read here". Both halves of that were false. The
// layer render-reads `isActive` three ways — `isActive={contentActivity.isActive}` into
// SceneStackBodyContentHost and the two `BottomSheetSceneStackBodyIsActiveContext.Provider`
// values — and downstream `useBottomSheetSceneStackBodyContentRuntime` computes
// `contentReady = isActive && (hasActivatedExpandedContent || isSynchronousMountedContent)`,
// the P3 return-to-origin scroll-restore gate. An `isActive`-only flip was therefore SKIPPED
// here, the Providers never republished, and the child's own correct `isActive: sameFieldRef`
// comparator never got the chance to see it: the scroll-restore gate could be stale on
// exactly the false→true edge it exists for. `ignoreField` is a per-field opt-out the
// `satisfies FieldComparators<T>` totality check cannot audit — it proves every field is
// NAMED, not that it is COMPARED — so a field waved through with a confident wrong comment
// is invisible to the compile-time guard. A render-read field is compared.
const SEARCH_SCENE_ACTIVITY_COMPARATORS = {
  isActive: sameFieldRef, // render-read: the isActive Providers + the child host prop
  shouldRenderListBody: sameFieldRef,
  shouldSubscribeDataLane: sameFieldRef,
  shouldAttachMountedContent: ignoreField, // search has no mounted body
  shouldRunDataLane: ignoreField, // search's data lane is the bundle's, not this leg's
  shouldRenderExpandedContent: ignoreField, // search has no expanded-content lane
  hasActivatedExpandedContent: ignoreField,
} satisfies FieldComparators<SceneStackBodyContentActivity>;

const DEFAULT_SCENE_ACTIVITY_COMPARATORS = {
  isActive: sameFieldRef, // render-read: the isActive Providers + the child host prop
  shouldRenderListBody: sameFieldRef,
  shouldAttachMountedContent: sameFieldRef,
  // CONDITIONAL by scene (shouldPublishSceneBodyDataActivity) — compared explicitly below,
  // because the predicate needs the runtime sceneKey a static map cannot see.
  shouldRunDataLane: ignoreField,
  shouldSubscribeDataLane: sameFieldRef,
  shouldRenderExpandedContent: sameFieldRef,
  hasActivatedExpandedContent: sameFieldRef,
} satisfies FieldComparators<SceneStackBodyContentActivity>;

const areSearchSceneActivitiesEqual = createShapeEquality<SceneStackBodyContentActivity>(
  SEARCH_SCENE_ACTIVITY_COMPARATORS
);
const areDefaultSceneActivitiesEqual = createShapeEquality<SceneStackBodyContentActivity>(
  DEFAULT_SCENE_ACTIVITY_COMPARATORS
);

// The non-activity half of the layer props — one entry per prop, compile-checked.
const areSceneStackBodyContentLayerNonActivityPropsEqual =
  createShapeEquality<SceneStackBodyContentLayerProps>({
    contentEntry: sameFieldRef,
    transportEntry: sameFieldRef,
    // Compared by the per-scene activity maps above (the comparison depends on the scene).
    contentActivity: ignoreField,
    bodyDefaults: sameFieldRef,
    bodyScrollRuntime: sameFieldRef,
    // W1 slice 1 — entry-keyed child mounts are render-read here.
    mountedEntryUnits: areSceneEntryMountUnitArraysEqual,
    activeEntryId: sameFieldRef,
  });

export const shouldSkipSceneStackBodyContentLayerUpdate = (
  previousProps: SceneStackBodyContentLayerProps,
  nextProps: SceneStackBodyContentLayerProps
): boolean => {
  if (!areSceneStackBodyContentLayerNonActivityPropsEqual(previousProps, nextProps)) {
    return false;
  }

  const previousActivity = previousProps.contentActivity;
  const nextActivity = nextProps.contentActivity;
  if (nextProps.contentEntry.sceneKey === 'search') {
    return areSearchSceneActivitiesEqual(previousActivity, nextActivity);
  }
  if (!areDefaultSceneActivitiesEqual(previousActivity, nextActivity)) {
    return false;
  }
  return (
    !shouldPublishSceneBodyDataActivity(nextProps.contentEntry.sceneKey) ||
    previousActivity.shouldRunDataLane === nextActivity.shouldRunDataLane
  );
};
