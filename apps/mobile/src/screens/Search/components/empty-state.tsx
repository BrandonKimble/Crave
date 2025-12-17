import React from 'react';
import { View } from 'react-native';

import { Text } from '../../../components';
import styles from '../styles';

type EmptyStateProps = {
  title: string;
  subtitle: string;
};

const EmptyState: React.FC<EmptyStateProps> = ({ title, subtitle }) => (
  <View style={styles.emptyState}>
    <Text variant="caption" style={styles.textSlate900}>
      {title}
    </Text>
    <Text variant="caption" style={styles.textSlate900}>
      {subtitle}
    </Text>
  </View>
);

export default EmptyState;
