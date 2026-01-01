import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import type { OperatingStatus } from '@crave-search/shared';

import { Text } from '../../../components';
import styles from '../styles';
import { formatDistanceMiles, minutesUntilCloseFromDisplay } from '../utils/format';

export const renderMetaDetailLine = (
  status: OperatingStatus | null | undefined,
  priceLabel?: string | null,
  distanceMiles?: number | null,
  align: 'left' | 'right' = 'left',
  prefix?: React.ReactNode,
  showLocationDetails = true,
  statusFirst = false,
  locationCount?: number | null,
  textStyle?: StyleProp<TextStyle>
): React.ReactNode => {
  const segments: React.ReactNode[] = [];
  const applyTextStyle = (style?: StyleProp<TextStyle>) =>
    textStyle ? [textStyle, style] : style;
  const applyBaseTextStyle = (style?: StyleProp<TextStyle>) =>
    textStyle ? [styles.resultMetaText, textStyle, style] : [styles.resultMetaText, style];
  const pushSegment = (node: React.ReactNode) => {
    if (segments.length) {
      segments.push(
        <Text
          key={`separator-${segments.length}`}
          variant="body"
          style={applyTextStyle(styles.resultMetaSeparator)}
        >
          {' · '}
        </Text>
      );
    }
    segments.push(node);
  };

  if (prefix) {
    pushSegment(
      <Text
        key="meta-prefix"
        variant="body"
        weight="regular"
        style={applyBaseTextStyle(styles.resultMetaPrefix)}
        numberOfLines={1}
      >
        {prefix}
      </Text>
    );
  }
  const normalizedPriceLabel = priceLabel ?? null;
  const distanceLabel = formatDistanceMiles(distanceMiles);
  const normalizedLocationCount =
    typeof locationCount === 'number' && locationCount > 1 ? locationCount : null;
  const locationCountLabel = normalizedLocationCount
    ? `${normalizedLocationCount} locations`
    : null;
  const effectiveMinutesUntilClose =
    status?.isOpen && typeof status.closesInMinutes === 'number'
      ? status.closesInMinutes
      : status?.isOpen
      ? minutesUntilCloseFromDisplay(status?.closesAtDisplay)
      : null;
  const isClosingSoon =
    status?.isOpen &&
    typeof effectiveMinutesUntilClose === 'number' &&
    effectiveMinutesUntilClose <= 45;

  const statusNode = (() => {
    if (!status) {
      return null;
    }
    if (isClosingSoon) {
      return (
        <Text
          key="status-closing-soon"
          variant="body"
          weight="semibold"
          style={textStyle}
        >
          <Text
            variant="body"
            weight="semibold"
            style={applyTextStyle(styles.resultMetaClosingSoon)}
          >
            Closes
          </Text>
          {status.closesAtDisplay ? (
            <Text
              variant="body"
              style={applyTextStyle(styles.resultMetaSuffix)}
            >{` at ${status.closesAtDisplay}`}</Text>
          ) : null}
        </Text>
      );
    }
    if (status.isOpen) {
      return (
        <Text key="status-open" variant="body" weight="semibold" style={textStyle}>
          <Text variant="body" weight="semibold" style={applyTextStyle(styles.resultMetaOpen)}>
            Open
          </Text>
          {status.closesAtDisplay ? (
            <Text
              variant="body"
              style={applyTextStyle(styles.resultMetaSuffix)}
            >{` until ${status.closesAtDisplay}`}</Text>
          ) : null}
        </Text>
      );
    }
    if (status.isOpen === false) {
      return (
        <Text key="status-closed" variant="body" weight="semibold" style={textStyle}>
          <Text
            variant="body"
            weight="semibold"
            style={applyTextStyle(styles.resultMetaClosed)}
          >
            Closed
          </Text>
          {status.nextOpenDisplay ? (
            <Text
              variant="body"
              style={applyTextStyle(styles.resultMetaSuffix)}
            >{` until ${status.nextOpenDisplay}`}</Text>
          ) : null}
        </Text>
      );
    }
    return null;
  })();

  if (statusFirst && statusNode) {
    pushSegment(statusNode);
  }

  if (showLocationDetails) {
    if (normalizedPriceLabel) {
      pushSegment(
        <Text key="price" variant="body" style={applyTextStyle(styles.resultMetaPrice)}>
          {normalizedPriceLabel}
        </Text>
      );
    }
    if (locationCountLabel) {
      pushSegment(
        <Text
          key="locations"
          variant="body"
          style={applyTextStyle(styles.resultMetaDistance)}
        >
          {locationCountLabel}
        </Text>
      );
    } else if (distanceLabel) {
      pushSegment(
        <Text
          key="distance"
          variant="body"
          style={applyTextStyle(styles.resultMetaDistance)}
        >
          {distanceLabel}
        </Text>
      );
    }
  }

  if (!statusFirst && statusNode) {
    pushSegment(statusNode);
  }
  if (!segments.length) {
    return null;
  }
  return (
    <Text
      variant="body"
      weight="regular"
      style={[styles.resultMetaText, textStyle, align === 'right' && styles.resultMetaTextRight]}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      {segments}
    </Text>
  );
};
