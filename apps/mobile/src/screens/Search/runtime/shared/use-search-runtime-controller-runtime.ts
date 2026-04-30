import React from 'react';

type DisposableRuntime = {
  dispose(): void;
};

export const useSearchRuntimeControllerRuntime = <T extends DisposableRuntime>(
  createController: () => T
): T => {
  const controllerRef = React.useRef<T | null>(null);

  if (controllerRef.current == null) {
    controllerRef.current = createController();
  }

  const controller = controllerRef.current;

  React.useEffect(
    () => () => {
      controller.dispose();
    },
    [controller]
  );

  return controller;
};
