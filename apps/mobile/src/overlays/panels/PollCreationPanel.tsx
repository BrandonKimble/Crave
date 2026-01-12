import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HandPlatter, Sparkles, Store, Utensils, X as LucideX } from 'lucide-react-native';

import { Text } from '../../components';
import { autocompleteService, type AutocompleteMatch } from '../../services/autocomplete';
import {
  createPoll,
  type CreatePollPayload,
  type Poll,
  type PollTopicType,
} from '../../services/polls';
import { colors as themeColors } from '../../constants/theme';
import { FONT_SIZES, LINE_HEIGHTS } from '../../constants/typography';
import { OVERLAY_HORIZONTAL_PADDING, overlaySheetStyles } from '../overlaySheetStyles';
import { resolveExpandedTop } from '../sheetUtils';
import type { OverlayContentSpec } from '../types';

const SCREEN_HEIGHT = Dimensions.get('window').height;

const ACCENT = themeColors.primary;
const BORDER = themeColors.border;
const SURFACE = themeColors.surface;

type UsePollCreationPanelSpecOptions = {
  visible: boolean;
  coverageKey: string | null;
  coverageName?: string | null;
  searchBarTop?: number;
  onClose: () => void;
  onCreated: (poll: Poll) => void;
};

type TemplateOption = {
  type: PollTopicType;
  title: string;
  description: string;
  Icon: typeof HandPlatter;
};

const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    type: 'best_dish',
    title: 'Best dish',
    description: 'Find the spot that nails a specific dish.',
    Icon: HandPlatter,
  },
  {
    type: 'what_to_order',
    title: 'What to order',
    description: 'Collect must-order dishes at a restaurant.',
    Icon: Utensils,
  },
  {
    type: 'best_dish_attribute',
    title: 'Best dish attribute',
    description: 'Rank dishes by a trait like spicy, crispy, or vegan.',
    Icon: Sparkles,
  },
  {
    type: 'best_restaurant_attribute',
    title: 'Best restaurant attribute',
    description: 'Highlight restaurants for patios, vibes, or service.',
    Icon: Store,
  },
];

const MIN_AUTOCOMPLETE_CHARS = 2;

type AutocompleteField = {
  query: string;
  selection: AutocompleteMatch | null;
  suggestions: AutocompleteMatch[];
  loading: boolean;
  showSuggestions: boolean;
  setQuery: (value: string) => void;
  setSelection: (value: AutocompleteMatch | null) => void;
  setShowSuggestions: (value: boolean) => void;
  reset: () => void;
};

const useAutocompleteField = (entityType: string, enabled: boolean): AutocompleteField => {
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<AutocompleteMatch | null>(null);
  const [suggestions, setSuggestions] = useState<AutocompleteMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setSuggestions([]);
      setLoading(false);
      setShowSuggestions(false);
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < MIN_AUTOCOMPLETE_CHARS) {
      setSuggestions([]);
      setLoading(false);
      setShowSuggestions(false);
      return;
    }

    let isActive = true;
    setLoading(true);
    const handle = setTimeout(() => {
      autocompleteService
        .fetchEntities(trimmed, { entityType })
        .then((response) => {
          if (!isActive) {
            return;
          }
          const matches = response.matches.filter((match) => match.entityType === entityType);
          setSuggestions(matches);
          setShowSuggestions(matches.length > 0);
        })
        .catch(() => {
          if (!isActive) {
            return;
          }
          setSuggestions([]);
          setShowSuggestions(false);
        })
        .finally(() => {
          if (!isActive) {
            return;
          }
          setLoading(false);
        });
    }, 250);

    return () => {
      isActive = false;
      clearTimeout(handle);
    };
  }, [enabled, entityType, query]);

  const reset = useCallback(() => {
    setQuery('');
    setSelection(null);
    setSuggestions([]);
    setShowSuggestions(false);
    setLoading(false);
  }, []);

  return {
    query,
    selection,
    suggestions,
    loading,
    showSuggestions,
    setQuery,
    setSelection,
    setShowSuggestions,
    reset,
  };
};

