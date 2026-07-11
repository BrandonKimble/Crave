import React from 'react';
import { create } from 'zustand';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';

import PhotoSourcePickerModal from './PhotoSourcePickerModal';
import { openCameraCapture } from '../screens/CameraCaptureHost';
import { stashPostPhotosAssets } from './postPhotosPendingAssets';
import { useAppOverlayRouteController } from './useAppOverlayRouteController';

// ─── The POST PHOTOS funnel (W2, plans/page-registry.md §7.4) ────────────────────────────────
// THE standard first step app-wide: any add-photo affordance calls openPostPhotosFunnel(context)
// → the shared 2-option modal (Take photo / Choose from library) → system picker OR the custom
// cameraCapture full-screen page → with assets in hand, pushRoute('postPhotos', context +
// sessionNonce) — assets travel through the module-scope pending-assets store (route params
// stay serializable).
//
// Shaped as a GLOBAL HOST + plain-function entry (zustand signal, mounted once in App.tsx next
// to EntitlementLapseHost) rather than a per-surface hook, because several trigger surfaces are
// scene body-SPEC hooks whose effects never commit (CLAUDE.md) — a plain function call from a
// render-produced onPress is the one shape that works from every surface.

export type PostPhotosFunnelContext = {
  restaurantId?: string;
  restaurantName?: string;
  dishId?: string;
  dishName?: string;
};

// Two request shapes share the 2-option modal + source legs:
// - 'route': the standard funnel — assets in hand → pushRoute('postPhotos').
// - 'assets': red-team W2 (§7.4 multi-restaurant sections) — an ALREADY-OPEN
//   post page re-runs the source picker for one of its sections; assets are
//   handed back via callback instead of a second route push.
type PostPhotosFunnelRequest =
  | { kind: 'route'; context: PostPhotosFunnelContext }
  | { kind: 'assets'; onAssets: (assets: ImagePickerAsset[]) => void };

interface PostPhotosFunnelState {
  pendingRequest: PostPhotosFunnelRequest | null;
  openRequest: (request: PostPhotosFunnelRequest) => void;
  clearFunnel: () => void;
}

const usePostPhotosFunnelStore = create<PostPhotosFunnelState>((set) => ({
  pendingRequest: null,
  openRequest: (request) => set({ pendingRequest: request }),
  clearFunnel: () => set({ pendingRequest: null }),
}));

/** THE app-wide add-photo entry. Callable from anywhere (incl. spec hooks). */
export const openPostPhotosFunnel = (context: PostPhotosFunnelContext): void => {
  usePostPhotosFunnelStore.getState().openRequest({ kind: 'route', context });
};

/** Source picker only: same modal + camera/library/dev legs, assets delivered
 *  to the caller (the mounted post page adding photos to a section). */
export const openPhotoSourceForAssets = (onAssets: (assets: ImagePickerAsset[]) => void): void => {
  usePostPhotosFunnelStore.getState().openRequest({ kind: 'assets', onAssets });
};

/** Hook-shaped alias for React surfaces that prefer the hook idiom. */
export const usePostPhotosFunnel = (): ((context: PostPhotosFunnelContext) => void) =>
  openPostPhotosFunnel;

// ─── __DEV__ test images (sim-drivable funnel without camera/library UI) ─────────────────────
// The system picker + camera are undrivable from Maestro/deep links; in dev the 2-option modal
// grows a third "Use test images" row that resolves the bundled splash asset (the only bundled
// image) to a real file:// uri via expo-asset and fabricates two picker-shaped assets from it.
const loadDevTestAssets = async (): Promise<ImagePickerAsset[]> => {
  // Lazy requires keep expo-asset (an expo core transitive dep) + the bundled image out of
  // the prod module graph — this function is only reachable behind __DEV__.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Asset } = require('expo-asset') as typeof import('expo-asset');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const asset = Asset.fromModule(require('../../assets/splash.png'));
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  return [1, 2].map((index) => ({
    assetId: null,
    uri,
    width: asset.width ?? 1024,
    height: asset.height ?? 1024,
    type: 'image' as const,
    fileName: `dev-test-${index}.png`,
    mimeType: 'image/png',
  }));
};

export function PostPhotosFunnelHost(): React.ReactElement | null {
  const pendingRequest = usePostPhotosFunnelStore((state) => state.pendingRequest);
  const clearFunnel = usePostPhotosFunnelStore((state) => state.clearFunnel);
  const { pushRoute } = useAppOverlayRouteController();

  // Latch the request for the async legs (picker/camera resolve after the modal closes).
  const requestRef = React.useRef<PostPhotosFunnelRequest | null>(null);
  if (pendingRequest != null) {
    requestRef.current = pendingRequest;
  }

  const pushPostPhotos = React.useCallback(
    (assets: ImagePickerAsset[]) => {
      if (assets.length === 0) {
        return;
      }
      const request = requestRef.current ?? { kind: 'route' as const, context: {} };
      if (request.kind === 'assets') {
        request.onAssets(assets);
        return;
      }
      const sessionNonce = stashPostPhotosAssets(assets);
      pushRoute('postPhotos', { ...request.context, sessionNonce });
    },
    [pushRoute]
  );

  const handleLibrary = React.useCallback(() => {
    void (async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.9,
        exif: true, // takenAt is read on-device pre-upload (stored original is metadata-stripped)
      });
      if (!result.canceled) {
        pushPostPhotos(result.assets);
      }
    })();
  }, [pushPostPhotos]);

  const handleCamera = React.useCallback(() => {
    openCameraCapture({
      onUsePhoto: (asset) => pushPostPhotos([asset]),
    });
  }, [pushPostPhotos]);

  const handleDevTestImages = React.useCallback(() => {
    void loadDevTestAssets()
      .then(pushPostPhotos)
      .catch(() => {
        // Dev-only path; a resolve failure is loud enough as a silent no-op here.
      });
  }, [pushPostPhotos]);

  return (
    <PhotoSourcePickerModal
      visible={pendingRequest != null}
      onRequestClose={clearFunnel}
      onCamera={handleCamera}
      onLibrary={handleLibrary}
      onDevTestImages={__DEV__ ? handleDevTestImages : undefined}
    />
  );
}
