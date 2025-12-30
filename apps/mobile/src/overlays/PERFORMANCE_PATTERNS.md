# Overlay Performance Patterns

This document describes performance patterns and best practices for building overlays and bottom sheets in the Crave Search mobile app. Following these patterns ensures smooth 35-45+ FPS during drag/scroll interactions.

## Table of Contents

1. [Understanding Performance Issues](#understanding-performance-issues)
2. [Callback Stability](#callback-stability)
3. [Memoization Patterns](#memoization-patterns)
4. [Layout Measurement](#layout-measurement)
5. [List Item Optimization](#list-item-optimization)
6. [FrostedGlassBackground Usage](#frostedglassbackground-usage)
7. [Hook Extraction](#hook-extraction)
8. [Checklist](#checklist)

---

## Understanding Performance Issues

### JS Thread vs UI Thread

React Native uses two main threads:

- **UI Thread**: Handles native animations, gestures, and rendering. Should stay at 60 FPS.
- **JS Thread**: Runs React components, business logic, and JavaScript. Target 35-45+ FPS during interactions.

When the JS thread drops to 0-15 FPS, common symptoms include:

- Laggy list scrolling
- Delayed touch responses
- Animation stuttering

### Common Causes

1. **Non-memoized components**: Large components re-rendering on every frame
2. **Inline callbacks**: Breaking `React.memo` on list items
3. **Layout thrashing**: Multiple `onLayout` callbacks firing during gestures
4. **Heavy computations**: Running during drag/scroll instead of after

---

## Callback Stability

### The Problem

```tsx
// BAD: Creates new function every render, breaks React.memo
<RestaurantResultCard onSavePress={() => handleSave(restaurant.id)} />
```

### The Solution

Use `useKeyedCallback` for list items:

```tsx
import { useKeyedCallback } from '../../hooks/useCallbackFactory';

// GOOD: Returns stable references keyed by ID
const getSaveHandler = useKeyedCallback((restaurantId: string) => handleSave(restaurantId), []);

// Usage in list item
<RestaurantResultCard onSavePress={getSaveHandler(restaurant.id)} />;
```

### Available Hooks

**`useCallbackFactory`** - For callbacks with additional arguments:

```tsx
const getHandler = useCallbackFactory(
  (id: string, ...args: unknown[]) => doSomething(id, ...args),
  [dependencies]
);

// Returns: (id) => (...args) => result
```

**`useKeyedCallback`** - For simple void callbacks:

```tsx
const getHandler = useKeyedCallback((id: string) => doSomething(id), []);

// Returns: (id) => () => void
```

---

## Memoization Patterns

### Headers and Filters

Large header components should be memoized:

```tsx
// GOOD: Wrapped in useMemo
const filtersHeader = React.useMemo(
  () => (
    <SearchFilters
      activeTab={activeTab}
      onTabChange={setActiveTab}
      openNow={openNow}
      // ... other props
    />
  ),
  [activeTab, openNow /* all dependencies */]
);
```

### List Render Functions

Use `React.useCallback` for list render functions:

```tsx
const renderItem = React.useCallback(
  (item: ItemType, index: number) => (
    <ItemCard item={item} index={index} onPress={getItemHandler(item.id)} isDragging={isDragging} />
  ),
  [getItemHandler, isDragging /* other dependencies */]
);
```

### When to Memoize

Memoize if the component:

- Is large (100+ lines, complex JSX)
- Re-renders during gestures
- Contains expensive calculations
- Is passed to a list as `ListHeaderComponent`

---

## Layout Measurement

### The Problem

Multiple `onLayout` callbacks during scroll cause:

- State updates on every frame
- Cascading re-renders
- JS thread blocking

### The Solution

Use `useTopFoodMeasurement` pattern or `useDebouncedLayoutMeasurement`:

```tsx
import { useDebouncedLayoutMeasurement } from '../../hooks';

const { layout, onLayout } = useDebouncedLayoutMeasurement({
  enabled: !isDragging, // Disable during gestures
  debounceMs: 50, // Batch updates
  threshold: 0.5, // Ignore sub-pixel changes
});

return <View onLayout={onLayout}>...</View>;
```

### For Complex Cases (Multiple Items)

Use `useMultiLayoutMeasurement`:

```tsx
const { measurements, registerLayout, hasAllMeasured } = useMultiLayoutMeasurement({
  keys: items.map((item) => item.id),
  enabled: !isDragging,
  debounceMs: 50,
});

return items.map((item) => (
  <View key={item.id} onLayout={registerLayout(item.id)}>
    ...
  </View>
));
```

### Key Principles

1. **Skip during drag**: Pass `isDragging` prop to disable measurements
2. **Debounce**: Batch layout updates (50-100ms)
3. **Threshold**: Ignore changes < 0.5px
4. **First mount**: Allow immediate measurement on initial render
5. **Use InteractionManager**: Defer heavy calculations

---

## List Item Optimization

### Card Component Structure

```tsx
// Components should use React.memo
const RestaurantResultCard: React.FC<Props> = ({
  restaurant,
  isDragging = false, // New prop!
  onSavePress,
  // ...
}) => {
  // Use measurement hooks with isDragging
  const { visibleItems, onLayout } = useMeasurement({
    isDragging,
    debounceMs: 50,
  });

  // All callbacks should be stable (from parent's factory)
  return <Pressable onPress={handlePress}>...</Pressable>;
};

export default React.memo(RestaurantResultCard);
```

### Pass isDragging from Parent

```tsx
const renderCard = React.useCallback(
  (item, index) => (
    <RestaurantResultCard
      restaurant={item}
      isDragging={isSheetDragging} // From sheet interaction state
      onSavePress={getSaveHandler(item.id)}
    />
  ),
  [isSheetDragging, getSaveHandler]
);
```

---

## FrostedGlassBackground Usage

### Guidelines

- Keep all `FrostedGlassBackground` instances (they're intentional for visual effect)
- Each overlay should have its own glass layer
- Don't duplicate glass layers within the same overlay
- Use `overlaySheetStyles` for consistent styling

### Structure

```tsx
<FrostedGlassBackground
  style={overlaySheetStyles.frostedBackground}
  blurAmount={16}
  blurType="regular"
/>
```

---

## Hook Extraction

### When to Extract

Extract hooks when state management:

- Has 3+ related state variables
- Has multiple derived values
- Is used across multiple components
- Includes suspension/restoration logic

### Pattern

```tsx
// hooks/use-save-sheet-state.ts
function useSaveSheetState() {
  const [state, setState] = useState(...);

  // Factory callbacks for list items
  const getHandler = useKeyedCallback(...);

  // Direct handlers
  const handleClose = useCallback(...);

  // Suspension/restoration (if needed)
  const suspend = useCallback(...);
  const restore = useCallback(...);

  return {
    state,
    getHandler,
    handleClose,
    suspend,
    restore,
  };
}
```

### Available Hooks

- `useSaveSheetState` - Save sheet state management
- `useResultsSheetInteraction` - Drag/scroll interaction tracking
- `useTopFoodMeasurement` - Dynamic item truncation measurement
- `useDebouncedLayoutMeasurement` - General debounced layout

---

## Checklist

Use this checklist when building new overlays or optimizing existing ones:

### Before Implementing

- [ ] Will this overlay have a scrollable list?
- [ ] Are there any inline callbacks in list items?
- [ ] Does the header contain large/complex components?

### Callback Stability

- [ ] Use `useKeyedCallback` for list item callbacks
- [ ] Use `useCallbackFactory` for complex callback patterns
- [ ] Verify all callbacks in list items are stable

### Memoization

- [ ] Memoize large header components with `useMemo`
- [ ] Use `useCallback` for render functions
- [ ] Verify memoization dependencies are complete

### Layout Measurement

- [ ] Pass `isDragging` to components with `onLayout`
- [ ] Use debounced measurement hooks
- [ ] Skip measurements during gestures

### Testing

- [ ] Test drag performance (JS FPS should be 35-45+)
- [ ] Test scroll performance in lists
- [ ] Test with Performance Monitor enabled
- [ ] Verify no unnecessary re-renders in React DevTools

---

## Performance Debugging

### Enable Performance Monitor

1. Open React Native dev menu
2. Enable "Perf Monitor"
3. Watch JS and UI FPS during interactions

### What to Look For

- **JS FPS < 35**: Too many re-renders or heavy computations
- **UI FPS < 55**: Native layer issues (rare in overlays)
- **Both low**: Likely bridge congestion

### React DevTools Profiler

1. Record during drag/scroll
2. Look for components re-rendering every frame
3. Check render times for list items
4. Identify non-memoized components

---

## Summary

Key optimizations implemented for Search results sheet:

| Optimization                         | Impact                                 |
| ------------------------------------ | -------------------------------------- |
| Memoized `filtersHeader`             | Prevents 574-line component re-render  |
| `useKeyedCallback` for save handlers | Stable callbacks for list items        |
| `useTopFoodMeasurement` hook         | Debounced, pausable layout measurement |
| `isDragging` prop on cards           | Skip measurements during gestures      |
| Extracted `useSaveSheetState`        | Clean state management                 |

Expected result: 35-45 FPS during drag (up from 0-15 FPS).
