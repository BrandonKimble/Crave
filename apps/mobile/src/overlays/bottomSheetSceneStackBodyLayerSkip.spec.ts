/**
 * The scene-stack body CONTENT layer's React.memo SKIP decision (F1453).
 *
 * A memo skip fn fails SILENTLY — it returns `true` and the leg simply never re-renders —
 * so it is exactly the shape that must be able to show RED in a test. Every case below
 * holds the non-activity props REF-STABLE and flips one activity lane, which is the only
 * way to interrogate the per-scene comparator maps.
 */
import type {
  SceneStackBodyContentActivity,
  SceneStackBodyContentLayerProps,
} from './bottomSheetSceneStackBodyLayerContract';
import { shouldSkipSceneStackBodyContentLayerUpdate } from './bottomSheetSceneStackBodyLayerSkip';

const activity = (
  overrides: Partial<SceneStackBodyContentActivity> = {}
): SceneStackBodyContentActivity => ({
  isActive: false,
  shouldRenderListBody: false,
  shouldAttachMountedContent: false,
  shouldRunDataLane: false,
  shouldSubscribeDataLane: false,
  shouldRenderExpandedContent: false,
  hasActivatedExpandedContent: false,
  ...overrides,
});

// One shared identity per non-activity prop, so ONLY the activity lane under test differs.
const stableProps = {
  transportEntry: {} as SceneStackBodyContentLayerProps['transportEntry'],
  bodyDefaults: {} as SceneStackBodyContentLayerProps['bodyDefaults'],
  bodyScrollRuntime: {} as SceneStackBodyContentLayerProps['bodyScrollRuntime'],
  mountedEntryUnits: null,
  activeEntryId: null,
};

const propsFor = (
  contentEntry: SceneStackBodyContentLayerProps['contentEntry'],
  contentActivity: SceneStackBodyContentActivity
): SceneStackBodyContentLayerProps => ({ ...stableProps, contentEntry, contentActivity });

const entryFor = (sceneKey: string): SceneStackBodyContentLayerProps['contentEntry'] =>
  ({ sceneKey }) as SceneStackBodyContentLayerProps['contentEntry'];

const skipsBetween = (
  sceneKey: string,
  previous: SceneStackBodyContentActivity,
  next: SceneStackBodyContentActivity
): boolean => {
  const contentEntry = entryFor(sceneKey);
  return shouldSkipSceneStackBodyContentLayerUpdate(
    propsFor(contentEntry, previous),
    propsFor(contentEntry, next)
  );
};

describe('shouldSkipSceneStackBodyContentLayerUpdate', () => {
  it('skips when nothing changed at all', () => {
    expect(skipsBetween('listDetail', activity(), activity())).toBe(true);
    expect(skipsBetween('search', activity(), activity())).toBe(true);
  });

  it('does not skip when a non-activity prop changes identity', () => {
    const shared = activity();
    expect(
      shouldSkipSceneStackBodyContentLayerUpdate(propsFor(entryFor('listDetail'), shared), {
        ...propsFor(entryFor('listDetail'), shared),
        activeEntryId: 'entry-1',
      })
    ).toBe(false);
  });

  // THE F1453 CASE. `isActive` was `ignoreField` in BOTH maps with the comment "the leg's own
  // visibility lane owns this; not render-read here" — false twice over: the layer feeds
  // `isActive` to the child host AND to the two BottomSheetSceneStackBodyIsActiveContext
  // Providers, and downstream `contentReady = isActive && (...)` is the P3 return-to-origin
  // scroll-restore gate. An isActive-ONLY flip was skipped here, so the Providers never
  // republished and the child's own correct `isActive: sameFieldRef` comparator never saw it.
  // RED recipe: set `isActive: ignoreField` in either comparator map — the matching case below
  // fails with `true` (skipped).
  it('NEVER skips an isActive-only flip — the default scenes', () => {
    expect(skipsBetween('listDetail', activity(), activity({ isActive: true }))).toBe(false);
    expect(skipsBetween('listDetail', activity({ isActive: true }), activity())).toBe(false);
  });

  it('NEVER skips an isActive-only flip — search', () => {
    expect(skipsBetween('search', activity(), activity({ isActive: true }))).toBe(false);
    expect(skipsBetween('search', activity({ isActive: true }), activity())).toBe(false);
  });

  it('NEVER skips an isActive-only flip — a data-activity scene (polls)', () => {
    expect(skipsBetween('polls', activity(), activity({ isActive: true }))).toBe(false);
  });

  it('does not skip the other render-read lanes', () => {
    expect(skipsBetween('listDetail', activity(), activity({ shouldRenderListBody: true }))).toBe(
      false
    );
    expect(
      skipsBetween('listDetail', activity(), activity({ shouldAttachMountedContent: true }))
    ).toBe(false);
    expect(
      skipsBetween('listDetail', activity(), activity({ shouldRenderExpandedContent: true }))
    ).toBe(false);
    expect(
      skipsBetween('listDetail', activity(), activity({ hasActivatedExpandedContent: true }))
    ).toBe(false);
    expect(skipsBetween('search', activity(), activity({ shouldRenderListBody: true }))).toBe(
      false
    );
    expect(skipsBetween('search', activity(), activity({ shouldSubscribeDataLane: true }))).toBe(
      false
    );
  });

  it('search deliberately ignores the lanes its body has no use for', () => {
    expect(skipsBetween('search', activity(), activity({ shouldAttachMountedContent: true }))).toBe(
      true
    );
    expect(skipsBetween('search', activity(), activity({ shouldRunDataLane: true }))).toBe(true);
    expect(
      skipsBetween('search', activity(), activity({ shouldRenderExpandedContent: true }))
    ).toBe(true);
    expect(
      skipsBetween('search', activity(), activity({ hasActivatedExpandedContent: true }))
    ).toBe(true);
  });

  // shouldRunDataLane is CONDITIONAL by scene — the static map cannot see the runtime sceneKey.
  it('compares shouldRunDataLane only on the scenes that publish the data-activity context', () => {
    expect(skipsBetween('polls', activity(), activity({ shouldRunDataLane: true }))).toBe(false);
    expect(skipsBetween('pollDetail', activity(), activity({ shouldRunDataLane: true }))).toBe(
      false
    );
    expect(skipsBetween('listDetail', activity(), activity({ shouldRunDataLane: true }))).toBe(
      true
    );
  });
});
