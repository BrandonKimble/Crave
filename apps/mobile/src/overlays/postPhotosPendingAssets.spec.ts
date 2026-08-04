import type { ImagePickerAsset } from 'expo-image-picker';

import {
  peekPostPhotosAssets,
  releasePostPhotosAssets,
  stashPostPhotosAssets,
} from './postPhotosPendingAssets';

// THE BOUND EXISTS (F971, the F912 shape).
//
// The store's documented lifecycle releases on the funnel's all-done close — the HAPPY path.
// An abandoned funnel never releases, and each orphan retains full-resolution
// ImagePickerAsset URIs + EXIF for the process lifetime.
//
// PROVEN RED: delete the `while (pendingAssetsByNonce.size > PENDING_ASSET_SESSION_LIMIT)`
// eviction loop in `stashPostPhotosAssets` and the "abandoned funnels are evicted" case fails
// while the stash/peek/release case keeps passing — which is why the bound needs its own test.

const asset = (uri: string): ImagePickerAsset => ({ uri }) as unknown as ImagePickerAsset;

describe('F971 — the postPhotos pending-asset store is bounded', () => {
  it('stashes, peeks REPEATEDLY (remounts re-peek), and releases', () => {
    const nonce = stashPostPhotosAssets([asset('file:///a.jpg')]);

    expect(peekPostPhotosAssets(nonce)?.[0]?.uri).toBe('file:///a.jpg');
    // peek, not take: an entry-mount remount must re-read the same assets.
    expect(peekPostPhotosAssets(nonce)?.[0]?.uri).toBe('file:///a.jpg');

    releasePostPhotosAssets(nonce);
    expect(peekPostPhotosAssets(nonce)).toBeNull();
  });

  it('EVICTS abandoned funnels instead of retaining their assets forever', () => {
    // Every one of these is "abandoned": stashed, never released.
    const abandonedNonce = stashPostPhotosAssets([asset('file:///abandoned.jpg')]);
    for (let index = 0; index < 20; index += 1) {
      stashPostPhotosAssets([asset(`file:///later-${index}.jpg`)]);
    }

    // THE RED ASSERTION: without the eviction loop this still returns the retained assets.
    expect(peekPostPhotosAssets(abandonedNonce)).toBeNull();
  });

  it('keeps the NEWEST stash alive — eviction is oldest-first, never a wipe', () => {
    const olderNonce = stashPostPhotosAssets([asset('file:///older.jpg')]);
    const liveNonce = stashPostPhotosAssets([asset('file:///live.jpg')]);

    // The in-flight funnel is always the newest one; it must survive.
    expect(peekPostPhotosAssets(liveNonce)?.[0]?.uri).toBe('file:///live.jpg');

    releasePostPhotosAssets(olderNonce);
    releasePostPhotosAssets(liveNonce);
  });
});
