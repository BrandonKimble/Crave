import React from 'react';
import { AppState } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';

import { useSystemStatusStore } from '../store/systemStatusStore';

const isOnlineState = (state: NetInfoState) =>
  Boolean(state.isConnected) && state.isInternetReachable !== false;

const NetworkStatusListener: React.FC = () => {
  const setOffline = useSystemStatusStore((state) => state.setOffline);

  React.useEffect(() => {
    const handleState = (state: NetInfoState) => {
      const online = isOnlineState(state);
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
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return null;
};

export default NetworkStatusListener;
