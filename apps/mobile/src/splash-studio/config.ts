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
