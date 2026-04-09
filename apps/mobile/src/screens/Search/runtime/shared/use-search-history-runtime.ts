import useSearchHistory from '../../hooks/use-search-history';

type UseSearchHistoryRuntimeArgs = {
  isSignedIn: boolean;
};

export const useSearchHistoryRuntime = ({ isSignedIn }: UseSearchHistoryRuntimeArgs) => {
  return useSearchHistory({ isSignedIn });
};
