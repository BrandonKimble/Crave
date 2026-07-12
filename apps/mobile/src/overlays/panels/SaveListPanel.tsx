import React from 'react';
import type { MountedSceneBodyProps } from '../BottomSheetSceneStackMountedBodyRegistry';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useSharedValue } from 'react-native-reanimated';
import { SegmentedToggle, Text } from '../../components';
import { colors as themeColors } from '../../constants/theme';
import OverlayHeaderActionButton from '../OverlayHeaderActionButton';
import { registerPersistentHeaderDescriptor } from '../../navigation/runtime/app-route-persistent-header-registry';
import {
  favoriteListsService,
  type FavoriteListSummary,
  type FavoriteListType,
  type FavoriteListVisibility,
} from '../../services/favorite-lists';
import { useFavoriteLists, favoriteListKeys } from '../../hooks/use-favorite-lists';
import { useBottomSheetSceneStackBodyDataActivity } from '../BottomSheetSceneStackBodyActivityContext';
import { useAppRouteSceneRuntime } from '../../navigation/runtime/AppRouteSceneRuntimeProvider';
import { useRouteAuthoritySelector } from '../../navigation/runtime/use-route-authority-selector';
import type { AppRouteOverlayCommandSnapshot } from '../../navigation/runtime/app-route-overlay-command-controller';
import type { AppOverlaySaveListTarget } from '../../navigation/runtime/app-overlay-route-types';
import { useDeferredSceneDataLane } from './useDeferredSceneDataLane';
import { SceneLoadingSurface } from '../../components/skeletons';

const ACTIVE_TAB_COLOR = themeColors.primary;
const ROW_GAP = 12;
const ROW_RADIUS = 16;
const ROW_BORDER = '#e2e8f0';
const ROW_BG = '#f8fafc';
const ROW_TEXT = '#0f172a';
const ROW_SUBTEXT = themeColors.textBody;
const FORM_BORDER = '#e2e8f0';
const FORM_PLACEHOLDER = themeColors.textBody;

type ListFormState = {
  mode: 'hidden' | 'create';
  name: string;
  description: string;
  visibility: FavoriteListVisibility;
};

const selectSaveSheetListType = (snapshot: AppRouteOverlayCommandSnapshot) =>
  snapshot.saveSheetState.listType;

const selectSaveSheetState = (snapshot: AppRouteOverlayCommandSnapshot) => snapshot.saveSheetState;

// ---------------------------------------------------------------------------
// Save-sheet SIDE store (page-registry §8.8): the sheet is dynamically
// two-sided — it opens on the trigger's side but the user can flip via the
// segmented switch. The flip is PANEL-LOCAL state, yet the persistent header
// title (mounted in the hoisted PersistentSheetHeaderHost, a different tree)
// must track it. This tiny module store bridges the two without touching the
// navigation-runtime overlay-command state (owned elsewhere): the panel body
// writes it, the header title subscribes; null = no override (trigger side).
// ---------------------------------------------------------------------------
type SaveSheetSideListener = () => void;
const VISIBILITY_OPTIONS = [
  { label: 'Private', value: 'private' },
  { label: 'Public', value: 'public' },
] as const satisfies readonly { label: string; value: FavoriteListVisibility }[];

const SIDE_SWITCH_OPTIONS = [
  { label: 'Restaurants', value: 'restaurant' },
  { label: 'Dishes', value: 'dish' },
] as const satisfies readonly { label: string; value: FavoriteListType }[];

let saveSheetSideOverride: FavoriteListType | null = null;
const saveSheetSideListeners = new Set<SaveSheetSideListener>();
const saveSheetSideStore = {
  get: (): FavoriteListType | null => saveSheetSideOverride,
  set: (next: FavoriteListType | null): void => {
    if (saveSheetSideOverride === next) {
      return;
    }
    saveSheetSideOverride = next;
    saveSheetSideListeners.forEach((listener) => listener());
  },
  subscribe: (listener: SaveSheetSideListener): (() => void) => {
    saveSheetSideListeners.add(listener);
    return () => {
      saveSheetSideListeners.delete(listener);
    };
  },
};

