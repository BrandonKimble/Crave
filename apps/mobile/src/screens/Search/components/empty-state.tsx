import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '../../../components';
import styles from '../styles';

type EmptyStateProps = {
  title: string;
  subtitle: string;
  /** Optional action (the failure Retry). Plumbing-first: visual polish tracked in
   *  product/search-and-dishes.md. */
  action?: {
    label: string;
    onPress: () => void;
    testID?: string;
  };
};

const EmptyState: React.FC<EmptyStateProps> = ({ title, subtitle, action }) => (
  <View style={styles.emptyState}>
    <Text variant="body" style={styles.textSlate900}>
      {title}
    </Text>
    <Text variant="body" style={[styles.textSlate900, styles.emptyStateSubtitle]}>
      {subtitle}
    </Text>
    {action ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={action.label}
        testID={action.testID}
        onPress={action.onPress}
        style={styles.emptyStateActionButton}
      >
        <Text variant="body" weight="semibold" style={styles.emptyStateActionText}>
          {action.label}
        </Text>
      </Pressable>
    ) : null}
  </View>
);

export default EmptyState;
