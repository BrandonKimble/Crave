import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import Reanimated from 'react-native-reanimated';
import { Search, ChevronLeft, X } from 'lucide-react-native';

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
  inputRef?: React.RefObject<TextInput>;
  inputAnimatedStyle?: AnimatedStyle;
  containerAnimatedStyle?: AnimatedStyle;
  editable?: boolean;
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
  inputRef,
  inputAnimatedStyle,
  containerAnimatedStyle,
  editable = true,
}) => {
  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <Reanimated.View style={[styles.promptCard, containerAnimatedStyle]}>
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
              <Pressable
                style={styles.searchIcon}
                onPress={(event) => {
                  event.stopPropagation?.();
                  if (showBack && onBackPress) {
                    onBackPress();
                    return;
                  }
                  (onPress ?? onFocus)?.();
                }}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={showBack ? 'Exit search' : 'Focus search'}
              >
                {showBack ? (
                  <ChevronLeft size={24} color="#6b7280" strokeWidth={2} />
                ) : (
                  <Search size={22} color="#6b7280" strokeWidth={2} />
                )}
              </Pressable>
              <TextInput
                ref={inputRef}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor="#9ca3af"
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
                  <X size={24} color={accentColor} strokeWidth={2} />
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
    paddingVertical: 2,
    backgroundColor: '#ffffff',
    minHeight: 44,
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    flex: 1,
    width: '100%',
  },
  promptInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingVertical: 2,
    gap: 8,
  },
  searchIcon: {
    marginRight: 4,
    paddingHorizontal: 0,
    paddingVertical: 6,
  },
  promptInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    textAlign: 'left',
    paddingVertical: 0,
    height: '100%',
  },
  trailingContainer: {
    marginLeft: 'auto',
    minWidth: 24,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  trailingButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailingPlaceholder: {
    width: 24,
    height: 24,
  },
});

export default SearchHeader;
