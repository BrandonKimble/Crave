import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { create } from 'zustand';
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Image } from 'expo-image';
import { RefreshCw, X as LucideX, Zap, ZapOff } from 'lucide-react-native';

import { Text } from '../components';

// ─── cameraCapture — FULL-SCREEN page OUTSIDE the sheet system (page-registry §9a) ──────────
// The custom camera every add-photo flow's "Take photo" option lands on (iOS gives no styled
// camera UI; apps roll their own). Mounted app-root like EntitlementLapseHost/PaywallScreen:
// a zustand store is the ONE signal, the host renders the takeover when a session is active.
// Controls: shutter, flip, flash toggle, X close; after snap → retake / use-photo. "Use photo"
// hands an ImagePickerAsset-shaped object back to the caller (the postPhotos funnel) through
// the session callback. Crude visuals by design — W3's design pass owns the polish.

type CameraCaptureSession = {
  /** Fired with the captured asset when the user accepts the photo. */
  onUsePhoto: (asset: ImagePickerAsset) => void;
  /** Fired when the user exits without a photo (X, permission denied). */
  onCancel?: () => void;
};

interface CameraCaptureState {
  session: CameraCaptureSession | null;
  openCameraCapture: (session: CameraCaptureSession) => void;
  closeCameraCapture: () => void;
}

export const useCameraCaptureStore = create<CameraCaptureState>((set) => ({
  session: null,
  openCameraCapture: (session) => set({ session }),
  closeCameraCapture: () => set({ session: null }),
}));

/** Plain-function entry (callable from spec hooks / non-React code). */
export const openCameraCapture = (session: CameraCaptureSession): void => {
  useCameraCaptureStore.getState().openCameraCapture(session);
};

type CapturedShot = {
  uri: string;
  width: number;
  height: number;
};

const CameraCaptureScreen = ({ session }: { session: CameraCaptureSession }) => {
  const closeCameraCapture = useCameraCaptureStore((state) => state.closeCameraCapture);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = React.useState<CameraType>('back');
  const [flash, setFlash] = React.useState<FlashMode>('off');
  const [shot, setShot] = React.useState<CapturedShot | null>(null);
  const [isCapturing, setIsCapturing] = React.useState(false);
  const cameraRef = React.useRef<CameraView | null>(null);

  React.useEffect(() => {
    if (permission != null && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const handleClose = React.useCallback(() => {
    closeCameraCapture();
    session.onCancel?.();
  }, [closeCameraCapture, session]);

  const handleSnap = React.useCallback(async () => {
    const camera = cameraRef.current;
    if (camera == null || isCapturing) {
      return;
    }
    setIsCapturing(true);
    try {
      const picture = await camera.takePictureAsync({ quality: 0.9 });
      if (picture?.uri) {
        setShot({ uri: picture.uri, width: picture.width, height: picture.height });
      }
    } catch {
      // Capture failed (backgrounded / hardware) — stay live, the user can retry.
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing]);

  const handleUsePhoto = React.useCallback(() => {
    if (shot == null) {
      return;
    }
    closeCameraCapture();
    // ImagePickerAsset-shaped — the funnel/upload pipeline consumes uri/mimeType/fileName.
    session.onUsePhoto({
      assetId: null,
      uri: shot.uri,
      width: shot.width,
      height: shot.height,
      type: 'image',
      fileName: `camera-${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
    });
  }, [closeCameraCapture, session, shot]);

  if (permission != null && !permission.granted && !permission.canAskAgain) {
    return (
      <View style={styles.deniedBody}>
        <Text variant="body" style={styles.deniedText}>
          Camera access is off. Enable it in Settings to take photos.
        </Text>
        <Pressable
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close camera"
          style={styles.deniedClose}
          testID="camera-capture-denied-close"
        >
          <Text variant="body" weight="semibold" style={styles.deniedCloseText}>
            Close
          </Text>
        </Pressable>
      </View>
    );
  }

  if (permission == null || !permission.granted) {
    return (
      <View style={styles.deniedBody}>
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  if (shot != null) {
    // Review step: retake / use-photo.
    return (
      <View style={styles.root}>
        <Image source={{ uri: shot.uri }} contentFit="cover" style={StyleSheet.absoluteFill} />
        <View style={styles.reviewBar}>
          <Pressable
            onPress={() => setShot(null)}
            accessibilityRole="button"
            accessibilityLabel="Retake photo"
            style={styles.reviewButton}
            testID="camera-capture-retake"
          >
            <Text variant="body" weight="semibold" style={styles.reviewButtonText}>
              Retake
            </Text>
          </Pressable>
          <Pressable
            onPress={handleUsePhoto}
            accessibilityRole="button"
            accessibilityLabel="Use photo"
            style={[styles.reviewButton, styles.reviewButtonPrimary]}
            testID="camera-capture-use-photo"
          >
            <Text variant="body" weight="semibold" style={styles.reviewButtonPrimaryText}>
              Use photo
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} flash={flash} />
      <View style={styles.topBar}>
        <Pressable
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close camera"
          hitSlop={10}
          style={styles.controlButton}
          testID="camera-capture-close"
        >
          <LucideX size={24} color="#ffffff" strokeWidth={2.5} />
        </Pressable>
        <Pressable
          onPress={() => setFlash((mode) => (mode === 'off' ? 'on' : 'off'))}
          accessibilityRole="button"
          accessibilityLabel={flash === 'off' ? 'Turn flash on' : 'Turn flash off'}
          hitSlop={10}
          style={styles.controlButton}
          testID="camera-capture-flash"
        >
          {flash === 'off' ? (
            <ZapOff size={22} color="#ffffff" strokeWidth={2} />
          ) : (
            <Zap size={22} color="#facc15" strokeWidth={2} />
          )}
        </Pressable>
      </View>
      <View style={styles.bottomBar}>
        <View style={styles.bottomSlot} />
        <Pressable
          onPress={() => void handleSnap()}
          disabled={isCapturing}
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          style={styles.shutterOuter}
          testID="camera-capture-shutter"
        >
          {isCapturing ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <View style={styles.shutterInner} />
          )}
        </Pressable>
        <View style={styles.bottomSlot}>
          <Pressable
            onPress={() => setFacing((side) => (side === 'back' ? 'front' : 'back'))}
            accessibilityRole="button"
            accessibilityLabel="Flip camera"
            hitSlop={10}
            style={styles.controlButton}
            testID="camera-capture-flip"
          >
            <RefreshCw size={22} color="#ffffff" strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export function CameraCaptureHost(): React.ReactElement | null {
  const session = useCameraCaptureStore((state) => state.session);
  if (session == null) {
    return null;
  }
  return (
    <View style={styles.hostRoot}>
      <CameraCaptureScreen session={session} />
    </View>
  );
}

const styles = StyleSheet.create({
  hostRoot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 1200, // above the entitlement-lapse takeover (1100)
  },
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    position: 'absolute',
    top: 64,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
  },
  bottomSlot: {
    width: 44,
    alignItems: 'center',
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#ffffff',
  },
  reviewBar: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    gap: 16,
  },
  reviewButton: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  reviewButtonText: {
    color: '#ffffff',
  },
  reviewButtonPrimary: {
    backgroundColor: '#ffffff',
  },
  reviewButtonPrimaryText: {
    color: '#0f172a',
  },
  deniedBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 32,
  },
  deniedText: {
    color: '#ffffff',
    textAlign: 'center',
  },
  deniedClose: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#ffffff',
  },
  deniedCloseText: {
    color: '#0f172a',
  },
});
