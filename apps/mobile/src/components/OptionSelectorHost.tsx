import React from 'react';
import { OptionSelectorSheet } from './OptionSelectorSheet';
import {
  closeOptionSelector,
  getOptionSelectorConfig,
  subscribeOptionSelector,
} from './option-selector-store';

/**
 * Root host for the imperative dropdown-toggle selector (see option-selector-store.ts).
 * Mounted ONCE beside AppModalHost. Keeps the last config through the sheet's exit
 * animation so the options don't blank mid-slide-out.
 */
export const OptionSelectorHost: React.FC = () => {
  const config = React.useSyncExternalStore(
    subscribeOptionSelector,
    getOptionSelectorConfig,
    () => null
  );
  const lastConfigRef = React.useRef(config);
  if (config != null) {
    lastConfigRef.current = config;
  }
  const renderedConfig = config ?? lastConfigRef.current;
  if (renderedConfig == null) {
    return null;
  }
  return (
    <OptionSelectorSheet
      visible={config != null}
      title={renderedConfig.title}
      options={renderedConfig.options}
      value={renderedConfig.value}
      onSelect={(value) => renderedConfig.onSelect(value)}
      onRequestClose={() => closeOptionSelector()}
      accentColor={renderedConfig.accentColor}
      testID={renderedConfig.testID}
    />
  );
};
