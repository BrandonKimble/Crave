import type { SharedValue } from 'react-native-reanimated';

export type SearchBackdropTarget = 'default' | 'results';
export type SearchInputMode = 'idle' | 'editing';
export type SearchHeaderChromeMode = 'default' | 'editing' | 'results';
export type SearchSheetContentLane =
  | { kind: 'results_live' }
  | { kind: 'results_closing'; closeIntentId: string; targetSnap: 'collapsed' }
  | { kind: 'persistent_poll' };

export type SearchCloseTransitionState = {
  closeIntentId: string;
  mapExitSettled: boolean;
  sheetCollapsedReached: boolean;
  sheetCollapsedSettled: boolean;
} | null;

export type SearchPresentationIntent =
  | { kind: 'close' }
  | {
      kind: 'shortcut_submit';
      transactionId?: string;
      query: string;
      targetTab: 'restaurants' | 'dishes';
      preserveSheetState?: boolean;
      transitionFromDockedPolls?: boolean;
    }
  | {
      kind: 'manual_submit' | 'autocomplete_submit' | 'recent_submit' | 'search_this_area';
      transactionId?: string;
      query: string;
      targetTab?: 'restaurants' | 'dishes';
      preserveSheetState?: boolean;
      transitionFromDockedPolls?: boolean;
    }
  | { kind: 'focus_editing' }
  | { kind: 'exit_editing' };

export type SearchHeaderVisualModel = {
  displayQuery: string;
  chromeMode: SearchHeaderChromeMode;
  leadingIconMode: 'search' | 'back' | 'none';
  trailingActionMode: 'hidden' | 'default_clear' | 'session_clear';
  editable: boolean;
  shortcutsVisibleTarget: boolean;
  shortcutsInteractive: boolean;
};

export type SearchResultsShellModel = {
  backdropTarget: SearchBackdropTarget;
  inputMode: SearchInputMode;
  defaultChromeProgress: SharedValue<number>;
  headerVisualModel: SearchHeaderVisualModel;
  searchSheetContentLane: SearchSheetContentLane;
  isCloseTransitionActive: boolean;
};
