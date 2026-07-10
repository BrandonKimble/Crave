export type SearchRootMapViewportIntentRuntime = {
  mapCenter: [number, number] | null;
  mapZoom: number | null;
  mapBearing: number | null;
  mapPitch: number | null;
  mapCameraAnimation: {
    mode: 'none' | 'easeTo';
    durationMs: number;
    completionId: string | null;
  };
  isFollowingUser: boolean;
};