export const usePollCreationPanelSpec = ({
  visible,
  coverageKey,
  coverageName,
  searchBarTop = 0,
  onClose,
  onCreated,
}: UsePollCreationPanelSpecOptions): OverlayContentSpec<unknown> => {
  const insets = useSafeAreaInsets();
  const [selectedType, setSelectedType] = useState<PollTopicType | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const dishField = useAutocompleteField('food', visible && selectedType === 'best_dish');
  const restaurantField = useAutocompleteField(
    'restaurant',
    visible && selectedType === 'what_to_order'
  );
  const foodAttributeField = useAutocompleteField(
    'food_attribute',
    visible && selectedType === 'best_dish_attribute'
  );
  const restaurantAttributeField = useAutocompleteField(
    'restaurant_attribute',
    visible && selectedType === 'best_restaurant_attribute'
  );

  const selectedTemplate = useMemo(
    () => TEMPLATE_OPTIONS.find((option) => option.type === selectedType) ?? null,
    [selectedType]
  );

  const resetFields = useCallback(() => {
    dishField.reset();
    restaurantField.reset();
    foodAttributeField.reset();
    restaurantAttributeField.reset();
  }, [
    dishField.reset,
    restaurantField.reset,
    foodAttributeField.reset,
    restaurantAttributeField.reset,
  ]);

  useEffect(() => {
    if (!visible) {
      setSelectedType(null);
      setDescription('');
      resetFields();
    }
  }, [resetFields, visible]);

  const renderSuggestions = (
    field: AutocompleteField,
    emptyText: string,
    onSelect: (match: AutocompleteMatch) => void
  ) => {
    if (!field.showSuggestions && !field.loading) {
      return null;
    }
    return (
      <View style={styles.autocompleteBox}>
        {field.loading ? (
          <View style={styles.autocompleteLoadingRow}>
            <Text variant="body" style={styles.autocompleteLoadingText}>
              Searching…
            </Text>
          </View>
        ) : field.suggestions.length === 0 ? (
          <Text variant="body" style={styles.autocompleteEmptyText}>
            {emptyText}
          </Text>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled">
            {field.suggestions.map((match) => (
              <TouchableOpacity
                key={match.entityId}
                style={styles.autocompleteItem}
                onPress={() => onSelect(match)}
              >
                <Text variant="subtitle" weight="semibold" style={styles.autocompletePrimary}>
                  {match.name}
                </Text>
                <Text variant="body" style={styles.autocompleteSecondary}>
                  {match.entityType.replace(/_/g, ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    );
  };

  const handleSubmit = useCallback(async () => {
    if (!coverageKey) {
      Alert.alert('Pick a city', 'Move the map to a city before creating a poll.');
      return;
    }
    if (!selectedType) {
      Alert.alert('Select a poll type', 'Choose a template to continue.');
      return;
    }

    const payload: CreatePollPayload = {
      topicType: selectedType,
      coverageKey,
      description: description.trim() || undefined,
    };

    if (selectedType === 'best_dish') {
      payload.topicEntityId = dishField.selection?.entityId;
      payload.topicEntityName = dishField.selection?.name ?? dishField.query.trim();
      payload.topicEntityType = 'food';
    } else if (selectedType === 'what_to_order') {
      payload.topicEntityId = restaurantField.selection?.entityId;
      payload.topicEntityName = restaurantField.selection?.name ?? restaurantField.query.trim();
      payload.topicEntityType = 'restaurant';
    } else if (selectedType === 'best_dish_attribute') {
      payload.topicEntityId = foodAttributeField.selection?.entityId;
      payload.topicEntityName =
        foodAttributeField.selection?.name ?? foodAttributeField.query.trim();
      payload.topicEntityType = 'food_attribute';
    } else if (selectedType === 'best_restaurant_attribute') {
      payload.topicEntityId = restaurantAttributeField.selection?.entityId;
      payload.topicEntityName =
        restaurantAttributeField.selection?.name ?? restaurantAttributeField.query.trim();
      payload.topicEntityType = 'restaurant_attribute';
    }

    if (!payload.topicEntityName) {
      Alert.alert('Add a topic', 'Pick an item from suggestions or type a value.');
      return;
    }

    try {
      setSubmitting(true);
      const poll = await createPoll(payload);
      onCreated(poll);
    } catch (error) {
      Alert.alert(
        'Unable to create poll',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    coverageKey,
    description,
    dishField,
    foodAttributeField,
    onCreated,
    restaurantAttributeField,
    restaurantField,
    selectedType,
  ]);

  const handleTemplateSelect = useCallback((option: TemplateOption) => {
    setSelectedType(option.type);
  }, []);

  const handleSuggestionSelect = (field: AutocompleteField) => (match: AutocompleteMatch) => {
    field.setSelection(match);
    field.setQuery(match.name);
    field.setShowSuggestions(false);
  };

  const contentBottomPadding = Math.max(insets.bottom, 12);
  const expanded = resolveExpandedTop(searchBarTop, insets.top);
  const hidden = SCREEN_HEIGHT + 80;
  const snapPoints = useMemo(
    () => ({
      expanded,
      middle: expanded,
      collapsed: expanded,
      hidden,
    }),
    [expanded, hidden]
  );

  const listHeaderComponent = (
    <View>
      <View style={styles.headerRow}>
        <View>
          <Text variant="title" weight="semibold" style={styles.headerTitle}>
            New poll
          </Text>
          <Text variant="body" style={styles.headerSubtitle}>
            {coverageName ? `in ${coverageName}` : 'Pick a city to continue'}
          </Text>
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
          <LucideX size={20} color="#000000" strokeWidth={2.5} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text variant="body" weight="semibold" style={styles.sectionLabel}>
          Poll type
        </Text>
        {selectedTemplate ? (
          <Pressable
            onPress={() => setSelectedType(null)}
            style={[styles.templateCard, styles.templateSelected]}
          >
            <View style={styles.templateIconWrap}>
              <selectedTemplate.Icon size={18} color={ACCENT} strokeWidth={2.2} />
            </View>
            <View style={styles.templateTextGroup}>
              <Text variant="body" weight="semibold" style={styles.templateTitle}>
                {selectedTemplate.title}
              </Text>
              <Text variant="caption" style={styles.templateSubtitle}>
                Tap to change
              </Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.templateList}>
            {TEMPLATE_OPTIONS.map((option) => (
              <Pressable
                key={option.type}
                style={styles.templateCard}
                onPress={() => handleTemplateSelect(option)}
              >
                <View style={styles.templateIconWrap}>
                  <option.Icon size={18} color={ACCENT} strokeWidth={2.2} />
                </View>
                <View style={styles.templateTextGroup}>
                  <Text variant="body" weight="semibold" style={styles.templateTitle}>
                    {option.title}
                  </Text>
                  <Text variant="caption" style={styles.templateSubtitle}>
                    {option.description}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {selectedType === 'best_dish' ? (
        <View style={styles.section}>
          <Text variant="body" weight="semibold" style={styles.sectionLabel}>
            Dish
          </Text>
          <TextInput
            value={dishField.query}
            onChangeText={(text) => {
              dishField.setQuery(text);
              dishField.setSelection(null);
            }}
            placeholder="Search for a dish"
            style={styles.input}
            autoCapitalize="none"
          />
          {renderSuggestions(
            dishField,
            'Keep typing to add a dish',
            handleSuggestionSelect(dishField)
          )}
        </View>
      ) : null}

      {selectedType === 'what_to_order' ? (
        <View style={styles.section}>
          <Text variant="body" weight="semibold" style={styles.sectionLabel}>
            Restaurant
          </Text>
          <TextInput
            value={restaurantField.query}
            onChangeText={(text) => {
              restaurantField.setQuery(text);
              restaurantField.setSelection(null);
            }}
            placeholder="Search for a restaurant"
            style={styles.input}
            autoCapitalize="none"
          />
          {renderSuggestions(
            restaurantField,
            'Keep typing to add a restaurant',
            handleSuggestionSelect(restaurantField)
          )}
        </View>
      ) : null}

      {selectedType === 'best_dish_attribute' ? (
        <View style={styles.section}>
          <Text variant="body" weight="semibold" style={styles.sectionLabel}>
            Dish attribute
          </Text>
          <TextInput
            value={foodAttributeField.query}
            onChangeText={(text) => {
              foodAttributeField.setQuery(text);
              foodAttributeField.setSelection(null);
            }}
            placeholder="Spicy, crispy, vegan"
            style={styles.input}
            autoCapitalize="none"
          />
          {renderSuggestions(
            foodAttributeField,
            'Keep typing to add an attribute',
            handleSuggestionSelect(foodAttributeField)
          )}
        </View>
      ) : null}

      {selectedType === 'best_restaurant_attribute' ? (
        <View style={styles.section}>
          <Text variant="body" weight="semibold" style={styles.sectionLabel}>
            Restaurant attribute
          </Text>
          <TextInput
            value={restaurantAttributeField.query}
            onChangeText={(text) => {
              restaurantAttributeField.setQuery(text);
              restaurantAttributeField.setSelection(null);
            }}
            placeholder="Patio, vibes, service"
            style={styles.input}
            autoCapitalize="none"
          />
          {renderSuggestions(
            restaurantAttributeField,
            'Keep typing to add an attribute',
            handleSuggestionSelect(restaurantAttributeField)
          )}
        </View>
      ) : null}

      {selectedType ? (
        <View style={styles.section}>
          <Text variant="body" weight="semibold" style={styles.sectionLabel}>
            Description
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Add context or a short story for this poll"
            style={[styles.input, styles.descriptionInput]}
            multiline
          />
        </View>
      ) : null}

      <TouchableOpacity
        onPress={() => void handleSubmit()}
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        disabled={submitting}
      >
        <Text variant="body" weight="semibold" style={styles.submitButtonText}>
          {submitting ? 'Publishing…' : 'Publish poll'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return {
    overlayKey: 'pollCreation',
    snapPoints,
    initialSnapPoint: 'expanded',
    preventSwipeDismiss: true,
    data: [],
    renderItem: () => null,
    estimatedItemSize: 880,
    contentContainerStyle: {
      paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
      paddingTop: 16,
      paddingBottom: contentBottomPadding,
    },
    ListHeaderComponent: listHeaderComponent,
    keyboardShouldPersistTaps: 'handled',
    surfaceStyle: [overlaySheetStyles.surface, styles.surface],
    style: overlaySheetStyles.container,
    onHidden: onClose,
  };
};

const styles = StyleSheet.create({
  surface: {
    backgroundColor: '#ffffff',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    color: '#0f172a',
  },
  headerSubtitle: {
    color: themeColors.textBody,
    marginTop: 4,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    color: '#0f172a',
    marginBottom: 8,
  },
  templateList: {
    gap: 10,
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#ffffff',
  },
  templateSelected: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(167, 139, 250, 0.08)',
  },
  templateIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  templateTextGroup: {
    flex: 1,
  },
  templateTitle: {
    color: '#0f172a',
  },
  templateSubtitle: {
    color: themeColors.textBody,
    marginTop: 4,
    fontSize: FONT_SIZES.caption,
    lineHeight: LINE_HEIGHTS.caption,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    backgroundColor: SURFACE,
  },
  descriptionInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#ffffff',
  },
  autocompleteBox: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    maxHeight: 200,
    overflow: 'hidden',
  },
  autocompleteLoadingRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  autocompleteLoadingText: {
    color: themeColors.textBody,
  },
  autocompleteEmptyText: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: themeColors.textBody,
  },
  autocompleteItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  autocompletePrimary: {
    color: '#111827',
  },
  autocompleteSecondary: {
    color: themeColors.textBody,
    marginTop: 2,
    textTransform: 'capitalize',
  },
});
