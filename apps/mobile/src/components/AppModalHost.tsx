import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Text } from './ui/Text';
import { colors as themeColors } from '../constants/theme';
import OverlayModalSheet from '../overlays/OverlayModalSheet';
import {
  dismissAppModal,
  useAppModalConfig,
  type AppModalAction,
  type AppModalConfig,
} from './app-modal-store';

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

  // Prompt state (the Alert.prompt replacement): keyed to the config identity so a
  // new modal always starts with a blank field; the typed value reaches every
  // action's onPress.
  const [promptText, setPromptText] = React.useState('');
  const promptConfigRef = React.useRef<AppModalConfig | null>(null);
  if (config != null && promptConfigRef.current !== config) {
    promptConfigRef.current = config;
    if (promptText !== '') {
      setPromptText('');
    }
  }

  // The sheet fences taps during its exit (pointerEvents), so a press only lands while
  // a live config is showing — dismiss exactly that config, then run its action.
  const handlePress = (action: AppModalAction): void => {
    if (config == null) {
      return;
    }
    const typed = config.prompt != null ? promptText : undefined;
    dismissAppModal(config);
    action.onPress?.(typed);
  };

  // Identity-scoped dismiss: the sheet defers onRequestClose a frame, so a swipe/backdrop
  // close must only dismiss the config it was showing — never a newer one that landed in
  // the gap. Closing over `config` (not a ref) pins the identity to the render the
  // gesture fired against.
  const handleRequestClose = React.useCallback((): void => {
    if (config != null) {
      dismissAppModal(config);
    }
  }, [config]);

  // The onDismissed contract: fires EXACTLY ONCE per config, on whichever path closes
  // it. Three closes exist: (a) normal — dismissed, exit animation completes; (b)
  // hard-swap — a new showAppModal replaces it while visible (no exit runs); (c)
  // abandoned exit — a new modal opens during the slide-out, cancelling finishExit.
  // A pending ref owns the not-yet-fired config; (b)/(c) fire it at replacement time,
  // (a) fires it when the sheet reports the exit finished. Without (b)/(c) a replaced
  // failure modal would silently drop its return-to-origin unwind.
  const pendingDismissedRef = React.useRef<AppModalConfig | null>(null);
  const prevConfigRef = React.useRef<AppModalConfig | null>(null);
  React.useEffect(() => {
    const prev = prevConfigRef.current;
    prevConfigRef.current = config;
    if (prev != null && config != null && prev !== config) {
      // (b) hard-swap: the outgoing config's modal is gone by the only path left.
      prev.onDismissed?.();
      return;
    }
    if (prev != null && config == null) {
      // Dismissed — the exit animation now owns the (a) firing.
      pendingDismissedRef.current = prev;
      return;
    }
    if (prev == null && config != null && pendingDismissedRef.current != null) {
      // (c) reopen-during-exit: the pending exit will never complete — fire now.
      const abandoned = pendingDismissedRef.current;
      pendingDismissedRef.current = null;
      abandoned.onDismissed?.();
    }
  }, [config]);
  const handleSheetDismissed = React.useCallback((): void => {
    const pending = pendingDismissedRef.current;
    pendingDismissedRef.current = null;
    pending?.onDismissed?.();
  }, []);

  return (
    <OverlayModalSheet
      visible={visible}
      onRequestClose={handleRequestClose}
      onDismiss={handleSheetDismissed}
      zIndex={200}
      maxBackdropOpacity={0.45}
      paddingTop={26}
      paddingHorizontal={24}
      minBottomPadding={18}
    >
      {renderedConfig?.title ? (
        <Text
          variant="subtitle"
          weight="semibold"
          style={[styles.title, renderedConfig.variant === 'menu' ? styles.titleMenu : null]}
        >
          {renderedConfig.title}
        </Text>
      ) : null}
      {renderedConfig?.message ? (
        <Text variant="body" style={styles.message}>
          {renderedConfig.message}
        </Text>
      ) : null}
      {renderedConfig?.prompt ? (
        <TextInput
          value={promptText}
          onChangeText={setPromptText}
          placeholder={renderedConfig.prompt.placeholder}
          placeholderTextColor={themeColors.textMuted}
          autoCapitalize={renderedConfig.prompt.autoCapitalize ?? 'none'}
          secureTextEntry={renderedConfig.prompt.secureTextEntry}
          keyboardType={renderedConfig.prompt.keyboardType}
          autoFocus
          autoCorrect={false}
          style={styles.promptInput}
          testID={renderedConfig.prompt.testID}
        />
      ) : null}
      {renderedConfig?.variant === 'menu' ? (
        // MENU VARIANT (wave-2 §2 — the list-ellipsis restyle): icon + text rows,
        // left-aligned, no color blocks, no separators; the sheet's own swipe/backdrop
        // dismissal replaces a Cancel row.
        <View style={styles.menuActions}>
          {actions.map((action, index) => {
            const isDestructive = action.style === 'destructive';
            return (
              <Pressable
                key={`${action.label}-${index}`}
                onPress={() => handlePress(action)}
                style={({ pressed }) => [styles.menuRow, pressed ? styles.buttonPressed : null]}
                accessibilityRole="button"
                testID={action.testID}
              >
                {action.icon != null ? <View style={styles.menuRowIcon}>{action.icon}</View> : null}
                <Text
                  variant="body"
                  weight="medium"
                  style={isDestructive ? styles.menuRowTextDestructive : styles.menuRowText}
                >
                  {action.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
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
      )}
    </OverlayModalSheet>
  );
};

const styles = StyleSheet.create({
  title: {
    textAlign: 'center',
    color: themeColors.textPrimary,
    fontSize: 18,
  },
  titleMenu: {
    textAlign: 'left',
  },
  menuActions: {
    marginTop: 14,
    flexDirection: 'column',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 14,
    paddingVertical: 13,
  },
  menuRowIcon: {
    width: 22,
    alignItems: 'center',
  },
  menuRowText: {
    color: themeColors.textPrimary,
  },
  menuRowTextDestructive: {
    color: DESTRUCTIVE,
  },
  message: {
    marginTop: 8,
    textAlign: 'center',
    color: themeColors.textMuted,
    lineHeight: 21,
  },
  promptInput: {
    marginTop: 16,
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(17, 24, 39, 0.05)',
    color: themeColors.textPrimary,
    fontSize: 16,
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
