import { AppState } from 'react-native';

import { photosService, type PhotoEventType } from '../../services/photos';

// photo_events client emission (product/images.md day-one requirement:
// impressions + taps per photo, batched fire-and-forget — the usage-ledger
// pattern's client analog). Consumers push; the buffer coalesces impressions
// per photo (count) and flushes on ANY of: 10s tick, 50 buffered events, or
// the app backgrounding. A failed flush is dropped silently — metrics must
// never announce or retry-storm.
//
// "Once per photo per screen mount" is the CONSUMER's contract (CardPhotoStrip
// tracks what it already reported); this module just batches the wire.

const FLUSH_INTERVAL_MS = 10_000;
const FLUSH_AT_COUNT = 50;
/** Server caps a batch at 200 events. */
const MAX_BATCH = 200;

type PendingEvent = { photoId: string; eventType: PhotoEventType; count: number };

// Keyed by `${photoId}:${type}` so repeat impressions coalesce into count.
const pending = new Map<string, PendingEvent>();
let timer: ReturnType<typeof setTimeout> | null = null;
let wired = false;

const pendingEventCount = (): number => {
  let total = 0;
  for (const event of pending.values()) {
    total += event.count;
  }
  return total;
};

const flush = (): void => {
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
  if (pending.size === 0) {
    return;
  }
  const events = [...pending.values()]
    .slice(0, MAX_BATCH)
    .map(({ photoId, eventType, count }) => ({ photoId, eventType, count }));
  pending.clear();
  // Fire-and-forget: a lost metrics batch is acceptable; a user-facing
  // failure announcement for one is not.
  void photosService.recordEvents(events).catch(() => undefined);
};

const wireOnce = (): void => {
  if (wired) {
    return;
  }
  wired = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') {
      flush();
    }
  });
};

export const pushPhotoEvent = (photoId: string, eventType: PhotoEventType): void => {
  wireOnce();
  const key = `${photoId}:${eventType}`;
  const existing = pending.get(key);
  if (existing) {
    existing.count += 1;
  } else {
    pending.set(key, { photoId, eventType, count: 1 });
  }
  if (pendingEventCount() >= FLUSH_AT_COUNT) {
    flush();
    return;
  }
  if (timer == null) {
    timer = setTimeout(flush, FLUSH_INTERVAL_MS);
  }
};

/** Test/debug escape hatch — force an immediate flush. */
export const flushPhotoEvents = flush;
