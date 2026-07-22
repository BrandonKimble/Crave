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

// THE BRAND (truncation law, type side — L1 completion): chrome title text is a
// branded string producible ONLY by toSingleLineText, whose constructor collapses
// line breaks — a multi-line chrome title is unrepresentable at the type level, not
// merely clipped at render. The ellipsis itself stays physical (numberOfLines=1 +
// the host slot's width bound); the brand closes the remaining hole (embedded
// newlines rendering as a squashed glyph line).
declare const SINGLE_LINE_TEXT_BRAND: unique symbol;
export type SingleLineText = string & { readonly [SINGLE_LINE_TEXT_BRAND]: true };
export const toSingleLineText = (raw: string): SingleLineText =>
  raw.replace(/\s*[\r\n]+\s*/g, ' ').trim() as SingleLineText;

export const ChromeTitleText = ({
  children,
  testID,
}: {
  children: SingleLineText;
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
