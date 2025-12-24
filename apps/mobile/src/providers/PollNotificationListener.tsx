import React from 'react';
import * as Notifications from 'expo-notifications';
import { navigationRef } from '../navigation/navigationRef';
import { useOverlayStore } from '../store/overlayStore';
import { useCityStore } from '../store/cityStore';

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const PollNotificationListener: React.FC = () => {
  const setCityPreference = useCityStore((state) => state.setSelectedCity);
  const setOverlay = useOverlayStore((state) => state.setOverlay);
  const pendingNavigation = React.useRef<{ coverageKey?: string; pollId?: string } | null>(null);

  const navigateToPolls = React.useCallback(
    (coverageKey?: string, pollId?: string) => {
      if (!navigationRef.isReady()) {
        pendingNavigation.current = { coverageKey, pollId };
        return;
      }
      navigationRef.navigate('Main');
      setOverlay('polls', { coverageKey, pollId });
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
        setOverlay('polls', {
          coverageKey: payload?.coverageKey,
          pollId: payload?.pollId,
        });
      }
    }, 300);

    return () => {
      clearInterval(interval);
    };
  }, [setOverlay]);

  return null;
};

export default PollNotificationListener;
