import React from 'react';
import * as Notifications from 'expo-notifications';
import { navigationRef } from '../navigation/navigationRef';
import { useCityStore } from '../store/cityStore';
import { useOverlayStore } from '../store/overlayStore';

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const PollNotificationListener: React.FC = () => {
  const setCityPreference = useCityStore((state) => state.setSelectedCity);
  const setOverlay = useOverlayStore((state) => state.setOverlay);
  const pendingNavigation = React.useRef<{ city?: string; pollId?: string } | null>(null);

  const navigateToPolls = React.useCallback(
    (city?: string, pollId?: string) => {
      if (!navigationRef.isReady()) {
        pendingNavigation.current = { city, pollId };
        return;
      }
      navigationRef.navigate('Main');
      setOverlay('polls', { city, pollId });
      pendingNavigation.current = null;
    },
    [setOverlay]
  );

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

      navigateToPolls(normalizedCity, pollIds[0]);
    },
    [navigateToPolls, setCityPreference]
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

  React.useEffect(() => {
    const interval = setInterval(() => {
      if (pendingNavigation.current && navigationRef.isReady()) {
        const payload = pendingNavigation.current;
        pendingNavigation.current = null;
        navigationRef.navigate('Main');
        setOverlay('polls', { city: payload?.city, pollId: payload?.pollId });
      }
    }, 300);

    return () => {
      clearInterval(interval);
    };
  }, [setOverlay]);

  return null;
};

export default PollNotificationListener;
