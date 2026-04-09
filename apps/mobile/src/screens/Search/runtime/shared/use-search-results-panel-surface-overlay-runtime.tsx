import React from 'react';
import { View } from 'react-native';
import Reanimated from 'react-native-reanimated';

import SquircleSpinner from '../../../../components/SquircleSpinner';
import EmptyState from '../../components/empty-state';
import { ACTIVE_TAB_COLOR } from '../../constants/search';
import type { UseSearchResultsRoutePublicationArgs } from './search-results-panel-runtime-contract';
import type { SearchResultsPanelCoveredRenderRuntime } from './use-search-results-panel-covered-render-runtime';
import type { SearchResultsPanelDataRuntime } from './search-results-panel-data-runtime-contract';
import type { SearchResultsPanelInteractionFrostRuntime } from './use-search-results-panel-interaction-frost-runtime';
import type { SearchResultsPanelRenderPolicyRuntime } from './use-search-results-panel-render-policy-runtime';
import styles from '../../styles';

const RESULTS_LOADING_SPINNER_OFFSET = 96;

type UseSearchResultsPanelSurfaceOverlayRuntimeArgs = Pick<
  UseSearchResultsRoutePublicationArgs,
  'resultsPanelVisualRuntimeModel'
> & {
  panelDataRuntime: SearchResultsPanelDataRuntime;
  coveredRenderRuntime: SearchResultsPanelCoveredRenderRuntime;
  renderPolicyRuntime: SearchResultsPanelRenderPolicyRuntime;
  interactionFrostRuntime: SearchResultsPanelInteractionFrostRuntime;
};

export type SearchResultsPanelSurfaceOverlayRuntime = {
  resultsOverlayComponent: React.ReactNode;
};

export const useSearchResultsPanelSurfaceOverlayRuntime = ({
  resultsPanelVisualRuntimeModel,
  panelDataRuntime,
  coveredRenderRuntime,
  renderPolicyRuntime,
  interactionFrostRuntime,
}: UseSearchResultsPanelSurfaceOverlayRuntimeArgs): SearchResultsPanelSurfaceOverlayRuntime => {
  const { resultsWashAnimatedStyle } = resultsPanelVisualRuntimeModel;
  const { activeTab, resolvedResults, onDemandNotice } = panelDataRuntime;
  const { effectiveFiltersHeaderHeightForRender, resolvedResultsHeaderHeightForRender } =
    coveredRenderRuntime;
  const { surfaceMode, surfaceActive, shouldUseInteractionSurface, shouldRenderWhiteWash } =
    renderPolicyRuntime;
  const { interactionFrostAnimatedStyle } = interactionFrostRuntime;

  const surfaceContent = React.useMemo(() => {
    if (surfaceMode === 'none') {
      return null;
    }
    if (surfaceMode === 'empty') {
      const emptyTitle = activeTab === 'dishes' ? 'No dishes found.' : 'No restaurants found.';
      const emptySubtitle =
        resolvedResults?.metadata?.emptyQueryMessage ??
        'Try moving the map or adjusting your search.';
      return (
        <View style={styles.emptyState}>
          {onDemandNotice}
          <EmptyState title={emptyTitle} subtitle={emptySubtitle} />
        </View>
      );
    }
    return (
      <View style={{ paddingTop: RESULTS_LOADING_SPINNER_OFFSET }}>
        <SquircleSpinner size={22} color={ACTIVE_TAB_COLOR} />
      </View>
    );
  }, [activeTab, onDemandNotice, resolvedResults?.metadata?.emptyQueryMessage, surfaceMode]);

  const initialLoadingTopOffset = resolvedResultsHeaderHeightForRender;
  const interactionLoadingTopOffset =
    initialLoadingTopOffset + effectiveFiltersHeaderHeightForRender;

  const resultsOverlayComponent = React.useMemo(() => {
    const overlayTopOffset = shouldUseInteractionSurface
      ? interactionLoadingTopOffset
      : initialLoadingTopOffset;
    const surfaceStyle = shouldUseInteractionSurface
      ? styles.resultsSurfaceInteraction
      : styles.resultsSurface;
    const interactionSurfaceStyle = shouldUseInteractionSurface
      ? [surfaceStyle, { top: overlayTopOffset }, interactionFrostAnimatedStyle]
      : null;
    return (
      <>
        {shouldRenderWhiteWash ? (
          <Reanimated.View
            pointerEvents="none"
            style={[
              styles.resultsWashOverlay,
              { top: initialLoadingTopOffset },
              resultsWashAnimatedStyle,
            ]}
          />
        ) : null}
        {surfaceActive && shouldUseInteractionSurface ? (
          <Reanimated.View style={interactionSurfaceStyle}>{surfaceContent}</Reanimated.View>
        ) : null}
        {surfaceActive && !shouldUseInteractionSurface ? (
          <View style={[surfaceStyle, { top: overlayTopOffset }]}>{surfaceContent}</View>
        ) : null}
      </>
    );
  }, [
    initialLoadingTopOffset,
    interactionFrostAnimatedStyle,
    interactionLoadingTopOffset,
    resultsWashAnimatedStyle,
    shouldRenderWhiteWash,
    shouldUseInteractionSurface,
    surfaceActive,
    surfaceContent,
  ]);

  return React.useMemo(
    () => ({
      resultsOverlayComponent,
    }),
    [resultsOverlayComponent]
  );
};
