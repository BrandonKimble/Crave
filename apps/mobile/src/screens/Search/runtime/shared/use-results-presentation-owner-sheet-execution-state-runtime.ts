import type { AppRouteResultsSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-results-sheet-runtime-contract';
import { useResultsPresentationSheetExecutionRuntime } from './use-results-presentation-sheet-execution-runtime';

type UseResultsPresentationOwnerSheetExecutionStateRuntimeArgs = {
  resultsSheetRuntime: Pick<
    AppRouteResultsSheetRuntimeOwner,
    | 'sheetTranslateY'
    | 'snapPoints'
    | 'animateSheetTo'
    | 'prepareShortcutSheetTransition'
    | 'shouldRenderResultsSheetRef'
    | 'resetResultsSheetToHidden'
  >;
};

export type ResultsPresentationOwnerSheetExecutionStateRuntime = ReturnType<
  typeof useResultsPresentationSheetExecutionRuntime
>;

export const useResultsPresentationOwnerSheetExecutionStateRuntime = ({
  resultsSheetRuntime,
}: UseResultsPresentationOwnerSheetExecutionStateRuntimeArgs): ResultsPresentationOwnerSheetExecutionStateRuntime =>
  useResultsPresentationSheetExecutionRuntime({
    resultsSheetRuntime,
  });
