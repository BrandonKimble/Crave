import { StyleSheet } from 'react-native';

import { CONTENT_HORIZONTAL_PADDING } from '../../../screens/Search/constants/search';

// Styles for the ResultCard primitive's SLOT content only (note line etc.).
// The card body's own styles remain the search styles module — a literal
// move preserving byte-parity on the results surface (see the header comment
// in RestaurantResultCard.tsx).

// Wave-3 §3.3: card gallery photos read BIGGER and slightly LESS WIDE.
export const RESULT_CARD_GALLERY_HEIGHT = 96;
export const RESULT_CARD_GALLERY_TILE_ASPECT = 1.1;
// The card gutter the gallery/pill rows bleed out of.
// F896 (2026-08-03): this was `= 20` under a comment RESTATING the two-hop derivation
// (overlay-chrome-metrics -> OVERLAY_HORIZONTAL_PADDING -> CONTENT_HORIZONTAL_PADDING).
// The constant is importable, so it is imported: a padding change now moves the full-bleed
// math with it instead of silently desyncing the card from the page it sits on.
export const RESULT_CARD_GUTTER = CONTENT_HORIZONTAL_PADDING;

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
