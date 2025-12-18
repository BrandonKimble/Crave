import React from 'react';
import { useAuth } from '@clerk/clerk-expo';

import useSearchHistory from '../screens/Search/hooks/use-search-history';

const SearchHistoryPreload: React.FC = () => {
  const { isSignedIn } = useAuth();

  useSearchHistory({ isSignedIn: Boolean(isSignedIn), autoLoad: true });

  return null;
};

export default SearchHistoryPreload;
