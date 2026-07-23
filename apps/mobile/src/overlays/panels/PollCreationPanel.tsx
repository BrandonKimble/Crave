import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';

import { announceFailureIfOnline, showAppModal, Text } from '../../components';
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
import { registerPersistentHeaderDescriptor } from '../../navigation/runtime/app-route-persistent-header-registry';
import { useAppRouteSceneRuntime } from '../../navigation/runtime/AppRouteSceneRuntimeProvider';
import type { OverlayRouteEntry } from '../../navigation/runtime/app-overlay-route-types';
import type { SnapPoints } from '../bottomSheetMotionTypes';
import type { MapBounds } from '../../types';
import type { SearchRoutePublishedSceneParts } from '../searchOverlayRouteHostContract';
import { normalizeSearchRouteSceneStackShellSpec } from '../searchOverlayRouteHostContract';
import { ChromeTitleText, toSingleLineText } from '../ChromeTitleText';
import { useViewportSubjectState } from '../../store/viewport-subject-store';

const SCREEN_HEIGHT = Dimensions.get('window').height;

const ACCENT = themeColors.primary;
const BORDER = themeColors.border;
const SURFACE = themeColors.surface;

// §5: user polls self-schedule their close window (3–14 days, default 1 week).
// §8.3/§9b pollInfo — the KEPT "how polls work" explainer, rendered on THE one app
// modal (never a bespoke sheet). Module-scope: stateless copy, no hook needed.
const showPollInfoModal = (): void => {
  showAppModal({
    title: 'How polls work',
    message:
      'Ask the community a question — "best breakfast tacos?" — for the city on your map.\n\n' +
      'There are no hand-made options: the ranking forms from the discussion. Every comment ' +
      'that names a place counts as a vote, and votes stack into a live leaderboard.\n\n' +
      'Polls close automatically after the window you pick; the results stay up for everyone.',
    actions: [{ label: 'Got it', style: 'default', testID: 'poll-info-dismiss' }],
  });
};

const DEFAULT_CLOSE_WINDOW_DAYS = 7;
const CLOSE_WINDOW_OPTIONS: ReadonlyArray<{ label: string; value: number }> = [
  { label: '3 days', value: 3 },
  { label: '1 week', value: 7 },
  { label: '2 weeks', value: 14 },
];

type UsePollCreationPanelSpecOptions = {
  visible: boolean;
  placeName?: string | null;
  bounds?: MapBounds | null;
  searchBarTop?: number;
  snapPoints?: SnapPoints;
  onClose: () => void;
  onCreated: (poll: Poll) => void;
};

