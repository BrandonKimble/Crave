import { captureHandledError } from '../observability/crash-reporting';

type DismissHandler = () => void;

const transientDismissors = new Set<DismissHandler>();

export const registerTransientDismissor = (handler: DismissHandler): (() => void) => {
  transientDismissors.add(handler);
  return () => {
    transientDismissors.delete(handler);
  };
};

/**
 * Dismiss every registered transient overlay.
 *
 * PER-HANDLER ISOLATION IS DELIBERATE: one bad dismissor must not block the rest of
 * the list. But a dismissor that throws leaves its overlay ON SCREEN while the caller
 * proceeds as if the screen were clear, and the old `console.warn` for that case is
 * STRIPPED IN RELEASE — the failure was invisible on the only lane that matters
 * (F913). So the failure is now honest where it matters: it reaches the owner through
 * the app's real Release-visible sink instead of a console call nobody will ever see.
 *
 * NOT DONE HERE, deliberately: returning the failed COUNT so a caller that needs a
 * genuinely clear screen can act on it. Every one of the ~15 consumer contracts in
 * screens/Search declares this verb as `() => void`, and that territory is a
 * concurrent lane — widening the return type belongs with the pass that owns those
 * files, not to a drive-by from here.
 */
export const dismissTransientOverlays = (): void => {
  Array.from(transientDismissors).forEach((handler) => {
    try {
      handler();
    } catch (error) {
      captureHandledError(error, { scope: 'overlayTransientDismissorRuntime' });
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.error(
          '[TRANSIENT-DISMISS] a dismissor threw — its overlay is STILL ON SCREEN',
          error
        );
      }
    }
  });
};
