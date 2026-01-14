import React from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  Text as RNText,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import Reanimated, {
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { Search, ChevronLeft, X as LucideX } from 'lucide-react-native';
import { SEARCH_BAR_SHADOW } from '../shadows';
import { colors as themeColors } from '../../../constants/theme';
import SquircleSpinner from '../../../components/SquircleSpinner';
import { XCircleIcon } from '../../../components/icons/HeroIcons';
import { FONT_SIZES } from '../../../constants/typography';

type AnimatedStyle = Reanimated.AnimatedStyleProp<ViewStyle>;

const EDGE_INSET = 12;
const SEARCH_ICON_EDGE_INSET = EDGE_INSET + 1;
const CHEVRON_ICON_EDGE_INSET = EDGE_INSET - 2;
const ICON_TEXT_GAP = 8;
const SEARCH_ICON_SIZE = 32;
const CHEVRON_ICON_SIZE = 36;
const CLEAR_ICON_SIZE = 28;
const LEADING_SLOT_WIDTH = Math.max(SEARCH_ICON_SIZE, CHEVRON_ICON_SIZE);
const CHEVRON_STROKE_WIDTH = ((2 * 24) / CHEVRON_ICON_SIZE) * 1.25;
const CHEVRON_ICON_OFFSET =
  CHEVRON_ICON_EDGE_INSET - EDGE_INSET - (LEADING_SLOT_WIDTH - CHEVRON_ICON_SIZE) / 2;
const SEARCH_ICON_OFFSET =
  SEARCH_ICON_EDGE_INSET - EDGE_INSET - (LEADING_SLOT_WIDTH - SEARCH_ICON_SIZE) / 2;
const SUBMITTED_TEXT_INSET = 7;
const TRAILING_SLOT_SIZE = 40;
const INLINE_LOADING_TRAILING_ICON_GAP = 16;
const TRAILING_ICON_INSET = TRAILING_SLOT_SIZE - CLEAR_ICON_SIZE;
const TRAILING_CONTAINER_LOADING_MARGIN_LEFT = Math.max(
  0,
  INLINE_LOADING_TRAILING_ICON_GAP - TRAILING_ICON_INSET
);
const INLINE_LOADING_GAP = 16;
const INLINE_LOADING_SIZE = 18;
const INLINE_LOADING_PADDING_RIGHT = INLINE_LOADING_SIZE + INLINE_LOADING_GAP;

type SearchHeaderProps = {
  value: string;
  placeholder?: string;
  loading?: boolean;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onClear: () => void;
  onPress?: () => void;
  onPressIn?: () => void;
  onInputTouchStart?: () => void;
  accentColor: string;
  showBack?: boolean;
  onBackPress?: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  inputRef?: React.RefObject<TextInput>;
  inputAnimatedStyle?: AnimatedStyle;
  containerAnimatedStyle?: AnimatedStyle;
  editable?: boolean;
  showInactiveSearchIcon?: boolean;
  isSearchSessionActive?: boolean;
  focusProgress?: SharedValue<number>;
};

const SearchHeader: React.FC<SearchHeaderProps> = ({
  value,
  placeholder = 'Search',
  loading = false,
  onChangeText,
  onSubmit,
  onFocus,
  onBlur,
  onClear,
  onPress,
  onPressIn,
  onInputTouchStart,
  accentColor,
  showBack = false,
  onBackPress,
  onLayout,
  inputRef,
  inputAnimatedStyle,
  containerAnimatedStyle,
  editable = true,
  showInactiveSearchIcon = false,
  isSearchSessionActive = false,
  focusProgress: focusProgressProp,
}) => {
  const hasLeadingIcon = showBack || showInactiveSearchIcon;
  const shouldCollapseLeadingSlot = !hasLeadingIcon;
  const [inputWidth, setInputWidth] = React.useState(0);
  const [measuredTextWidth, setMeasuredTextWidth] = React.useState(0);
  const shouldShowInlineLoading = Boolean(loading && value.length > 0);
  const shouldReserveInlineSpinnerSpace = value.length > 0;
  const textStartInset = shouldCollapseLeadingSlot ? SUBMITTED_TEXT_INSET : 0;
  const hasValue = value.length > 0;
  const focusProgressFallback = useSharedValue(0);
  const focusProgress = focusProgressProp ?? focusProgressFallback;
  const handleSubmitEditing = React.useCallback(() => {
    runOnUI(() => {
      'worklet';
      focusProgress.value = 0;
    })();
    onSubmit();
    requestAnimationFrame(() => {
      inputRef?.current?.blur?.();
    });
  }, [focusProgress, inputRef, onSubmit]);
  const textInputOpacityStyle = useAnimatedStyle(
    () => ({
      opacity: hasValue ? focusProgress.value : 1,
    }),
    [hasValue]
  );
  const blurredTextOpacityStyle = useAnimatedStyle(
    () => ({
      opacity: hasValue ? 1 - focusProgress.value : 0,
    }),
    [hasValue]
  );
  const inlineLoadingPlacement = React.useMemo(() => {
    if (!shouldShowInlineLoading || inputWidth <= 0) {
      return { left: 0, isClamped: false };
    }
    const desired = textStartInset + measuredTextWidth + INLINE_LOADING_GAP;
    const maxLeft = Math.max(0, inputWidth - INLINE_LOADING_SIZE);
    if (desired >= maxLeft) {
      return { left: maxLeft, isClamped: true };
    }
    return { left: desired, isClamped: false };
  }, [inputWidth, measuredTextWidth, shouldShowInlineLoading, textStartInset]);
  const shouldTightenInlineLoadingGap = shouldShowInlineLoading && inlineLoadingPlacement.isClamped;
  const trailingContainerStyle = React.useMemo(
    () => [
      styles.trailingContainer,
      shouldTightenInlineLoadingGap ? styles.trailingContainerInlineLoading : null,
      inputAnimatedStyle,
    ],
    [inputAnimatedStyle, shouldTightenInlineLoadingGap]
  );
  const resolvedContainerStyle = React.useMemo(() => {
    if (!containerAnimatedStyle) {
      return [];
    }
    return Array.isArray(containerAnimatedStyle)
      ? containerAnimatedStyle
      : [containerAnimatedStyle];
  }, [containerAnimatedStyle]);
  return (
    <View style={styles.wrapper} pointerEvents="box-none" onLayout={onLayout}>
      <Reanimated.View style={[styles.promptCard, ...resolvedContainerStyle]}>
        <View style={styles.promptCardInner}>
          <Pressable style={styles.promptRow} onPress={onPress ?? onFocus} onPressIn={onPressIn}>
            <View style={styles.promptInner}>
              <Reanimated.View style={[styles.inputRow, inputAnimatedStyle]}>
                <View
                  style={[
                    styles.leadingSlot,
                    shouldCollapseLeadingSlot ? styles.leadingSlotCollapsed : null,
                  ]}
                >
                  {showBack ? (
                    <Pressable
                      style={styles.leadingButton}
                      onPress={(event) => {
                        event.stopPropagation?.();
                        if (onBackPress) {
                          onBackPress();
                          return;
                        }
                        (onPress ?? onFocus)?.();
                      }}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel="Exit search"
                    >
                      <ChevronLeft
                        size={CHEVRON_ICON_SIZE}
                        color="#000000"
                        strokeWidth={CHEVRON_STROKE_WIDTH}
                        style={styles.chevronIcon}
                      />
                    </Pressable>
                  ) : showInactiveSearchIcon ? (
                    <View style={styles.leadingButton}>
                      <Search
                        size={SEARCH_ICON_SIZE}
                        color="#000000"
                        strokeWidth={2}
                        style={styles.searchIcon}
                      />
                    </View>
                  ) : null}
                </View>
                <View
                  style={styles.inputTextArea}
                  onLayout={(event) => {
                    const width = event.nativeEvent.layout.width;
                    setInputWidth((prev) => (Math.abs(prev - width) < 0.5 ? prev : width));
                  }}
                >
                  <Reanimated.View style={[styles.textInputContainer, textInputOpacityStyle]}>
                    <TextInput
                      ref={inputRef}
                      value={value}
                      onChangeText={onChangeText}
                      placeholder={placeholder}
                      placeholderTextColor={themeColors.textBody}
                      style={[
                        styles.promptInput,
                        { paddingLeft: textStartInset },
                        shouldReserveInlineSpinnerSpace ? styles.promptInputInlineLoading : null,
                      ]}
                      returnKeyType="search"
                      blurOnSubmit={false}
                      onSubmitEditing={handleSubmitEditing}
                      onFocus={() => {
                        runOnUI(() => {
                          'worklet';
                          focusProgress.value = 1;
                        })();
                        onFocus();
                      }}
                      onBlur={() => {
                        runOnUI(() => {
                          'worklet';
                          focusProgress.value = 0;
                        })();
                        onBlur();
                      }}
                      onTouchStart={onInputTouchStart}
                      editable={editable}
                      multiline={false}
                      numberOfLines={1}
                      autoCapitalize="none"
                      autoCorrect={false}
                      clearButtonMode="never"
                    />
                  </Reanimated.View>
                  <Reanimated.View
                    pointerEvents="none"
                    style={[
                      styles.blurredEllipsisContainer,
                      {
                        paddingLeft: textStartInset,
                        paddingRight: shouldReserveInlineSpinnerSpace
                          ? INLINE_LOADING_PADDING_RIGHT
                          : 0,
                      },
                      blurredTextOpacityStyle,
                    ]}
                  >
                    <RNText
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={styles.blurredEllipsisText}
                    >
                      {value}
                    </RNText>
                  </Reanimated.View>
                  {shouldShowInlineLoading ? (
                    <View
                      pointerEvents="none"
                      style={[styles.inlineLoading, { left: inlineLoadingPlacement.left }]}
                    >
                      <SquircleSpinner size={INLINE_LOADING_SIZE} color={accentColor} />
                    </View>
                  ) : null}
                  <View pointerEvents="none" style={styles.measurementContainer}>
                    <RNText
                      numberOfLines={1}
                      style={styles.measurementText}
                      onLayout={(event) => {
                        const width = event.nativeEvent.layout.width;
                        setMeasuredTextWidth((prev) =>
                          Math.abs(prev - width) < 0.5 ? prev : width
                        );
                      }}
                    >
                      {value}
                    </RNText>
                  </View>
                </View>
              </Reanimated.View>
              <Reanimated.View style={trailingContainerStyle}>
                {value.length > 0 ? (
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation?.();
                      onClear();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    style={styles.trailingButton}
                    hitSlop={10}
                  >
                    {isSearchSessionActive ? (
                      <LucideX size={CLEAR_ICON_SIZE} color={accentColor} strokeWidth={2} />
                    ) : (
                      <XCircleIcon size={CLEAR_ICON_SIZE} color={accentColor} />
                    )}
                  </Pressable>
                ) : (
                  <View style={styles.trailingPlaceholder} />
                )}
              </Reanimated.View>
            </View>
          </Pressable>
        </View>
      </Reanimated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  promptCard: {
    borderRadius: 14,
    backgroundColor: '#ffffff',
    minHeight: 50,
    height: 50,
    ...SEARCH_BAR_SHADOW,
  },
  promptCardInner: {
    borderRadius: 14,
    paddingHorizontal: EDGE_INSET,
    paddingVertical: 0,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    minHeight: 50,
    height: 50,
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    flex: 1,
    width: '100%',
  },
  promptInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    height: 50,
  },
  leadingSlot: {
    width: LEADING_SLOT_WIDTH,
    height: 50,
    marginRight: ICON_TEXT_GAP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leadingSlotCollapsed: {
    width: 0,
    marginRight: 0,
  },
  leadingButton: {
    width: LEADING_SLOT_WIDTH,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronIcon: {
    transform: [{ translateX: CHEVRON_ICON_OFFSET }],
  },
  searchIcon: {
    transform: [{ translateX: SEARCH_ICON_OFFSET }],
  },
  promptInput: {
    flex: 1,
    fontSize: FONT_SIZES.title,
    color: '#000000',
    textAlign: 'left',
    textAlignVertical: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
    height: 50,
    includeFontPadding: false,
  },
  promptInputInlineLoading: {
    paddingRight: INLINE_LOADING_PADDING_RIGHT,
  },
  inputTextArea: {
    flex: 1,
    position: 'relative',
    height: 50,
    overflow: 'hidden',
  },
  textInputContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  blurredEllipsisContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    zIndex: 2,
    elevation: 2,
  },
  blurredEllipsisText: {
    fontSize: FONT_SIZES.title,
    fontWeight: '400',
    color: '#000000',
    includeFontPadding: false,
  },
  inlineLoading: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 3,
    elevation: 3,
  },
  measurementContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
  measurementText: {
    alignSelf: 'flex-start',
    fontSize: FONT_SIZES.title,
    fontWeight: '400',
    color: '#000000',
    includeFontPadding: false,
  },
  trailingContainer: {
    marginLeft: ICON_TEXT_GAP,
    width: TRAILING_SLOT_SIZE,
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: 50,
  },
  trailingContainerInlineLoading: {
    marginLeft: TRAILING_CONTAINER_LOADING_MARGIN_LEFT,
  },
  trailingButton: {
    width: TRAILING_SLOT_SIZE,
    height: TRAILING_SLOT_SIZE,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  trailingPlaceholder: {
    width: TRAILING_SLOT_SIZE,
    height: TRAILING_SLOT_SIZE,
  },
});

export default SearchHeader;
