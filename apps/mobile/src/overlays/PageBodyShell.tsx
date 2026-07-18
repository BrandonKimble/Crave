import React from 'react';
import { View } from 'react-native';

import { SceneLoadingSurface } from '../components/skeletons';
import { resolveSceneLoadingMaterial } from '../navigation/runtime/scene-foundation-spec';
import { useSceneLoadFailurePolicy } from './scene-load-failure-policy';
import type {
  PageBodyState,
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
          frostBacking={material.frostBacking}
        />
      ) : null}
    </View>
  );
};

// The shell fills the body lane it replaces (mirrors the old gate's pending surface).
const pendingSurfaceStyle = { flex: 1, minHeight: 320 } as const;

/** List bodies require a state; static bodies cannot carry one — both mismatches are
 *  compile errors, not runtime surprises. */
export type PageBodyShellProps<TItem> =
  | { spec: PageListBodySpec<TItem>; state: PageBodyState<TItem> }
  | { spec: PageStaticBodySpec; state?: undefined };

export const PageBodyShell = <TItem,>(
  props: PageBodyShellProps<TItem>
): React.ReactElement | null => {
  // TS cannot narrow a union by a NESTED discriminant (spec.kind), so the split is
  // localized to this one cast; the union type keeps call sites honest.
  const listProps =
    props.spec.kind === 'list'
      ? (props as { spec: PageListBodySpec<TItem>; state: PageBodyState<TItem> })
      : null;
  // THE failure-law chokepoint: every migrated page inherits the app-wide behavior
  // from this one call — a page-local retry/error view has nowhere to exist.
  useSceneLoadFailurePolicy(
    props.spec.scene,
    listProps != null && listProps.state.kind === 'error' ? listProps.state.failure : undefined
  );
  if (listProps == null) {
    // A static body has no page-level query: present by construction — the declared
    // content IS the body.
    const StaticContent = (props.spec as PageStaticBodySpec).Content;
    return <StaticContent />;
  }
  return <PageListBody spec={listProps.spec} state={listProps.state} />;
};

export default PageBodyShell;
