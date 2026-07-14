import React from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import type { ImagePickerAsset } from 'expo-image-picker';

import { Text } from '../../components';
import type { MountedSceneBodyProps } from '../BottomSheetSceneStackMountedBodyRegistry';
import { registerPersistentHeaderDescriptor } from '../../navigation/runtime/app-route-persistent-header-registry';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useAppRouteSceneRuntime } from '../../navigation/runtime/AppRouteSceneRuntimeProvider';
import { peekPostPhotosAssets, releasePostPhotosAssets } from '../postPhotosPendingAssets';
import { photosService, PhotoUploadError } from '../../services/photos';
import { requestPushPermissionIfEligible } from '../../services/push-permission';
import { searchService } from '../../services/search';
import { autocompleteService } from '../../services/autocomplete';
import { openPhotoSourceForAssets } from '../PostPhotosFunnelHost';
import type { FoodResult } from '../../types';
import SquircleSpinner from '../../components/SquircleSpinner';

// ─── postPhotos — THE post page (W2; plans/page-registry.md §7.4) ────────────────────────────
// The funnel terminal: opens AFTER the 2-option modal + picker/camera produced assets (the
// PostPhotosFunnelHost stashes them in the pending-assets store; the sessionNonce param is the
// key). Child-page pattern copy of ListDetailPanel: entry BY PROP, mounted body, persistent
// header, honest failure body.
//
// Shape: photo row (selected assets as thumbnails, tap to select) → per-photo DISH ASSIGNMENT
// (inline ranked dish list of the restaurant, typeahead filter, "Other…" free-text final row —
// the demand signal, sent as pendingDishName) → PUBLIC/PRIVATE control → POST (per-photo
// optimistic upload states with retry) → all-done, funnel collapses to the trigger.
//
// Multi-restaurant sections (own-profile entry, W3): state is already sections[] with ONE
// section so the "Add another restaurant" loop lands without a rewrite.
//
// Visibility (§7.4): the Public/Private control maps to the ticket's `visibility` field —
// private photos surface only to the uploader (own food log / own reads); every public read
// surface excludes them server-side.

type PostPhotosParams = {
  restaurantId?: string | null;
  restaurantName?: string | null;
  dishId?: string | null;
  dishName?: string | null;
  sessionNonce?: string | null;
};

type PhotoDraftStatus = 'draft' | 'uploading' | 'done' | 'failed';

type PhotoDraft = {
  id: string;
  asset: ImagePickerAsset;
  /** Assigned dish (connectionId + display name), or null = the general/"vibes" bucket. */
  dish: { connectionId: string; foodName: string } | null;
  /** "Other…" free-text dish name — the demand signal (pendingDishName on the ticket). */
  otherDishName: string | null;
  /** Set once the Cloudinary upload succeeded (confirm-stage failure): the photo
   *  EXISTS server-side — Retry must re-poll this id, never re-upload (a fresh
   *  ticket would duplicate the live photo). */
  photoId: string | null;
  status: PhotoDraftStatus;
};

type PostPhotosSection = {
  /** Panel-local section key (restaurantId can't key: unpicked sections are null). */
  sid: string;
  /** null = the §7.4 "pick a restaurant" state (own-profile entry / added section). */
  restaurantId: string | null;
  restaurantName: string | null;
  drafts: PhotoDraft[];
};

const THUMB_HEIGHT = 96;

// Module counters: draft/section ids must stay unique across "Add photos"
// re-runs (the same dev/library assets can be picked twice).
let draftSeq = 0;
let sectionSeq = 0;
const nextSectionId = (): string => `section-${sectionSeq++}`;

const draftsFromAssets = (
  assets: ImagePickerAsset[],
  preassignedDish: { connectionId: string; foodName: string } | null
): PhotoDraft[] =>
  assets.map((asset) => ({
    id: `draft-${draftSeq++}-${asset.fileName ?? asset.uri.slice(-24)}`,
    asset,
    dish: preassignedDish,
    otherDishName: null,
    photoId: null,
    status: 'draft' as const,
  }));

