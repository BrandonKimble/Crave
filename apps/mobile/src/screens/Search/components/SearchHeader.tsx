import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import Reanimated from 'react-native-reanimated';
import { Search, ChevronLeft, X as LucideX } from 'lucide-react-native';
import { colors as themeColors } from '../../../constants/theme';
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
  surfaceVariant?: 'solid' | 'transparent';
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
  surfaceVariant = 'solid',
}) => {
  const hasLeadingIcon = showBack || showInactiveSearchIcon;
  const shouldCollapseLeadingSlot = !hasLeadingIcon;
  return (
    <View style={styles.wrapper} pointerEvents="box-none" onLayout={onLayout}>
      <Reanimated.View
        style={[
          styles.promptCard,
          surfaceVariant === 'transparent' ? styles.promptCardTransparent : null,
          containerAnimatedStyle,
        ]}
      >
        <Pressable style={styles.promptRow} onPress={onPress ?? onFocus}>
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
                      color="#6b7280"
                      strokeWidth={CHEVRON_STROKE_WIDTH}
                      style={styles.chevronIcon}
                    />
                  </Pressable>
                ) : showInactiveSearchIcon ? (
                  <View style={styles.leadingButton}>
                    <Search
                      size={SEARCH_ICON_SIZE}
                      color="#9ca3af"
                      strokeWidth={2}
                      style={styles.searchIcon}
                    />
                  </View>
                ) : null}
              </View>
              <TextInput
                ref={inputRef}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={themeColors.textBody}
                style={[
                  styles.promptInput,
                  shouldCollapseLeadingSlot ? styles.promptInputSubmitted : null,
                ]}
                returnKeyType="search"
                onSubmitEditing={onSubmit}
                onFocus={onFocus}
                onBlur={onBlur}
                editable={editable}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="never"
              />
            </Reanimated.View>
            <Reanimated.View style={[styles.trailingContainer, inputAnimatedStyle]}>
              {loading ? (
                <View style={styles.trailingButton}>
                  <ActivityIndicator size="small" color={accentColor} />
                </View>
              ) : value.length > 0 ? (
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
    paddingHorizontal: EDGE_INSET,
    paddingVertical: 0,
    backgroundColor: '#ffffff',
    minHeight: 50,
    height: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5},
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 1,
  },
  promptCardTransparent: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    borderWidth: 0,
    borderColor: 'transparent',
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
    color: '#111827',
    textAlign: 'left',
    textAlignVertical: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
    height: 50,
    includeFontPadding: false,
  },
  promptInputSubmitted: {
    paddingLeft: SUBMITTED_TEXT_INSET,
  },
  trailingContainer: {
    marginLeft: ICON_TEXT_GAP,
    width: TRAILING_SLOT_SIZE,
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: 50,
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
