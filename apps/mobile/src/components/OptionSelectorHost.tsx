import React from 'react';
import { OptionSelectorSheet } from './OptionSelectorSheet';
import { optionSelectorStore } from './option-selector-store';
import { useSingletonSurfaceHost } from './singleton-surface-store';

/**
 * Root host for the imperative dropdown-toggle selector (see option-selector-store.ts).
 * Mounted ONCE beside AppModalHost. Keeps the last config through the sheet's exit
 * animation so the options don't blank mid-slide-out.
 */
export const OptionSelectorHost: React.FC = () => {
  const {
    visible,
    rendered: renderedConfig,
    requestClose,
  } = useSingletonSurfaceHost(optionSelectorStore);
  if (renderedConfig == null) {
    return null;
  }
  return (
    <OptionSelectorSheet
      visible={visible}
      title={renderedConfig.title}
      options={renderedConfig.options}
      value={renderedConfig.value}
      onSelect={(value) => renderedConfig.onSelect(value)}
      onRequestClose={requestClose}
      accentColor={renderedConfig.accentColor}
      testID={renderedConfig.testID}
    />
  );
};
