import React from 'react';
import { StyleSheet, View } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import { buildMapStyleURL, DEFAULT_MAP_CENTER } from '../constants/map';
import type { StartupCameraSpec } from '../navigation/runtime/MainLaunchCoordinator';
import { buildBackdropDotFeatures, getBackdropDotRadius } from './backdrop-dot-theme';
import { SPLASH_STUDIO_CONFIG } from '../splash-studio/config';

MapboxGL.setTelemetryEnabled(false);

const AUSTIN_FALLBACK_ZOOM = SPLASH_STUDIO_CONFIG.studioCamera.zoom;
const BACKDROP_BASE = SPLASH_STUDIO_CONFIG.backdrop.baseColor;
const BACKDROP_READY_SETTLE_MS = 650;

type BackdropMapSceneProps = {
  cameraSpec?: StartupCameraSpec | null;
  onReadyChange?: (ready: boolean) => void;
};

const BackdropMapScene: React.FC<BackdropMapSceneProps> = ({ cameraSpec, onReadyChange }) => {
  const accessToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
  const configuredStyleURL = process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ?? '';
  const styleURL = React.useMemo(
    () => buildMapStyleURL(accessToken),
    [accessToken, configuredStyleURL]
  );
  const [hasLoadedStyle, setHasLoadedStyle] = React.useState(false);
  const [hasLoadedMap, setHasLoadedMap] = React.useState(false);
  const [hasRenderedFullFrame, setHasRenderedFullFrame] = React.useState(false);
  const [isBackdropReady, setIsBackdropReady] = React.useState(false);

  React.useLayoutEffect(() => {
    if (!accessToken) {
      return;
    }
    void MapboxGL.setAccessToken(accessToken);
  }, [accessToken]);

  const center = cameraSpec?.center ?? DEFAULT_MAP_CENTER;
  const zoom = cameraSpec?.zoom ?? AUSTIN_FALLBACK_ZOOM;
  const backdropDots = React.useMemo(() => buildBackdropDotFeatures(center, zoom), [center, zoom]);
  const backdropDotRadius = React.useMemo(() => getBackdropDotRadius(), []);

  React.useEffect(() => {
    setHasLoadedStyle(false);
    setHasLoadedMap(false);
    setHasRenderedFullFrame(false);
    setIsBackdropReady(false);
  }, [center, zoom]);

  React.useEffect(() => {
    if (!hasLoadedStyle || !hasLoadedMap || !hasRenderedFullFrame) {
      setIsBackdropReady(false);
      return;
    }
    const timer = setTimeout(() => {
      setIsBackdropReady(true);
    }, BACKDROP_READY_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [hasLoadedMap, hasLoadedStyle, hasRenderedFullFrame]);

  React.useEffect(() => {
    onReadyChange?.(isBackdropReady);
  }, [isBackdropReady, onReadyChange]);

  const backdropDotLayerStyle = React.useMemo<MapboxGL.CircleLayerStyle>(
    () => ({
      circleRadius: backdropDotRadius,
      circleColor: ['coalesce', ['get', 'color'], '#f59e0b'],
      circleOpacity: 1,
      circlePitchAlignment: 'map',
      circleStrokeWidth: 0,
    }),
    [backdropDotRadius]
  );

  return (
    <View pointerEvents="none" style={styles.container}>
      <MapboxGL.MapView
        style={styles.map}
        styleURL={styleURL}
        onDidFinishLoadingMap={() => setHasLoadedMap(true)}
        onDidFinishLoadingStyle={() => setHasLoadedStyle(true)}
        onDidFinishRenderingFrameFully={() => setHasRenderedFullFrame(true)}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        compassEnabled={false}
        zoomEnabled={false}
        scrollEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        <MapboxGL.Camera
          centerCoordinate={center}
          zoomLevel={zoom}
          animationMode="none"
          animationDuration={0}
        />
        <MapboxGL.ShapeSource id="root-shell-backdrop-dots" shape={backdropDots}>
          <MapboxGL.CircleLayer id="root-shell-backdrop-dots-layer" style={backdropDotLayerStyle} />
        </MapboxGL.ShapeSource>
      </MapboxGL.MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BACKDROP_BASE,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default React.memo(BackdropMapScene);
