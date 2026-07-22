import React from 'react';
import { ChromeTitleText, toSingleLineText } from '../ChromeTitleText';
import { StyleSheet } from 'react-native';

import { Text } from '../../components';
import { colors as themeColors } from '../../constants/theme';
import { FONT_SIZES, LINE_HEIGHTS } from '../../constants/typography';

// The polls header now uses the standardized single header (title + close cutout only) — the
// live-count badge cutout was removed 2026-07-01 (page-switch-master-plan.md). Only the TITLE model
// remains.
export type PollsHeaderVisualModel = {
  title: string;
};

type BuildPollsHeaderVisualModelArgs = {
  /** §2 header verdict from the feed response (null = multi-place straddle / unnamed ground). */
  placeName?: string | null;
  /** First-ever load, nothing to say yet — the title stays a quiet placeholder. */
  isResolvingPlace?: boolean;
};

/**
 * §6 header law: the title IS the §2 subjecthood verdict — `Polls in <place>`, and
 * a null verdict renders the FIRST-CLASS "Polls in this area" (no tie band, no
 * display-market election; the market vocabulary is dead).
 */
export const buildPollsHeaderVisualModel = ({
  placeName,
  isResolvingPlace = false,
}: BuildPollsHeaderVisualModelArgs): PollsHeaderVisualModel => {
  const trimmedPlaceName = typeof placeName === 'string' ? placeName.trim() : '';
  const title = isResolvingPlace
    ? 'Finding local polls...'
    : trimmedPlaceName
      ? `Polls in ${trimmedPlaceName}`
      : 'Polls in this area';

  return { title };
};

export const PollsHeaderTitleText: React.FC<{ title: string }> = ({ title }) => (
  <ChromeTitleText>{toSingleLineText(title)}</ChromeTitleText>
);

const styles = StyleSheet.create({
});

export const pollsHeaderVisualStyles = styles;
