import { getResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';

export const useSearchRootSearchSceneListPreparedRowsReadinessPatchRuntime = ({
  resultsPreparedRowsKey,
}: {
  resultsPreparedRowsKey: string | null;
}): boolean => {
  const preparedRowsSnapshot =
    getResultsPresentationSurfaceAuthority().getSnapshot().preparedRows;

  return (
    resultsPreparedRowsKey != null &&
    preparedRowsSnapshot.readyReadinessKey === resultsPreparedRowsKey
  );
};