// ─── Restaurant picker (§7.4 multi-restaurant / own-profile entry) ───────────
// SIMPLEST honest v1: a search input over the existing restaurant-scoped
// autocomplete endpoint; picking assigns the section's restaurant.
const RestaurantPickInline = ({
  onPick,
}: {
  onPick: (restaurant: { restaurantId: string; restaurantName: string }) => void;
}) => {
  const [query, setQuery] = React.useState('');
  const trimmed = query.trim();
  const suggestionsQuery = useQuery({
    queryKey: ['postPhotosRestaurantPick', trimmed],
    enabled: trimmed.length >= 2,
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      autocompleteService.fetchEntities(trimmed, { entityType: 'restaurant', signal }),
  });
  const matches = (suggestionsQuery.data?.matches ?? []).filter(
    (match) => match.matchType == null || match.matchType === 'entity'
  );
  return (
    <View style={styles.restaurantPick} testID="post-photos-restaurant-pick">
      <Text variant="caption" weight="semibold" style={styles.dishAssignTitle}>
        Which restaurant are these from?
      </Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search restaurants…"
        placeholderTextColor="#94a3b8"
        style={styles.dishFilterInput}
        autoCapitalize="none"
        autoCorrect={false}
        testID="post-photos-restaurant-input"
      />
      {trimmed.length >= 2 && suggestionsQuery.isPending ? (
        <View style={styles.dishListSpinner}>
          <SquircleSpinner size={18} color="#94a3b8" />
        </View>
      ) : null}
      {matches.map((match) => (
        <Pressable
          key={match.entityId}
          onPress={() => onPick({ restaurantId: match.entityId, restaurantName: match.name })}
          accessibilityRole="button"
          accessibilityLabel={`Pick ${match.name}`}
          style={styles.dishRow}
          testID={`post-photos-restaurant-${match.entityId}`}
        >
          <Text variant="body" numberOfLines={1} style={styles.dishRowName}>
            {match.name}
          </Text>
        </Pressable>
      ))}
      {trimmed.length >= 2 && suggestionsQuery.isSuccess && matches.length === 0 ? (
        <Text variant="caption" style={styles.dishListEmptyText}>
          No restaurants match.
        </Text>
      ) : null}
    </View>
  );
};

