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

// A list body is an ordered band set with ONE ACTIVE (L1 A#14/B#15) — the shell
// interprets exactly the active band: its row template, its pending face, its empty
// view, its OWN closed state. Bands are item-type-erased in the spec (defineListBand
// checks agreement at the declaration site), so the interpreter renders items as the
// band's opaque vocabulary.
type ErasedBandRowComponent = React.ComponentType<{ item: unknown }>;

const PageListBody = ({
  spec,
  bandStates,
  activeBandKey,
}: {
  spec: PageListBodySpec;
  bandStates: Readonly<Record<string, PageBodyState<unknown>>>;
  activeBandKey?: string;
}): React.ReactElement | null => {
  const band =
    (activeBandKey != null ? spec.bands.find((candidate) => candidate.key === activeBandKey) : null) ??
    spec.bands[0];
  const state = bandStates[band.key] ?? { kind: 'pending' as const };
  const material = resolveSceneLoadingMaterial(spec.scene);
  const RowComponent = band.row.Component as ErasedBandRowComponent;
  const keyOf = band.keyOf as (item: unknown, index: number) => string;
  if (state.kind === 'pending' || state.kind === 'error') {
    if (material == null) {
      return null;
    }
    return (
      <View pointerEvents="none" style={pendingSurfaceStyle} testID={`page-body-pending-${spec.scene}`}>
        <SceneLoadingSurface
          rowType={band.materialRowType ?? material.rowType}
          count={band.placeholder.count}
          insetX={band.placeholder.insetX}
          withFilterStripHoles={material.withStripHoles}
          style={pendingMaterialFillStyle}
        />
      </View>
    );
  }
  if (state.kind === 'empty') {
    return <band.Empty />;
  }
  return (
    <View testID={`page-body-list-${spec.scene}`}>
      {state.items.map((item, index) => (
        <RowComponent key={keyOf(item, index)} item={item} />
      ))}
      {state.kind === 'appending' && material != null ? (
        <SceneLoadingSurface
          rowType={band.materialRowType ?? material.rowType}
          count={APPENDING_TAIL_ROWS}
          insetX={band.placeholder.insetX}
        />
      ) : null}
    </View>
  );
};

// THE LENGTH LAW (skeleton-sheet spec §4, owner 2026-07-18): the pending face FILLS
// the body's scroll box and never extends past it — the material
// renders absolutely inside and CLIPS, so its row count can never lengthen the
// scroll. A pending page scrolls exactly like any short page: bounded, normal.
const pendingSurfaceStyle = { flex: 1, alignSelf: 'stretch', overflow: 'hidden' } as const;
const pendingMaterialFillStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
} as const;

/** List/collection/content bodies require their state; static bodies cannot carry
 *  one — every mismatch is a compile error, not a runtime surprise. List bodies carry
 *  PER-BAND states keyed by band key (one band = one entry) plus the active-band
 *  input (omitted = the first declared band). */
export type PageBodyShellProps<TItem> =
  | {
      spec: PageListBodySpec;
      bandStates: Readonly<Record<string, PageBodyState<unknown>>>;
      activeBandKey?: string;
      state?: undefined;
    }
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
          withFilterStripHoles={material.withStripHoles}
          style={pendingMaterialFillStyle}
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
      <SceneLoadingSurface
        rowType={material.rowType}
        withFilterStripHoles={material.withStripHoles}
        style={pendingMaterialFillStyle}
      />
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
      ? (props as {
          spec: PageListBodySpec;
          bandStates: Readonly<Record<string, PageBodyState<unknown>>>;
          activeBandKey?: string;
        })
      : null;
  const collectionProps =
    props.spec.kind === 'collection'
      ? (props as { spec: PageCollectionBodySpec<TItem>; state: PageBodyState<TItem> })
      : null;
  const contentProps =
    props.spec.kind === 'content'
      ? (props as { spec: PageContentBodySpec<TItem>; state: PageContentBodyState<TItem> })
      : null;
  const activeListBandState = (() => {
    if (listProps == null) {
      return null;
    }
    const band =
      (listProps.activeBandKey != null
        ? listProps.spec.bands.find((candidate) => candidate.key === listProps.activeBandKey)
        : null) ?? listProps.spec.bands[0];
    return listProps.bandStates[band.key] ?? null;
  })();
  const failure =
    activeListBandState?.kind === 'error'
      ? activeListBandState.failure
      : collectionProps?.state.kind === 'error'
        ? collectionProps.state.failure
        : contentProps?.state.kind === 'error'
          ? contentProps.state.failure
          : undefined;
  // THE failure-law chokepoint: every migrated page inherits the app-wide behavior
  // from this one call — a page-local retry/error view has nowhere to exist.
  useSceneLoadFailurePolicy(props.spec.scene, failure);
  if (listProps != null) {
    return (
      <PageListBody
        spec={listProps.spec}
        bandStates={listProps.bandStates}
        activeBandKey={listProps.activeBandKey}
      />
    );
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
