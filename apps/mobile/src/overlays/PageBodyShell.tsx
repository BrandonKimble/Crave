import React from 'react';
import { View } from 'react-native';

import { SceneLoadingSurface } from '../components/skeletons';
import { resolveSceneLoadingMaterial } from '../navigation/runtime/scene-foundation-spec';
import { useSceneLoadFailurePolicy } from './scene-load-failure-policy';
import type {
  PageBodyState,
  PageCollectionBodySpec,
  PageContentBodySpec,
  PageContentBodyState,
  PageListBodySpec,
  PageStaticBodySpec,
} from './page-body-contract';

// ─── THE PAGE BODY SHELL (THE PAGE L2 — the one interpreter) ────────────────────────
//
// The ONLY component that turns a PageBodySpec + PageBodyState into pixels. There is
// exactly ONE skeleton owner per migrated scene — this shell — so the old sequential
// ownership handoff (host skeleton leg → SceneBodyReadyGate → panel pending branch,
// the owner's "skeleton changes midway") is unrepresentable: pending, error-hold,
// appending tails, empty, and rows all render from the same closed dispatch below.
//
// - Pending/error paint the scene's DECLARED L0 material (foundation-table row +
//   derived backing — resolveSceneLoadingMaterial; no per-call-site choice).
// - Error keeps the material while the wave-4 failure law announces through the ONE
//   chokepoint here (child scenes modal+pop; root scenes re-run — the policy owns it).
// - Rows render only resolved items (slots carry data — a row can't branch on load).
// - `appending` paints the tail placeholders under the landed rows (same material).

const APPENDING_TAIL_ROWS = 2;

const PageListBody = <TItem,>({
  spec,
  state,
}: {
  spec: PageListBodySpec<TItem>;
  state: PageBodyState<TItem>;
}): React.ReactElement | null => {
  const material = resolveSceneLoadingMaterial(spec.scene);
  if (state.kind === 'pending' || state.kind === 'error') {
    if (material == null) {
      return null;
    }
    return (
      <View pointerEvents="none" style={pendingSurfaceStyle} testID={`page-body-pending-${spec.scene}`}>
        <SceneLoadingSurface
          rowType={material.rowType}
          count={spec.placeholder.count}
          insetX={spec.placeholder.insetX}
          frostBacking={material.frostBacking}
        />
      </View>
    );
  }
  if (state.kind === 'empty') {
    return <spec.Empty />;
  }
  return (
    <View testID={`page-body-list-${spec.scene}`}>
      {state.items.map((item) => (
        <spec.row.Component key={spec.row.keyOf(item)} item={item} />
      ))}
      {state.kind === 'appending' && material != null ? (
        <SceneLoadingSurface
          rowType={material.rowType}
          count={APPENDING_TAIL_ROWS}
          insetX={spec.placeholder.insetX}
          frostBacking={material.frostBacking}
        />
      ) : null}
    </View>
  );
};

// The shell fills the body lane it replaces (mirrors the old gate's pending surface).
const pendingSurfaceStyle = { flex: 1, minHeight: 320 } as const;

/** List/collection/content bodies require their state; static bodies cannot carry
 *  one — every mismatch is a compile error, not a runtime surprise. */
export type PageBodyShellProps<TItem> =
  | { spec: PageListBodySpec<TItem>; state: PageBodyState<TItem> }
  | { spec: PageCollectionBodySpec<TItem>; state: PageBodyState<TItem> }
  | { spec: PageContentBodySpec<TItem>; state: PageContentBodyState<TItem> }
  | { spec: PageStaticBodySpec; state?: undefined };

const PageCollectionBody = <TItem,>({
  spec,
  state,
}: {
  spec: PageCollectionBodySpec<TItem>;
  state: PageBodyState<TItem>;
}): React.ReactElement | null => {
  const material = resolveSceneLoadingMaterial(spec.scene);
  if (state.kind === 'pending' || state.kind === 'error') {
    if (material == null) {
      return null;
    }
    return (
      <View pointerEvents="none" style={pendingSurfaceStyle} testID={`page-body-pending-${spec.scene}`}>
        <SceneLoadingSurface
          rowType={material.rowType}
          count={spec.placeholder.count}
          insetX={spec.placeholder.insetX}
          frostBacking={material.frostBacking}
        />
      </View>
    );
  }
  if (state.kind === 'empty') {
    return <spec.Empty />;
  }
  return (
    <>
      <spec.Content items={state.items} />
      {state.kind === 'appending' && material != null ? (
        <SceneLoadingSurface
          rowType={material.rowType}
          count={APPENDING_TAIL_ROWS}
          insetX={spec.placeholder.insetX}
          frostBacking={material.frostBacking}
        />
      ) : null}
    </>
  );
};

const PageContentBody = <TData,>({
  spec,
  state,
}: {
  spec: PageContentBodySpec<TData>;
  state: PageContentBodyState<TData>;
}): React.ReactElement | null => {
  if (state.kind === 'present') {
    return <spec.Content data={state.data} />;
  }
  // pending + error-hold — the one full-body material (same law as list bodies).
  const material = resolveSceneLoadingMaterial(spec.scene);
  if (material == null) {
    return null;
  }
  return (
    <View pointerEvents="none" style={pendingSurfaceStyle} testID={`page-body-pending-${spec.scene}`}>
      <SceneLoadingSurface rowType={material.rowType} frostBacking={material.frostBacking} />
    </View>
  );
};

export const PageBodyShell = <TItem,>(
  props: PageBodyShellProps<TItem>
): React.ReactElement | null => {
  // TS cannot narrow a union by a NESTED discriminant (spec.kind), so the split is
  // localized to these casts; the union type keeps call sites honest.
  const listProps =
    props.spec.kind === 'list'
      ? (props as { spec: PageListBodySpec<TItem>; state: PageBodyState<TItem> })
      : null;
  const collectionProps =
    props.spec.kind === 'collection'
      ? (props as { spec: PageCollectionBodySpec<TItem>; state: PageBodyState<TItem> })
      : null;
  const contentProps =
    props.spec.kind === 'content'
      ? (props as { spec: PageContentBodySpec<TItem>; state: PageContentBodyState<TItem> })
      : null;
  const failure =
    listProps?.state.kind === 'error'
      ? listProps.state.failure
      : collectionProps?.state.kind === 'error'
        ? collectionProps.state.failure
        : contentProps?.state.kind === 'error'
          ? contentProps.state.failure
          : undefined;
  // THE failure-law chokepoint: every migrated page inherits the app-wide behavior
  // from this one call — a page-local retry/error view has nowhere to exist.
  useSceneLoadFailurePolicy(props.spec.scene, failure);
  if (listProps != null) {
    return <PageListBody spec={listProps.spec} state={listProps.state} />;
  }
  if (collectionProps != null) {
    return <PageCollectionBody spec={collectionProps.spec} state={collectionProps.state} />;
  }
  if (contentProps != null) {
    return <PageContentBody spec={contentProps.spec} state={contentProps.state} />;
  }
  // A static body has no page-level query: present by construction — the declared
  // content IS the body.
  const StaticContent = (props.spec as PageStaticBodySpec).Content;
  return <StaticContent />;
};

export default PageBodyShell;
