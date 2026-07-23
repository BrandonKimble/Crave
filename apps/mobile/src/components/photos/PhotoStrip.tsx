import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Plus } from 'lucide-react-native';

import { colors as themeColors } from '../../constants/theme';

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
  /**
   * Default tile aspect (width / height) when a photo doesn't carry its own.
   * Wave-3 §3.3: cards pass a narrower aspect so photos read bigger/less wide.
   */
  tileAspect?: number;
  /**
   * Edge-to-edge bleed (wave-3 §2.4, the toggle-strip law): the strip itself is
   * full-bleed; the FIRST tile aligns with page content via this scrollable inset —
   * photos slide under both screen edges, nothing clips them into a padded box.
   */
  contentInset?: number;
  /** 'add' prepends the owner-context "+" tile (own saved/favorites lists only). */
  leadTile?: 'add';
  onAddPress?: () => void;
  onPhotoPress?: (id: string, index: number) => void;
  /** Long-press affordance — the report entry (page-registry §8.6). */
  onPhotoLongPress?: (id: string, index: number) => void;
}

const DEFAULT_ASPECT = 4 / 3;
const TILE_GAP = 6;
const TILE_RADIUS = 10;
// First-class placeholder tokens (a quiet neutral pane, not chrome). These are the
// strip's OWN colors — the old derivation string-mutated the skeleton config's
// self-frost tint, a token that died with the true-cutout law.
const PLACEHOLDER_COLOR = 'rgba(146, 151, 159, 0.16)';
const ADD_TILE_BORDER = 'rgba(146, 151, 159, 0.45)';
const ADD_ICON_COLOR = 'rgb(146, 151, 159)';

// ─── The plus SLIVER (leg 10 step 4; listdetail-ideal §7 gallery seam) ───────────────────────
// Decree: the "+" tile is a SLIVER — 1/6–1/8 of an image block's width, image height. At
// today's strip heights the literal decree cannot hold the icon: an image block is
// height·4/3 px wide (75px at h=56, 96px at h=72), so /6–/8 is 9–16px — no room for a plus
// with tasteful padding. Closest tasteful geometry (⚠ OWNER FEEL-CHECK pending, bigger
// gallery tiles would let the literal ratio land):
//   sliverWidth = max(round(blockWidth / 6), 24px)  → 24px at h=56 (~1/3 block) and
//   24px at h=72 (1/4 block); icon 14px, ~5px side padding.
const DECREED_SLIVER_FRACTION = 1 / 6;
const MIN_PLUS_SLIVER_WIDTH = 24;
const PLUS_SLIVER_ICON_SIZE = 14;

const AddTile: React.FC<{ height: number; onPress?: () => void }> = ({ height, onPress }) => {
  const blockWidth = Math.round(height * DEFAULT_ASPECT);
  const width = Math.max(Math.round(blockWidth * DECREED_SLIVER_FRACTION), MIN_PLUS_SLIVER_WIDTH);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add photo"
      onPress={onPress}
      style={({ pressed }) => [styles.addTile, { height, width, opacity: pressed ? 0.6 : 1 }]}
    >
      <Plus size={PLUS_SLIVER_ICON_SIZE} color={ADD_ICON_COLOR} strokeWidth={2.5} />
    </Pressable>
  );
};

export const PhotoStrip: React.FC<PhotoStripProps> = ({
  photos,
  height,
  tileAspect = DEFAULT_ASPECT,
  contentInset = 0,
  leadTile,
  onAddPress,
  onPhotoPress,
  onPhotoLongPress,
}) => {
  if (photos.length === 0 && leadTile !== 'add') {
    // Display-only placeholder: one soft rectangle in the strip's shape,
    // aligned with page content when the strip itself bleeds.
    return (
      <View
        accessibilityLabel="No photos yet"
        style={[styles.placeholder, { height, marginHorizontal: contentInset }]}
      />
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingHorizontal: contentInset }]}
      style={{ height }}
    >
      {leadTile === 'add' ? <AddTile height={height} onPress={onAddPress} /> : null}
      {photos.map((photo, index) => {
        const width = Math.round(height * (photo.aspect ?? tileAspect));
        return (
          <Pressable
            key={photo.id}
            accessibilityRole="imagebutton"
            onPress={onPhotoPress ? () => onPhotoPress(photo.id, index) : undefined}
            onLongPress={onPhotoLongPress ? () => onPhotoLongPress(photo.id, index) : undefined}
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
