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

/**
 * ONE online truth (foundation-hardening §A/§D): NetInfo writes INTO the system
 * status store (the single writer, which the dev offline override can pin), and
 * react-query's onlineManager MIRRORS the store — never NetInfo directly. Every
 * consumer (banner, search pause/resume, polls resume, react-query pause/refetch,
 * the failure-matrix lever) therefore agrees on one isOffline, always.
 */
const NetworkStatusListener: React.FC = () => {
  const setOffline = useSystemStatusStore((state) => state.setOffline);

  // store → onlineManager mirror (the ONLY writer of onlineManager).
  React.useEffect(() => {
    onlineManager.setOnline(!useSystemStatusStore.getState().isOffline);
    return useSystemStatusStore.subscribe((state, prevState) => {
      if (state.isOffline !== prevState.isOffline) {
        onlineManager.setOnline(!state.isOffline);
      }
    });
  }, []);

  React.useEffect(() => {
    const handleState = (state: NetInfoState) => {
      setOffline(!isOnlineState(state));
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
          useSystemStatusStore.getState().setOffline(!isOnlineState(state));
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
