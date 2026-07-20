import React from 'react';
import { StyleSheet } from 'react-native';

import { Text } from '../components';
import { colors as themeColors } from '../constants/theme';

// THE CHROME TITLE (THE PAGE L1 — the truncation law's text side). The ONLY legal text
// inside a persistent-header Title slot: single-line by construction, title tokens,
// the ink token. The WIDTH BOUND that makes the ellipsis physical lives on the host's
// title SLOT (OverlaySheetHeaderChrome headerTitleSlot — flex:1/minWidth:0), never
// here and never per panel — the old per-panel sheetTitle/headerTitle/restaurantName/
// submittedQueryLabel forks (some with hand-rolled flex bounds, some silently
// unbounded) died with this pair.
export const ChromeTitleText = ({
  children,
  testID,
}: {
  children: React.ReactNode;
  testID?: string;
}) => (
  <Text
    variant="title"
    weight="semibold"
    numberOfLines={1}
    ellipsizeMode="tail"
    style={styles.chromeTitle}
    testID={testID}
  >
    {children}
  </Text>
);

const styles = StyleSheet.create({
  chromeTitle: {
    color: themeColors.text,
  },
});

export default ChromeTitleText;
