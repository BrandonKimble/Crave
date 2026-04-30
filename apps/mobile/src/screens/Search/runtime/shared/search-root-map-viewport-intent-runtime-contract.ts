export type SearchRootMapViewportIntentRuntime = {
  restaurantOnlyId: string | null;
  mapCenter: [number, number] | null;
  mapZoom: number | null;
  mapCameraAnimation: {
    mode: 'none' | 'easeTo';
    durationMs: number;
    completionId: string | null;
  };
  isFollowingUser: boolean;
};
