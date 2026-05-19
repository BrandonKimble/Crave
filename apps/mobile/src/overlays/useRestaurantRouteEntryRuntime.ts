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

type RestaurantRouteEntrySource =
  | {
      panelDraft: RestaurantRoutePanelDraft | null;
      data?: never;
      onToggleFavorite?: never;
    }
  | {
      panelDraft?: never;
      data: RestaurantOverlayData | null;
      onToggleFavorite: RestaurantRoutePanelContract['onToggleFavorite'];
    };

type UseRestaurantRouteEntryRuntimeArgs = RestaurantRouteEntrySource & {
  hostConfig: RestaurantRoutePanelHostConfig | null;
  onRequestClose: RestaurantRoutePanelContract['onRequestClose'];
  isActive: boolean;
  onProfilerRender: React.ProfilerOnRenderCallback | null;
};

export type RestaurantRouteEntryRuntime = {
  isActive: boolean;
  panel: RestaurantRoutePanelContract | null;
  hostConfig: RestaurantRoutePanelHostConfig | null;
  onProfilerRender: React.ProfilerOnRenderCallback | null;
};

type RetainedRestaurantRoutePanelDraft = {
  panelDraft: RestaurantRoutePanelDraft | null;
  payloadSignature: string | null;
  onToggleFavorite: RestaurantRoutePanelDraft['onToggleFavorite'] | null;
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
  hostConfig,
  onRequestClose,
  isActive,
  onProfilerRender,
  ...source
}: UseRestaurantRouteEntryRuntimeArgs): RestaurantRouteEntryRuntime => {
  const sourcePanelDraft = 'panelDraft' in source ? source.panelDraft : undefined;
  const sourceData = 'data' in source ? source.data : undefined;
  const sourceToggleFavorite = 'onToggleFavorite' in source ? source.onToggleFavorite : undefined;
  const stableRequestClose = useStableEvent(onRequestClose);
  const stableToggleFavorite = useStableEvent(sourceToggleFavorite ?? (() => undefined));
  const panelDraft = React.useMemo(() => {
    if (sourcePanelDraft !== undefined) {
      return sourcePanelDraft;
    }

    return createRestaurantRoutePanelDraft({
      data: sourceData ?? null,
      onToggleFavorite: stableToggleFavorite,
    });
  }, [sourceData, sourcePanelDraft, stableToggleFavorite]);
  const retainedPanelDraftRef = React.useRef<RetainedRestaurantRoutePanelDraft>({
    panelDraft: null,
    payloadSignature: null,
    onToggleFavorite: null,
  });
  const nextPayloadSignature = createPanelDraftPayloadSignature(panelDraft);
  const retainedPanelDraft = retainedPanelDraftRef.current;
  const resolvedPanelDraft =
    retainedPanelDraft.payloadSignature === nextPayloadSignature &&
    retainedPanelDraft.onToggleFavorite === (panelDraft?.onToggleFavorite ?? null)
      ? retainedPanelDraft.panelDraft
      : panelDraft;
  if (retainedPanelDraft.panelDraft !== resolvedPanelDraft) {
    retainedPanelDraftRef.current = {
      panelDraft: resolvedPanelDraft,
      payloadSignature: nextPayloadSignature,
      onToggleFavorite: panelDraft?.onToggleFavorite ?? null,
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
      isActive,
      panel,
      hostConfig,
      onProfilerRender,
    }),
    [hostConfig, isActive, onProfilerRender, panel]
  );
};
