import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RotateCcw, RotateCw } from 'lucide-react-native';

import { Text } from '../components/ui/Text';
import SquircleSpinner from '../components/SquircleSpinner';
import { colors as themeColors } from '../constants/theme';

// ─── The ONE edit-mode action row (wave-3 §1.1/§2.8 — both reorder surfaces) ─────────────────
// Content for the ToggleStrip engine's action-row slot: Cancel-left · undo/redo-center ·
// Save-right, spread by the engine's space-between static layer.
//
// CONTRACT (leg-11 sim RED, root-caused): the engine wraps each DIRECT child of `actionRow`
// in its own hole slot via React.Children.toArray — which does NOT see through a component
// element or a fragment. So this is a plain FUNCTION returning the controls as an ARRAY of
// keyed siblings, exactly how the toggle row's children are passed.
//
// VISUAL SPEC (wave-3 §2.8 — the owner's original wave-2 action-row styling):
//   Cancel = BLACK text · undo/redo = a ROUNDED CUTOUT PILL (its window is pill-shaped via
//   the engine's per-slot `stripHoleBorderRadius` convention) · Save = PRIMARY-RED text.
//   The middle slot shows the "Edit lists" LABEL (plain chrome on the white plate — no
//   cutout, `stripHoleDisabled`) until the FIRST edit drops; then the label snaps out and
//   the undo/redo pill's cutout FADES in white → clear (`stripHoleFadeIn` — the engine
//   mounts a congruent cover rect over the fresh window and animates it clear).

/** Swallows the engine convention props (read off the element, never forwarded native). */
const EditHistoryPillGroup = ({
  children,
}: {
  children: React.ReactNode;
  stripHoleBorderRadius?: number;
  stripHoleFadeIn?: boolean;
}) => <View style={styles.middlePill}>{children}</View>;

/** Pre-first-edit middle slot: a plain label ON the plate (no cutout window). */
const EditListsLabel = (_props: { stripHoleDisabled?: boolean }) => (
  <View style={styles.middleLabel}>
    <Text variant="caption" weight="semibold" style={styles.middleLabelText}>
      Edit lists
    </Text>
  </View>
);

export const buildEditModeActionRow = ({
  onCancelEdit,
  onUndo,
  onRedo,
  onSaveEdit,
  canUndo,
  canRedo,
  hasEverEdited,
  isSaving,
  testIDPrefix,
}: {
  onCancelEdit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSaveEdit: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** True once the session's history holds ANY entry — flips the label to the pill. */
  hasEverEdited: boolean;
  isSaving: boolean;
  testIDPrefix: string;
}): React.ReactNode[] => [
  <Pressable
    key="cancel"
    onPress={onCancelEdit}
    accessibilityRole="button"
    accessibilityLabel="Cancel reordering"
    style={styles.textButton}
    testID={`${testIDPrefix}-edit-cancel`}
  >
    <Text variant="caption" weight="semibold" style={styles.cancelText}>
      Cancel
    </Text>
  </Pressable>,
  !hasEverEdited ? (
    <EditListsLabel key="history-label" stripHoleDisabled />
  ) : (
    <EditHistoryPillGroup key="history" stripHoleBorderRadius={999} stripHoleFadeIn>
      <Pressable
        onPress={onUndo}
        disabled={!canUndo}
        accessibilityRole="button"
        accessibilityLabel="Undo move"
        hitSlop={6}
        style={styles.iconButton}
        testID={`${testIDPrefix}-edit-undo`}
      >
        <RotateCcw size={18} color={canUndo ? '#0f172a' : '#cbd5e1'} strokeWidth={2} />
      </Pressable>
      <Pressable
        onPress={onRedo}
        disabled={!canRedo}
        accessibilityRole="button"
        accessibilityLabel="Redo move"
        hitSlop={6}
        style={styles.iconButton}
        testID={`${testIDPrefix}-edit-redo`}
      >
        <RotateCw size={18} color={canRedo ? '#0f172a' : '#cbd5e1'} strokeWidth={2} />
      </Pressable>
    </EditHistoryPillGroup>
  ),
  <Pressable
    key="save"
    onPress={onSaveEdit}
    disabled={isSaving}
    accessibilityRole="button"
    accessibilityLabel="Save order"
    style={[styles.textButton, styles.saveButton]}
    testID={`${testIDPrefix}-edit-save`}
  >
    {isSaving ? (
      <SquircleSpinner size={16} color={themeColors.primary} />
    ) : (
      <Text variant="caption" weight="semibold" style={styles.saveText}>
        Save
      </Text>
    )}
  </Pressable>,
];

const styles = StyleSheet.create({
  textButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cancelText: {
    color: '#0f172a',
  },
  middleLabel: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  middleLabelText: {
    color: '#64748b',
  },
  middlePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 999,
  },
  iconButton: {
    padding: 6,
  },
  saveButton: {
    minWidth: 64,
    alignItems: 'center',
  },
  saveText: {
    color: themeColors.primary,
  },
});
