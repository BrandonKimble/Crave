import React from 'react';
import { View } from 'react-native';

import styles from '../../styles';

// The one living output of the R8-era panel-list transport (residue-kill-plan §2):
// the results-row separator. Everything else that hook carried was proven dark and
// deleted with it.
export const SearchResultsItemSeparator = () => <View style={styles.resultItemSeparator} />;
