import React from 'react';
import { Dimensions, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { TrackSheetPage, TrackSheetStripCutout } from '../tracksheet';

// ─── THE ONE TRACK — kit consumer (design doc "THE ONE TRACK") ─────────────────
//
// The prototype is now the TrackSheet kit's FIRST CONSUMER — the whole page is
// one <TrackSheetPage>: physics, sheet clip surface, chrome, strip cutouts and
// divider fade all come from the kit. What remains here is exactly what a real
// page authors: geometry, a header row, strip content, rows. Open with:
//   crave://one-track-proto?show=1     (hide: show=0, toggle: no param)

const DEEP_LINK_HOST = 'one-track-proto';

const SCREEN = Dimensions.get('window');
const EXPANDED_TOP = 120;
const MIDDLE_TOP = Math.round(SCREEN.height * 0.55);
const COLLAPSED_TOP = Math.round(SCREEN.height * 0.85);
const ROW_DATA = Array.from({ length: 40 }, (_, index) => index);
const STRIP_LABELS = ['Sort', 'Restaurants', 'Dishes', 'Open now'];

export const OneTrackPrototype: React.FC = () => {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url || !url.includes(DEEP_LINK_HOST)) {
        return;
      }
      const show = /[?&]show=(1|true|on|yes)/i.test(url);
      const hide = /[?&]show=(0|false|off|no)/i.test(url);
      setVisible((prev) => (hide ? false : show ? true : !prev));
    };
    Linking.getInitialURL()
      .then(handleUrl)
      .catch(() => undefined);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  if (!visible) {
    return null;
  }
  return <OneTrackSurface onClose={() => setVisible(false)} />;
};

const OneTrackSurface: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const header = React.useMemo(
    () => (
      <View style={styles.headerCard} pointerEvents="box-none">
        <Text style={styles.headerTitle}>One Track</Text>
        <Pressable onPress={onClose} style={styles.closeButton} hitSlop={12}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>
    ),
    [onClose]
  );

  // Frost replica under the strip plate (production: the real frosted layer).
  const stripBackdrop = React.useMemo(
    () => (
      <>
        <View style={styles.stripFrost} />
        <View style={styles.stripFrostWash} />
      </>
    ),
    []
  );

  const renderRow = React.useCallback(
    ({ item }: { item: number }) => (
      <View style={styles.row}>
        <View style={styles.rowBadge}>
          <Text style={styles.rowBadgeText}>{item + 1}</Text>
        </View>
        <View style={styles.rowLines}>
          <View style={styles.rowLineWide} />
          <View style={styles.rowLineNarrow} />
        </View>
      </View>
    ),
    []
  );

  return (
    <View style={styles.root} pointerEvents="auto">
      {/* Fake map backdrop (the frost world behind) */}
      <View style={styles.map} />

      <TrackSheetPage
        geometry={{
          expandedTop: EXPANDED_TOP,
          collapsedTop: COLLAPSED_TOP,
          detentTops: [EXPANDED_TOP, MIDDLE_TOP, COLLAPSED_TOP],
        }}
        title={header}
        legs={[
          {
            sceneKey: 'prototype',
            list: { data: ROW_DATA, renderItem: renderRow } as never,
            rowSurfaceStyle: styles.rowSurface,
          },
        ]}
        presentedSceneKey="prototype"
        debugHud
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 9999 },
  map: { ...StyleSheet.absoluteFillObject, backgroundColor: '#dce7dd' },
  headerCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 20, color: '#0f172a', lineHeight: 22 },
  stripFrost: { ...StyleSheet.absoluteFillObject, backgroundColor: '#a9bfab' },
  stripFrostWash: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.45)' },
  stripRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 11,
  },
  chip: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  chipActive: { backgroundColor: '#f43f5e' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  chipTextActive: { color: '#ffffff' },
  rowSurface: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 22 },
  rowBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowBadgeText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  rowLines: { flex: 1, gap: 10 },
  rowLineWide: { height: 14, borderRadius: 7, backgroundColor: '#e2e8f0', width: '92%' },
  rowLineNarrow: { height: 12, borderRadius: 6, backgroundColor: '#eef2f7', width: '58%' },
});
