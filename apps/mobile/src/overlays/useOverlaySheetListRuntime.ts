import React from 'react';
import type { FlashListRef } from '@shopify/flash-list';

import { getOverlayScrollOffset, setOverlayScrollOffset } from './sceneScrollStateRegistry';
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

  // Cross-SCENE offset save/restore ONLY. The effect used to depend on `spec`, so every
  // body-content republish (each variant rerun swaps the spec) re-applied the stored
  // offset to the SAME scene — any transiently captured offset became sticky, and a
  // user scroll-to-top was undone on the next spec churn (the owner's "reveals scrolled
  // to cards 4–6 and hard to get out of"). The spec is read through a ref; the effect
  // fires only when the scene identity (or visibility) actually changes.
  const specRef = React.useRef(spec);
  specRef.current = spec;
  React.useLayoutEffect(() => {
    if (!visible || !isListBackedSpec) {
      return;
    }

    const previousKey = lastSceneIdentityRef.current;
    if (previousKey === sceneIdentityKey) {
      return;
    }
    if (previousKey) {
      setOverlayScrollOffset(previousKey, scrollOffset.value);
    }
    lastSceneIdentityRef.current = sceneIdentityKey;

    const storedOffset = getOverlayScrollOffset(sceneIdentityKey);
    const nextOffset = Math.max(0, storedOffset);

    const applyOffset = () => {
      const currentSpec = specRef.current;
      if (!isOverlayListContentSpec(currentSpec)) {
        return false;
      }
      const list = (currentSpec.listRef ?? internalListRef).current;
      scrollOffset.value = nextOffset;
      if (!list?.scrollToOffset) {
        return false;
      }
      if (__DEV__ && nextOffset > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[SCROLLDBG] scene-restore apply scene=${sceneIdentityKey} offset=${nextOffset}`
        );
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
  }, [isListBackedSpec, sceneIdentityKey, scrollOffset, setOverlayScrollOffset, visible]);

  return React.useMemo(
    () => ({
      isListBackedSpec,
      resolvedListRef,
      handleScrollOffsetChange,
    }),
    [handleScrollOffsetChange, isListBackedSpec, resolvedListRef]
  );
};
