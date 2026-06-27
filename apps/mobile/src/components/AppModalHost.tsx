import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

import { Text } from './ui/Text';
import { colors as themeColors } from '../constants/theme';
import { useArmedOutsideDismiss } from '../overlays/useArmedOutsideDismiss';
import {
  dismissAppModal,
  useAppModalConfig,
  type AppModalAction,
} from './app-modal-store';

const ACCENT = themeColors.primary;
const DESTRUCTIVE = '#ef4444';

/**
 * Renders the in-app modal driven by `app-modal-store` (a styled replacement for
 * `Alert.alert`). Mount once at the app root. Tapping the backdrop or an action
 * dismisses; the card swallows taps.
 */
export const AppModalHost: React.FC = () => {
  const config = useAppModalConfig();
  const visible = config != null;
  const actions: AppModalAction[] =
    config?.actions && config.actions.length > 0
      ? config.actions
      : [{ label: 'OK', style: 'default' }];
  const isRow = actions.length === 2;

  const handlePress = (action: AppModalAction): void => {
    dismissAppModal();
    action.onPress?.();
  };

  // Standardized "armed-outside" dismiss (matches the price/score sheets + compose chin):
  // the backdrop behind the card dismisses on first move or on lift, never on touch-down.
  const backdropDismissGesture = useArmedOutsideDismiss({
    enabled: visible,
    onDismiss: dismissAppModal,
  });

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismissAppModal}
    >
      {/* RNGH gestures inside a native Modal render in a separate window, so they need their
          own root view to register touches. */}
      <GestureHandlerRootView style={styles.root}>
        {/* The native Modal `animationType="fade"` fades the whole overlay (backdrop + card)
            in and out — no spring/zoom, per the in-app modal spec. */}
        <View style={styles.backdrop} pointerEvents="box-none">
          <GestureDetector gesture={backdropDismissGesture}>
            <View
              style={StyleSheet.absoluteFill}
              accessible={visible}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              onAccessibilityTap={dismissAppModal}
            />
          </GestureDetector>
          <View style={styles.card}>
          {config?.title ? (
            <Text variant="subtitle" weight="semibold" style={styles.title}>
              {config.title}
            </Text>
          ) : null}
          {config?.message ? (
            <Text variant="body" style={styles.message}>
              {config.message}
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
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingTop: 26,
    paddingHorizontal: 24,
    paddingBottom: 18,
    shadowColor: '#0f172a',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 24,
  },
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
