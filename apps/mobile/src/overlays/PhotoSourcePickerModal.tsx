import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Camera, Images } from 'lucide-react-native';

import { Text } from '../components';
import { colors as themeColors } from '../constants/theme';
import OverlayModalSheet from './OverlayModalSheet';

// THE APP-WIDE STANDARD FIRST STEP of every add-photo flow (page-registry §9b):
// exactly two options — Take photo / Choose from library — on the ONE modal surface.
// The callbacks are the contract; cancel is implicit via normal modal dismissal
// (backdrop tap / swipe down). Consumers own `visible` and wire the actual
// camera/library pickers behind the callbacks.

export type PhotoSourcePickerModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  /** The user chose "Take photo". Fired after the close is requested. */
  onCamera: () => void;
  /** The user chose "Choose from library". Fired after the close is requested. */
  onLibrary: () => void;
  /** Fires once the sheet's exit animation completes (any close path). */
  onDismiss?: () => void;
  /** __DEV__-only third row ("Use test images") — the sim-drivable funnel lane.
   *  Callers pass it gated on __DEV__; the row never renders in production. */
  onDevTestImages?: () => void;
};

const ICON_SIZE = 22;

export const PhotoSourcePickerModal: React.FC<PhotoSourcePickerModalProps> = ({
  visible,
  onRequestClose,
  onCamera,
  onLibrary,
  onDismiss,
  onDevTestImages,
}) => {
  // Close first, then hand off — same order as AppModalHost: the sheet fences taps
  // during its exit, so a press only lands while live, and the chosen flow starts
  // immediately while the sheet slides away.
  const handleChoose = (choice: () => void): void => {
    onRequestClose();
    choice();
  };

  return (
    <OverlayModalSheet
      visible={visible}
      onRequestClose={onRequestClose}
      onDismiss={onDismiss}
      paddingTop={26}
      paddingHorizontal={24}
      minBottomPadding={18}
    >
      <Text variant="subtitle" weight="semibold" style={styles.title}>
        Add a photo
      </Text>
      <View style={styles.options}>
        <Pressable
          onPress={() => handleChoose(onCamera)}
          style={({ pressed }) => [styles.option, pressed ? styles.optionPressed : null]}
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          testID="photo-source-camera"
        >
          <Camera size={ICON_SIZE} color={themeColors.textPrimary} strokeWidth={2} />
          <Text variant="body" weight="semibold" style={styles.optionLabel}>
            Take photo
          </Text>
        </Pressable>
        <Pressable
          onPress={() => handleChoose(onLibrary)}
          style={({ pressed }) => [styles.option, pressed ? styles.optionPressed : null]}
          accessibilityRole="button"
          accessibilityLabel="Choose from library"
          testID="photo-source-library"
        >
          <Images size={ICON_SIZE} color={themeColors.textPrimary} strokeWidth={2} />
          <Text variant="body" weight="semibold" style={styles.optionLabel}>
            Choose from library
          </Text>
        </Pressable>
        {__DEV__ && onDevTestImages ? (
          <Pressable
            onPress={() => handleChoose(onDevTestImages)}
            style={({ pressed }) => [styles.option, pressed ? styles.optionPressed : null]}
            accessibilityRole="button"
            accessibilityLabel="Use test images"
            testID="photo-source-dev-test-images"
          >
            <Images size={ICON_SIZE} color={themeColors.textPrimary} strokeWidth={2} />
            <Text variant="body" weight="semibold" style={styles.optionLabel}>
              Use test images (dev)
            </Text>
          </Pressable>
        ) : null}
      </View>
    </OverlayModalSheet>
  );
};

const styles = StyleSheet.create({
  title: {
    textAlign: 'center',
    color: themeColors.textPrimary,
    fontSize: 18,
  },
  options: {
    marginTop: 22,
    flexDirection: 'column',
    gap: 8,
  },
  option: {
    height: 56,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(17, 24, 39, 0.05)',
  },
  optionPressed: {
    opacity: 0.85,
  },
  optionLabel: {
    color: themeColors.textPrimary,
  },
});

export default PhotoSourcePickerModal;
