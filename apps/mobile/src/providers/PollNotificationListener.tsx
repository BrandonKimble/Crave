import React from 'react';
import * as Notifications from 'expo-notifications';
import { useAppRouteCoordinator } from '../navigation/runtime/AppRouteCoordinator';
import { parseLaunchIntentFromUrl } from '../navigation/runtime/app-route-types';

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const PollNotificationListener: React.FC = () => {
  const { dispatchLaunchIntent } = useAppRouteCoordinator();

  const handleResponse = React.useCallback(
    (response: Notifications.NotificationResponse) => {
      const payload = response.notification.request.content.data;
      if (!payload) {
        return;
      }

      // S-E (addressability): a notification carrying a `url` routes through THE codec —
      // one path vocabulary for share links, deep links, and notification payloads. Any
      // /r /e /u /l /list /q /s /p path works here with zero per-type handler code.
      const urlRaw = (payload as { url?: unknown }).url;
      if (typeof urlRaw === 'string' && urlRaw.trim()) {
        const intent = parseLaunchIntentFromUrl(urlRaw.trim());
        if (intent.type !== 'none' && intent.type !== 'external') {
          dispatchLaunchIntent(intent);
          return;
        }
      }

      if ((payload as { type?: string }).type !== 'poll_release') {
        return;
      }

      // Poll-release push → open the polls surface (the feed is viewport-scoped;
      // the payload's placeId targets DELIVERY server-side, not the route).
      const pollIdsRaw = (payload as { pollIds?: unknown }).pollIds;
      const pollIds = isStringArray(pollIdsRaw) ? pollIdsRaw : [];

      dispatchLaunchIntent({
        type: 'polls',
        pollId: pollIds[0] ?? null,
      });
    },
    [dispatchLaunchIntent]
  );

  // F1555 (2026-08-04): `handleResponse` is latest-value-mirrored into a ref so BOTH
  // effects below can run with an EMPTY dep array — their arity is a stated mount-once
  // fact, not an accident of `dispatchLaunchIntent` happening to be stable today.
  const handleResponseRef = React.useRef(handleResponse);
  handleResponseRef.current = handleResponse;

  // Live listener: fires per-response for the app's remaining lifetime. Deps: [] — a
  // stranger's dep array re-minting `handleResponse` must never re-subscribe this.
  React.useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleResponseRef.current(response);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  // Cold-launch intent: `getLastNotificationResponseAsync()` reads the LAST response,
  // which PERSISTS — this must run exactly once per mount, never re-fire because a
  // stranger's dep array re-ran the effect (the bug this finding recorded: the same
  // stored notification re-dispatched as a fresh launch intent, yanking the user back to
  // a poll they already dismissed). `alive` also guards a response resolving after unmount.
  React.useEffect(() => {
    let alive = true;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response && alive) {
          handleResponseRef.current(response);
        }
      })
      .catch((error) => {
        console.warn('[Notifications] Failed to hydrate last response', error);
      });
    return () => {
      alive = false;
    };
  }, []);

  return null;
};

export default PollNotificationListener;
