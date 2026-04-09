import React from 'react';

type SubmitShortcutSearchRef = React.MutableRefObject<
  (args: {
    targetTab: 'dishes' | 'restaurants';
    label: string;
    preserveSheetState?: boolean;
    transitionFromDockedPolls?: boolean;
    scoreMode?: string | null;
  }) => Promise<void>
>;

type UseSearchShortcutHarnessBridgeRuntimeArgs = {
  submitShortcutSearchRef: SubmitShortcutSearchRef;
  setQuery: (value: string) => void;
  submitViewportShortcut: (
    targetTab: 'dishes' | 'restaurants',
    label: string,
    options?: {
      preserveSheetState?: boolean;
      transitionFromDockedPolls?: boolean;
      scoreMode?: string | null;
    }
  ) => Promise<void>;
};

export const useSearchShortcutHarnessBridgeRuntime = ({
  submitShortcutSearchRef,
  setQuery,
  submitViewportShortcut,
}: UseSearchShortcutHarnessBridgeRuntimeArgs) => {
  submitShortcutSearchRef.current = async ({
    targetTab,
    label,
    preserveSheetState,
    transitionFromDockedPolls,
    scoreMode: harnessScoreMode,
  }) => {
    setQuery(label);
    await submitViewportShortcut(targetTab, label, {
      preserveSheetState,
      transitionFromDockedPolls,
      scoreMode: harnessScoreMode,
    });
  };
};
