import React from 'react';
import type { FlashListRef } from '@shopify/flash-list';

import { useOverlayStore } from '../store/overlayStore';
import { isOverlayListContentSpec } from './types';
import type {
  OverlaySheetListRuntime,
  OverlaySheetListRuntimeArgs,
} from './overlaySheetShellRuntimeContract';

export const useOverlaySheetListRuntime = ({
  visible,
  spec,
  sceneIdentityKey,
  scrollOffset,
}: OverlaySheetListRuntimeArgs): OverlaySheetListRuntime => {
  const setOverlayScrollOffset = useOverlayStore((state) => state.setOverlayScrollOffset);
  const isListBackedSpec = isOverlayListContentSpec(spec);
  const internalListRef = React.useRef<FlashListRef<unknown> | null>(null);
  const resolvedListRef = isListBackedSpec && spec.listRef ? spec.listRef : internalListRef;
  const lastSceneIdentityRef = React.useRef<string | null>(null);

  const handleScrollOffsetChange = React.useCallback(
    (nextOffset: number) => {
      spec?.onScrollOffsetChange?.(nextOffset);
      if (!isListBackedSpec) {
        return;
      }
      setOverlayScrollOffset(sceneIdentityKey, nextOffset);
    },
    [isListBackedSpec, sceneIdentityKey, setOverlayScrollOffset, spec]
  );

  React.useLayoutEffect(() => {
    if (!visible || !isListBackedSpec) {
      return;
    }

    const previousKey = lastSceneIdentityRef.current;
    if (previousKey && previousKey !== sceneIdentityKey) {
      setOverlayScrollOffset(previousKey, scrollOffset.value);
    }
    lastSceneIdentityRef.current = sceneIdentityKey;

    const storedOffset = useOverlayStore.getState().overlayScrollOffsets[sceneIdentityKey] ?? 0;
    const nextOffset = Math.max(0, storedOffset);

    const applyOffset = () => {
      if (!isOverlayListContentSpec(spec)) {
        return false;
      }
      const list = (spec.listRef ?? internalListRef).current;
      scrollOffset.value = nextOffset;
      if (!list?.scrollToOffset) {
        return false;
      }
      list.scrollToOffset({ offset: nextOffset, animated: false });
      return true;
    };

    applyOffset();

    const animationFrameId = requestAnimationFrame(() => {
      applyOffset();
    });

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isListBackedSpec, sceneIdentityKey, scrollOffset, setOverlayScrollOffset, spec, visible]);

  return React.useMemo(
    () => ({
      isListBackedSpec,
      resolvedListRef,
      handleScrollOffsetChange,
    }),
    [handleScrollOffsetChange, isListBackedSpec, resolvedListRef]
  );
};
