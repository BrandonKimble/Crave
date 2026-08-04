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

// F971 — THE STORE IS BOUNDED, because `release` is not guaranteed to run.
//
// The lifecycle above describes the HAPPY path: release on the funnel's all-done close.
// An ABANDONED funnel — the user backs out, the app is backgrounded and the stack is
// restored differently, a push that never reaches its close handler — never releases, and
// each orphaned entry retains full-resolution ImagePickerAsset URIs plus EXIF for the whole
// process lifetime. Unbounded retention of the largest objects the app handles is the leak
// class at its most expensive.
//
// THE POLICY: least-recently-stashed eviction at a small cap. The cap is a MEMORY knob, not
// a UX knob — only ONE funnel can be in flight at a time (the postPhotos scene is a single
// route entry), so the live nonce is always the newest; the older entries are, by
// construction, funnels the user has already left. Evicting one costs nothing that a live
// funnel can observe. A peek that misses already has an honest failure body (see above),
// which is the same behaviour a dev reload produces.
const PENDING_ASSET_SESSION_LIMIT = 4;

const pendingAssetsByNonce = new Map<string, ImagePickerAsset[]>();

let nonceCounter = 0;

export const stashPostPhotosAssets = (assets: ImagePickerAsset[]): string => {
  nonceCounter += 1;
  const nonce = `post-photos-${Date.now().toString(36)}-${nonceCounter}`;
  pendingAssetsByNonce.set(nonce, assets);
  // Map iteration is insertion order, so the front IS the least-recently-stashed end.
  while (pendingAssetsByNonce.size > PENDING_ASSET_SESSION_LIMIT) {
    const oldestNonce = pendingAssetsByNonce.keys().next().value;
    if (oldestNonce === undefined) {
      break;
    }
    pendingAssetsByNonce.delete(oldestNonce);
  }
  return nonce;
};

export const peekPostPhotosAssets = (nonce: string): ImagePickerAsset[] | null =>
  pendingAssetsByNonce.get(nonce) ?? null;

export const releasePostPhotosAssets = (nonce: string): void => {
  pendingAssetsByNonce.delete(nonce);
};
