import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';

import { X as LucideX } from 'lucide-react-native';

import { showAppModal, Text } from '../../components';
import {
  checkPollDuplicate,
  createPoll,
  type CreatePollPayload,
  type Poll,
} from '../../services/polls';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { colors as themeColors } from '../../constants/theme';
import { FONT_SIZES, LINE_HEIGHTS } from '../../constants/typography';
import {
  OVERLAY_HORIZONTAL_PADDING,
  OVERLAY_TAB_HEADER_HEIGHT,
  overlaySheetStyles,
} from '../overlaySheetStyles';
import { resolveExpandedTop } from '../sheetUtils';
import { useNavHideIntent } from '../../navigation/runtime/nav-hide-intent-store';
import OverlaySheetHeaderChrome from '../OverlaySheetHeaderChrome';
import type { SnapPoints } from '../bottomSheetMotionTypes';
import type { MapBounds } from '../../types';
import type { SearchRoutePublishedSceneParts } from '../searchOverlayRouteHostContract';
import { normalizeSearchRouteSceneStackShellSpec } from '../searchOverlayRouteHostContract';

const SCREEN_HEIGHT = Dimensions.get('window').height;

const ACCENT = themeColors.primary;
const BORDER = themeColors.border;
const SURFACE = themeColors.surface;

// §5: user polls self-schedule their close window (3–14 days, default 1 week).
const DEFAULT_CLOSE_WINDOW_DAYS = 7;
const CLOSE_WINDOW_OPTIONS: ReadonlyArray<{ label: string; value: number }> = [
  { label: '3 days', value: 3 },
  { label: '1 week', value: 7 },
  { label: '2 weeks', value: 14 },
];

type UsePollCreationPanelSpecOptions = {
  visible: boolean;
  marketKey: string | null;
  marketName?: string | null;
  bounds?: MapBounds | null;
  searchBarTop?: number;
  snapPoints?: SnapPoints;
  onClose: () => void;
  onCreated: (poll: Poll) => void;
};

