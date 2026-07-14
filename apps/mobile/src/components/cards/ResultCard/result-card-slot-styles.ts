import { StyleSheet } from 'react-native';

// Styles for the ResultCard primitive's SLOT content only (note line etc.).
// The card body's own styles remain the search styles module — a literal
// move preserving byte-parity on the results surface (see the header comment
// in RestaurantResultCard.tsx).

// Wave-3 §3.3: card gallery photos read BIGGER and slightly LESS WIDE.
export const RESULT_CARD_GALLERY_HEIGHT = 96;
export const RESULT_CARD_GALLERY_TILE_ASPECT = 1.1;
// The card gutter the gallery/pill rows bleed out of (= CONTENT_HORIZONTAL_PADDING).
export const RESULT_CARD_GUTTER = 20;

export const resultCardSlotStyles = StyleSheet.create({
  // The saver's note (§8.1: below the photo-strip row) — carried over from
  // ListDetailRow's rowNote treatment.
  note: {
    color: '#475569',
    marginTop: 8,
  },
  // Wave-3 §3.2: the rank bubble is INLINE — flush with the text column's left
  // edge, title to its right, metadata aligned UNDER at the same edge (the
  // indented-bubble left margin is dead). Overrides the search styles'
  // RESULT_DETAILS_INDENT on the metadata stack.
  metaFlush: {
    paddingLeft: 0,
  },
  // Wave-3 §2.4 (the toggle-strip bleed law): the gallery row escapes the
  // card's gutter; the first tile re-aligns via PhotoStrip's scrollable inset.
  galleryBleed: {
    marginHorizontal: -RESULT_CARD_GUTTER,
  },
});