// The header (place-aware title + close action) no longer rides this spec — it is extracted to
// the persistent-header descriptor below (P3), which re-sources the place from the pollCreation
// route params. `placeName` stays on the options contract for the callers; the spec itself only
// consumes what the BODY (submit flow) needs.
export const usePollCreationPanelSpec = ({
  visible,
  bounds,
  searchBarTop = 0,
  snapPoints: snapPointsOverride,
  onClose,
  onCreated,
}: UsePollCreationPanelSpecOptions): SearchRoutePublishedSceneParts => {
  const insets = useSafeAreaInsets();
  // §J: the bottom tab bar leaves via the DERIVED nav-out rule (child scene ⇒ nav out), so
  // the pinned Publish chin has the bottom band to itself and isn't covered by the nav.
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
    if (!bounds) {
      showAppModal({
        title: 'Pick an area',
        message: 'Move the map to the area you want to ask about before creating a poll.',
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
      // Place-scoped: the server resolves the dedupe scope from the viewport bounds.
      const { matches } = await checkPollDuplicate({ question: trimmedQuestion, bounds });
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

      const payload: CreatePollPayload = {
        question: trimmedQuestion,
        bounds,
        description: description.trim() || undefined,
        closeWindowDays,
      };
      const poll = await createPoll(payload);
      onCreated(poll);
    } catch (error) {
      announceFailureIfOnline();
    } finally {
      setSubmitting(false);
    }
  }, [bounds, closeWindowDays, description, onClose, onCreated, pushRoute, question]);

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

      {/* §8.3/§9b pollInfo — the ⓘ "how polls work" explainer, THE one app modal. */}
      <Pressable
        onPress={showPollInfoModal}
        accessibilityRole="button"
        accessibilityLabel="How polls work"
        style={styles.pollInfoLink}
        testID="poll-info-link"
        hitSlop={8}
      >
        <Text variant="caption" weight="semibold" style={styles.pollInfoLinkText}>
          How do polls work?
        </Text>
      </Pressable>
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
      // P3: the poll-creation header is the persistent-header descriptor (registered below) —
      // the per-scene header lane stays NULL (shape-preserving; other chrome surfaces stay).
      headerComponent: null,
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

// ─── Persistent header descriptor (P3, page-switch-master-plan.md §6-P3) ────────────────────
// The poll-creation header is extracted OUT of the panel spec into the hoisted persistent chrome
// (PersistentSheetHeaderHost). The place-aware title re-sources placeName (the feed's place
// verdict snapshot) from the SAME place the panel spec got it — the active pollCreation route's
// params (the exact polls-parent guard useSearchRoutePollCreationSceneStateRuntime applies) —
// read live from the route-overlay navigation authority. The last resolved label is LATCHED
// while the header outlives the route for a dismiss frame, so the title never flickers to the
// fallback mid-close.

type PollCreationHeaderPlace = {
  placeName: string | null;
};

const EMPTY_POLL_CREATION_HEADER_PLACE: PollCreationHeaderPlace = {
  placeName: null,
};

const resolvePollCreationHeaderPlace = (
  route: OverlayRouteEntry
): PollCreationHeaderPlace | null => {
  if (route.key !== 'pollCreation') {
    return null;
  }
  const params = route.params as OverlayRouteEntry<'pollCreation'>['params'];
  if (params?.parentSceneKey !== 'polls' || params?.ownerSceneKey !== 'polls') {
    return null;
  }
  return {
    placeName: params?.placeName ?? null,
  };
};

const arePollCreationHeaderPlacesEqual = (
  left: PollCreationHeaderPlace | null,
  right: PollCreationHeaderPlace | null
): boolean =>
  left === right || (left != null && right != null && left.placeName === right.placeName);

const usePollCreationHeaderPlace = (): PollCreationHeaderPlace => {
  const { routeOverlayNavigationAuthority } = useAppRouteSceneRuntime();
  const [place, setPlace] = React.useState<PollCreationHeaderPlace>(
    () =>
      resolvePollCreationHeaderPlace(
        routeOverlayNavigationAuthority.getSnapshot().activeOverlayRoute
      ) ?? EMPTY_POLL_CREATION_HEADER_PLACE
  );
  React.useEffect(
    () =>
      routeOverlayNavigationAuthority.registerTarget({
        selector: (snapshot) => resolvePollCreationHeaderPlace(snapshot.activeOverlayRoute),
        syncNavigationSnapshot: (_snapshot, resolved) => {
          // LATCH: null (another route is active) keeps the last pollCreation place so the title
          // holds steady on dismiss frames; a fresh pollCreation route always overwrites it.
          if (resolved != null) {
            setPlace((previous) =>
              arePollCreationHeaderPlacesEqual(previous, resolved) ? previous : resolved
            );
          }
        },
        isEqual: arePollCreationHeaderPlacesEqual,
        attributionLabel: 'PollCreationPersistentHeaderTitle',
      }),
    [routeOverlayNavigationAuthority]
  );
  return place;
};

const PollCreationPersistentHeaderTitle = React.memo(() => {
  const { placeName } = usePollCreationHeaderPlace();
  // HEADER SUBJECT-STORE (ratified 2026-07-21): the creation place label reads
  // the ONE client subject verdict once committed — the route-param
  // placeName (creation-context snapshot) is only the pre-first-commit
  // fallback, so the title names where the map actually IS, not where the
  // feed last fetched.
  const { verdict: subjectVerdict } = useViewportSubjectState();
  const headerTitle = subjectVerdict
    ? subjectVerdict.kind === 'place'
      ? `Add a poll in ${subjectVerdict.placeName}`
      : 'Add a poll near here'
    : placeName?.trim()
      ? `Add a poll in ${placeName.trim()}`
      : 'Add a poll near here';
  return <ChromeTitleText>{toSingleLineText(headerTitle)}</ChromeTitleText>;
});
PollCreationPersistentHeaderTitle.displayName = 'PollCreationPersistentHeaderTitle';

// Leg 6 (§4 HeaderNavAction): the per-scene close factory is DELETED — the persistent header
// host owns the ONE plus↔X control; children get the X + the canonical close by role derivation.
registerPersistentHeaderDescriptor('pollCreation', {
  Title: PollCreationPersistentHeaderTitle,
});

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
  section: {
    marginBottom: 16,
  },
  pollInfoLink: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  pollInfoLinkText: {
    color: themeColors.textMuted,
    textDecorationLine: 'underline',
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
