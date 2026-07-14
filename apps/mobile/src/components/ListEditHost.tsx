import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { Text } from './ui/Text';
import { announceFailureIfOnline } from './app-modal-store';
import {
  closeListEdit,
  getListEditPayload,
  subscribeListEdit,
  type ListEditPayload,
} from './list-edit-store';
import { colors as themeColors } from '../constants/theme';
import { favoriteListKeys } from '../hooks/use-favorite-lists';
import { favoriteListsService, type FavoriteListVisibility } from '../services/favorite-lists';
import OverlayModalSheet from '../overlays/OverlayModalSheet';
import SquircleSpinner from './SquircleSpinner';

// ─── The ONE listEdit panel (wave-3 §4 — registry `listEdit`, create-vs-edit) ────────────────
// Root host (score-info / collaborator-modal pattern) so the sheet is viewport-anchored on
// every surface. ONE parameterized form: mode 'create' (home plus, needs the side) or
// mode 'edit' (per-list ellipsis "Edit", prefilled). Name / description / visibility —
// the home popup create-form is deleted; ListDetail's "Rename" row routes here.

const FORM_BORDER = '#e2e8f0';
const INK = '#0f172a';
const SUBTLE = '#64748b';

type FormState = {
  name: string;
  description: string;
  visibility: FavoriteListVisibility;
};

const initialFormFor = (payload: ListEditPayload): FormState =>
  payload.mode === 'edit'
    ? {
        name: payload.name,
        description: payload.description ?? '',
        visibility: payload.visibility,
      }
    : { name: '', description: '', visibility: 'private' };

const ListEditForm: React.FC<{ payload: ListEditPayload }> = ({ payload }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<FormState>(() => initialFormFor(payload));
  const [isSaving, setIsSaving] = React.useState(false);
  const canSave = form.name.trim().length > 0 && !isSaving;

  const handleSave = React.useCallback(async () => {
    const name = form.name.trim();
    if (!name || isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      if (payload.mode === 'create') {
        await favoriteListsService.create({
          name,
          description: form.description.trim() || undefined,
          listType: payload.listType,
          visibility: form.visibility,
        });
      } else {
        await favoriteListsService.update(payload.listId, {
          name,
          description: form.description.trim(),
          visibility: form.visibility,
        });
      }
    } catch {
      setIsSaving(false);
      announceFailureIfOnline();
      return;
    }
    await queryClient.invalidateQueries({ queryKey: favoriteListKeys.all });
    if (payload.mode === 'edit') {
      await queryClient.invalidateQueries({ queryKey: ['listDetail', payload.listId] });
    }
    setIsSaving(false);
    closeListEdit();
  }, [form, isSaving, payload, queryClient]);

  return (
    <View testID="list-edit-form">
      <Text variant="subtitle" weight="semibold" style={styles.title}>
        {payload.mode === 'create' ? 'Create list' : 'Edit list'}
      </Text>
      <TextInput
        value={form.name}
        onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))}
        placeholder="List name"
        placeholderTextColor={SUBTLE}
        style={styles.input}
        autoFocus={payload.mode === 'create'}
        testID="list-edit-name-input"
      />
      <TextInput
        value={form.description}
        onChangeText={(value) => setForm((prev) => ({ ...prev, description: value }))}
        placeholder="Description (optional)"
        placeholderTextColor={SUBTLE}
        style={[styles.input, styles.inputMultiline]}
        multiline
        testID="list-edit-description-input"
      />
      <View style={styles.visibilityRow}>
        <Text variant="caption" style={styles.visibilityLabel}>
          Visibility
        </Text>
        <View style={styles.visibilityToggle}>
          {(['private', 'public'] as FavoriteListVisibility[]).map((value) => {
            const isActive = form.visibility === value;
            return (
              <Pressable
                key={value}
                onPress={() => setForm((prev) => ({ ...prev, visibility: value }))}
                style={[styles.visibilityOption, isActive && styles.visibilityOptionActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  variant="caption"
                  weight="semibold"
                  style={[
                    styles.visibilityOptionText,
                    isActive && styles.visibilityOptionTextActive,
                  ]}
                >
                  {value === 'private' ? 'Private' : 'Public'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={closeListEdit}
          style={styles.cancelButton}
          accessibilityRole="button"
          testID="list-edit-cancel"
        >
          <Text variant="caption" weight="semibold" style={styles.cancelText}>
            Cancel
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void handleSave()}
          disabled={!canSave}
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          accessibilityRole="button"
          testID="list-edit-save"
        >
          {isSaving ? (
            <SquircleSpinner size={16} color="#ffffff" />
          ) : (
            <Text variant="caption" weight="semibold" style={styles.saveText}>
              {payload.mode === 'create' ? 'Create' : 'Save'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
};

export const ListEditHost: React.FC = () => {
  const payload = React.useSyncExternalStore(subscribeListEdit, getListEditPayload, () => null);
  // Keep the last payload through the exit animation so content doesn't blank
  // mid-slide-out (the ScoreInfoHost pattern).
  const lastPayloadRef = React.useRef(payload);
  if (payload != null) {
    lastPayloadRef.current = payload;
  }
  const renderedPayload = payload ?? lastPayloadRef.current;
  if (renderedPayload == null) {
    return null;
  }
  return (
    <OverlayModalSheet visible={payload != null} onRequestClose={closeListEdit}>
      {/* Remount the form per open so prefills never leak across sessions. */}
      <ListEditForm
        key={
          renderedPayload.mode === 'edit'
            ? `edit-${renderedPayload.listId}`
            : `create-${renderedPayload.listType}`
        }
        payload={renderedPayload}
      />
    </OverlayModalSheet>
  );
};

const styles = StyleSheet.create({
  title: {
    color: INK,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: FORM_BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: INK,
    marginBottom: 10,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  visibilityRow: {
    marginTop: 4,
    marginBottom: 12,
  },
  visibilityLabel: {
    color: SUBTLE,
    marginBottom: 6,
  },
  visibilityToggle: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    padding: 4,
  },
  visibilityOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 999,
  },
  visibilityOptionActive: {
    backgroundColor: INK,
  },
  visibilityOptionText: {
    color: SUBTLE,
  },
  visibilityOptionTextActive: {
    color: '#ffffff',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cancelText: {
    color: INK,
  },
  saveButton: {
    backgroundColor: themeColors.primary,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 999,
    minWidth: 76,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveText: {
    color: '#ffffff',
  },
});
