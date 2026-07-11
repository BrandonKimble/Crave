import React from 'react';

import { showAppModal } from '../app-modal-store';
import {
  photosService,
  type PhotoReportReason,
  type PhotoStripItemDto,
} from '../../services/photos';
import PhotoStrip, { type PhotoStripPhoto } from './PhotoStrip';
import { pushPhotoEvent } from './photo-events-buffer';
import { useCardPhotoStrip } from './use-card-photo-strip';

// The CONNECTED card strip: data (batched per screen via the dataloader in
// use-card-photo-strip), photo_events emission (impressions once per photo
// per mount + taps), and the §8.6 report flow (long-press → the ONE reasons
// modal → reportPhoto → confirmation). PhotoStrip itself stays presentational.
//
// Photo TAP behavior: galleries are W3 — today a tap is the interest signal
// only. `onPhotoOpen` is the deliberate seam: when the gallery viewer lands,
// pass it here and taps start opening photos with zero other changes.

export interface CardPhotoStripProps {
  restaurantId: string;
  /** Present = dish card (dish-linked photos only); absent = restaurant card. */
  connectionId?: string;
  height: number;
  /** 'add' = own-list context ONLY (§7.1: owner/collaborator lists). */
  leadTile?: 'add';
  onAddPress?: () => void;
  /** W3 seam — the gallery viewer. Absent today: tap = tap event only. */
  onPhotoOpen?: (photo: PhotoStripItemDto, index: number) => void;
}

const REPORT_REASONS: Array<{ label: string; reason: PhotoReportReason }> = [
  { label: 'Not food', reason: 'not_food' },
  { label: 'Inappropriate', reason: 'inappropriate' },
  { label: 'Wrong restaurant/dish', reason: 'wrong_entity' },
  { label: 'Other', reason: 'other' },
];

const submitReport = (photoId: string, reason: PhotoReportReason): void => {
  void photosService
    .reportPhoto(photoId, reason)
    .then(() => {
      showAppModal({
        title: 'Report received',
        message: "Thanks — we'll take a look.",
        actions: [{ label: 'OK', style: 'default' }],
      });
    })
    .catch(() => {
      // Uniform failure surface — but a report is quiet-by-design, so a
      // duplicate/failed report simply doesn't confirm.
    });
};

/** The §8.6 shared "what's wrong" modal, on the app's ONE modal surface. */
export const openPhotoReportModal = (photoId: string): void => {
  showAppModal({
    title: 'Report photo',
    message: "What's wrong with this photo?",
    actions: [
      ...REPORT_REASONS.map(({ label, reason }) => ({
        label,
        onPress: () => submitReport(photoId, reason),
      })),
      { label: 'Cancel', style: 'cancel' as const },
    ],
  });
};

export const CardPhotoStrip: React.FC<CardPhotoStripProps> = ({
  restaurantId,
  connectionId,
  height,
  leadTile,
  onAddPress,
  onPhotoOpen,
}) => {
  const stripQuery = useCardPhotoStrip({ restaurantId, connectionId });
  const items = React.useMemo(() => stripQuery.data?.photos ?? [], [stripQuery.data]);

  // Impressions: once per photo PER SCREEN MOUNT (this component's lifetime).
  const reportedImpressions = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    for (const item of items) {
      if (!reportedImpressions.current.has(item.photoId)) {
        reportedImpressions.current.add(item.photoId);
        pushPhotoEvent(item.photoId, 'impression');
      }
    }
  }, [items]);

  const photos = React.useMemo<PhotoStripPhoto[]>(
    () => items.map((item) => ({ id: item.photoId, thumbUrl: item.urls.thumb })),
    [items]
  );

  const handlePhotoPress = React.useCallback(
    (id: string, index: number) => {
      pushPhotoEvent(id, 'tap');
      const item = items[index];
      if (onPhotoOpen && item) {
        onPhotoOpen(item, index);
      }
    },
    [items, onPhotoOpen]
  );

  const handlePhotoLongPress = React.useCallback((id: string) => {
    openPhotoReportModal(id);
  }, []);

  return (
    <PhotoStrip
      photos={photos}
      height={height}
      leadTile={leadTile}
      onAddPress={onAddPress}
      onPhotoPress={handlePhotoPress}
      onPhotoLongPress={handlePhotoLongPress}
    />
  );
};
