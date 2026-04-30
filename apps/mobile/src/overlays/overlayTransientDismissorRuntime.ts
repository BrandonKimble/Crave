type DismissHandler = () => void;

const transientDismissors = new Set<DismissHandler>();

export const registerTransientDismissor = (
  handler: DismissHandler
): (() => void) => {
  transientDismissors.add(handler);
  return () => {
    transientDismissors.delete(handler);
  };
};

export const dismissTransientOverlays = (): void => {
  Array.from(transientDismissors).forEach((handler) => {
    try {
      handler();
    } catch (error) {
      console.warn('transient overlay dismissal error', error);
    }
  });
};
