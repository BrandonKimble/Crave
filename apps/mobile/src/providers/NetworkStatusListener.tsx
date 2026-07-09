import React from 'react';
import { AppState } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';

import { useSystemStatusStore } from '../store/systemStatusStore';

const isOnlineState = (state: NetInfoState) => {
  if (__DEV__) {
    return state.type !== 'none';
  }
  return Boolean(state.isConnected) && state.isInternetReachable !== false;
};

const NetworkStatusListener: React.FC = () => {
  const setOffline = useSystemStatusStore((state) => state.setOffline);
  const lastOnlineRef = React.useRef<boolean | null>(null);

  React.useEffect(() => {
    const handleState = (state: NetInfoState) => {
      const online = isOnlineState(state);
      if (lastOnlineRef.current === online) {
        return;
      }
      lastOnlineRef.current = online;
      onlineManager.setOnline(online);
      setOffline(!online);
    };

    const unsubscribe = NetInfo.addEventListener(handleState);
    void NetInfo.fetch().then(handleState);

    return () => {
      unsubscribe();
    };
  }, [setOffline]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      focusManager.setFocused(nextState === 'active');
      // NetInfo's own guidance: connectivity EVENTS can be missed while backgrounded
      // (and the iOS simulator drops them after host network flaps) — re-evaluate on
      // every foreground so the offline level (and the reconnect auto-retry that rides
      // its edge) never sticks stale.
      if (nextState === 'active') {
        void NetInfo.fetch().then((state) => {
          const online = isOnlineState(state);
          onlineManager.setOnline(online);
          useSystemStatusStore.getState().setOffline(!online);
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return null;
};

export default NetworkStatusListener;
