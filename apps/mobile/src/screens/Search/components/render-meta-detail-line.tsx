import React from 'react';

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
  showLocationDetails = true
): React.ReactNode => {
  const segments: React.ReactNode[] = [];
  if (prefix) {
    segments.push(
      <Text
        key="meta-prefix"
        variant="body"
        weight="regular"
        style={[styles.resultMetaText, styles.resultMetaPrefix]}
        numberOfLines={1}
      >
        {prefix}
      </Text>
    );
  }
  const normalizedPriceLabel = priceLabel ?? null;
  const distanceLabel = formatDistanceMiles(distanceMiles);
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

  if (showLocationDetails) {
    if (normalizedPriceLabel) {
      if (segments.length) {
        segments.push(
          <Text
            key={`separator-${segments.length}`}
            variant="body"
            style={styles.resultMetaSeparator}
          >
            {' · '}
          </Text>
        );
      }
      segments.push(
        <Text key="price" variant="body" style={styles.resultMetaPrice}>
          {normalizedPriceLabel}
        </Text>
      );
    }
    if (distanceLabel) {
      if (segments.length) {
        segments.push(
          <Text
            key={`separator-${segments.length}`}
            variant="body"
            style={styles.resultMetaSeparator}
          >
            {' · '}
          </Text>
        );
      }
      segments.push(
        <Text key="distance" variant="body" style={styles.resultMetaDistance}>
          {distanceLabel}
        </Text>
      );
    }
  }

  if (status) {
    if (segments.length) {
      segments.push(
        <Text
          key={`separator-${segments.length}`}
          variant="body"
          style={styles.resultMetaSeparator}
        >
          {' · '}
        </Text>
      );
    }
    if (isClosingSoon) {
      segments.push(
        <Text key="status-closing-soon" variant="body" weight="semibold">
          <Text variant="body" weight="semibold" style={styles.resultMetaClosingSoon}>
            Closes
          </Text>
          {status.closesAtDisplay ? (
            <Text
              variant="body"
              style={styles.resultMetaSuffix}
            >{` at ${status.closesAtDisplay}`}</Text>
          ) : null}
        </Text>
      );
    } else if (status.isOpen) {
      segments.push(
        <Text key="status-open" variant="body" weight="semibold">
          <Text variant="body" weight="semibold" style={styles.resultMetaOpen}>
            Open
          </Text>
          {status.closesAtDisplay ? (
            <Text
              variant="body"
              style={styles.resultMetaSuffix}
            >{` until ${status.closesAtDisplay}`}</Text>
          ) : null}
        </Text>
      );
    } else if (status.isOpen === false) {
      segments.push(
        <Text key="status-closed" variant="body" weight="semibold">
          <Text variant="body" weight="semibold" style={styles.resultMetaClosed}>
            Closed
          </Text>
          {status.nextOpenDisplay ? (
            <Text
              variant="body"
              style={styles.resultMetaSuffix}
            >{` until ${status.nextOpenDisplay}`}</Text>
          ) : null}
        </Text>
      );
    }
  }
  if (!segments.length) {
    return null;
  }
  return (
    <Text
      variant="body"
      weight="regular"
      style={[styles.resultMetaText, align === 'right' && styles.resultMetaTextRight]}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      {segments}
    </Text>
  );
};
