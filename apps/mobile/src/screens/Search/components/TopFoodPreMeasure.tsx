import React from 'react';
import { type LayoutChangeEvent, View } from 'react-native';

import { Text } from '../../../components';
import { topFoodItemWidthCache, topFoodMoreWidthCache } from '../hooks/use-top-food-measurement';
import styles from '../styles';

type PreMeasureItem = {
  connectionId: string;
  foodName: string;
};

type TopFoodPreMeasureProps = {
  items: readonly PreMeasureItem[];
  moreCounts: readonly number[];
  onComplete?: () => void;
};

const TOP_FOOD_INLINE_GAP = '\u2006\u2006\u2006\u2006';

/**
 * Batch pre-measurement component that renders all uncached food name widths
 * in a single offscreen layout pass. Writes directly to the module-level LRU
 * caches so that individual card measurement nodes are skipped (allCached=true).
 *
 * Calls `onComplete` and unmounts itself after all measurements complete.
 */
const TopFoodPreMeasure: React.FC<TopFoodPreMeasureProps> = ({ items, moreCounts, onComplete }) => {
  const remainingRef = React.useRef(items.length + moreCounts.length);
  const completedRef = React.useRef(false);
  const [done, setDone] = React.useState(false);

  const markDone = React.useCallback(() => {
    remainingRef.current -= 1;
    if (remainingRef.current <= 0 && !completedRef.current) {
      completedRef.current = true;
      setDone(true);
      onComplete?.();
    }
  }, [onComplete]);

  // Handle empty items case — signal completion immediately
  React.useEffect(() => {
    if (items.length === 0 && moreCounts.length === 0 && !completedRef.current) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [items.length, moreCounts.length, onComplete]);

  // Stable callback maps so we don't recreate per render
  const itemCallbacksRef = React.useRef(new Map<string, (event: LayoutChangeEvent) => void>());
  const moreCallbacksRef = React.useRef(new Map<number, (event: LayoutChangeEvent) => void>());

  const getItemCallback = React.useCallback(
    (connectionId: string) => {
      let cb = itemCallbacksRef.current.get(connectionId);
      if (!cb) {
        cb = (event: LayoutChangeEvent) => {
          topFoodItemWidthCache.set(connectionId, event.nativeEvent.layout.width);
          markDone();
        };
        itemCallbacksRef.current.set(connectionId, cb);
      }
      return cb;
    },
    [markDone]
  );

  const getMoreCallback = React.useCallback(
    (count: number) => {
      let cb = moreCallbacksRef.current.get(count);
      if (!cb) {
        cb = (event: LayoutChangeEvent) => {
          topFoodMoreWidthCache.set(count, event.nativeEvent.layout.width);
          markDone();
        };
        moreCallbacksRef.current.set(count, cb);
      }
      return cb;
    },
    [markDone]
  );

  if (done || (items.length === 0 && moreCounts.length === 0)) {
    return null;
  }

  return (
    <View style={styles.topFoodInlineMeasure}>
      {items.map((item, index) => (
        <Text
          key={`pre-item-${item.connectionId}`}
          variant="body"
          weight="regular"
          style={styles.topFoodMeasureText}
          onLayout={getItemCallback(item.connectionId)}
        >
          <Text variant="body" weight="semibold" style={styles.topFoodRankInline}>
            {index + 1}.
          </Text>
          <Text variant="body" weight="regular" style={styles.topFoodNameInline}>
            {' '}
            {item.foodName}
          </Text>
          {TOP_FOOD_INLINE_GAP}
        </Text>
      ))}
      {moreCounts.map((count) => (
        <Text
          key={`pre-more-${count}`}
          variant="body"
          weight="semibold"
          style={styles.topFoodMore}
          onLayout={getMoreCallback(count)}
        >
          {TOP_FOOD_INLINE_GAP}+{count} more
        </Text>
      ))}
    </View>
  );
};

export default React.memo(TopFoodPreMeasure);
