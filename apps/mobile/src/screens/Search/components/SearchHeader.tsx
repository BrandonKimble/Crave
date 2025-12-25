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
import { FONT_SIZES, LINE_HEIGHTS } from '../../../constants/typography';

type AnimatedStyle = Reanimated.AnimatedStyleProp<ViewStyle>;

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
  const clearIconSize = 24;
  const leadingIconSize = 24;
  const hasLeadingIcon = showBack || showInactiveSearchIcon;
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
            <Reanimated.View
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  flex: 1,
                },
                inputAnimatedStyle,
              ]}
            >
              <View
                style={[styles.leadingSlot, hasLeadingIcon ? null : styles.leadingSlotCollapsed]}
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
                      size={leadingIconSize}
                      color="#6b7280"
                      strokeWidth={2}
                      style={styles.chevronIcon}
                    />
                  </Pressable>
                ) : showInactiveSearchIcon ? (
                  <View style={styles.leadingButton}>
                    <Search size={leadingIconSize} color="#9ca3af" strokeWidth={2} />
                  </View>
                ) : null}
              </View>
              <TextInput
                ref={inputRef}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={themeColors.textBody}
                style={styles.promptInput}
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
                <ActivityIndicator size="small" color={accentColor} />
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
                    <LucideX size={clearIconSize} color={accentColor} strokeWidth={2} />
                  ) : (
                    <XCircleIcon size={clearIconSize} color={accentColor} />
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
    paddingHorizontal: 8,
    paddingVertical: 0,
    backgroundColor: '#ffffff',
    minHeight: 50,
    height: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
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
    paddingHorizontal: 0,
    paddingVertical: 0,
    height: 50,
    gap: 8,
  },
  leadingSlot: {
    width: 36,
    height: 50,
    marginRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leadingSlotCollapsed: {
    width: 0,
    marginRight: 0,
  },
  leadingButton: {
    width: 36,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptInput: {
    flex: 1,
    fontSize: FONT_SIZES.title,
    color: '#111827',
    textAlign: 'left',
    textAlignVertical: 'center',
    paddingVertical: 12,
    paddingHorizontal: 0,
    height: 50,
    lineHeight: LINE_HEIGHTS.title,
    includeFontPadding: false,
  },
  trailingContainer: {
    marginLeft: 'auto',
    minWidth: 36,
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: 50,
  },
  trailingButton: {
    paddingHorizontal: 4,
    paddingVertical: 6,
    marginLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailingPlaceholder: {
    width: 24,
    height: 24,
  },
});

export default SearchHeader;
