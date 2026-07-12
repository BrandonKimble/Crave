import React from 'react';
import type { OptionSelectorSheetOption } from './OptionSelectorSheet';

/**
 * Imperative dropdown-toggle selector (plans/toggle-strip-primitive.md): the root-hosted
 * counterpart of `OptionSelectorSheet`, mirroring the `showAppModal` mechanics. A strip's
 * `SelectorChip` calls `showOptionSelector(config)` from its press handler — no
 * per-surface sheet mounting, no z-index/clipping concerns inside list headers or
 * scene-spec hooks (the sheet renders once at the app root via `OptionSelectorHost`).
 * `useOptionSelectorOpenKey` gives chips their chevron/expanded state.
 */
export type OptionSelectorConfig<T extends string = string> = {
  /** Stable identity for the OPENING chip (chevron state rides it), e.g. 'poll-feed-sort'. */
  key: string;
  title: string;
  options: readonly OptionSelectorSheetOption<T>[];
  value: T;
  onSelect: (value: T) => void;
  accentColor?: string;
  testID?: string;
};

let currentConfig: OptionSelectorConfig | null = null;
const listeners = new Set<() => void>();

const emit = (): void => {
  listeners.forEach((listener) => listener());
};

export const showOptionSelector = <T extends string>(config: OptionSelectorConfig<T>): void => {
  currentConfig = config as unknown as OptionSelectorConfig;
  emit();
};

export const closeOptionSelector = (key?: string): void => {
  if (currentConfig == null || (key != null && currentConfig.key !== key)) {
    return;
  }
  currentConfig = null;
  emit();
};

/** Toggle affordance: pressing the chip while its selector is open closes it. */
export const toggleOptionSelector = <T extends string>(config: OptionSelectorConfig<T>): void => {
  if (currentConfig?.key === config.key) {
    closeOptionSelector();
    return;
  }
  showOptionSelector(config);
};

export const getOptionSelectorConfig = (): OptionSelectorConfig | null => currentConfig;

export const subscribeOptionSelector = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The open selector's key (null when closed) — a chip's `expanded` = key match. */
export const useOptionSelectorOpenKey = (): string | null =>
  React.useSyncExternalStore(
    subscribeOptionSelector,
    () => currentConfig?.key ?? null,
    () => null
  );
