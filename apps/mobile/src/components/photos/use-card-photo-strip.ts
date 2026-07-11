import { useQuery } from '@tanstack/react-query';

import { photosService, type CardStripDto, type PhotoStripRef } from '../../services/photos';

// The card strip's data hook. Every card row calls this with ITS OWN ref,
// but the wire stays one POST /photos/strips per visible screen: a
// dataloader window (one tick) coalesces every row's ask from the same
// render pass into a single batch call, and react-query caches per entity
// (60s staleTime) so scrolling back through cards refetches nothing.

const BATCH_WINDOW_MS = 16; // one frame — the panel's rows all mount together
const MAX_REFS_PER_CALL = 60; // server-side ArrayMaxSize on the refs DTO

type Waiter = {
  ref: PhotoStripRef;
  resolve: (strip: CardStripDto) => void;
  reject: (error: unknown) => void;
};

const stripKeyOf = (ref: PhotoStripRef): string => ref.connectionId ?? ref.restaurantId;

let pendingWaiters = new Map<string, Waiter[]>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;

const runBatch = (): void => {
  batchTimer = null;
  const waiters = pendingWaiters;
  pendingWaiters = new Map();
  const entries = [...waiters.entries()];
  for (let start = 0; start < entries.length; start += MAX_REFS_PER_CALL) {
    const chunk = entries.slice(start, start + MAX_REFS_PER_CALL);
    void photosService
      .getStrips(chunk.map(([, group]) => group[0].ref))
      .then((strips) => {
        const byKey = new Map(strips.map((strip) => [strip.key, strip]));
        for (const [key, group] of chunk) {
          const strip = byKey.get(key) ?? { key, totalCount: 0, photos: [] };
          group.forEach((waiter) => waiter.resolve(strip));
        }
      })
      .catch((error: unknown) => {
        for (const [, group] of chunk) {
          group.forEach((waiter) => waiter.reject(error));
        }
      });
  }
};

const loadStrip = (ref: PhotoStripRef): Promise<CardStripDto> =>
  new Promise<CardStripDto>((resolve, reject) => {
    const key = stripKeyOf(ref);
    const group = pendingWaiters.get(key) ?? [];
    group.push({ ref, resolve, reject });
    pendingWaiters.set(key, group);
    if (batchTimer == null) {
      batchTimer = setTimeout(runBatch, BATCH_WINDOW_MS);
    }
  });

export const useCardPhotoStrip = (ref: PhotoStripRef | null) => {
  return useQuery({
    queryKey: ['photoStrip', ref ? stripKeyOf(ref) : null],
    enabled: ref != null,
    staleTime: 60_000,
    retry: 1,
    queryFn: () => loadStrip(ref as PhotoStripRef),
  });
};
