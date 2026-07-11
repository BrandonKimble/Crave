import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';

import { Text } from '../../components';
import { openPhotoReportModal } from '../../components/photos/CardPhotoStrip';
import { pushPhotoEvent } from '../../components/photos/photo-events-buffer';
import { photosService, type PhotoStripItemDto } from '../../services/photos';
import { fetchRestaurantMentions, type RestaurantMentionCard } from '../../services/polls';
import { favoriteListsService } from '../../services/favorite-lists';
import { FONT_SIZES, LINE_HEIGHTS } from '../../constants/typography';
import { colors as themeColors } from '../../constants/theme';
import { OVERLAY_HORIZONTAL_PADDING } from '../overlaySheetStyles';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { openPostPhotosFunnel } from '../PostPhotosFunnelHost';

// W3 (page-registry §8.4): the restaurant profile's segmented views. The panel
// spec hook (RestaurantPanel) owns WHICH view is active (render-time state —
// effects are dead there); these are REAL components rendered inside the list,
// so effects/queries fire normally. Crude visuals by design (§7.10) — the
// design pass is a later wave.

export type RestaurantProfileViewKey = 'overview' | 'dishes' | 'discussions' | 'photos';

export const RESTAURANT_PROFILE_VIEWS: Array<{
  key: RestaurantProfileViewKey;
  label: string;
}> = [
  { key: 'overview', label: 'Overview' },
  { key: 'dishes', label: 'Dishes' },
  { key: 'discussions', label: 'Discussions' },
  { key: 'photos', label: 'Photos' },
];

// ─── View switcher chip strip ────────────────────────────────────────────────

