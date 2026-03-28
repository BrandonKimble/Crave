import React from 'react';
import * as Notifications from 'expo-notifications';
import { useAppRouteCoordinator } from '../navigation/runtime/AppRouteCoordinator';
import { useCityStore } from '../store/cityStore';

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const PollNotificationListener: React.FC = () => {
  const setCityPreference = useCityStore((state) => state.setSelectedCity);
  const { dispatchLaunchIntent } = useAppRouteCoordinator();

  const handleResponse = React.useCallback(
    (response: Notifications.NotificationResponse) => {
      const payload = response.notification.request.content.data;
      if (!payload || (payload as { type?: string }).type !== 'poll_release') {
        return;
      }

      const cityRaw = (payload as { city?: unknown }).city;
      const pollIdsRaw = (payload as { pollIds?: unknown }).pollIds;
      const normalizedCity = typeof cityRaw === 'string' ? cityRaw.trim() : undefined;
      const pollIds = isStringArray(pollIdsRaw) ? pollIdsRaw : [];

      if (normalizedCity) {
        setCityPreference(normalizedCity);
      }

      dispatchLaunchIntent({
        type: 'polls',
        coverageKey: normalizedCity ?? null,
        pollId: pollIds[0] ?? null,
      });
    },
    [dispatchLaunchIntent, setCityPreference]
  );

  React.useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleResponse(response);
    });

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          handleResponse(response);
        }
      })
      .catch((error) => {
        console.warn('[Notifications] Failed to hydrate last response', error);
      });

    return () => {
      subscription.remove();
    };
  }, [handleResponse]);

  return null;
};

export default PollNotificationListener;
