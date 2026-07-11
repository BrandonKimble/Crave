import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Plus } from 'lucide-react-native';

import { colors as themeColors } from '../../constants/theme';
import { CUTOUT_SKELETON_CONFIG } from '../skeletons/cutout-skeleton-config';

// The ONE card photo strip (product/images.md, owner 2026-07-10: cards carry
// horizontally scrollable STRIPS, never single slots; ~3-4 photos visible at
// typical card widths). Ordering is SERVER policy — this component renders
// `photos` in the order given. Purely presentational: no fetching, no
// event emission (the consumer owns impressions/taps batching).
//
// Empty states (page-registry §7.1):
//   - display context (no leadTile): ONE attractive placeholder — a single
//     soft frost-gray rectangle in the strip's shape, display-only, NO button.
//   - own-list context (leadTile='add'): the "+" tile LEADS the strip and is
//     the only thing shown when empty.

export interface PhotoStripPhoto {
  id: string;
  thumbUrl: string;
  /** width / height. Defaults to 4:3 when the caller doesn't know it. */
  aspect?: number;
}

export interface PhotoStripProps {
  photos: PhotoStripPhoto[];
  /** Tile height in px; widths follow each photo's aspect. */
  height: number;
  /** 'add' prepends the owner-context "+" tile (own saved/favorites lists only). */
  leadTile?: 'add';
  onAddPress?: () => void;
  onPhotoPress?: (id: string, index: number) => void;
}

const DEFAULT_ASPECT = 4 / 3;
const TILE_GAP = 6;
const TILE_RADIUS = 10;
// The app's frost-gray token (cutout-skeleton-config frostTint) at a soft
// resting opacity — the placeholder reads as a quiet frosted pane, not chrome.
const FROST_GRAY = CUTOUT_SKELETON_CONFIG.frostTintColor.replace('rgb(', 'rgba(');
const PLACEHOLDER_COLOR = FROST_GRAY.replace(')', ', 0.16)');
const ADD_TILE_BORDER = FROST_GRAY.replace(')', ', 0.45)');
const ADD_ICON_COLOR = CUTOUT_SKELETON_CONFIG.frostTintColor;

const AddTile: React.FC<{ height: number; onPress?: () => void }> = ({ height, onPress }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel="Add photo"
    onPress={onPress}
    style={({ pressed }) => [
      styles.addTile,
      { height, width: Math.round(height * 0.75), opacity: pressed ? 0.6 : 1 },
    ]}
  >
    <Plus size={22} color={ADD_ICON_COLOR} strokeWidth={2.25} />
  </Pressable>
);

export const PhotoStrip: React.FC<PhotoStripProps> = ({
  photos,
  height,
  leadTile,
  onAddPress,
  onPhotoPress,
}) => {
  if (photos.length === 0 && leadTile !== 'add') {
    // Display-only placeholder: one soft rectangle in the strip's shape.
    return <View accessibilityLabel="No photos yet" style={[styles.placeholder, { height }]} />;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={{ height }}
    >
      {leadTile === 'add' ? <AddTile height={height} onPress={onAddPress} /> : null}
      {photos.map((photo, index) => {
        const width = Math.round(height * (photo.aspect ?? DEFAULT_ASPECT));
        return (
          <Pressable
            key={photo.id}
            accessibilityRole="imagebutton"
            onPress={onPhotoPress ? () => onPhotoPress(photo.id, index) : undefined}
            style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
          >
            <Image
              source={{ uri: photo.thumbUrl }}
              recyclingKey={photo.id}
              transition={180}
              contentFit="cover"
              style={[styles.tile, { height, width }]}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    gap: TILE_GAP,
  },
  tile: {
    borderRadius: TILE_RADIUS,
    backgroundColor: PLACEHOLDER_COLOR,
  },
  placeholder: {
    alignSelf: 'stretch',
    borderRadius: TILE_RADIUS,
    backgroundColor: PLACEHOLDER_COLOR,
  },
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: TILE_RADIUS,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderStyle: 'dashed',
    borderColor: ADD_TILE_BORDER,
    backgroundColor: themeColors.surface,
  },
});

export default PhotoStrip;
