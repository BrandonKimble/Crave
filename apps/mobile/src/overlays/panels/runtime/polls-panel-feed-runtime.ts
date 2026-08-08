import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Poll, PollFeedPromise } from '../../../services/polls';
import { useSystemStatusStore } from '../../../store/systemStatusStore';
import type {
  PollsPanelInitialSnapPoint,
  UsePollsPanelSpecOptions,
} from './polls-panel-runtime-contract';
import { usePollsFeedControlsStore } from './polls-feed-controls-store';
import { resolveChinlessContentBottomPadding } from '../../overlay-sheet-chin-geometry';
import { usePollsFeedRuntimeController } from './polls-feed-runtime-controller';
import { buildPollsHeaderVisualModel } from '../pollsHeaderVisuals';
import { useViewportSubjectVerdict } from '../../../store/viewport-subject-store';

type UsePollsPanelFeedRuntimeArgs = Pick<
  UsePollsPanelSpecOptions,
  'visible' | 'params' | 'currentSnap' | 'initialSnapPoint' | 'interactionRef'
>;

export type PollsPanelFeedRuntime = {
  contentBottomPadding: number;
  headerAction: 'create' | 'close';
  headerVisualModel: ReturnType<typeof buildPollsHeaderVisualModel>;
  /** §2 header verdict for this viewport (null = "Polls in this area"). */
  headerPlaceName: string | null;
  isSystemUnavailable: boolean;
  loading: boolean;
  /** Final give-up of the retry ladder — the body may surface a quiet failure note. */
  pollFeedLoadFailed: boolean;
  polls: Poll[];
  /** §6 cold-start promise state (weekly drop pending on an empty seeded town). */
  promise: PollFeedPromise | null;
  resolvedSnap: UsePollsPanelSpecOptions['currentSnap'] | PollsPanelInitialSnapPoint;
  /** Cursor pagination: append the next keyset page (single-flight; no-op at end). */
  loadMorePolls: () => void;
  /**
   * Leg 4 content choreography: true between a feed-toggle press-up (old cards out)
   * and the new slice's arrival — the list body renders NOTHING (bare white under
   * the header strip; no skeleton, no empty-state message).
   */
  isFeedSliceAwaiting: boolean;
};

export const usePollsPanelFeedRuntime = ({
  visible,
  params,
  currentSnap,
  initialSnapPoint,
  interactionRef,
}: UsePollsPanelFeedRuntimeArgs): PollsPanelFeedRuntime => {
  const insets = useSafeAreaInsets();
  const isOffline = useSystemStatusStore((state) => state.isOffline);
  const serviceIssue = useSystemStatusStore((state) => state.serviceIssue);
  const isSystemUnavailable = isOffline || Boolean(serviceIssue);
  const [polls, setPolls] = React.useState<Poll[]>([]);
  const [promise, setPromise] = React.useState<PollFeedPromise | null>(null);
  const [pollFeedLoadFailed, setPollFeedLoadFailed] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  // Feed control state (Live/Results split, Type, Sort, Time, place slicer) lives in
  // the module store since leg 3 — the header-mounted strip (chrome) writes it, this
  // runtime (body/query) reads it. See polls-feed-controls-store.ts for the protocol.
  const feedState = usePollsFeedControlsStore((state) => state.feedState);
  const feedSort = usePollsFeedControlsStore((state) => state.feedSort);
  const feedType = usePollsFeedControlsStore((state) => state.feedType);
  const feedTime = usePollsFeedControlsStore((state) => state.feedTime);

  const contentBottomPadding = resolveChinlessContentBottomPadding(insets.bottom);
  // F1494: `mode` is the single literal 'docked' (see polls-panel-runtime-contract.ts),
  // so this always resolved to 'collapsed' — the 'overlay' arm was dead. F6900 then
  // dropped `mode` from this runtime's args entirely: it was supplied and never bound.
  const initialSnap: PollsPanelInitialSnapPoint = initialSnapPoint ?? 'collapsed';
  const resolvedSnap = currentSnap ?? initialSnap;
  const headerAction: 'create' | 'close' =
    resolvedSnap === 'collapsed' || resolvedSnap === 'hidden' ? 'create' : 'close';
  // §6 place slicing died with Job 4 (place selection flies the camera; no
  // placeFilterId is ever sent) — the loaded pages ARE the feed; no
  // render-time client filter exists.
  // HEADER SUBJECT-STORE — now the ONLY naming authority (2026-08-08): the
  // same shared law run on-device against the sliding catalog slice,
  // committed via settle+dwell hysteresis. The server no longer publishes a
  // header name at all; before the store's first commit the title renders
  // its resolving placeholder (isResolvingPlace), never a stale server
  // string that a later commit would contradict.
  const verdict = useViewportSubjectVerdict();
  const effectivePlaceName = verdict != null && verdict.kind === 'place' ? verdict.placeName : null;
  const headerVisualModel = React.useMemo(
    () =>
      buildPollsHeaderVisualModel({
        placeName: effectivePlaceName,
        isResolvingPlace: verdict == null && loading && !effectivePlaceName && polls.length === 0,
      }),
    [effectivePlaceName, loading, polls.length, verdict]
  );

  const { loadMorePolls, isFeedSliceAwaiting } = usePollsFeedRuntimeController({
    visible,
    feedState,
    feedSort,
    feedType,
    feedTime,
    setPolls,
    setPromise,
    setLoading,
    setPollFeedLoadFailed,
    isSystemUnavailable,
    pollIdParam: params?.pollId,
    interactionRef,
  });

  // Feed-query toggle presses (toggle-system v2.1, leg-3 shape): the header strip's
  // store write IS the optimistic flip; the network consequence is wired inside the
  // feed controller, which subscribes to the store's control keys and hands the
  // refresh to the shared toggle engine (one quiet refresh per press burst).

  return React.useMemo(
    () => ({
      contentBottomPadding,
      headerAction,
      headerVisualModel,
      // The published place verdict is the STORE's once committed (see above);
      // downstream mouths (header model → creation label) read one authority.
      headerPlaceName: effectivePlaceName,
      isSystemUnavailable,
      loading,
      pollFeedLoadFailed,
      polls,
      promise,
      resolvedSnap,
      loadMorePolls,
      isFeedSliceAwaiting,
    }),
    [
      contentBottomPadding,
      headerAction,
      headerVisualModel,
      effectivePlaceName,
      isSystemUnavailable,
      loading,
      pollFeedLoadFailed,
      polls,
      promise,
      resolvedSnap,
      loadMorePolls,
      isFeedSliceAwaiting,
    ]
  );
};
