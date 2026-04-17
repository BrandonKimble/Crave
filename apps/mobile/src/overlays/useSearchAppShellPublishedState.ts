import React from 'react';
import { useShallow } from 'zustand/react/shallow';

import {
  getPublishedSearchAppShellRuntimeModels,
  useSearchAppShellRuntimeStore,
} from './searchAppShellRuntimeStore';

export const useSearchAppShellPublishedState = () => {
  const { isVisible, version } = useSearchAppShellRuntimeStore(
    useShallow((state) => ({
      isVisible: state.isVisible,
      version: state.version,
    }))
  );

  return React.useMemo(
    () => ({
      isVisible,
      ...getPublishedSearchAppShellRuntimeModels(),
    }),
    [isVisible, version]
  );
};