export const usePollCreationPanelSpec = ({
  visible,
  marketKey,
  marketName,
  bounds,
  searchBarTop = 0,
  snapPoints: snapPointsOverride,
  onClose,
  onCreated,
}: UsePollCreationPanelSpecOptions): SearchRoutePublishedSceneParts => {
  const insets = useSafeAreaInsets();
  // §J: push the bottom tab bar down while creating (like pollDetail) so the pinned Publish chin
  // has the bottom band to itself and isn't covered by the nav.
  useNavHideIntent('pollCreation', visible);
  const { pushRoute } = useAppOverlayRouteController();
  // Subject-first: the free-text question the LLM resolves into a poll (type + axis
  // are inferred server-side — no manual poll-type picker). The description is the
  // creator's organic seed; its entity mentions seed the live leaderboard.
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  // §5: the creator self-schedules the close window (default 1 week).
  const [closeWindowDays, setCloseWindowDays] = useState(DEFAULT_CLOSE_WINDOW_DAYS);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setQuestion('');
      setDescription('');
      setCloseWindowDays(DEFAULT_CLOSE_WINDOW_DAYS);
    }
  }, [visible]);

  // §J keyboard choreography: subject-first creation autofocuses the subject so the keyboard
  // rises WITH the sheet on open. `autoFocus` (on the TextInput below) fires when the input itself
  // MOUNTS — robust against the body surface mounting the header AFTER this hook's effects (a
  // ref+effect.focus() raced the mount and found a null ref). The sheet instant-covers to the top
  // snap in ~1 frame, so the keyboard rising right after reads as "keyboard-up on open".

  const handleSubmit = useCallback(async () => {
    if (!marketKey && !bounds) {
      showAppModal({
        title: 'Pick a market',
        message: 'Move the map to a local market before creating a poll.',
      });
      return;
    }
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      showAppModal({
        title: 'Add a subject',
        message: 'Type what you want the community to weigh in on.',
      });
      return;
    }

    try {
      setSubmitting(true);

      // Stage 1 — fast text dedup (no LLM): route obvious duplicates to the existing
      // poll instead of spinning up another. Precision-favoring threshold server-side.
      if (marketKey) {
        const { matches } = await checkPollDuplicate({ question: trimmedQuestion, marketKey });
        const match = matches[0];
        if (match) {
          setSubmitting(false);
          showAppModal({
            title: 'This poll already exists',
            message: `"${match.question}" is already live here. Jump into that discussion instead?`,
            actions: [
              { label: 'Cancel', style: 'cancel' },
              {
                label: 'View poll',
                onPress: () => {
                  onClose();
                  pushRoute('pollDetail', { pollId: match.pollId });
                },
              },
            ],
          });
          return;
        }
      }

      const payload: CreatePollPayload = {
        question: trimmedQuestion,
        marketKey: marketKey ?? undefined,
        bounds,
        description: description.trim() || undefined,
        closeWindowDays,
      };
      const poll = await createPoll(payload);
      onCreated(poll);
    } catch (error) {
      showAppModal({
        title: 'Unable to create poll',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  }, [bounds, closeWindowDays, description, marketKey, onClose, onCreated, pushRoute, question]);

  const headerTitle = marketName?.trim()
    ? `Add a poll in ${marketName.trim()}`
    : marketKey
      ? 'Add a poll'
      : 'Add a poll near here';

  const expanded = resolveExpandedTop(searchBarTop, insets.top);
  // The list body frame fills the full sheet height but the sheet is translated DOWN by `expanded`,
  // so its bottom overhangs the visible screen by `expanded`. Reserve that overhang + the home
  // inset + the pinned Publish chin's height so the last field (Description) clears the chin.
  const contentBottomPadding = expanded + insets.bottom + 88;
  const hidden = SCREEN_HEIGHT + 80;
  const snapPoints = useMemo(
    () =>
      snapPointsOverride ?? {
        expanded,
        middle: expanded,
        collapsed: expanded,
        hidden,
      },
    [expanded, hidden, snapPointsOverride]
  );

  const canSubmit = question.trim().length > 0 && !submitting;

  // §J: the Publish CTA is pinned as a keyboard-aware chin at the sheet bottom (mirrors the
  // PollDetailPanel composer) so it rides ABOVE the keyboard instead of being buried under it
  // while the subject/description fields are focused. `useAnimatedKeyboard.height` is measured
  // from the screen bottom (it spans the home-indicator inset the chin already clears), so lift
  // by height − inset to sit flush on the keyboard.
  const keyboard = useAnimatedKeyboard();
  const publishChinAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, keyboard.height.value - insets.bottom) }],
  }));
  const publishChin = (
    <Reanimated.View
      style={[styles.publishChin, { bottom: expanded + insets.bottom }, publishChinAnimatedStyle]}
    >
      <Pressable
        onPress={() => void handleSubmit()}
        style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
        disabled={!canSubmit}
        accessibilityRole="button"
        testID="poll-create-publish"
      >
        <Text variant="body" weight="semibold" style={styles.submitButtonText}>
          {submitting ? 'Publishing…' : 'Publish poll'}
        </Text>
      </Pressable>
    </Reanimated.View>
  );

  const headerComponent = (
    <OverlaySheetHeaderChrome
      title={
        <Text variant="title" weight="semibold" style={styles.sheetTitle} numberOfLines={1}>
          {headerTitle}
        </Text>
      }
      actionButton={
        <Pressable
          onPressIn={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close poll creation"
          style={overlaySheetStyles.closeButton}
          hitSlop={8}
        >
          <View style={overlaySheetStyles.closeIcon} pointerEvents="none">
            <LucideX size={20} color="#000000" strokeWidth={2.5} />
          </View>
        </Pressable>
      }
    />
  );

  const listHeaderComponent = (
    <View>
      <View style={styles.section}>
        <Text variant="body" weight="semibold" style={styles.sectionLabel}>
          Subject
        </Text>
        <TextInput
          autoFocus={visible}
          value={question}
          onChangeText={setQuestion}
          placeholder="What should people weigh in on? e.g. best tacos in NYC"
          placeholderTextColor={themeColors.textMuted}
          style={[styles.input, styles.subjectInput]}
          multiline
          autoCorrect={false}
          accessibilityLabel="Poll subject"
          testID="poll-subject-input"
        />
      </View>

      {/* Options form from the discussion — they are never hand-seeded. */}
      <View style={styles.section}>
        <Text variant="body" weight="semibold" style={styles.sectionLabel}>
          Options
        </Text>
        <View style={styles.optionsPlaceholder} pointerEvents="none">
          <Text variant="body" style={styles.optionsPlaceholderText}>
            Your ranking forms from the discussion — no need to add options.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text variant="body" weight="semibold" style={styles.sectionLabel}>
          Description
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Add context or your own take to kick off the discussion"
          placeholderTextColor={themeColors.textMuted}
          style={[styles.input, styles.descriptionInput]}
          multiline
        />
      </View>

      <View style={styles.section}>
        <Text variant="body" weight="semibold" style={styles.sectionLabel}>
          Closes in
        </Text>
        <View style={styles.windowRow}>
          {CLOSE_WINDOW_OPTIONS.map((option) => {
            const active = closeWindowDays === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setCloseWindowDays(option.value)}
                style={[styles.windowChip, active && styles.windowChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Close in ${option.label}`}
              >
                <Text
                  variant="caption"
                  weight="semibold"
                  style={[styles.windowChipText, active && styles.windowChipTextActive]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );

  return {
    shellSpec: normalizeSearchRouteSceneStackShellSpec({
      overlayKey: 'pollCreation',
      snapPoints,
      style: overlaySheetStyles.container,
    }),
    sceneChrome: {
      underlayComponent: null,
      // White, full-bleed sheet (no frosted glass) for the poll-creation scene.
      backgroundComponent: <View style={styles.sheetSurface} />,
      headerComponent,
      overlayComponent: null,
    },
    sceneBodyContent: {
      surfaceKind: 'list',
      data: [],
      renderItem: () => null,
      estimatedItemSize: 880,
      ListHeaderComponent: listHeaderComponent,
      // §J: the Publish CTA rides with the sheet (pinned chin), keyboard-aware.
      ListChromeComponent: publishChin,
    },
    sceneBodyTransport: {
      contentContainerStyle: {
        paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
        paddingTop: 16,
        // Clear the pinned Publish chin so the last field isn't hidden behind it.
        paddingBottom: contentBottomPadding,
      },
      keyboardShouldPersistTaps: 'handled',
      // §J: dragging the form dismisses the keyboard (matches PollDetailPanel); a tap on any field
      // re-raises it. Over-scroll enforced no-bounce structurally by BottomSheetScrollContainer.
      keyboardDismissMode: 'on-drag',
    },
  };
};

const styles = StyleSheet.create({
  // White body layer scoped BELOW the header so the header plate's cutouts see through to the
  // shared frosty foundation (matches the result sheet). Frost → this white layer → form content.
  sheetSurface: {
    position: 'absolute',
    top: OVERLAY_TAB_HEADER_HEIGHT,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
  },
  sheetTitle: {
    color: themeColors.text,
    flex: 1,
    marginRight: 12,
    minWidth: 0,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    color: '#0f172a',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    backgroundColor: SURFACE,
    color: themeColors.textPrimary,
  },
  subjectInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  optionsPlaceholder: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 16,
    backgroundColor: '#f8fafc',
  },
  optionsPlaceholderText: {
    color: themeColors.textBody,
    lineHeight: 20,
  },
  descriptionInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  windowRow: {
    flexDirection: 'row',
    gap: 8,
  },
  windowChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    alignItems: 'center',
  },
  windowChipActive: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(255, 51, 104, 0.08)',
  },
  windowChipText: {
    color: themeColors.textBody,
  },
  windowChipTextActive: {
    color: ACCENT,
  },
  // §J: pinned, keyboard-aware Publish chin at the sheet bottom (mirrors the PollDetailPanel composer).
  publishChin: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  submitButton: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#ffffff',
  },
});
