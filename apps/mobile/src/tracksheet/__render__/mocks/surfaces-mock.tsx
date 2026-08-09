// ─── Visual-surface mocks (render lane) ──────────────────────────────────────
//
// One file serves several purely-visual module seams. Marker host elements
// keep the tree assertable; children pass through untouched.

import React from 'react';

// The REAL width-hint context (pure React, not a visual module): the marker
// records what the host actually provided, so the skeleton-geometry falsifiers
// assert delivered values, never re-derived ones.
import { SceneSkeletonWidthHintContext } from '../../../components/skeletons/scene-skeleton-width-hint';

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

export const SceneBodyFoundationSurface: React.FC<AnyProps> = ({ children, sceneKey }) => (
  <foundation-surface sceneKey={sceneKey as string}>{children}</foundation-surface>
);

export const SearchRouteSheetFrameHost: React.FC<AnyProps> = ({ children }) => <>{children}</>;

/** FrostCutout is inert outside a foundation surface by its own contract — the
 * mock is the inert face (pass-through wrapper). */
export const FrostCutout: React.FC<AnyProps> = ({ children }) => (
  <frost-cutout>{children}</frost-cutout>
);

export const useIsInsideSceneFoundationSurface = (): boolean => false;

/** The skeleton material marker — readiness tests assert its props. Mount
 * continuity is observable via the module-level counter (a marker cannot lie
 * about instance identity: React only runs the mount effect on a REAL mount). */
export const sceneLoadingSurfaceMounts = { count: 0 };
export const SceneLoadingSurface: React.FC<AnyProps> = (props) => {
  const widthHint = React.useContext(SceneSkeletonWidthHintContext);
  React.useEffect(() => {
    sceneLoadingSurfaceMounts.count += 1;
  }, []);
  return <scene-loading-surface {...props} widthHint={widthHint} />;
};

export type SceneLoadingRowType = string;

export const FrostedGlassBackground: React.FC<AnyProps> = () => <frost />;

/** Default export serves MaskedHoleOverlay AND HeaderNavAction (both default
 * imports mapped to this file). */
const GenericVisual: React.FC<AnyProps> = ({ children }) => (
  <generic-visual>{children}</generic-visual>
);

export default GenericVisual;
