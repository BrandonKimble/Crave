import type { OverlaySheetSnap, OverlaySheetSnapRequest } from './types';

export type SearchRouteSceneSnapMeta = {
  source: 'gesture' | 'programmatic';
};

export type SearchRouteSceneSnapHandler = (
  snap: OverlaySheetSnap,
  meta?: SearchRouteSceneSnapMeta
) => void;

export type SearchRouteSceneShellMotionContract = {
  shellSnapRequest?: OverlaySheetSnapRequest | null;
  onSnapStart?: SearchRouteSceneSnapHandler;
  onSnapChange?: SearchRouteSceneSnapHandler;
};

export const createSearchRouteSceneShellSnapRequest = (
  snap: OverlaySheetSnap | null | undefined,
  token?: number | null,
  settleToken?: number | null
): OverlaySheetSnapRequest | null =>
  snap
    ? {
        snap,
        token: token ?? null,
        settleToken: settleToken ?? null,
      }
    : null;

export const resolveSearchRouteSceneShellSnapRequest = (
  visible: boolean,
  snap: OverlaySheetSnap | null | undefined,
  token?: number | null,
  settleToken?: number | null
): OverlaySheetSnapRequest | null =>
  visible ? createSearchRouteSceneShellSnapRequest(snap, token, settleToken) : null;
