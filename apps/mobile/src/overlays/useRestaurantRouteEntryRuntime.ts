import React from 'react';

import {
  createRestaurantRoutePanelContract,
  createRestaurantRoutePanelDraft,
} from './restaurantRoutePanelContract';
import type {
  RestaurantOverlayData,
  RestaurantRoutePanelContract,
  RestaurantRoutePanelDraft,
  RestaurantRoutePanelHostConfig,
} from './restaurantRoutePanelContract';

// F5000: this used to take a two-armed source union — a parent-scoped `panelDraft` (from the
// global-restaurant route draft) OR search-scoped `data`. The panelDraft arm's only producer,
// `openRestaurantRoute`, had no callers, so that arm was never taken; `data` is the source.
type UseRestaurantRouteEntryRuntimeArgs = {
  data: RestaurantOverlayData | null;
  hostConfig: RestaurantRoutePanelHostConfig | null;
  onRequestClose: RestaurantRoutePanelContract['onRequestClose'];
};

export type RestaurantRouteEntryRuntime = {
  panel: RestaurantRoutePanelContract | null;
  hostConfig: RestaurantRoutePanelHostConfig | null;
};

// F4507: the retained draft used to carry `onToggleFavorite` as a second identity axis,
// so a re-minted handler forced a new draft. The handler was dead; the PAYLOAD signature
// is the whole identity now.
type RetainedRestaurantRoutePanelDraft = {
  panelDraft: RestaurantRoutePanelDraft | null;
  payloadSignature: string | null;
};

const createPanelDraftPayloadSignature = (
  panelDraft: RestaurantRoutePanelDraft | null
): string | null => (panelDraft == null ? null : JSON.stringify(panelDraft.data));

const useStableEvent = <TArgs extends readonly unknown[], TResult>(
  handler: (...args: TArgs) => TResult
): ((...args: TArgs) => TResult) => {
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;

  return React.useCallback((...args: TArgs) => handlerRef.current(...args), []);
};

export const useRestaurantRouteEntryRuntime = ({
  data,
  hostConfig,
  onRequestClose,
}: UseRestaurantRouteEntryRuntimeArgs): RestaurantRouteEntryRuntime => {
  const stableRequestClose = useStableEvent(onRequestClose);
  const panelDraft = React.useMemo(() => createRestaurantRoutePanelDraft({ data }), [data]);
  const retainedPanelDraftRef = React.useRef<RetainedRestaurantRoutePanelDraft>({
    panelDraft: null,
    payloadSignature: null,
  });
  const nextPayloadSignature = createPanelDraftPayloadSignature(panelDraft);
  const retainedPanelDraft = retainedPanelDraftRef.current;
  const resolvedPanelDraft =
    retainedPanelDraft.payloadSignature === nextPayloadSignature
      ? retainedPanelDraft.panelDraft
      : panelDraft;
  if (retainedPanelDraft.panelDraft !== resolvedPanelDraft) {
    retainedPanelDraftRef.current = {
      panelDraft: resolvedPanelDraft,
      payloadSignature: nextPayloadSignature,
    };
  }

  const panel = React.useMemo(
    () =>
      resolvedPanelDraft == null
        ? null
        : createRestaurantRoutePanelContract({
            ...resolvedPanelDraft,
            onRequestClose: stableRequestClose,
          }),
    [resolvedPanelDraft, stableRequestClose]
  );

  return React.useMemo(
    () => ({
      panel,
      hostConfig,
    }),
    [hostConfig, panel]
  );
};