// ─── Per-photo dish assignment: inline ranked dish list + typeahead + "Other…" ──────────────
const DishAssignList = ({
  restaurantId,
  selectedConnectionId,
  otherDishName,
  onAssign,
  onAssignOther,
  onClear,
}: {
  restaurantId: string;
  selectedConnectionId: string | null;
  otherDishName: string | null;
  onAssign: (dish: { connectionId: string; foodName: string }) => void;
  onAssignOther: (name: string) => void;
  onClear: () => void;
}) => {
  const [filter, setFilter] = React.useState('');
  const [otherOpen, setOtherOpen] = React.useState(otherDishName != null);
  const [otherText, setOtherText] = React.useState(otherDishName ?? '');

  const dishesQuery = useQuery({
    queryKey: ['restaurantDishes', restaurantId],
    staleTime: 60_000,
    queryFn: (): Promise<FoodResult[]> => searchService.restaurantDishes(restaurantId),
  });

  const dishes = dishesQuery.data ?? [];
  const normalizedFilter = filter.trim().toLowerCase();
  const visibleDishes = normalizedFilter
    ? dishes.filter((dish) => dish.foodName.toLowerCase().includes(normalizedFilter))
    : dishes;

  return (
    <View style={styles.dishAssign} testID="post-photos-dish-assign">
      <View style={styles.dishAssignHeader}>
        <Text variant="caption" weight="semibold" style={styles.dishAssignTitle}>
          Which dish is this?
        </Text>
        {selectedConnectionId != null || otherDishName != null ? (
          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="Clear dish assignment"
            testID="post-photos-dish-clear"
          >
            <Text variant="caption" style={styles.dishClearText}>
              Clear
            </Text>
          </Pressable>
        ) : null}
      </View>
      <TextInput
        value={filter}
        onChangeText={setFilter}
        placeholder="Filter dishes…"
        placeholderTextColor="#94a3b8"
        style={styles.dishFilterInput}
        autoCapitalize="none"
        autoCorrect={false}
        testID="post-photos-dish-filter"
      />
      {dishesQuery.isPending ? (
        <View style={styles.dishListSpinner}>
          <SquircleSpinner size={18} color="#94a3b8" />
        </View>
      ) : dishesQuery.isError ? (
        <Text variant="caption" style={styles.dishListEmptyText}>
          Couldn’t load this restaurant’s dishes.
        </Text>
      ) : (
        <>
          {visibleDishes.length === 0 ? (
            <Text variant="caption" style={styles.dishListEmptyText}>
              No dishes match.
            </Text>
          ) : null}
          {visibleDishes.map((dish, index) => {
            const isSelected = dish.connectionId === selectedConnectionId;
            return (
              <Pressable
                key={dish.connectionId}
                onPress={() =>
                  onAssign({ connectionId: dish.connectionId, foodName: dish.foodName })
                }
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`Assign ${dish.foodName}`}
                style={[styles.dishRow, isSelected && styles.dishRowSelected]}
                testID={`post-photos-dish-${dish.connectionId}`}
              >
                <Text variant="caption" style={styles.dishRowRank}>
                  {index + 1}
                </Text>
                <Text
                  variant="body"
                  weight={isSelected ? 'semibold' : 'regular'}
                  numberOfLines={1}
                  style={styles.dishRowName}
                >
                  {dish.foodName}
                </Text>
              </Pressable>
            );
          })}
          {/* "Other…" final row — free-text demand signal (never creates entities). */}
          {otherOpen ? (
            <View style={styles.otherRow}>
              <TextInput
                value={otherText}
                onChangeText={setOtherText}
                onEndEditing={() => {
                  const trimmed = otherText.trim();
                  if (trimmed.length > 0) {
                    onAssignOther(trimmed);
                  }
                }}
                placeholder="Type the dish name…"
                placeholderTextColor="#94a3b8"
                style={styles.otherInput}
                autoFocus
                testID="post-photos-dish-other-input"
              />
            </View>
          ) : (
            <Pressable
              onPress={() => setOtherOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Other dish"
              style={styles.dishRow}
              testID="post-photos-dish-other"
            >
              <Text variant="body" style={styles.otherRowLabel}>
                Other…
              </Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
};

const STATUS_LABELS: Record<PhotoDraftStatus, string | null> = {
  draft: null,
  uploading: 'Uploading…',
  done: 'Done',
  failed: 'Failed',
};

export const PostPhotosPanelBody = React.memo(({ entry }: MountedSceneBodyProps) => {
  const { closeActiveRoute } = useAppOverlayRouteController();
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const params: PostPhotosParams | null =
    entry?.key === 'postPhotos' ? ((entry.params ?? {}) as PostPhotosParams) : null;
  const restaurantId = typeof params?.restaurantId === 'string' ? params.restaurantId : null;
  const restaurantName =
    typeof params?.restaurantName === 'string' ? params.restaurantName : 'This restaurant';
  const dishId = typeof params?.dishId === 'string' ? params.dishId : null;
  const dishName = typeof params?.dishName === 'string' ? params.dishName : null;
  const sessionNonce = typeof params?.sessionNonce === 'string' ? params.sessionNonce : null;

  // Assets ride the pending-assets store (peek, not take — entry-mount remounts re-read).
  const initialAssets = React.useMemo(
    () => (sessionNonce != null ? peekPostPhotosAssets(sessionNonce) : null),
    [sessionNonce]
  );

  // SECTIONS state (§7.4): the trigger context seeds section 1. Own-profile
  // entry arrives with NO restaurant → section 1 opens in "pick a restaurant"
  // state; "Add another restaurant" appends more sections.
  const [sections, setSections] = React.useState<PostPhotosSection[]>(() =>
    initialAssets != null
      ? [
          {
            sid: nextSectionId(),
            restaurantId,
            restaurantName: restaurantId != null ? restaurantName : null,
            drafts: draftsFromAssets(
              initialAssets,
              dishId != null ? { connectionId: dishId, foodName: dishName ?? 'Dish' } : null
            ),
          },
        ]
      : []
  );
  const [selectedDraftId, setSelectedDraftId] = React.useState<string | null>(null);
  const [isPublic, setIsPublic] = React.useState(true);
  const [isPosting, setIsPosting] = React.useState(false);

  // Release the stashed assets when the funnel COLLAPSES — not on bare unmount:
  // entry-keyed remounts of a still-stacked postPhotos scene must re-peek the
  // same stash. The cleanup checks the route stack; a scene that unmounted while
  // its entry is still stacked keeps the stash alive for the remount. (The
  // all-done close handler also releases explicitly — belt and suspenders.)
  React.useEffect(() => {
    if (sessionNonce == null) {
      return undefined;
    }
    return () => {
      const { overlayRouteStack } =
        routeSceneRuntime.routeOverlayRouteCommandRuntime.getRouteState();
      const stillInStack = overlayRouteStack.some(
        (stackEntry) =>
          stackEntry.key === 'postPhotos' &&
          (stackEntry.params as PostPhotosParams | null | undefined)?.sessionNonce === sessionNonce
      );
      if (!stillInStack) {
        releasePostPhotosAssets(sessionNonce);
      }
    };
  }, [routeSceneRuntime, sessionNonce]);

  const updateDraft = React.useCallback((draftId: string, patch: Partial<PhotoDraft>) => {
    setSections((current) =>
      current.map((section) => ({
        ...section,
        drafts: section.drafts.map((draft) =>
          draft.id === draftId ? { ...draft, ...patch } : draft
        ),
      }))
    );
  }, []);

  const uploadDraft = React.useCallback(
    async (section: PostPhotosSection, draft: PhotoDraft): Promise<boolean> => {
      updateDraft(draft.id, { status: 'uploading' });
      try {
        if (draft.photoId != null) {
          // Confirm-stage retry: the photo already uploaded — ONLY re-poll the
          // row (a fresh ticket + upload would duplicate the live photo).
          await photosService.retryConfirm(draft.photoId);
        } else {
          if (section.restaurantId == null) {
            // Post is disabled while a section lacks a restaurant; loud guard.
            throw new Error('post-photos: section has no restaurant');
          }
          await photosService.uploadPhoto(draft.asset, {
            restaurantId: section.restaurantId,
            connectionId: draft.dish?.connectionId,
            // "Other…" free text = the demand-signal field the backend built for it.
            pendingDishName: draft.otherDishName ?? undefined,
            visibility: isPublic ? 'public' : 'private',
          });
        }
        updateDraft(draft.id, { status: 'done' });
        return true;
      } catch (error) {
        // PhotoUploadError carries the failing stage (ticket/upload/confirm); a
        // confirm-stage failure also carries the photoId of the ALREADY-uploaded
        // photo — latch it so Retry re-polls instead of re-uploading.
        const uploadedPhotoId =
          error instanceof PhotoUploadError && error.photoId != null
            ? error.photoId
            : draft.photoId;
        updateDraft(draft.id, { status: 'failed', photoId: uploadedPhotoId ?? null });
        return false;
      }
    },
    [updateDraft, isPublic]
  );

  const handlePost = React.useCallback(async () => {
    if (isPosting) {
      return;
    }
    setIsPosting(true);
    let allDone = true;
    for (const section of sections) {
      for (const draft of section.drafts) {
        if (draft.status === 'done') {
          continue;
        }
        const ok = await uploadDraft(section, draft);
        allDone = allDone && ok;
      }
    }
    setIsPosting(false);
    if (allDone) {
      // §8.9 push-permission moment: first contribution (photos posted).
      requestPushPermissionIfEligible();
      // Funnel collapses back to the trigger (§7.4) — the stash is done for.
      if (sessionNonce != null) {
        releasePostPhotosAssets(sessionNonce);
      }
      closeActiveRoute();
    }
  }, [closeActiveRoute, isPosting, sections, sessionNonce, uploadDraft]);

  const handleRetry = React.useCallback(
    (section: PostPhotosSection, draft: PhotoDraft) => {
      void uploadDraft(section, draft);
    },
    [uploadDraft]
  );

  if (initialAssets == null || sections.length === 0) {
    // Missing context or a dropped pending-assets stash (dev reload) — honest failure body.
    return (
      <View style={styles.stateBody} testID="post-photos-failed">
        <Text variant="body" style={styles.stateText}>
          We couldn’t start this post. Close and try again.
        </Text>
        <Pressable
          onPress={closeActiveRoute}
          accessibilityRole="button"
          accessibilityLabel="Close post"
          style={styles.stateClose}
          testID="post-photos-failed-close"
        >
          <Text variant="body" weight="semibold" style={styles.stateCloseText}>
            Close
          </Text>
        </Pressable>
      </View>
    );
  }

  const totalCount = sections.reduce((sum, section) => sum + section.drafts.length, 0);
  const doneCount = sections.reduce(
    (sum, section) => sum + section.drafts.filter((draft) => draft.status === 'done').length,
    0
  );
  // Post gate (§7.4): every photo needs a restaurant; empty added sections don't block.
  const hasUnpickedDrafts = sections.some(
    (section) => section.restaurantId == null && section.drafts.length > 0
  );
  const postDisabled = isPosting || totalCount === 0 || hasUnpickedDrafts;

  const assignSectionRestaurant = (
    sid: string,
    restaurant: { restaurantId: string; restaurantName: string }
  ): void => {
    setSections((current) =>
      current.map((section) => (section.sid === sid ? { ...section, ...restaurant } : section))
    );
  };

  const addAssetsToSection = (sid: string): void => {
    // Re-runs the shared source picker (camera/library/dev) for THIS section;
    // assets come back by callback — the panel is already mounted (§7.4).
    openPhotoSourceForAssets((assets) => {
      const drafts = draftsFromAssets(assets, null);
      setSections((current) =>
        current.map((section) =>
          section.sid === sid ? { ...section, drafts: [...section.drafts, ...drafts] } : section
        )
      );
    });
  };

  return (
    <View style={styles.body} testID="post-photos-body">
      {sections.map((section) => {
        const selectedDraft = section.drafts.find((draft) => draft.id === selectedDraftId) ?? null;
        return (
          <View key={section.sid} style={styles.section}>
            {section.restaurantId == null ? (
              <RestaurantPickInline
                onPick={(restaurant) => assignSectionRestaurant(section.sid, restaurant)}
              />
            ) : (
              <Text variant="title" weight="semibold" numberOfLines={1} style={styles.sectionTitle}>
                {section.restaurantName}
              </Text>
            )}
            {section.drafts.length > 0 ? (
              <Text variant="caption" style={styles.sectionSubtitle}>
                Tap a photo to say which dish it is (optional)
              </Text>
            ) : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoRow}
              style={styles.photoRowContainer}
            >
              {section.drafts.map((draft) => {
                const isSelected = draft.id === selectedDraftId;
                const width = Math.round(
                  THUMB_HEIGHT *
                    (draft.asset.width > 0 && draft.asset.height > 0
                      ? draft.asset.width / draft.asset.height
                      : 4 / 3)
                );
                const chipLabel = draft.dish?.foodName ?? draft.otherDishName;
                const statusLabel = STATUS_LABELS[draft.status];
                return (
                  <View key={draft.id} style={styles.thumbColumn}>
                    <Pressable
                      onPress={() => setSelectedDraftId(isSelected ? null : draft.id)}
                      accessibilityRole="imagebutton"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel="Select photo"
                      testID={`post-photos-thumb-${draft.id}`}
                      style={[styles.thumbFrame, isSelected && styles.thumbFrameSelected]}
                    >
                      <Image
                        source={{ uri: draft.asset.uri }}
                        contentFit="cover"
                        style={[styles.thumb, { width, height: THUMB_HEIGHT }]}
                      />
                      {statusLabel != null ? (
                        <View
                          style={[
                            styles.statusBadge,
                            draft.status === 'failed' && styles.statusBadgeFailed,
                            draft.status === 'done' && styles.statusBadgeDone,
                          ]}
                        >
                          <Text variant="caption" weight="semibold" style={styles.statusBadgeText}>
                            {statusLabel}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                    {chipLabel != null ? (
                      <View style={styles.dishChip} testID={`post-photos-chip-${draft.id}`}>
                        <Text
                          variant="caption"
                          weight="semibold"
                          numberOfLines={1}
                          style={styles.dishChipText}
                        >
                          {chipLabel}
                        </Text>
                      </View>
                    ) : null}
                    {draft.status === 'failed' ? (
                      <Pressable
                        onPress={() => handleRetry(section, draft)}
                        accessibilityRole="button"
                        accessibilityLabel="Retry upload"
                        style={styles.retryChip}
                        testID={`post-photos-retry-${draft.id}`}
                      >
                        <Text variant="caption" weight="semibold" style={styles.retryChipText}>
                          Retry
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
            {/* Per-section add: reopens the shared source picker for THIS section. */}
            <Pressable
              onPress={() => addAssetsToSection(section.sid)}
              accessibilityRole="button"
              accessibilityLabel="Add photos to this restaurant"
              style={styles.sectionAddPhotos}
              testID={`post-photos-add-assets-${section.sid}`}
            >
              <Text variant="caption" weight="semibold" style={styles.sectionAddPhotosText}>
                + Add photos
              </Text>
            </Pressable>
            {selectedDraft != null && section.restaurantId != null ? (
              <DishAssignList
                restaurantId={section.restaurantId}
                selectedConnectionId={selectedDraft.dish?.connectionId ?? null}
                otherDishName={selectedDraft.otherDishName}
                onAssign={(dish) => updateDraft(selectedDraft.id, { dish, otherDishName: null })}
                onAssignOther={(name) =>
                  updateDraft(selectedDraft.id, { dish: null, otherDishName: name })
                }
                onClear={() => updateDraft(selectedDraft.id, { dish: null, otherDishName: null })}
              />
            ) : null}
          </View>
        );
      })}

      {/* §7.4 multi-restaurant sessions: append a fresh "pick a restaurant" section. */}
      <Pressable
        onPress={() =>
          setSections((current) => [
            ...current,
            { sid: nextSectionId(), restaurantId: null, restaurantName: null, drafts: [] },
          ])
        }
        accessibilityRole="button"
        accessibilityLabel="Add another restaurant"
        style={styles.addRestaurantRow}
        testID="post-photos-add-restaurant"
      >
        <Text variant="body" weight="semibold" style={styles.addRestaurantText}>
          + Add another restaurant
        </Text>
      </Pressable>

      {/* PUBLIC/PRIVATE — sent as the ticket's `visibility` (owner-only when private). */}
      <View style={styles.visibilityRow}>
        <Pressable
          onPress={() => setIsPublic(true)}
          accessibilityRole="button"
          accessibilityState={{ selected: isPublic }}
          accessibilityLabel="Public post"
          style={[styles.visibilityChip, isPublic && styles.visibilityChipSelected]}
          testID="post-photos-visibility-public"
        >
          <Text
            variant="caption"
            weight="semibold"
            style={isPublic ? styles.visibilityTextSelected : styles.visibilityText}
          >
            Public
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setIsPublic(false)}
          accessibilityRole="button"
          accessibilityState={{ selected: !isPublic }}
          accessibilityLabel="Private post"
          style={[styles.visibilityChip, !isPublic && styles.visibilityChipSelected]}
          testID="post-photos-visibility-private"
        >
          <Text
            variant="caption"
            weight="semibold"
            style={!isPublic ? styles.visibilityTextSelected : styles.visibilityText}
          >
            Private
          </Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => void handlePost()}
        disabled={postDisabled}
        accessibilityRole="button"
        accessibilityLabel="Post photos"
        testID="post-photos-submit"
        style={[styles.postButton, postDisabled && styles.postButtonBusy]}
      >
        {isPosting ? (
          <SquircleSpinner size={18} color="#ffffff" />
        ) : (
          <Text variant="body" weight="semibold" style={styles.postButtonText}>
            Post {totalCount === 1 ? '1 photo' : `${totalCount} photos`}
            {doneCount > 0 && doneCount < totalCount ? ` (${doneCount} done)` : ''}
          </Text>
        )}
      </Pressable>
    </View>
  );
});
PostPhotosPanelBody.displayName = 'PostPhotosPanelBody';

// ─── Persistent header (house pattern: static synchronous title + fixed-close action) ───────
const PostPhotosPersistentHeaderTitle = React.memo(() => (
  <View style={styles.headerTextGroup}>
    <Text
      variant="title"
      weight="semibold"
      style={styles.headerTitle}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      Post photos
    </Text>
  </View>
));
PostPhotosPersistentHeaderTitle.displayName = 'PostPhotosPersistentHeaderTitle';

// Leg 6 (§4 HeaderNavAction): the per-scene close factory is DELETED — the persistent header
// host owns the ONE plus↔X control; children get the X + the canonical close by role derivation.
registerPersistentHeaderDescriptor('postPhotos', {
  Title: PostPhotosPersistentHeaderTitle,
});

const styles = StyleSheet.create({
  body: {
    paddingBottom: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#0f172a',
  },
  sectionSubtitle: {
    color: '#64748b',
    marginTop: 2,
  },
  photoRowContainer: {
    marginTop: 12,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 10,
  },
  thumbColumn: {
    gap: 6,
    alignItems: 'flex-start',
  },
  thumbFrame: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbFrameSelected: {
    borderColor: '#0f172a',
  },
  thumb: {
    backgroundColor: '#f1f5f9',
  },
  statusBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
  },
  statusBadgeFailed: {
    backgroundColor: '#dc2626',
  },
  statusBadgeDone: {
    backgroundColor: '#16a34a',
  },
  statusBadgeText: {
    color: '#ffffff',
    fontSize: 11,
  },
  dishChip: {
    maxWidth: 140,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  dishChipText: {
    color: '#0f172a',
    fontSize: 11,
  },
  retryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#fee2e2',
  },
  retryChipText: {
    color: '#dc2626',
    fontSize: 11,
  },
  sectionAddPhotos: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#e0f2fe',
  },
  sectionAddPhotosText: {
    color: '#0f172a',
  },
  addRestaurantRow: {
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  addRestaurantText: {
    color: '#0f172a',
  },
  restaurantPick: {
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  // Dish assignment
  dishAssign: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  dishAssignHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dishAssignTitle: {
    color: '#0f172a',
  },
  dishClearText: {
    color: '#64748b',
  },
  dishFilterInput: {
    marginTop: 10,
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    color: '#0f172a',
  },
  dishListSpinner: {
    marginTop: 16,
  },
  dishListEmptyText: {
    marginTop: 12,
    color: '#64748b',
  },
  dishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  dishRowSelected: {
    backgroundColor: '#eef2ff',
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  dishRowRank: {
    width: 20,
    color: '#94a3b8',
  },
  dishRowName: {
    flex: 1,
    color: '#0f172a',
  },
  otherRow: {
    marginTop: 8,
  },
  otherRowLabel: {
    color: '#0f172a',
  },
  otherInput: {
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    color: '#0f172a',
  },
  // Visibility
  visibilityRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  visibilityChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  visibilityChipSelected: {
    backgroundColor: '#0f172a',
  },
  visibilityText: {
    color: '#0f172a',
  },
  visibilityTextSelected: {
    color: '#ffffff',
  },
  // Post button
  postButton: {
    marginTop: 18,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  postButtonBusy: {
    opacity: 0.7,
  },
  postButtonText: {
    color: '#ffffff',
  },
  // Failure body
  stateBody: {
    paddingBottom: 48,
    alignItems: 'center',
    gap: 16,
  },
  stateText: {
    color: '#0f172a',
    textAlign: 'center',
  },
  stateClose: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  stateCloseText: {
    color: '#0f172a',
  },
  headerTextGroup: {
    flex: 1,
    paddingRight: 12,
  },
  headerTitle: {
    color: '#0f172a',
  },
});
