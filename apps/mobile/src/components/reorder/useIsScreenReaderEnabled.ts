import React from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * WCAG 2.5.7 (page-registry §8.11): with a screen reader active, edit-mode
 * drag-reorder swaps the drag handles for move buttons. Shared by every
 * ReorderableRows consumer (favorites home + listDetail).
 */
export const useIsScreenReaderEnabled = (): boolean => {
  const [enabled, setEnabled] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (alive) {
        setEnabled(value);
      }
    });
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  return enabled;
};
