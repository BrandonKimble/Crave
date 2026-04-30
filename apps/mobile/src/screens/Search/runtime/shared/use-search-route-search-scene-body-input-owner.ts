import React from 'react';
import { StyleSheet } from 'react-native';

import type { RouteShellSceneInputLane } from '../../../../navigation/runtime/app-route-scene-runtime';
import type {
  AppRouteSceneBodyAdmissionPolicy,
  AppRouteSceneBodyContentSpec,
  AppRouteSceneBodyTransportSpec,
} from '../../../../navigation/runtime/app-route-scene-descriptor-contract';
import { syncSearchMountedSceneBodySnapshot } from '../../../../overlays/SearchMountedSceneBody';
import type { useSearchRouteSearchSceneModelOwner } from './use-search-route-search-scene-model-owner';

const SEARCH_MOUNTED_LIST_BODY_ADMISSION_POLICY: AppRouteSceneBodyAdmissionPolicy = {
  retainMountedBodyDuringTransition: false,
};

const SEARCH_MOUNTED_LIST_BODY_CONTENT: AppRouteSceneBodyContentSpec = {
  surfaceKind: 'mountedList',
  mountedBodyKey: 'search',
};

const SEARCH_MOUNTED_LIST_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {};

type SearchMountedListSceneBodyDescriptor = {
  sceneBodyContent: AppRouteSceneBodyContentSpec;
  sceneBodyTransport: AppRouteSceneBodyTransportSpec;
};

type SearchMountedListBodyContentSpec = Extract<
  AppRouteSceneBodyContentSpec,
  { surfaceKind: 'list' }
>;

type SearchMountedListBodyTransportSpec = AppRouteSceneBodyTransportSpec;

const arePlainObjectsShallowEqual = (
  left: Record<string, unknown> | null | undefined,
  right: Record<string, unknown> | null | undefined
): boolean => {
  if (left === right) {
    return true;
  }
  if (left == null || right == null) {
    return left == null && right == null;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.is(left[key], right[key]))
  );
};

const useShallowStablePlainObject = <TValue>(value: TValue): TValue => {
  const valueRef = React.useRef(value);
  const flatValue = StyleSheet.flatten(value as never) as Record<string, unknown> | undefined;
  const flatValueRef = React.useRef(flatValue);
  if (!arePlainObjectsShallowEqual(flatValueRef.current, flatValue)) {
    valueRef.current = value;
    flatValueRef.current = flatValue;
  }
  return valueRef.current;
};

const useLatestRef = <TValue>(value: TValue): React.MutableRefObject<TValue> => {
  const valueRef = React.useRef(value);
  valueRef.current = value;
  return valueRef;
};