// P3 persistent header (page-switch-master-plan.md §6-P3): the save-list header CONTENT mounts
// inside the hoisted PersistentSheetHeaderHost, NOT inside this panel — the title reads the
// overlay-command authority (plus the panel-local side override above) and the close semantics
// come from the overlay-command actions in the Action slot.

const SaveListPersistentHeaderTitle = React.memo(() => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const triggerListType = useRouteAuthoritySelector({
    subscribe: routeSceneRuntime.routeOverlayCommandAuthority.subscribe,
    getSnapshot: routeSceneRuntime.routeOverlayCommandAuthority.getSnapshot,
    selector: selectSaveSheetListType,
  });
  const sideOverride = React.useSyncExternalStore(
    saveSheetSideStore.subscribe,
    saveSheetSideStore.get
  );
  const listType = sideOverride ?? triggerListType;
  return (
    <View style={styles.headerTextGroup}>
      <Text
        variant="title"
        weight="semibold"
        style={styles.headerTitle}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        Save to {listType === 'restaurant' ? 'Restaurants' : 'Dishes'}
      </Text>
    </View>
  );
});

SaveListPersistentHeaderTitle.displayName = 'SaveListPersistentHeaderTitle';

const SaveListPersistentHeaderAction = React.memo(() => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const { handleCloseSaveSheet } = routeSceneRuntime.routeOverlayCommandActions;
  const headerActionProgress = useSharedValue(0);

  const onClose = React.useCallback(() => {
    handleCloseSaveSheet();
  }, [handleCloseSaveSheet]);

  return (
    <OverlayHeaderActionButton
      progress={headerActionProgress}
      onPress={onClose}
      accessibilityLabel="Close save sheet"
      accentColor={ACTIVE_TAB_COLOR}
      closeColor="#000000"
    />
  );
});

SaveListPersistentHeaderAction.displayName = 'SaveListPersistentHeaderAction';

// Module-scope registration (house pattern — origin-scene-live-state-registry).
registerPersistentHeaderDescriptor('saveList', {
  Title: SaveListPersistentHeaderTitle,
  Action: SaveListPersistentHeaderAction,
});

/**
 * Resolve the addItem payload target for the CURRENT side (§8.8):
 * - side matches the trigger → the trigger target as-is.
 * - dish trigger flipped to the RESTAURANT side → the save target becomes the
 *   restaurant OF THE TRIGGERING DISH: send the connectionId; the API resolves
 *   it to the connection's restaurant on restaurant lists.
 * - restaurant trigger flipped to the DISH side → no dish is derivable from a
 *   restaurant; returns null (rows still browse, saving is disabled w/ hint).
 */
const resolveTargetForSide = (
  side: FavoriteListType,
  target: AppOverlaySaveListTarget | null
): { restaurantId?: string; connectionId?: string } | null => {
  if (!target) {
    return null;
  }
  if (side === 'restaurant') {
    if (target.restaurantId) {
      return { restaurantId: target.restaurantId };
    }
    if (target.connectionId) {
      return { connectionId: target.connectionId };
    }
    return null;
  }
  return target.connectionId ? { connectionId: target.connectionId } : null;
};

type SaveListRowProps = {
  item: FavoriteListSummary;
  selected: boolean;
  note: string;
  onSelect: (listId: string) => void;
  onNoteChange: (value: string) => void;
};

