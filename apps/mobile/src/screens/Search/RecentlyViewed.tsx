import React from 'react';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import type { RootStackParamList } from '../../types/navigation';
import RecentHistoryView from './RecentHistoryView';

const RecentlyViewedScreen: React.FC = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'RecentlyViewed'>>();
  return (
    <RecentHistoryView
      mode="recentlyViewed"
      title="Recently viewed"
      userLocation={route.params?.userLocation ?? null}
    />
  );
};

export default RecentlyViewedScreen;
