import React from 'react';
import { View } from 'react-native';

import { Text } from '../../../components';
import styles from '../styles';

type EmptyStateProps = {
  title: string;
  subtitle: string;
};

// No action affordance by design: failures announce via the uniform modal and unwind
// to origin (the modal never auto-retries; retrying is the user's move from where
// they came back to) — an inline retry here would be a second, competing flow.
const EmptyState: React.FC<EmptyStateProps> = ({ title, subtitle }) => (
  <View style={styles.emptyState}>
    <Text variant="body" style={styles.textSlate900}>
      {title}
    </Text>
    <Text variant="body" style={[styles.textSlate900, styles.emptyStateSubtitle]}>
      {subtitle}
    </Text>
  </View>
);

export default EmptyState;