const SaveListRow = React.memo(
  ({ item, selected, note, onSelect, onNoteChange }: SaveListRowProps) => (
    <View style={[styles.row, selected && styles.rowSelected]}>
      <Pressable
        onPress={() => onSelect(item.listId)}
        style={({ pressed }) => [styles.rowPressable, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        <View style={styles.rowTextGroup}>
          <Text variant="body" weight="semibold" style={styles.rowTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <Text variant="caption" style={styles.rowCount}>
            {item.itemCount === 1 ? '1 item' : `${item.itemCount} items`}
          </Text>
        </View>
        <Feather
          name={selected ? 'check-circle' : 'circle'}
          size={20}
          color={selected ? ACTIVE_TAB_COLOR : ROW_SUBTEXT}
        />
      </Pressable>
      {selected ? (
        <TextInput
          value={note}
          onChangeText={onNoteChange}
          placeholder="Add a note (optional)"
          placeholderTextColor={FORM_PLACEHOLDER}
          style={styles.noteInput}
          multiline
        />
      ) : null}
    </View>
  )
);

SaveListRow.displayName = 'SaveListRow';

export const SaveListMountedSceneBody = React.memo((_props: MountedSceneBodyProps) => {
  const { shouldRunDataLane } = useBottomSheetSceneStackBodyDataActivity();
  const queryClient = useQueryClient();
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const saveSheetState = useRouteAuthoritySelector({
    subscribe: routeSceneRuntime.routeOverlayCommandAuthority.subscribe,
    getSnapshot: routeSceneRuntime.routeOverlayCommandAuthority.getSnapshot,
    selector: selectSaveSheetState,
  });
  const { handleCloseSaveSheet } = routeSceneRuntime.routeOverlayCommandActions;
  const [formState, setFormState] = React.useState<ListFormState>({
    mode: 'hidden',
    name: '',
    description: '',
    visibility: 'private',
  });
  const triggerListType = saveSheetState.listType;
  const target = saveSheetState.target;
  const routeInstanceId = saveSheetState.routeInstanceId;

  // Panel-local funnel state: the flipped side, the selected row, its note,
  // and the in-flight latch. Render-time reset keyed on routeInstanceId (the
  // derived-state pattern — a NEW save funnel must not inherit the previous
  // one's flip/selection).
  const [side, setSide] = React.useState<FavoriteListType>(triggerListType);
  const [selectedListId, setSelectedListId] = React.useState<string | null>(null);
  const [note, setNote] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [seenRouteInstanceId, setSeenRouteInstanceId] = React.useState(routeInstanceId);
  if (seenRouteInstanceId !== routeInstanceId) {
    setSeenRouteInstanceId(routeInstanceId);
    setSide(triggerListType);
    setSelectedListId(null);
    setNote('');
    setIsSaving(false);
    setFormState({ mode: 'hidden', name: '', description: '', visibility: 'private' });
  }

  // Publish the side to the persistent-header title store (render-time write
  // is safe: idempotent set + the header subscribes, it never writes back).
  saveSheetSideStore.set(side === triggerListType ? null : side);
  React.useEffect(
    () => () => {
      saveSheetSideStore.set(null);
    },
    []
  );

  const queryEnabled = useDeferredSceneDataLane(shouldRunDataLane);
  const listsQuery = useFavoriteLists({
    listType: side,
    enabled: queryEnabled,
    subscribed: queryEnabled,
  });
  // Server order IS the row order (§8.8): system defaults first (fixed rank),
  // then the user's custom home order if set, else recently updated.
  const lists = listsQuery.data ?? [];
  const isListsLoading = !queryEnabled || (listsQuery.isLoading && lists.length === 0);
  const isListsError = listsQuery.isError && lists.length === 0;

  const sideTarget = resolveTargetForSide(side, target);
  const canSaveOnThisSide = sideTarget != null;

  const onClose = React.useCallback(() => {
    handleCloseSaveSheet();
  }, [handleCloseSaveSheet]);

  const resetForm = React.useCallback(() => {
    setFormState({
      mode: 'hidden',
      name: '',
      description: '',
      visibility: 'private',
    });
  }, []);

  const handleNameChange = React.useCallback((value: string) => {
    setFormState((prev) => ({ ...prev, name: value }));
  }, []);

  const handleDescriptionChange = React.useCallback((value: string) => {
    setFormState((prev) => ({ ...prev, description: value }));
  }, []);

  const handleVisibilityChange = React.useCallback((value: FavoriteListVisibility) => {
    setFormState((prev) => ({ ...prev, visibility: value }));
  }, []);

  const handleOpenCreateForm = React.useCallback(() => {
    setFormState((prev) => ({ ...prev, mode: 'create' }));
  }, []);

  const handleSideChange = React.useCallback((nextSide: FavoriteListType) => {
    setSide(nextSide);
    // A flipped side is a different list universe — the selection can't carry.
    setSelectedListId(null);
  }, []);

  const handleSelectList = React.useCallback((listId: string) => {
    setSelectedListId((prev) => (prev === listId ? null : listId));
  }, []);

  const commitAdd = React.useCallback(
    async (listId: string) => {
      if (!sideTarget || isSaving) {
        return;
      }
      setIsSaving(true);
      try {
        await favoriteListsService.addItem(listId, {
          ...sideTarget,
          note: note.trim() ? note.trim() : undefined,
        });
        await queryClient.invalidateQueries({ queryKey: favoriteListKeys.all });
        await queryClient.invalidateQueries({ queryKey: ['entityMemberships'] });
        onClose();
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, note, onClose, queryClient, sideTarget]
  );

  const handleConfirmSave = React.useCallback(() => {
    if (!selectedListId) {
      return;
    }
    void commitAdd(selectedListId);
  }, [commitAdd, selectedListId]);

  const handleCreateList = React.useCallback(async () => {
    if (!sideTarget || !formState.name.trim() || isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      const created = await favoriteListsService.create({
        name: formState.name,
        description: formState.description,
        listType: side,
        visibility: formState.visibility,
      });
      await favoriteListsService.addItem(created.listId, {
        ...sideTarget,
        note: note.trim() ? note.trim() : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: favoriteListKeys.all });
      await queryClient.invalidateQueries({ queryKey: ['entityMemberships'] });
      resetForm();
      onClose();
    } finally {
      setIsSaving(false);
    }
  }, [formState, isSaving, note, onClose, queryClient, resetForm, side, sideTarget]);

  return (
    <View style={styles.sceneBody}>
      {/* THE house toggle primitive (plans/toggle-strip-primitive.md): press-up unbounded,
          whole-control tap flips. Replaces the hand-rolled sideOption pill pair. */}
      <SegmentedToggle
        options={SIDE_SWITCH_OPTIONS}
        value={side}
        onChange={(value) => handleSideChange(value)}
        accessibilityLabel="Toggle save target between restaurants and dishes"
      />
      {!canSaveOnThisSide ? (
        <Text variant="caption" style={styles.sideHint}>
          {side === 'dish'
            ? 'A restaurant save has no dish to add — flip back to Restaurants, or save from a dish card.'
            : 'Nothing to save on this side.'}
        </Text>
      ) : null}
      {formState.mode === 'hidden' ? (
        <Pressable onPress={handleOpenCreateForm} style={styles.newListRow}>
          <View style={styles.newListIcon}>
            <Feather name="plus" size={18} color={ROW_SUBTEXT} />
          </View>
          <Text variant="body" weight="semibold" style={styles.newListText}>
            New list
          </Text>
        </Pressable>
      ) : (
        <View style={styles.formPanel}>
          <Text variant="subtitle" weight="semibold" style={styles.formTitle}>
            Create list
          </Text>
          <TextInput
            value={formState.name}
            onChangeText={handleNameChange}
            placeholder="List name"
            placeholderTextColor={FORM_PLACEHOLDER}
            style={styles.formInput}
          />
          <TextInput
            value={formState.description}
            onChangeText={handleDescriptionChange}
            placeholder="Description (optional)"
            placeholderTextColor={FORM_PLACEHOLDER}
            style={[styles.formInput, styles.formInputMultiline]}
            multiline
          />
          <View style={styles.visibilityRow}>
            <Text variant="caption" style={styles.visibilityLabel}>
              Visibility
            </Text>
            <SegmentedToggle
              options={VISIBILITY_OPTIONS}
              value={formState.visibility}
              onChange={(value) => handleVisibilityChange(value)}
              accessibilityLabel="Toggle list visibility between private and public"
            />
          </View>
          <View style={styles.formActions}>
            <Pressable onPress={resetForm} style={styles.formCancel}>
              <Text variant="caption" weight="semibold" style={styles.formCancelText}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void handleCreateList()}
              style={[styles.formSave, !canSaveOnThisSide && styles.saveButtonDisabled]}
              disabled={!canSaveOnThisSide || isSaving}
            >
              <Text variant="caption" weight="semibold" style={styles.formSaveText}>
                Save
              </Text>
            </Pressable>
          </View>
        </View>
      )}
      {isListsLoading ? (
        // Row skeleton; inherits the 20px horizontal inset from the body
        // transport's contentContainer, so no extra insetX (see the tile-grid
        // double-pad gotcha that used to live here).
        <SceneLoadingSurface rowType="history" insetX={0} frostBacking />
      ) : lists.length ? (
        <View style={styles.rowList}>
          {lists.map((item) => (
            <SaveListRow
              key={item.listId}
              item={item}
              selected={selectedListId === item.listId}
              note={note}
              onSelect={handleSelectList}
              onNoteChange={setNote}
            />
          ))}
        </View>
      ) : isListsError ? (
        <View style={styles.emptyState}>
          <Text variant="body" style={styles.emptyText}>
            Couldn&apos;t load your lists
          </Text>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text variant="body" style={styles.emptyText}>
            No lists yet
          </Text>
        </View>
      )}
      {selectedListId ? (
        <Pressable
          onPress={handleConfirmSave}
          disabled={!canSaveOnThisSide || isSaving}
          style={[styles.saveButton, (!canSaveOnThisSide || isSaving) && styles.saveButtonDisabled]}
          accessibilityRole="button"
        >
          <Text variant="body" weight="semibold" style={styles.saveButtonText}>
            {isSaving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

SaveListMountedSceneBody.displayName = 'SaveListMountedSceneBody';

const styles = StyleSheet.create({
  sceneBody: {
    gap: ROW_GAP,
  },
  headerTextGroup: {
    flex: 1,
    paddingRight: 12,
  },
  headerTitle: {
    color: '#0f172a',
  },
  sideHint: {
    color: ROW_SUBTEXT,
  },
  rowList: {
    gap: ROW_GAP,
  },
  row: {
    backgroundColor: ROW_BG,
    borderRadius: ROW_RADIUS,
    borderWidth: 1,
    borderColor: ROW_BORDER,
  },
  rowSelected: {
    borderColor: ACTIVE_TAB_COLOR,
  },
  rowPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  rowPressed: {
    opacity: 0.85,
  },
  rowTextGroup: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: ROW_TEXT,
  },
  rowCount: {
    color: ROW_SUBTEXT,
  },
  noteInput: {
    borderTopWidth: 1,
    borderTopColor: ROW_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: ROW_TEXT,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  newListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: ROW_RADIUS,
    borderWidth: 1,
    borderColor: ROW_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  newListIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: ROW_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newListText: {
    color: ROW_SUBTEXT,
  },
  formPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: FORM_BORDER,
    padding: 16,
  },
  formTitle: {
    color: ROW_TEXT,
    marginBottom: 12,
  },
  formInput: {
    borderWidth: 1,
    borderColor: FORM_BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: ROW_TEXT,
    marginBottom: 10,
  },
  formInputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  visibilityLabel: {
    color: ROW_SUBTEXT,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  formCancel: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  formCancelText: {
    color: ROW_SUBTEXT,
  },
  formSave: {
    backgroundColor: ROW_TEXT,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  formSaveText: {
    color: '#ffffff',
  },
  saveButton: {
    backgroundColor: ROW_TEXT,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#ffffff',
  },
  emptyState: {
    paddingVertical: 24,
  },
  emptyText: {
    color: ROW_SUBTEXT,
  },
});
