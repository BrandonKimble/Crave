import React from 'react';

import { Text, type TextProps } from '../../../components';
import { formatCraveScoreDetailParts, formatCraveScoreParts } from '../utils/quality';

type CraveScoreTextProps = Omit<TextProps, 'children'> & {
  score?: number | null;
  detail?: boolean;
};

const CraveScoreText: React.FC<CraveScoreTextProps> = ({
  score,
  detail = false,
  accessibilityLabel,
  ...textProps
}) => {
  const parts = detail ? formatCraveScoreDetailParts(score) : formatCraveScoreParts(score);

  return (
    <Text accessibilityLabel={accessibilityLabel ?? parts.accessibilityLabel} {...textProps}>
      {parts.value}
    </Text>
  );
};

export default React.memo(CraveScoreText);
