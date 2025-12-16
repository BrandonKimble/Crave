import React from 'react';
import { View } from 'react-native';

import { Text } from '../../../components';
import styles from '../styles';

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <View style={styles.emptyState}>
    <Text variant="caption" style={styles.textSlate500}>
      {message}
    </Text>
  </View>
);

export default EmptyState;
