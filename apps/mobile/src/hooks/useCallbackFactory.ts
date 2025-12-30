import React from 'react';

/**
 * A hook that creates a factory function for generating stable callback references.
 *
 * This is useful when rendering lists where each item needs its own callback
 * (e.g., onPress handlers that need the item's ID). Instead of creating inline
 * arrow functions that break React.memo, this hook provides stable references
 * that are cached by key.
 *
 * @example
 * ```tsx
 * const getOnPress = useCallbackFactory(
 *   (id: string) => handleItemPress(id),
 *   [handleItemPress]
 * );
 *
 * // In renderItem:
 * <ItemComponent onPress={getOnPress(item.id)} />
 * ```
 *
 * The callback for each unique key is created once and reused, preventing
 * unnecessary re-renders of memoized child components.
 */
function useCallbackFactory<K extends string | number, A extends unknown[], R>(
  callback: (key: K, ...args: A) => R,
  deps: React.DependencyList
): (key: K) => (...args: A) => R {
  // Store the latest callback in a ref so the cached functions always call the current version
  const callbackRef = React.useRef(callback);
  callbackRef.current = callback;

  // Cache of generated callbacks by key
  const cacheRef = React.useRef(new Map<K, (...args: A) => R>());

  // Track deps to clear cache when they change
  const depsRef = React.useRef<React.DependencyList>(deps);
  const depsChanged = deps.length !== depsRef.current.length ||
    deps.some((dep, i) => !Object.is(dep, depsRef.current[i]));

  if (depsChanged) {
    cacheRef.current.clear();
    depsRef.current = deps;
  }

  // The factory function that returns stable callbacks
  const factory = React.useCallback((key: K): ((...args: A) => R) => {
    let cached = cacheRef.current.get(key);
    if (!cached) {
      cached = (...args: A) => callbackRef.current(key, ...args);
      cacheRef.current.set(key, cached);
    }
    return cached;
  }, []);

  return factory;
}

/**
 * A simpler version of useCallbackFactory for callbacks that only take the key.
 *
 * @example
 * ```tsx
 * const getOnSave = useKeyedCallback(
 *   (restaurantId: string) => setSaveSheetState({
 *     visible: true,
 *     listType: 'restaurant',
 *     target: { restaurantId },
 *   }),
 *   []
 * );
 *
 * // In renderItem:
 * <RestaurantCard onSavePress={getOnSave(restaurant.restaurantId)} />
 * ```
 */
function useKeyedCallback<K extends string | number>(
  callback: (key: K) => void,
  deps: React.DependencyList
): (key: K) => () => void {
  const callbackRef = React.useRef(callback);
  callbackRef.current = callback;

  const cacheRef = React.useRef(new Map<K, () => void>());
  const depsRef = React.useRef<React.DependencyList>(deps);

  const depsChanged = deps.length !== depsRef.current.length ||
    deps.some((dep, i) => !Object.is(dep, depsRef.current[i]));

  if (depsChanged) {
    cacheRef.current.clear();
    depsRef.current = deps;
  }

  const factory = React.useCallback((key: K): (() => void) => {
    let cached = cacheRef.current.get(key);
    if (!cached) {
      cached = () => callbackRef.current(key);
      cacheRef.current.set(key, cached);
    }
    return cached;
  }, []);

  return factory;
}

export { useCallbackFactory, useKeyedCallback };