export const RestaurantViewSwitcher: React.FC<{
  active: RestaurantProfileViewKey;
  onSelect: (view: RestaurantProfileViewKey) => void;
}> = ({ active, onSelect }) => (
  <View style={styles.switcherRow}>
    {RESTAURANT_PROFILE_VIEWS.map(({ key, label }) => {
      const isActive = key === active;
      return (
        <Pressable
          key={key}
          style={[styles.switcherChip, isActive && styles.switcherChipActive]}
          onPress={() => onSelect(key)}
          accessibilityRole="button"
          accessibilityState={{ selected: isActive }}
          testID={`restaurant-view-${key}`}
        >
          <Text style={[styles.switcherChipText, isActive && styles.switcherChipTextActive]}>
            {label}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

// ─── Photos view ─────────────────────────────────────────────────────────────

const PhotoGrid: React.FC<{ photos: PhotoStripItemDto[] }> = ({ photos }) => (
  <View style={styles.photoGrid}>
    {photos.map((photo) => (
      <Pressable
        key={photo.photoId}
        style={styles.photoGridTile}
        // Tap = interest signal only today. photoViewer is NOT in the §9b
        // modal registry — when a viewer lands, open it here (the seam).
        onPress={() => pushPhotoEvent(photo.photoId, 'tap')}
        onLongPress={() => openPhotoReportModal(photo.photoId)}
      >
        <Image source={{ uri: photo.urls.card }} style={styles.photoGridImage} contentFit="cover" />
      </Pressable>
    ))}
  </View>
);

export const RestaurantPhotosView: React.FC<{
  restaurantId: string;
  restaurantName: string;
  /** connectionId → { name, rank } from the panel's ranked dish list — orders
   *  the per-dish slices by dish rank and names the slice headers. */
  dishByConnectionId: Map<string, { name: string; rank: number }>;
}> = ({ restaurantId, restaurantName, dishByConnectionId }) => {
  const galleryQuery = useQuery({
    queryKey: ['restaurantGallery', restaurantId],
    queryFn: () => photosService.getRestaurantGallery(restaurantId),
    enabled: Boolean(restaurantId),
    staleTime: 60_000,
  });

  const gallery = galleryQuery.data ?? null;
  const slices = React.useMemo(() => {
    if (!gallery) {
      return [];
    }
    return gallery.byDish
      .map((slice) => ({
        ...slice,
        dish: dishByConnectionId.get(slice.connectionId) ?? null,
      }))
      .sort(
        (a, b) =>
          (a.dish?.rank ?? Number.MAX_SAFE_INTEGER) - (b.dish?.rank ?? Number.MAX_SAFE_INTEGER)
      );
  }, [dishByConnectionId, gallery]);

  return (
    <View style={styles.viewBody}>
      <Pressable
        style={styles.addPhotosButton}
        onPress={() => openPostPhotosFunnel({ restaurantId, restaurantName })}
        accessibilityRole="button"
        testID="restaurant-photos-add"
      >
        <Feather name="camera" size={16} color="#0f172a" />
        <Text style={styles.addPhotosButtonText}>Add photos</Text>
      </Pressable>
      {galleryQuery.isLoading ? (
        <Text style={styles.mutedText}>Loading photos…</Text>
      ) : !gallery || gallery.totalCount === 0 ? (
        <Text style={styles.mutedText}>No photos yet — be the first to add one.</Text>
      ) : (
        <View>
          {slices.map((slice) => (
            <View key={slice.connectionId} style={styles.photoSection}>
              <Text style={styles.photoSectionTitle}>
                {slice.dish ? slice.dish.name : 'Other dishes'}
              </Text>
              <PhotoGrid photos={slice.photos} />
            </View>
          ))}
          <View style={styles.photoSection}>
            <Text style={styles.photoSectionTitle}>Latest</Text>
            <PhotoGrid photos={gallery.all} />
          </View>
        </View>
      )}
    </View>
  );
};

// ─── Discussions (mentions) view ─────────────────────────────────────────────

const MentionCard: React.FC<{
  card: RestaurantMentionCard;
  onPress: (card: RestaurantMentionCard) => void;
}> = ({ card, onPress }) => {
  const authorLabel = (c: { user: RestaurantMentionCard['user'] }) =>
    c.user.displayName ?? (c.user.username ? `@${c.user.username}` : 'Someone');
  return (
    <Pressable style={styles.mentionCard} onPress={() => onPress(card)}>
      <Text style={styles.mentionPollContext} numberOfLines={1}>
        {card.pollQuestion}
      </Text>
      <Text style={styles.mentionBody}>{card.body}</Text>
      <Text style={styles.mentionMeta}>
        {authorLabel(card)} · {card.score} {card.score === 1 ? 'vote' : 'votes'} ·{' '}
        {new Date(card.loggedAt).toLocaleDateString()}
      </Text>
      {card.replies.map((reply) => (
        <View key={reply.commentId} style={styles.mentionReply}>
          <Text style={styles.mentionBody}>{reply.body}</Text>
          <Text style={styles.mentionMeta}>
            {authorLabel(reply)} · {reply.score} {reply.score === 1 ? 'vote' : 'votes'}
          </Text>
        </View>
      ))}
    </Pressable>
  );
};

export const RestaurantMentionsView: React.FC<{
  restaurantId: string;
}> = ({ restaurantId }) => {
  const { pushRoute } = useAppOverlayRouteController();
  const [sort, setSort] = React.useState<'top' | 'new'>('top');
  const [search, setSearch] = React.useState('');
  const [selectedTags, setSelectedTags] = React.useState<Set<string>>(new Set());

  const tagList = React.useMemo(() => [...selectedTags].sort(), [selectedTags]);
  const mentionsQuery = useQuery({
    queryKey: ['restaurantMentions', restaurantId, sort, search, tagList],
    queryFn: () =>
      fetchRestaurantMentions(restaurantId, {
        sort,
        search: search.trim() || undefined,
        tags: tagList.length ? tagList : undefined,
      }),
    enabled: Boolean(restaurantId),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });

  const data = mentionsQuery.data ?? null;

  const toggleTag = React.useCallback((entityId: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) {
        next.delete(entityId);
      } else {
        next.add(entityId);
      }
      return next;
    });
  }, []);

  const openCard = React.useCallback(
    (card: RestaurantMentionCard) => {
      // §8.4: tap card → pollDetail scrolled to + highlighting that comment
      // (pollDetail-from-anywhere; commentAnchorId already threaded — W0.3).
      pushRoute('pollDetail', { pollId: card.pollId, commentAnchorId: card.commentId });
    },
    [pushRoute]
  );

  return (
    <View style={styles.viewBody}>
      {/* Tags COLLAGE (multi-select filters, §8.4). */}
      {data && data.tags.length > 0 ? (
        <View style={styles.tagCollage}>
          {data.tags.map((tag) => {
            const isSelected = selectedTags.has(tag.entityId);
            return (
              <Pressable
                key={tag.entityId}
                style={[styles.tagChip, isSelected && styles.tagChipSelected]}
                onPress={() => toggleTag(tag.entityId)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={[styles.tagChipText, isSelected && styles.tagChipTextSelected]}>
                  {tag.name} {tag.mentionCount}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {/* Sort toggle (Top votes | Newest) + search bar. */}
      <View style={styles.mentionControlsRow}>
        {(
          [
            { key: 'top', label: 'Top votes' },
            { key: 'new', label: 'Newest' },
          ] as const
        ).map(({ key, label }) => (
          <Pressable
            key={key}
            style={[styles.sortChip, sort === key && styles.sortChipActive]}
            onPress={() => setSort(key)}
          >
            <Text style={[styles.sortChipText, sort === key && styles.sortChipTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.mentionSearchInput}
        placeholder="Search discussions"
        placeholderTextColor={themeColors.textBody}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        returnKeyType="search"
      />
      {mentionsQuery.isLoading ? (
        <Text style={styles.mutedText}>Loading discussions…</Text>
      ) : !data || data.cards.length === 0 ? (
        <Text style={styles.mutedText}>
          {search.trim() || tagList.length
            ? 'No discussions match — clear the search or tags.'
            : 'No discussions mention this place yet.'}
        </Text>
      ) : (
        data.cards.map((card) => (
          <MentionCard key={card.commentId} card={card} onPress={openCard} />
        ))
      )}
    </View>
  );
};

// ─── Overview saved note (§8.4 element 1) ────────────────────────────────────
// Red-team W2: if the viewer has this restaurant saved in any of their lists
// WITH a note, the note (+ which list) leads the Overview composite. A real
// committed component (queries fire here, unlike the panel spec hook).

export const RestaurantSavedNote: React.FC<{ restaurantId: string }> = ({ restaurantId }) => {
  const membershipsQuery = useQuery({
    queryKey: ['entityMemberships', restaurantId],
    queryFn: () => favoriteListsService.entityMemberships(restaurantId),
    enabled: Boolean(restaurantId),
    staleTime: 30_000,
  });
  const noted = (membershipsQuery.data ?? []).filter(
    (membership) => membership.note != null && membership.note.trim().length > 0
  );
  if (noted.length === 0) {
    return null;
  }
  return (
    <View style={styles.savedNoteSection} testID="restaurant-saved-note">
      {noted.map((membership) => (
        <View key={membership.itemId} style={styles.savedNoteCard}>
          <Text style={styles.savedNoteText}>“{membership.note?.trim()}”</Text>
          <Text style={styles.savedNoteMeta}>Your note · {membership.listName}</Text>
        </View>
      ))}
    </View>
  );
};

// ─── Overview mention extras (tags collage + top discussions) ───────────────

export const RestaurantOverviewMentions: React.FC<{
  restaurantId: string;
  onSeeAllDiscussions: () => void;
}> = ({ restaurantId, onSeeAllDiscussions }) => {
  const { pushRoute } = useAppOverlayRouteController();
  const mentionsQuery = useQuery({
    queryKey: ['restaurantMentions', restaurantId, 'top', '', [] as string[]],
    queryFn: () => fetchRestaurantMentions(restaurantId, { sort: 'top' }),
    enabled: Boolean(restaurantId),
    staleTime: 30_000,
  });
  const data = mentionsQuery.data ?? null;
  if (!data || (data.tags.length === 0 && data.cards.length === 0)) {
    return null;
  }
  return (
    <View>
      {data.tags.length > 0 ? (
        <View style={styles.overviewSection}>
          <Text style={styles.overviewSectionTitle}>Mentioned here</Text>
          <View style={styles.tagCollage}>
            {data.tags.slice(0, 12).map((tag) => (
              // Overview tags act as LINKS into Discussions (§8.4).
              <Pressable key={tag.entityId} style={styles.tagChip} onPress={onSeeAllDiscussions}>
                <Text style={styles.tagChipText}>
                  {tag.name} {tag.mentionCount}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {data.cards.length > 0 ? (
        <View style={styles.overviewSection}>
          <Text style={styles.overviewSectionTitle}>Discussions</Text>
          {data.cards.slice(0, 3).map((card) => (
            <MentionCard
              key={card.commentId}
              card={card}
              onPress={(c) =>
                pushRoute('pollDetail', { pollId: c.pollId, commentAnchorId: c.commentId })
              }
            />
          ))}
          <Pressable style={styles.seeAllRow} onPress={onSeeAllDiscussions}>
            <Text style={styles.seeAllText}>See all discussions</Text>
            <Feather name="chevron-right" size={16} color={themeColors.textBody} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  switcherRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    marginTop: 12,
  },
  switcherChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.12)',
  },
  switcherChipActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  switcherChipText: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    fontWeight: '600',
    color: '#0f172a',
  },
  switcherChipTextActive: {
    color: '#ffffff',
  },
  viewBody: {
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    paddingTop: 16,
  },
  mutedText: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    color: themeColors.textBody,
    paddingVertical: 24,
    textAlign: 'center',
  },
  addPhotosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#e0f2fe',
    marginBottom: 8,
  },
  addPhotosButtonText: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    fontWeight: '600',
    color: '#0f172a',
  },
  photoSection: {
    marginTop: 16,
  },
  photoSectionTitle: {
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  photoGridTile: {
    width: '48.5%',
    aspectRatio: 4 / 3,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  photoGridImage: {
    width: '100%',
    height: '100%',
  },
  tagCollage: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.12)',
  },
  tagChipSelected: {
    backgroundColor: '#fef3c7',
    borderColor: '#b45309',
  },
  tagChipText: {
    fontSize: FONT_SIZES.caption,
    lineHeight: LINE_HEIGHTS.caption,
    color: '#0f172a',
  },
  tagChipTextSelected: {
    fontWeight: '700',
    color: '#b45309',
  },
  mentionControlsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.12)',
  },
  sortChipActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  sortChipText: {
    fontSize: FONT_SIZES.caption,
    lineHeight: LINE_HEIGHTS.caption,
    fontWeight: '600',
    color: '#0f172a',
  },
  sortChipTextActive: {
    color: '#ffffff',
  },
  mentionSearchInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FONT_SIZES.body,
    color: '#0f172a',
    marginBottom: 12,
  },
  mentionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    padding: 14,
    marginBottom: 8,
  },
  mentionPollContext: {
    fontSize: FONT_SIZES.caption,
    lineHeight: LINE_HEIGHTS.caption,
    color: themeColors.textBody,
    marginBottom: 6,
  },
  mentionBody: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    color: '#0f172a',
  },
  mentionMeta: {
    fontSize: FONT_SIZES.caption,
    lineHeight: LINE_HEIGHTS.caption,
    color: themeColors.textBody,
    marginTop: 4,
  },
  mentionReply: {
    marginTop: 10,
    marginLeft: 14,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(15, 23, 42, 0.12)',
  },
  savedNoteSection: {
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    marginTop: 12,
    gap: 8,
  },
  savedNoteCard: {
    backgroundColor: '#fefce8',
    borderWidth: 1,
    borderColor: 'rgba(180, 83, 9, 0.25)',
    borderRadius: 14,
    padding: 12,
  },
  savedNoteText: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    fontStyle: 'italic',
    color: '#0f172a',
  },
  savedNoteMeta: {
    fontSize: FONT_SIZES.caption,
    lineHeight: LINE_HEIGHTS.caption,
    color: themeColors.textBody,
    marginTop: 4,
  },
  overviewSection: {
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    marginTop: 24,
  },
  overviewSectionTitle: {
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
  },
  seeAllText: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    fontWeight: '600',
    color: themeColors.textBody,
  },
});
