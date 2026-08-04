// ─── Visual-surface mocks (render lane) ──────────────────────────────────────
//
// One file serves several purely-visual module seams. Marker host elements
// keep the tree assertable; children pass through untouched.

import React from 'react';

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

export const SceneBodyFoundationSurface: React.FC<AnyProps> = ({ children, sceneKey }) => (
  <foundation-surface sceneKey={sceneKey as string}>{children}</foundation-surface>
);

export const SearchRouteSheetFrameHost: React.FC<AnyProps> = ({ children }) => <>{children}</>;

/** The skeleton material marker — readiness tests assert its props. */
export const SceneLoadingSurface: React.FC<AnyProps> = (props) => (
  <scene-loading-surface {...props} />
);

export type SceneLoadingRowType = string;

export const FrostedGlassBackground: React.FC<AnyProps> = () => <frost />;

/** Default export serves MaskedHoleOverlay AND HeaderNavAction (both default
 * imports mapped to this file). */
const GenericVisual: React.FC<AnyProps> = ({ children }) => (
  <generic-visual>{children}</generic-visual>
);

export default GenericVisual;