export const useSearchRouteSearchSceneBodyInputOwner = ({
  routeSceneInputLane,
  routeSearchSceneModel,
}: {
  routeSceneInputLane: RouteShellSceneInputLane;
  routeSearchSceneModel: ReturnType<typeof useSearchRouteSearchSceneModelOwner>;
}): void => {
  const lastPublishedBodyRef = React.useRef<SearchMountedListSceneBodyDescriptor | null>(null);
  const rawSceneBodyContent = routeSearchSceneModel.routeSearchSceneListBodyContentSnapshot;
  const rawSceneBodyTransport = routeSearchSceneModel.routeSearchSceneListBodyTransportSnapshot;
  const rawSceneBodyContentRef = useLatestRef(rawSceneBodyContent);
  const rawSceneBodyTransportRef = useLatestRef(rawSceneBodyTransport);
  const stableContentContainerStyle = useShallowStablePlainObject(
    rawSceneBodyTransport.contentContainerStyle
  );
  const stableScrollIndicatorInsets = useShallowStablePlainObject(
    rawSceneBodyTransport.scrollIndicatorInsets
  );
  const stablePrimaryRenderItem = React.useCallback<
    NonNullable<SearchMountedListBodyContentSpec['renderItem']>
  >((info) => rawSceneBodyContentRef.current.renderItem?.(info) ?? null, [rawSceneBodyContentRef]);
  const stablePrimaryKeyExtractor = React.useCallback<
    NonNullable<SearchMountedListBodyContentSpec['keyExtractor']>
  >(
    (item, index) => rawSceneBodyContentRef.current.keyExtractor?.(item, index) ?? `${index}`,
    [rawSceneBodyContentRef]
  );
  const stableSecondaryRenderItem = React.useCallback<
    NonNullable<NonNullable<SearchMountedListBodyContentSpec['secondaryList']>['renderItem']>
  >(
    (info) => rawSceneBodyContentRef.current.secondaryList?.renderItem?.(info) ?? null,
    [rawSceneBodyContentRef]
  );
  const stableSecondaryKeyExtractor = React.useCallback<
    NonNullable<NonNullable<SearchMountedListBodyContentSpec['secondaryList']>['keyExtractor']>
  >(
    (item, index) =>
      rawSceneBodyContentRef.current.secondaryList?.keyExtractor?.(item, index) ?? `${index}`,
    [rawSceneBodyContentRef]
  );
  const stableOnScrollOffsetChange = React.useCallback<
    NonNullable<SearchMountedListBodyTransportSpec['onScrollOffsetChange']>
  >(
    (...args) => rawSceneBodyTransportRef.current.onScrollOffsetChange?.(...args),
    [rawSceneBodyTransportRef]
  );
  const stableOnScrollBeginDrag = React.useCallback<
    NonNullable<SearchMountedListBodyTransportSpec['onScrollBeginDrag']>
  >(
    (...args) => rawSceneBodyTransportRef.current.onScrollBeginDrag?.(...args),
    [rawSceneBodyTransportRef]
  );
  const stableOnScrollEndDrag = React.useCallback<
    NonNullable<SearchMountedListBodyTransportSpec['onScrollEndDrag']>
  >(
    (...args) => rawSceneBodyTransportRef.current.onScrollEndDrag?.(...args),
    [rawSceneBodyTransportRef]
  );
  const stableOnMomentumBeginJS = React.useCallback<
    NonNullable<SearchMountedListBodyTransportSpec['onMomentumBeginJS']>
  >(
    (...args) => rawSceneBodyTransportRef.current.onMomentumBeginJS?.(...args),
    [rawSceneBodyTransportRef]
  );
  const stableOnMomentumEndJS = React.useCallback<
    NonNullable<SearchMountedListBodyTransportSpec['onMomentumEndJS']>
  >(
    (...args) => rawSceneBodyTransportRef.current.onMomentumEndJS?.(...args),
    [rawSceneBodyTransportRef]
  );
  const stableSecondaryListContent = React.useMemo(
    () =>
      rawSceneBodyContent.secondaryList == null
        ? rawSceneBodyContent.secondaryList
        : {
            ...rawSceneBodyContent.secondaryList,
            renderItem:
              rawSceneBodyContent.secondaryList.renderItem == null
                ? undefined
                : stableSecondaryRenderItem,
            keyExtractor:
              rawSceneBodyContent.secondaryList.keyExtractor == null
                ? undefined
                : stableSecondaryKeyExtractor,
          },
    [
      rawSceneBodyContent.secondaryList?.ListEmptyComponent,
      rawSceneBodyContent.secondaryList?.ListFooterComponent,
      rawSceneBodyContent.secondaryList?.ListHeaderComponent,
      rawSceneBodyContent.secondaryList?.ItemSeparatorComponent,
      rawSceneBodyContent.secondaryList?.data,
      rawSceneBodyContent.secondaryList?.estimatedItemSize,
      rawSceneBodyContent.secondaryList?.extraData,
      rawSceneBodyContent.secondaryList?.keyExtractor == null,
      rawSceneBodyContent.secondaryList?.listKey,
      rawSceneBodyContent.secondaryList?.onEndReached,
      rawSceneBodyContent.secondaryList?.renderItem == null,
      stableSecondaryKeyExtractor,
      stableSecondaryRenderItem,
    ]
  );
  const stableSceneBodyContent = React.useMemo<SearchMountedListBodyContentSpec>(
    () => ({
      ...rawSceneBodyContent,
      renderItem: stablePrimaryRenderItem,
      keyExtractor:
        rawSceneBodyContent.keyExtractor == null ? undefined : stablePrimaryKeyExtractor,
      secondaryList: stableSecondaryListContent,
    }),
    [
      rawSceneBodyContent.ListEmptyComponent,
      rawSceneBodyContent.ListFooterComponent,
      rawSceneBodyContent.ListHeaderComponent,
      rawSceneBodyContent.ItemSeparatorComponent,
      rawSceneBodyContent.data,
      rawSceneBodyContent.estimatedItemSize,
      rawSceneBodyContent.extraData,
      rawSceneBodyContent.keyExtractor == null,
      rawSceneBodyContent.listKey,
      rawSceneBodyContent.onEndReached,
      rawSceneBodyContent.onEndReachedThreshold,
      stablePrimaryKeyExtractor,
      stablePrimaryRenderItem,
      stableSecondaryListContent,
    ]
  );
  const stableSceneBodyTransport = React.useMemo<SearchMountedListBodyTransportSpec>(
    () => ({
      ...rawSceneBodyTransport,
      contentContainerStyle: stableContentContainerStyle,
      scrollIndicatorInsets: stableScrollIndicatorInsets,
      onScrollOffsetChange:
        rawSceneBodyTransport.onScrollOffsetChange == null ? undefined : stableOnScrollOffsetChange,
      onScrollBeginDrag:
        rawSceneBodyTransport.onScrollBeginDrag == null ? undefined : stableOnScrollBeginDrag,
      onScrollEndDrag:
        rawSceneBodyTransport.onScrollEndDrag == null ? undefined : stableOnScrollEndDrag,
      onMomentumBeginJS:
        rawSceneBodyTransport.onMomentumBeginJS == null ? undefined : stableOnMomentumBeginJS,
      onMomentumEndJS:
        rawSceneBodyTransport.onMomentumEndJS == null ? undefined : stableOnMomentumEndJS,
    }),
    [
      rawSceneBodyTransport.activeList,
      rawSceneBodyTransport.alwaysBounceVertical,
      rawSceneBodyTransport.bounces,
      rawSceneBodyTransport.contentSurfaceStyle,
      rawSceneBodyTransport.flashListProps,
      rawSceneBodyTransport.keyboardDismissMode,
      rawSceneBodyTransport.keyboardShouldPersistTaps,
      rawSceneBodyTransport.listRef,
      rawSceneBodyTransport.onMomentumBeginJS == null,
      rawSceneBodyTransport.onMomentumEndJS == null,
      rawSceneBodyTransport.onScrollBeginDrag == null,
      rawSceneBodyTransport.onScrollEndDrag == null,
      rawSceneBodyTransport.onScrollOffsetChange == null,
      rawSceneBodyTransport.overScrollMode,
      rawSceneBodyTransport.secondaryList,
      rawSceneBodyTransport.showsVerticalScrollIndicator,
      rawSceneBodyTransport.testID,
      stableContentContainerStyle,
      stableOnMomentumBeginJS,
      stableOnMomentumEndJS,
      stableOnScrollBeginDrag,
      stableOnScrollEndDrag,
      stableOnScrollOffsetChange,
      stableScrollIndicatorInsets,
    ]
  );

  const publishBody = React.useCallback(
    (body: SearchMountedListSceneBodyDescriptor) => {
      if (
        lastPublishedBodyRef.current?.sceneBodyContent === body.sceneBodyContent &&
        lastPublishedBodyRef.current.sceneBodyTransport === body.sceneBodyTransport
      ) {
        return;
      }
      lastPublishedBodyRef.current = body;
      routeSceneInputLane.publishRouteSceneBody({
        sceneKey: 'search',
        sceneBodyContent: body.sceneBodyContent,
        sceneBodyTransport: body.sceneBodyTransport,
        sceneBodyAdmissionPolicy: SEARCH_MOUNTED_LIST_BODY_ADMISSION_POLICY,
      });
    },
    [routeSceneInputLane]
  );

  React.useEffect(() => {
    publishBody({
      sceneBodyContent: SEARCH_MOUNTED_LIST_BODY_CONTENT,
      sceneBodyTransport: SEARCH_MOUNTED_LIST_BODY_TRANSPORT,
    });
  }, [publishBody]);

  React.useEffect(() => {
    syncSearchMountedSceneBodySnapshot({
      sceneBodyContent: stableSceneBodyContent,
      sceneBodyTransport: stableSceneBodyTransport,
    });
  }, [stableSceneBodyContent, stableSceneBodyTransport]);
};
