import React from 'react';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import type { RootStackParamList } from '../../types/navigation';
import RecentHistoryView from './RecentHistoryView';

const RecentSearchesScreen: React.FC = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'RecentSearches'>>();
  return (
    <RecentHistoryView
      mode="recentSearches"
      title="Recent searches"
      userLocation={route.params?.userLocation ?? null}
    />
  );
};

export default RecentSearchesScreen;
