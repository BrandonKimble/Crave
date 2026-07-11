import type { ImagePickerAsset } from 'expo-image-picker';

// ─── Pending-assets pass-through (W2, plans/page-registry.md §7.4) ───────────────────────────
// Route params must stay serializable (they ride the route stack + equality fns), but the
// postPhotos funnel needs to hand the picker/camera's rich ImagePickerAsset objects to the
// postPhotos scene. The honest bridge: a module-scope store keyed by a minted nonce — the
// NONCE travels as the route param (`sessionNonce`), the assets stay here. Same family as the
// overlay-sheet edit-lock registry (module-scope runtime seam, no React context).
//
// Lifecycle: `stash` at push time; the panel `peek`s (NOT takes) so an entry-mount remount of
// the scene re-reads the same assets; `release` when the funnel COLLAPSES (the all-done close
// handler + a stack-removal check on unmount — never bare unmount, remounts must re-peek).
// A missing nonce (dev reload dropped module state) renders the panel's honest failure body.

const pendingAssetsByNonce = new Map<string, ImagePickerAsset[]>();

let nonceCounter = 0;

export const stashPostPhotosAssets = (assets: ImagePickerAsset[]): string => {
  nonceCounter += 1;
  const nonce = `post-photos-${Date.now().toString(36)}-${nonceCounter}`;
  pendingAssetsByNonce.set(nonce, assets);
  return nonce;
};

export const peekPostPhotosAssets = (nonce: string): ImagePickerAsset[] | null =>
  pendingAssetsByNonce.get(nonce) ?? null;

export const releasePostPhotosAssets = (nonce: string): void => {
  pendingAssetsByNonce.delete(nonce);
};
