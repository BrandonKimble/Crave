import { useShallow } from 'zustand/react/shallow';

import { useSearchRequests } from '../../../../hooks/useSearchRequests';
import { useSystemStatusStore } from '../../../../store/systemStatusStore';

export const useSearchRequestStatusRuntime = () => {
  const requestsRuntime = useSearchRequests();
  const systemStatusRuntime = useSystemStatusStore(
    useShallow((state) => ({
      isOffline: state.isOffline,
      hasSystemStatusBanner: state.isOffline || Boolean(state.serviceIssue),
    }))
  );

  return {
    ...requestsRuntime,
    ...systemStatusRuntime,
  };
};
