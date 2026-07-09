import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './ui/Text';
import { colors as themeColors } from '../constants/theme';
import OverlayModalSheet from '../overlays/OverlayModalSheet';
import { dismissAppModal, useAppModalConfig, type AppModalAction } from './app-modal-store';

const ACCENT = themeColors.primary;
const DESTRUCTIVE = '#ef4444';

/**
 * Renders the in-app modal driven by `app-modal-store` (a styled replacement for
 * `Alert.alert`). Mount once at the app root.
 *
 * THE STANDARD MODAL SURFACE (owner spec, 2026-07-08): the old centered card (native
 * Modal, fade, no gestures — not swipeable) is replaced by the OverlayModalSheet
 * primitive — the same surface as the toggle-strip sheets: dimmed backdrop, no snap
 * points or grab handle, grab-to-rubber-band, dismiss by swipe down or backdrop tap.
 */
export const AppModalHost: React.FC = () => {
  const config = useAppModalConfig();
  const visible = config != null;
  // Keep the last non-null config through the exit animation so the content doesn't
  // blank out while the sheet slides away.
  const lastConfigRef = React.useRef(config);
  if (config != null) {
    lastConfigRef.current = config;
  }
  const renderedConfig = config ?? lastConfigRef.current;

  const actions: AppModalAction[] =
    renderedConfig?.actions && renderedConfig.actions.length > 0
      ? renderedConfig.actions
      : [{ label: 'OK', style: 'default' }];
  const isRow = actions.length === 2;

  const handlePress = (action: AppModalAction): void => {
    dismissAppModal();
    action.onPress?.();
  };

  return (
    <OverlayModalSheet
      visible={visible}
      onRequestClose={dismissAppModal}
      zIndex={200}
      maxBackdropOpacity={0.45}
      paddingTop={26}
      paddingHorizontal={24}
      minBottomPadding={18}
    >
      {renderedConfig?.title ? (
        <Text variant="subtitle" weight="semibold" style={styles.title}>
          {renderedConfig.title}
        </Text>
      ) : null}
      {renderedConfig?.message ? (
        <Text variant="body" style={styles.message}>
          {renderedConfig.message}
        </Text>
      ) : null}
      <View style={[styles.actions, isRow ? styles.actionsRow : styles.actionsStack]}>
        {actions.map((action, index) => {
          const isDestructive = action.style === 'destructive';
          const isCancel = action.style === 'cancel';
          return (
            <Pressable
              key={`${action.label}-${index}`}
              onPress={() => handlePress(action)}
              style={({ pressed }) => [
                styles.button,
                isRow ? styles.buttonFlex : null,
                isCancel
                  ? styles.buttonCancel
                  : isDestructive
                    ? styles.buttonDestructive
                    : styles.buttonPrimary,
                pressed ? styles.buttonPressed : null,
              ]}
              accessibilityRole="button"
              testID={action.testID}
            >
              <Text
                variant="body"
                weight="semibold"
                style={isCancel ? styles.buttonTextCancel : styles.buttonTextFilled}
              >
                {action.label}
              </Text>
            </Pressable>
          );
        })}
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
  message: {
    marginTop: 8,
    textAlign: 'center',
    color: themeColors.textMuted,
    lineHeight: 21,
  },
  actions: {
    marginTop: 22,
  },
  actionsStack: {
    flexDirection: 'column',
    gap: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonFlex: {
    flex: 1,
  },
  buttonPrimary: {
    backgroundColor: ACCENT,
  },
  buttonDestructive: {
    backgroundColor: DESTRUCTIVE,
  },
  buttonCancel: {
    backgroundColor: 'rgba(17, 24, 39, 0.05)',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonTextFilled: {
    color: '#ffffff',
  },
  buttonTextCancel: {
    color: themeColors.textPrimary,
  },
});

export default AppModalHost;
