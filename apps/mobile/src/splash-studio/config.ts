/**
 * THIS IS TOOLING, NOT PRODUCT (F893, 2026-08-03).
 *
 * `src/splash-studio/**` plus `components/{SplashStudioScene,BackdropMapScene,
 * FrostedGridOverlay}.tsx` and `components/backdrop-dot-theme.ts` (~370 lines total) are a
 * CAPTURE TOOL whose only output is `src/assets/splash.png` — they exist to be screenshotted
 * by `apps/mobile/scripts/capture_splash_from_studio.sh`, which then runs
 * `install_captured_splash.sh` to write the PNG into the app + iOS asset catalogs.
 *
 * It is NOT dead code: `EXPO_PUBLIC_SPLASH_STUDIO === '1'` (see `splashStudioEnabled` below)
 * gates the single RootNavigator route (RootNavigator.tsx:46), so a normal build never
 * mounts it. Recorded here so a future reader neither deletes it as unreachable nor reads it
 * as shipped product surface. (`components/StaticSplashArtShell.tsx` is unrelated and DOES
 * ship unconditionally.)
 *
 * NOT DONE (deliberate): the finding also proposed MOVING these files beside the scripts that
 * drive them. Left in place — the move would rewrite the RootNavigator route registration and
 * several component imports for a labelling benefit this comment already delivers.
 */
import type { StartupCameraSpec } from '../navigation/runtime/MainLaunchCoordinator';
import splashStudioConfigData from './splash-studio-config.json';

type SplashStudioConfig = {
  studioCamera: {
    center: [number, number];
    zoom: number;
  };
  backdrop: {
    baseColor: string;
    dotCount: number;
    primaryColorChance: number;
    gradientBias: number;
    centerPull: number;
  };
  frost: {
    intensity: number;
    tint: 'light' | 'dark' | 'default';
    tintColor: string;
    tintOpacity: number;
  };
  grid: {
    minorSize: number;
    majorSize: number;
    minorStroke: string;
    majorStroke: string;
  };
};

const splashStudioConfig = splashStudioConfigData as SplashStudioConfig;

export const SPLASH_STUDIO_CONFIG = splashStudioConfig;

export const SPLASH_STUDIO_CAMERA_SPEC: StartupCameraSpec = {
  center: splashStudioConfig.studioCamera.center,
  zoom: splashStudioConfig.studioCamera.zoom,
  pitch: 0,
  heading: 0,
  source: 'city_fallback',
};

export const isSplashStudioEnabled = process.env.EXPO_PUBLIC_SPLASH_STUDIO === '1';
export const shouldShowSplashStudioLabel = process.env.EXPO_PUBLIC_SPLASH_STUDIO_LABEL !== '0';
export const shouldShowSplashStudioFrost = process.env.EXPO_PUBLIC_SPLASH_STUDIO_FROST !== '0';
export const shouldShowSplashStudioGrid = process.env.EXPO_PUBLIC_SPLASH_STUDIO_GRID !== '0';
export const shouldEnableSplashStudioNativeBlur =
  process.env.EXPO_PUBLIC_SPLASH_STUDIO_NATIVE_BLUR !== '0';
