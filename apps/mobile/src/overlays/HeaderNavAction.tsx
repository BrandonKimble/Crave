import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { X as LucideX } from 'lucide-react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { overlaySheetStyles } from './overlaySheetStyles';

// ─── HeaderNavAction (wave-2 charter §4 / child-transition primitive §3, leg 6) ──────────────
//
// THE one host-owned header action control, rendered by PersistentSheetHeaderHost — never by a
// per-scene Action descriptor (the per-scene close-X factories are deleted; the plus/X is
// chrome LAW, not page choice). Geometry = the OverlayHeaderActionButton prior art's glyph
// (LucideX, the OLD close icon — its arms span the full icon diagonal, visibly larger than a
// rotated Plus; owner-decreed §2.3 wave-3): ONE glyph shape, two stacked color layers —
// RED at progress=0 (parents: the X rotated 45° IS the create plus) and BLACK at progress=1
// (children: the close X) — crossfading while the stack rotates 45·(1+progress)°. LucideX is
// 90°-symmetric, so 90° at progress=1 renders identical to the unrotated close X.
//   • child push: 0→1, CLOCKWISE quarter-twist into the black X (starts on press-up — the
//     driver is the PF chrome clock in the header host).
//   • child dismiss: 1→0, counterclockwise back to the red plus. Symmetry is free from the
//     single scalar. Child→child: target stays 1 — no animation, X↔X.

export const HEADER_NAV_ACTION_ACCENT_COLOR = '#e11d48';
export const HEADER_NAV_ACTION_CLOSE_COLOR = '#000000';

type HeaderNavActionProps = {
  /** 0 = red plus (parents), 1 = black X (children). Driven by the header host. */
  progress: SharedValue<number>;
  onPress: () => void;
  accessibilityLabel: string;
};

export const HeaderNavAction: React.FC<HeaderNavActionProps> = ({
  progress,
  onPress,
  accessibilityLabel,
}) => {
  const rotationStyle = useAnimatedStyle(() => {
    return { transform: [{ rotate: `${45 * (1 + progress.value)}deg` }] };
  }, [progress]);
  const plusOpacityStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }), [progress]);
  const closeOpacityStyle = useAnimatedStyle(() => ({ opacity: progress.value }), [progress]);

  const handlePressOut = React.useCallback(() => {
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPressOut={handlePressOut}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // Rig lever (CLAUDE.md maestro gotcha): the ONE shared child-dismiss / parent-create
      // control. A stable id makes `tapOn: id:` drive it reliably — coordinate taps on the
      // gesture-handoff sheet get eaten by the pan gesture. Serves the per-permutation
      // transition audit + the owner's repeatable finger-test.
      testID="header-nav-action"
      style={overlaySheetStyles.closeButton}
      collapsable={false}
      hitSlop={8}
    >
      <View style={overlaySheetStyles.closeIcon} collapsable={false}>
        <Animated.View style={rotationStyle}>
          <View style={styles.iconStack} pointerEvents="none">
            <Animated.View style={[styles.iconLayer, plusOpacityStyle]}>
              <LucideX size={20} color={HEADER_NAV_ACTION_ACCENT_COLOR} strokeWidth={2.5} />
            </Animated.View>
            <Animated.View style={[styles.iconLayer, closeOpacityStyle]}>
              <LucideX size={20} color={HEADER_NAV_ACTION_CLOSE_COLOR} strokeWidth={2.5} />
            </Animated.View>
          </View>
        </Animated.View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  iconStack: {
    position: 'relative',
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default HeaderNavAction;
