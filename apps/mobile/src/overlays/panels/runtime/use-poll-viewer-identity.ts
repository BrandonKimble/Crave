import React from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuthController } from '../../../hooks/use-auth-controller';
import { useAuth } from '@clerk/clerk-expo';
import { createProfileQueryOptions } from '../profileSceneQueryOptions';
import {
  getPollViewerIdentity,
  setPollViewerIdentity,
  subscribePollViewerIdentity,
} from './poll-viewer-identity-store';

/**
 * THE ONE SUBSCRIPTION FOR A LEG. Mounted exactly once — in the polls list
 * parts hook, which runs once per host render — and never inside a row.
 *
 * It is the ONLY place in the polls lane that talks to the profile query or the
 * auth controller, and it projects both down to the two values rows actually
 * render from. Row count is irrelevant to it by construction: it is not in the
 * row's tree.
 */
export const usePollViewerIdentityPublication = (): void => {
  const { isSignedIn } = useAuthController();
  const { userId } = useAuth();
  const { data: viewerProfile } = useQuery({
    ...createProfileQueryOptions(userId),
    enabled: isSignedIn,
  });
  const avatarUrl = viewerProfile?.avatarUrl ?? null;
  // WRITE IN AN EFFECT, not in render: this hook runs inside the parts hook that
  // BUILDS the list spec, and a store write during that render would notify rows
  // mid-render. The store drops no-op writes, so steady state costs one compare.
  React.useEffect(() => {
    setPollViewerIdentity({ isSignedIn, avatarUrl });
  }, [avatarUrl, isSignedIn]);
};

/**
 * THE ROW-SIDE READ. A two-field module-store subscription — not a react-query
 * cache subscription and not an auth controller — so a row re-renders when (and
 * only when) something it actually draws has changed.
 */
export const usePollViewerIdentity = (): ReturnType<typeof getPollViewerIdentity> =>
  React.useSyncExternalStore(subscribePollViewerIdentity, getPollViewerIdentity);
