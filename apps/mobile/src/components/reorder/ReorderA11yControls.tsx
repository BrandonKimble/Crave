import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronDown, ChevronUp, ChevronsUp } from 'lucide-react-native';

/**
 * THE ONE non-drag reordering affordance (WCAG 2.5.7 — dragging must have a
 * single-pointer alternative): move-to-top / move-up / move-down.
 *
 * F890 (2026-08-03): this trio was written TWICE — once in ReorderableRows and once in
 * ReorderableGrid — with IDENTICAL disabled logic, identical hit slop, identical colors and
 * identical labels, but IN TWO DIFFERENT ICON LIBRARIES (`@expo/vector-icons` Feather in
 * rows, `lucide-react-native` in the grid). Two accessibility surfaces that must behave the
 * same, maintained apart, drawn from different icon sets. Standardized on lucide, which is
 * what the rest of the app uses.
 */
export const REORDER_SLOT_SHUFFLE_MS = 180;

/**
 * THE AUTO-SCROLL VIEWPORT BAND, shared by both reorder primitives (F890).
 *
 * A drag near the top/bottom of the visible area scrolls the list. These are the y bounds
 * of "visible area", and both primitives declared them SEPARATELY as `120` and
 * `windowHeight - 60`, each self-described as "coarse".
 *
 * COARSE, ACKNOWLEDGED: 120 approximates the bottom of the persistent sheet header and 60
 * the top of the home indicator. They are NOT derived from safe-area insets or from
 * `overlay-chrome-metrics`, which is what they should read from — recorded here rather than
 * silently duplicated, because deriving them needs the insets at the call site and belongs
 * with a pass that can check the result on a device. One declaration means the two surfaces
 * can no longer drift apart while both remain coarse.
 */
export const REORDER_VIEWPORT_TOP_Y = 120;
export const REORDER_VIEWPORT_BOTTOM_INSET = 60;

const DISABLED_COLOR = '#cbd5e1';
const ENABLED_COLOR = '#475569';

export type ReorderA11yControlsProps = {
  /** This item's index in the full list (pinned items included). */
  index: number;
  itemCount: number;
  /** Items before this index cannot be moved past — nothing may go above them. */
  pinnedLeadingCount: number;
  onMoveToTop: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** Stable per-item key, used only to build test ids. */
  itemKey: string;
  testIDPrefix?: string;
  /**
   * The container's POSITIONING, which is genuinely per-surface and stays with the caller:
   * rows anchor the trio right-aligned over a full-height row; the grid floats it as a
   * top-right chip on a translucent plate. Only the BUTTONS are shared — that is where the
   * duplication was, and where a divergence would be a real accessibility inconsistency.
   */
  containerStyle?: StyleProp<ViewStyle>;
};

export const ReorderA11yControls: React.FC<ReorderA11yControlsProps> = ({
  index,
  itemCount,
  pinnedLeadingCount,
  onMoveToTop,
  onMoveUp,
  onMoveDown,
  itemKey,
  testIDPrefix,
  containerStyle,
}) => {
  // ONE disabled rule, read by all three buttons: you cannot move above the pinned block,
  // and you cannot move below the end.
  const atTop = index <= pinnedLeadingCount;
  const atBottom = index >= itemCount - 1;
  const testId = (verb: string) =>
    testIDPrefix ? `${testIDPrefix}-${verb}-${itemKey}` : undefined;

  return (
    <View style={containerStyle}>
      <Pressable
        onPress={onMoveToTop}
        disabled={atTop}
        accessibilityRole="button"
        accessibilityLabel="Move to top"
        hitSlop={6}
        style={styles.a11yButton}
        testID={testId('move-top')}
      >
        <ChevronsUp size={18} color={atTop ? DISABLED_COLOR : ENABLED_COLOR} />
      </Pressable>
      <Pressable
        onPress={onMoveUp}
        disabled={atTop}
        accessibilityRole="button"
        accessibilityLabel="Move up"
        hitSlop={6}
        style={styles.a11yButton}
        testID={testId('move-up')}
      >
        <ChevronUp size={18} color={atTop ? DISABLED_COLOR : ENABLED_COLOR} />
      </Pressable>
      <Pressable
        onPress={onMoveDown}
        disabled={atBottom}
        accessibilityRole="button"
        accessibilityLabel="Move down"
        hitSlop={6}
        style={styles.a11yButton}
        testID={testId('move-down')}
      >
        <ChevronDown size={18} color={atBottom ? DISABLED_COLOR : ENABLED_COLOR} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  a11yButton: { padding: 6 },
});
