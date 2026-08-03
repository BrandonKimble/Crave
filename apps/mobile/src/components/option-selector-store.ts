import type { OptionSelectorSheetOption } from './OptionSelectorSheet';
import { createSingletonSurfaceStore } from './singleton-surface-store';

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

/**
 * The one selector whose identity is NOT the payload object: a chip holds its
 * stable `key`, not the config it built, so the shared factory is instantiated
 * with `identityOf = config.key`. Same race fix, same code — only the identity
 * rule differs, which is exactly the thing a factory parameter is for.
 */
const store = createSingletonSurfaceStore<OptionSelectorConfig, string>({
  identityOf: (config) => config.key,
});

export const optionSelectorStore = store;

export const showOptionSelector = <T extends string>(config: OptionSelectorConfig<T>): void => {
  store.show(config as unknown as OptionSelectorConfig);
};

export const closeOptionSelector = (key?: string): void => store.close(key);

/** Toggle affordance: pressing the chip while its selector is open closes it. */
export const toggleOptionSelector = <T extends string>(config: OptionSelectorConfig<T>): void => {
  if (store.getSnapshot()?.key === config.key) {
    closeOptionSelector(config.key);
    return;
  }
  showOptionSelector(config);
};

export const getOptionSelectorConfig = (): OptionSelectorConfig | null => store.getSnapshot();

export const subscribeOptionSelector = (listener: () => void): (() => void) =>
  store.subscribe(listener);

/** The open selector's key (null when closed) — a chip's `expanded` = key match. */
export const useOptionSelectorOpenKey = (): string | null => store.useIdentity();
