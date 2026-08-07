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
  // F7801: after F5000 collapsed the two-armed source union to `data`,
  // `createRestaurantRoutePanelDraft` always returns an object, so the panel is never
  // absent — the `| null` here was an unreachable state. Absence is modelled ONCE, as
  // `data: null` inside the contract (the host's own off-switch operates on the scene
  // descriptor's spec, not on this panel). Narrowed to non-null so the dead guards die by
  // compile.
  panel: RestaurantRoutePanelContract;
  hostConfig: RestaurantRoutePanelHostConfig | null;
};

// F4507: the retained draft used to carry `onToggleFavorite` as a second identity axis,
// so a re-minted handler forced a new draft. The handler was dead; the PAYLOAD signature
// is the whole identity now. F7801: the retained slot is initialised lazily (ref === null
// until the first render); a populated slot always carries both a draft and its signature.
type RetainedRestaurantRoutePanelDraft = {
  panelDraft: RestaurantRoutePanelDraft;
  payloadSignature: string;
};

const createPanelDraftPayloadSignature = (panelDraft: RestaurantRoutePanelDraft): string =>
  JSON.stringify(panelDraft.data);

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
  const retainedPanelDraftRef = React.useRef<RetainedRestaurantRoutePanelDraft | null>(null);
  const nextPayloadSignature = createPanelDraftPayloadSignature(panelDraft);
  const retainedPanelDraft = retainedPanelDraftRef.current;
  const resolvedPanelDraft =
    retainedPanelDraft != null && retainedPanelDraft.payloadSignature === nextPayloadSignature
      ? retainedPanelDraft.panelDraft
      : panelDraft;
  if (retainedPanelDraftRef.current?.panelDraft !== resolvedPanelDraft) {
    retainedPanelDraftRef.current = {
      panelDraft: resolvedPanelDraft,
      payloadSignature: nextPayloadSignature,
    };
  }

  const panel = React.useMemo(
    () =>
      createRestaurantRoutePanelContract({
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
