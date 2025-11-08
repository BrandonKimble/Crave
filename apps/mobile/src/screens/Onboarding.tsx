import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import { Text, Button } from '../components';
import {
  onboardingSteps,
  getSingleChoiceLabel,
  getMultiChoiceLabels,
  type OnboardingStep,
} from '../constants/onboarding';
import { useOnboardingStore } from '../store/onboardingStore';
import type { RootStackParamList } from '../types/navigation';
import { logger } from '../utils';

type OnboardingProps = StackScreenProps<RootStackParamList, 'Onboarding'>;

type AnswerValue = string | string[] | number | undefined;

const FREQUENCY_TO_MONTHLY: Record<string, number> = {
  rarely: 6,
  weekly: 14,
  often: 22,
  daily: 28,
};

const BUDGET_TO_AMOUNT: Record<string, number> = {
  'under-20': 15,
  '20-40': 30,
  '40-70': 55,
  '70-plus': 80,
};

const FREQUENCY_RANGES: Record<
  string,
  {
    monthly: [number, number];
  }
> = {
  rarely: { monthly: [4, 8] },
  weekly: { monthly: [12, 16] },
  often: { monthly: [20, 24] },
  daily: { monthly: [28, 31] },
};

const BUDGET_RANGES: Record<
  string,
  {
    label: string;
    min: number;
    max?: number;
  }
> = {
  'under-20': { label: 'Under $20 each', min: 10, max: 20 },
  '20-40': { label: '$20–$40 each', min: 20, max: 40 },
  '40-70': { label: '$40–$70 each', min: 40, max: 70 },
  '70-plus': { label: '$70+ each', min: 70 },
};

const OnboardingScreen: React.FC<OnboardingProps> = ({ navigation }) => {
  const [stepIndex, setStepIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, AnswerValue>>({});
  const [processingReady, setProcessingReady] = React.useState(true);
  const completeOnboarding = useOnboardingStore((state) => state.completeOnboarding);
  const currentStep = onboardingSteps[stepIndex];
  const totalSteps = onboardingSteps.length;
  const regretBaselineAnim = React.useRef(new Animated.Value(0)).current;
  const regretCraveAnim = React.useRef(new Animated.Value(0)).current;
  const [graphTrackWidth, setGraphTrackWidth] = React.useState(0);

  const goToTabs = React.useCallback(() => {
    completeOnboarding();
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  }, [completeOnboarding, navigation]);

  const handleContinue = React.useCallback(() => {
    if (stepIndex === totalSteps - 1) {
      logger.info('Onboarding preferences', answers);
      goToTabs();
      return;
    }
    setStepIndex((prev) => Math.min(prev + 1, totalSteps - 1));
  }, [answers, goToTabs, stepIndex, totalSteps]);

  const handleBack = React.useCallback(() => {
    setStepIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const updateAnswer = React.useCallback((stepId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [stepId]: value }));
  }, []);

  const toggleMultiValue = React.useCallback((stepId: string, optionId: string) => {
    setAnswers((prev) => {
      const existing = prev[stepId];
      const current = Array.isArray(existing) ? existing : [];
      const next = current.includes(optionId)
        ? current.filter((value) => value !== optionId)
        : [...current, optionId];
      return {
        ...prev,
        [stepId]: next,
      };
    });
  }, []);

  const handleRegretTrackLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const { width } = event.nativeEvent.layout;
      setGraphTrackWidth((prev) => (Math.abs(prev - width) < 1 ? prev : width));
    },
    []
  );

  const currencyFormatter = React.useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }),
    []
  );

  const formatCurrency = React.useCallback(
    (value: number) => {
      if (!Number.isFinite(value)) {
        return '$0';
      }
      return currencyFormatter.format(Math.max(0, Math.round(value)));
    },
    [currencyFormatter]
  );

  const budgetAmount = React.useMemo(() => {
    const selection = answers.budget;
    if (typeof selection === 'string' && selection in BUDGET_TO_AMOUNT) {
      return BUDGET_TO_AMOUNT[selection];
    }
    return 25;
  }, [answers]);

  const diningFrequencyPerMonth = React.useMemo(() => {
    const selection = answers['dining-frequency'];
    if (typeof selection === 'string' && FREQUENCY_TO_MONTHLY[selection]) {
      return FREQUENCY_TO_MONTHLY[selection];
    }
    return 12;
  }, [answers]);

  const regretGraphData = React.useMemo(() => {
    const frequencySelection =
      typeof answers['dining-frequency'] === 'string' ? (answers['dining-frequency'] as string) : undefined;
    const budgetSelection =
      typeof answers.budget === 'string' ? (answers.budget as string) : undefined;
    const frequencyLabel = frequencySelection
      ? getSingleChoiceLabel('dining-frequency', frequencySelection)
      : undefined;
    const budgetLabel = budgetSelection ? getSingleChoiceLabel('budget', budgetSelection) : undefined;
    const monthlyMealsAverage = Math.max(1, Math.round(diningFrequencyPerMonth));
    const frequencyRange = frequencySelection ? FREQUENCY_RANGES[frequencySelection] : undefined;
    const monthlyMealRange = frequencyRange?.monthly;
    const monthlyMealRangeText = monthlyMealRange
      ? `${monthlyMealRange[0]}–${monthlyMealRange[1]} meals/month`
      : `${monthlyMealsAverage} meals/month`;
    const budgetRange = budgetSelection ? BUDGET_RANGES[budgetSelection] : undefined;
    const perMealLabel = budgetRange
      ? budgetRange.label
      : budgetLabel
        ? `${budgetLabel} each`
        : `${formatCurrency(budgetAmount)} each`;
    const monthlySpendMin =
      (monthlyMealRange?.[0] ?? monthlyMealsAverage) * (budgetRange?.min ?? budgetAmount);
    const monthlySpendMax =
      monthlyMealRange?.[1] && budgetRange?.max
        ? monthlyMealRange[1] * budgetRange.max
        : budgetRange?.max
          ? (monthlyMealRange?.[1] ?? monthlyMealsAverage) * budgetRange.max
          : undefined;
    const monthlySpendRangeLabel = monthlySpendMax
      ? `${formatCurrency(monthlySpendMin)}–${formatCurrency(monthlySpendMax)}`
      : `${formatCurrency(monthlySpendMin)}+`;
    const baselineRegretRate = 0.35;
    const craveRegretRate = 0.08;
    const monthlySpendAverage = monthlyMealsAverage * budgetAmount;
    const baselineWaste = monthlySpendAverage * baselineRegretRate;
    const craveWaste = monthlySpendAverage * craveRegretRate;
    const regretSavings = baselineWaste - craveWaste;

    return {
      frequencyLabel,
      monthlyMealRangeText,
      perMealLabel,
      monthlySpendRangeLabel,
      monthlySpendAverage,
      monthlySpendMin,
      monthlySpendMax,
      baselineWaste,
      craveWaste,
      regretSavings,
      baselineRegretRate,
      craveRegretRate,
    };
  }, [answers, budgetAmount, diningFrequencyPerMonth, formatCurrency]);

  // Processing screen timer with dynamic duration
  React.useEffect(() => {
    if (currentStep.type === 'processing') {
      setProcessingReady(false);
      const duration = currentStep.durationMs ?? 2000;
      const timer = setTimeout(() => setProcessingReady(true), duration);
      return () => clearTimeout(timer);
    }
    setProcessingReady(true);
    return undefined;
  }, [currentStep]);

  React.useEffect(() => {
    if (
      currentStep.type === 'graph' &&
      currentStep.graphType === 'regret-rate' &&
      graphTrackWidth > 0
    ) {
      regretBaselineAnim.setValue(0);
      regretCraveAnim.setValue(0);
      const baselineTarget = graphTrackWidth;
      const regretRatio =
        regretGraphData.baselineWaste > 0
          ? Math.min(regretGraphData.craveWaste / regretGraphData.baselineWaste, 1)
          : 0;
      const craveTarget = baselineTarget * regretRatio;
      Animated.parallel([
        Animated.timing(regretBaselineAnim, {
          toValue: baselineTarget,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(regretCraveAnim, {
          toValue: craveTarget,
          duration: 700,
          delay: 120,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [
    currentStep,
    graphTrackWidth,
    regretBaselineAnim,
    regretCraveAnim,
    regretGraphData.baselineWaste,
    regretGraphData.craveWaste,
  ]);

  const isStepComplete = React.useMemo(() => {
    switch (currentStep.type) {
      case 'hero':
      case 'summary':
      case 'comparison':
      case 'processing':
      case 'account':
      case 'graph':
        return true;
      case 'single-choice': {
        const selected = answers[currentStep.id];
        return currentStep.required ? typeof selected === 'string' && selected.length > 0 : true;
      }
      case 'multi-choice': {
        const selected = answers[currentStep.id];
        const count = Array.isArray(selected) ? selected.length : 0;
        const min = currentStep.minSelect ?? (currentStep.required ? 1 : 0);
        return count >= min;
      }
      case 'location': {
        const value = answers[currentStep.id];
        return typeof value === 'string' && value.trim().length > 0;
      }
      case 'rating': {
        const value = answers[currentStep.id];
        if (!currentStep.required) {
          return true;
        }
        return typeof value === 'number' && value > 0;
      }
      case 'notification': {
        const selected = answers[currentStep.id];
        return typeof selected === 'string' && selected.length > 0;
      }
      default:
        return true;
    }
  }, [answers, currentStep]);

  const continueLabel = React.useMemo(() => {
    if (currentStep.ctaLabel) {
      return currentStep.ctaLabel;
    }
    return stepIndex === totalSteps - 1 ? 'Finish' : 'Continue';
  }, [currentStep, stepIndex, totalSteps]);

  const renderHero = (step: Extract<OnboardingStep, { type: 'hero' }>) => (
    <View style={styles.heroContainer}>
      {step.image ? (
        <View style={styles.heroImageWrapper}>
          <Image source={step.image} style={styles.heroImage} resizeMode="contain" />
          {step.showAppScreenshot ? (
            <View style={styles.screenshotBadge}>
              <Text variant="caption" weight="semibold" style={styles.screenshotBadgeText}>
                👆 Replace with actual app screenshot
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <Text variant="title" weight="bold" style={styles.heroTitle}>
        {step.title}
      </Text>
      <Text variant="body" style={styles.heroDescription}>
        {step.description}
      </Text>
    </View>
  );

  const renderSummary = (step: Extract<OnboardingStep, { type: 'summary' }>) => (
    <View style={styles.summaryContainer}>
      <Text variant="title" weight="bold" style={styles.heroTitle}>
        {step.title}
      </Text>
      <Text variant="body" style={styles.heroDescription}>
        {step.description}
      </Text>
      {step.bullets?.map((bullet) => (
        <View key={bullet} style={styles.summaryBulletRow}>
          <View style={styles.summaryBulletDot} />
          <Text variant="body" style={styles.summaryBulletText}>
            {bullet}
          </Text>
        </View>
      ))}
    </View>
  );

  const renderSingleChoice = (step: Extract<OnboardingStep, { type: 'single-choice' }>) => {
    const selected = answers[step.id];

    return (
      <View>
        <Text variant="subtitle" weight="bold" style={styles.questionTitle}>
          {step.question}
        </Text>
        {step.helper ? (
          <Text variant="body" style={styles.helperText}>
            {step.helper}
          </Text>
        ) : null}
        <View style={styles.choiceColumn}>
          {step.options.map((option) => {
            const isActive = selected === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => updateAnswer(step.id, option.id)}
                style={[styles.choiceCard, isActive && styles.choiceCardActive]}
              >
                <Text variant="body" weight="semibold" style={styles.choiceCardLabel}>
                  {option.label}
                </Text>
                {option.detail ? (
                  <Text variant="caption" style={styles.choiceCardDetail}>
                    {option.detail}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  const renderMultiChoice = (step: Extract<OnboardingStep, { type: 'multi-choice' }>) => {
    const selected = Array.isArray(answers[step.id]) ? (answers[step.id] as string[]) : [];
    const optionIds = step.options.map((option) => option.id);
    const customSelections = selected.filter((value) => !optionIds.includes(value));
    const customInputKey = `${step.id}CustomInput`;
    const customInputValue =
      typeof answers[customInputKey] === 'string' ? (answers[customInputKey] as string) : '';

    const handleAddCustomValue = () => {
      const trimmed = customInputValue.trim();
      if (!trimmed) {
        return;
      }
      setAnswers((prev) => {
        const current = Array.isArray(prev[step.id]) ? (prev[step.id] as string[]) : [];
        if (current.some((value) => value.toLowerCase() === trimmed.toLowerCase())) {
          return {
            ...prev,
            [customInputKey]: '',
          };
        }
        return {
          ...prev,
          [step.id]: [...current, trimmed],
          [customInputKey]: '',
        };
      });
    };

    return (
      <View>
        <Text variant="subtitle" weight="bold" style={styles.questionTitle}>
          {step.question}
        </Text>
        {step.helper ? (
          <Text variant="body" style={styles.helperText}>
            {step.helper}
          </Text>
        ) : null}
        <View style={styles.chipGrid}>
          {step.options.map((option) => {
            const isActive = selected.includes(option.id);
            return (
              <Pressable
                key={option.id}
                onPress={() => toggleMultiValue(step.id, option.id)}
                style={[styles.chip, isActive && styles.chipActive]}
              >
                <Text
                  variant="body"
                  weight="semibold"
                  style={[styles.chipLabel, isActive && styles.chipLabelActive]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
          {customSelections.map((value) => (
            <Pressable
              key={value}
              onPress={() => toggleMultiValue(step.id, value)}
              style={styles.chipCustom}
            >
              <Text variant="body" weight="semibold" style={styles.chipLabel}>
                {value}
              </Text>
            </Pressable>
          ))}
        </View>
        {step.allowCustomInput ? (
          <View style={styles.customInputRow}>
            <TextInput
              style={[styles.textInput, styles.customInputField]}
              placeholder={step.customPlaceholder ?? 'Add your own'}
              placeholderTextColor="#94a3b8"
              value={customInputValue}
              onChangeText={(text) => updateAnswer(customInputKey, text)}
            />
            <Pressable
              style={[
                styles.addCustomButton,
                !customInputValue.trim() && styles.addCustomButtonDisabled,
              ]}
              onPress={handleAddCustomValue}
              disabled={!customInputValue.trim()}
            >
              <Text
                variant="body"
                weight="semibold"
                style={[
                  styles.addCustomButtonText,
                  !customInputValue.trim() && styles.addCustomButtonTextDisabled,
                ]}
              >
                Add
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  const renderLocation = (step: Extract<OnboardingStep, { type: 'location' }>) => {
    const rawValue = (answers[step.id] as string) ?? '';
    const activeCity = step.allowedCities.find((city) => city.value === rawValue);
    const requestValue = activeCity ? '' : rawValue;
    const requestedCity = requestValue.trim();
    const showWaitlistMessage = requestedCity.length > 0;
    const budgetValue = typeof answers.budget === 'string' ? (answers.budget as string) : undefined;
    const budgetLabel = budgetValue ? getSingleChoiceLabel('budget', budgetValue) : undefined;
    const frequencyLabel =
      typeof answers['dining-frequency'] === 'string'
        ? getSingleChoiceLabel('dining-frequency', answers['dining-frequency'] as string)
        : undefined;
    const outingLabels = Array.isArray(answers['outing-types'])
      ? getMultiChoiceLabels('outing-types', answers['outing-types'] as string[]).slice(0, 2)
      : [];
    const cuisineLabels = Array.isArray(answers.cuisines)
      ? getMultiChoiceLabels('cuisines', answers.cuisines as string[]).slice(0, 3)
      : [];

    return (
      <View>
        <Text variant="subtitle" weight="bold" style={styles.questionTitle}>
          {step.question}
        </Text>
        {step.helper ? (
          <Text variant="body" style={styles.helperText}>
            {step.helper}
          </Text>
        ) : null}
        <View style={styles.choiceColumn}>
          {step.allowedCities.map((city) => {
            const isActive = activeCity?.id === city.id;
            return (
              <Pressable
                key={city.id}
                onPress={() => updateAnswer(step.id, city.value)}
                style={[styles.choiceCard, isActive && styles.choiceCardActive]}
              >
                <Text variant="body" weight="semibold" style={styles.choiceCardLabel}>
                  {city.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.locationDivider}>
          <View style={styles.locationDividerLine} />
          <Text variant="caption" style={styles.locationDividerText}>
            or request another city
          </Text>
          <View style={styles.locationDividerLine} />
        </View>
        <TextInput
          style={styles.textInput}
          placeholder={step.placeholder ?? 'City name'}
          placeholderTextColor="#94a3b8"
          value={requestValue}
          onChangeText={(text) => updateAnswer(step.id, text)}
          autoCapitalize="words"
        />
        {showWaitlistMessage ? (
          <View style={styles.waitlistMessage}>
            <Text variant="body" weight="semibold" style={styles.waitlistMessageTitle}>
              🚀 {requestedCity} is coming soon!
            </Text>
            <Text variant="body" style={styles.waitlistMessageText}>
              You just told us what you crave ({cuisineLabels.join(', ') || 'top dishes'}), your spend{' '}
              {budgetLabel ? `(~${budgetLabel})` : ''} and how often you go out{' '}
              {frequencyLabel ? `(${frequencyLabel})` : ''}. Finish setup so we can point curated drops, polls,
              and early alerts at {requestedCity} while we scout the neighborhoods that matter to you.
            </Text>
            {(budgetLabel || frequencyLabel || outingLabels.length || cuisineLabels.length) ? (
              <View style={styles.waitlistPreferenceChips}>
                {budgetLabel ? (
                  <Text style={styles.waitlistPreferenceChip}>{budgetLabel} spend</Text>
                ) : null}
                {frequencyLabel ? (
                  <Text style={styles.waitlistPreferenceChip}>{frequencyLabel}</Text>
                ) : null}
                {outingLabels.map((label) => (
                  <Text key={label} style={styles.waitlistPreferenceChip}>
                    {label}
                  </Text>
                ))}
                {cuisineLabels.map((label) => (
                  <Text key={label} style={styles.waitlistPreferenceChip}>
                    {label}
                  </Text>
                ))}
              </View>
            ) : null}
            <View style={styles.waitlistBenefits}>
              <Text variant="caption" weight="semibold" style={styles.waitlistBenefitTitle}>
                What you'll get:
              </Text>
              <Text variant="caption" style={styles.waitlistBenefitText}>
                ✓ Early access notification the moment {requestedCity} goes live
              </Text>
              <Text variant="caption" style={styles.waitlistBenefitText}>
                ✓ 2-3 free searches to explore Austin + NYC today (use search + saves freely)
              </Text>
              <Text variant="caption" style={styles.waitlistBenefitText}>
                ✓ Your vote on which neighborhoods we rank first + tailored Tuesday polls
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const renderComparison = (step: Extract<OnboardingStep, { type: 'comparison' }>) => (
    <View>
      <Text variant="subtitle" weight="bold" style={styles.questionTitle}>
        {step.title}
      </Text>
      {step.helper ? (
        <Text variant="body" style={styles.helperText}>
          {step.helper}
        </Text>
      ) : null}
      <View style={styles.comparisonRow}>
        {[step.left, step.right].map((column, index) => (
          <View
            key={column.title}
            style={[styles.comparisonColumn, index === 1 && styles.comparisonColumnHighlight]}
          >
            <Text variant="body" weight="semibold" style={styles.comparisonColumnTitle}>
              {column.title}
            </Text>
            {column.rows.map((row) => (
              <Text key={row} variant="caption" style={styles.comparisonRowText}>
                {row}
              </Text>
            ))}
          </View>
        ))}
      </View>
      {step.body ? (
        <Text variant="body" weight="bold" style={styles.comparisonBodyText}>
          {step.body}
        </Text>
      ) : null}
    </View>
  );

  const renderRating = (step: Extract<OnboardingStep, { type: 'rating' }>) => {
    const value = (answers[step.id] as number) ?? 0;
    const max = step.maxRating ?? 5;
    return (
      <View>
        <Text variant="subtitle" weight="bold" style={styles.questionTitle}>
          {step.question}
        </Text>
        {step.helper ? (
          <Text variant="body" style={styles.helperText}>
            {step.helper}
          </Text>
        ) : null}
        <View style={styles.ratingRow}>
          {Array.from({ length: max }).map((_, index) => {
            const ratingValue = index + 1;
            const isFilled = ratingValue <= value;
            return (
              <Pressable
                key={ratingValue}
                onPress={() => updateAnswer(step.id, ratingValue)}
                style={styles.ratingStar}
              >
                <Text style={[styles.ratingStarText, isFilled && styles.ratingStarFilled]}>★</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  const renderProcessing = (step: Extract<OnboardingStep, { type: 'processing' }>) => {
    const budgetValue = typeof answers.budget === 'string' ? (answers.budget as string) : undefined;
    const budgetDisplay = budgetValue ? getSingleChoiceLabel('budget', budgetValue) : 'Flexible';

    const highlights = step.showSummary
      ? [
          {
            label: 'Budget',
            value: budgetDisplay ?? 'Flexible',
          },
          {
            label: 'Cravings',
            value:
              getMultiChoiceLabels('cuisines', answers.cuisines as string[]).join(', ') ||
              'Open to anything',
          },
          {
            label: 'Vibe',
            value: getSingleChoiceLabel('ambiance', answers.ambiance as string) ?? 'Any vibe',
          },
          {
            label: 'Outings',
            value:
              getMultiChoiceLabels('outing-types', answers['outing-types'] as string[]).join(
                ', '
              ) || 'All types',
          },
        ]
      : [];

    return (
      <View style={styles.processingContainer}>
        <View style={styles.processingProgressTrack}>
          <View style={[styles.processingProgressFill, { width: `${step.progress * 100}%` }]} />
        </View>
        <Text variant="subtitle" weight="bold" style={styles.processingTitle}>
          {step.title}
        </Text>
        <Text variant="body" style={styles.helperText}>
          {step.subtitle}
        </Text>
        <View style={styles.processingChecklist}>
          {step.checklist.map((item) => (
            <View key={item.label} style={styles.processingChecklistRow}>
              <View
                style={[
                  styles.processingBadge,
                  item.status === 'complete'
                    ? styles.processingBadgeComplete
                    : styles.processingBadgePending,
                ]}
              >
                <Text
                  style={[
                    styles.processingBadgeText,
                    item.status === 'complete'
                      ? styles.processingBadgeTextComplete
                      : styles.processingBadgeTextPending,
                  ]}
                >
                  {item.status === 'complete' ? '✓' : '○'}
                </Text>
              </View>
              <Text variant="body" style={styles.processingChecklistLabel}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>
        {step.showSummary ? (
          <View style={styles.processingHighlights}>
            {highlights.map((highlight) => (
              <View key={highlight.label} style={styles.processingHighlightRow}>
                <Text variant="caption" style={styles.processingHighlightLabel}>
                  {highlight.label}
                </Text>
                <Text
                  variant="body"
                  weight="semibold"
                  style={styles.processingHighlightValue}
                  numberOfLines={1}
                >
                  {highlight.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {!processingReady ? (
          <View style={styles.processingSpinnerRow}>
            <ActivityIndicator color="#a78bfa" size="small" />
            <Text variant="caption" style={styles.processingSpinnerLabel}>
              Processing…
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  const openTerms = React.useCallback(() => {
    // TODO: Replace with actual Terms of Service URL
    void Linking.openURL('https://example.com/terms');
  }, []);

  const openPrivacy = React.useCallback(() => {
    // TODO: Replace with actual Privacy Policy URL
    void Linking.openURL('https://example.com/privacy');
  }, []);

  const renderAccount = (step: Extract<OnboardingStep, { type: 'account' }>) => {
    const locationValue = (answers.location as string) ?? '';
    const locationStep = onboardingSteps.find((s) => s.id === 'location');
    const isLiveCity =
      locationStep?.type === 'location'
        ? locationStep.allowedCities.some((city) => city.value === locationValue)
        : false;
    const isWaitlistUser = !isLiveCity && locationValue.trim().length > 0;

    return (
      <View>
        <Text variant="title" weight="bold" style={styles.heroTitle}>
          {isWaitlistUser ? `Reserve your spot in ${locationValue}` : step.title}
        </Text>
        <Text variant="body" style={styles.heroDescription}>
          {isWaitlistUser
            ? `Create an account to get curated drops for ${locationValue}, be first to know when we launch, and unlock a few free searches in Austin & NYC so you can poke around today.`
            : step.description}
        </Text>
        {isWaitlistUser ? (
          <View style={styles.waitlistAccountBenefits}>
            <Text variant="caption" weight="semibold" style={styles.waitlistAccountBenefitTitle}>
              Your waitlist benefits:
            </Text>
            <Text variant="caption" style={styles.waitlistAccountBenefitText}>
              ✓ Early access notification (est. Q2 2025)
            </Text>
            <Text variant="caption" style={styles.waitlistAccountBenefitText}>
              ✓ 2-3 free searches in Austin & NYC today
            </Text>
            <Text variant="caption" style={styles.waitlistAccountBenefitText}>
              ✓ Priority access to vote on neighborhoods we rank first
            </Text>
          </View>
        ) : null}
        <View style={styles.accountButtons}>
        <Pressable
          style={styles.accountButton}
          onPress={() => {
            // TODO: Implement Apple Sign In
            logger.info('Apple Sign In tapped');
            handleContinue();
          }}
        >
          <Text variant="body" weight="semibold" style={styles.accountButtonText}>
            🍎 Continue with Apple
          </Text>
        </Pressable>
        <Pressable
          style={styles.accountButton}
          onPress={() => {
            // TODO: Implement Google Sign In
            logger.info('Google Sign In tapped');
            handleContinue();
          }}
        >
          <Text variant="body" weight="semibold" style={styles.accountButtonText}>
            🔍 Continue with Google
          </Text>
        </Pressable>
      </View>
      {step.disclaimer ? (
        <View style={styles.disclaimerContainer}>
          <Text variant="caption" style={styles.disclaimerText}>
            {step.disclaimer.split('Terms of Service')[0]}
            <Text variant="caption" style={styles.disclaimerLink} onPress={openTerms}>
              Terms of Service
            </Text>
            {' and '}
            <Text variant="caption" style={styles.disclaimerLink} onPress={openPrivacy}>
              Privacy Policy
            </Text>
            {step.disclaimer.split('Privacy Policy')[1]}
          </Text>
        </View>
      ) : null}
    </View>
    );
  };

  const renderGraph = (step: Extract<OnboardingStep, { type: 'graph' }>) => {
    // Placeholder graphs - replace with actual chart library later
    const renderGraphVisualization = () => {
      switch (step.graphType) {
        case 'calendar-comparison': {
          const frequencySelection =
            typeof answers['dining-frequency'] === 'string'
              ? (answers['dining-frequency'] as string)
              : undefined;

          // Map frequency ID to display label (preserving dashes)
          const frequencyMap: Record<string, string> = {
            rarely: '1-2 times/week',
            weekly: '3-4 times/week',
            often: '5-6 times/week',
            daily: 'every day',
          };
          const frequencyLabel = frequencySelection && frequencyMap[frequencySelection]
            ? frequencyMap[frequencySelection]
            : 'regularly';

          // Map frequency to meals per week for visualization
          const mealsPerWeekMap: Record<string, number> = {
            rarely: 1.5,   // 1-2 times/week
            weekly: 3.5,   // 3-4 times/week
            often: 5.5,    // 5-6 times/week
            daily: 7,      // every day
          };
          const mealsPerWeek = frequencySelection && mealsPerWeekMap[frequencySelection]
            ? mealsPerWeekMap[frequencySelection]
            : 3.5;

          const budgetSelection =
            typeof answers.budget === 'string' ? (answers.budget as string) : undefined;

          // Map budget ID to dollar range
          const budgetMap: Record<string, string> = {
            'under-20': 'under $20',
            '20-40': '$20-$40',
            '40-70': '$40-$70',
            '70-plus': '$70+',
          };
          const budgetLabel = budgetSelection && budgetMap[budgetSelection]
            ? budgetMap[budgetSelection]
            : '$20-$40';

          // Generate calendar pattern based on frequency
          // 30 days (full month), weighted towards weekends with some clustering
          const totalDays = 30;
          // Calculate total meals: (meals per week) × (30 days / 7 days per week)
          const totalMealsInMonth = Math.round(mealsPerWeek * (30 / 7));
          const generateCalendar = (disappointmentRate: number) => {
            // Initialize all days as 'none' (not eating out)
            const calendar: ('none' | 'good' | 'bad')[] = Array(totalDays).fill('none');

            // Define day weights (0=Sunday, 6=Saturday pattern repeating)
            // Higher weight = more likely to eat out
            const dayWeights = [
              1.6, // Sun (leftmost column)
              0.8, // Mon
              0.7, // Tue
              0.8, // Wed
              1.2, // Thu
              1.8, // Fri
              2.0, // Sat (rightmost column)
            ];

            const eatingDays: number[] = [];

            // Create weighted pool of days
            const weightedDays: number[] = [];
            for (let i = 0; i < totalDays; i++) {
              const dayOfWeek = i % 7;
              const weight = dayWeights[dayOfWeek];
              // Add day multiple times based on weight (higher weight = more chances)
              const copies = Math.round(weight * 10);
              for (let j = 0; j < copies; j++) {
                weightedDays.push(i);
              }
            }

            // Select eating days from weighted pool
            const selectedDays = new Set<number>();
            while (selectedDays.size < totalMealsInMonth && selectedDays.size < totalDays) {
              const randomIdx = Math.floor(Math.random() * weightedDays.length);
              const day = weightedDays[randomIdx];
              selectedDays.add(day);
            }

            eatingDays.push(...Array.from(selectedDays).sort((a, b) => a - b));

            // Add some clustering (back-to-back days)
            // ~30% chance of adding adjacent day if not already selected
            const clusteredDays = [...eatingDays];
            eatingDays.forEach(day => {
              if (Math.random() < 0.3 && clusteredDays.length < totalMealsInMonth) {
                const nextDay = day + 1;
                if (nextDay < totalDays && !clusteredDays.includes(nextDay)) {
                  clusteredDays.push(nextDay);
                }
              }
            });

            // Trim if we added too many
            const finalEatingDays = clusteredDays.sort((a, b) => a - b).slice(0, totalMealsInMonth);

            // Determine how many should be disappointing
            const targetBad = Math.round(finalEatingDays.length * disappointmentRate);

            // Randomly select which eating days are disappointing
            const shuffledIndices = finalEatingDays.map((_, i) => i).sort(() => Math.random() - 0.5);

            finalEatingDays.forEach((dayIndex, i) => {
              const isBad = shuffledIndices.indexOf(i) < targetBad;
              calendar[dayIndex] = isBad ? 'bad' : 'good';
            });

            return calendar;
          };

          const withoutCraveCalendar = generateCalendar(0.37); // Visual: 35-40% disappoint (copy says "1 in 3")
          const withCraveCalendar = generateCalendar(0.08); // ~1 in 12 disappoint

          return (
            <View style={styles.graphContainer}>
              <View style={styles.calendarComparisonRow}>
                <View style={styles.calendarColumn}>
                  <Text variant="caption" style={styles.calendarColumnLabel}>
                    Without Crave
                  </Text>
                  <View style={styles.calendarGrid}>
                    {withoutCraveCalendar.map((dayType, index) => (
                      <View
                        key={index}
                        style={[
                          styles.calendarDay,
                          dayType === 'none' && styles.calendarDayNone,
                          dayType === 'good' && styles.calendarDayGood,
                          dayType === 'bad' && styles.calendarDayBad,
                        ]}
                      />
                    ))}
                  </View>
                  <Text variant="caption" style={styles.calendarStat}>
                    1 in 3 meals disappoint
                  </Text>
                </View>
                <View style={styles.calendarColumn}>
                  <Text variant="caption" style={styles.calendarColumnLabel}>
                    With Crave
                  </Text>
                  <View style={styles.calendarGrid}>
                    {withCraveCalendar.map((dayType, index) => (
                      <View
                        key={index}
                        style={[
                          styles.calendarDay,
                          dayType === 'none' && styles.calendarDayNone,
                          dayType === 'good' && styles.calendarDayGood,
                          dayType === 'bad' && styles.calendarDayBad,
                        ]}
                      />
                    ))}
                  </View>
                  <Text variant="caption" style={styles.calendarStat}>
                    11 in 12 meals satisfy
                  </Text>
                </View>
              </View>
              <Text variant="caption" style={styles.graphCallout}>
                At {frequencyLabel} and {budgetLabel} per meal, you could save ~{formatCurrency(regretGraphData.regretSavings)}/month on meals you'd regret.
              </Text>
            </View>
          );
        }
        case 'time-saved':
          return (
            <View style={styles.graphContainer}>
              <Text variant="caption" style={styles.graphLabel}>
                Finding great food
              </Text>
              <View style={styles.graphBarRow}>
                <Text variant="caption" style={styles.graphBarLabel}>
                  Without Crave:
                </Text>
                <View style={styles.graphBarTrack}>
                  <View style={[styles.graphBarFill, { width: '100%', backgroundColor: '#fca5a5' }]} />
                </View>
                <Text variant="caption" style={styles.graphBarValue}>
                  High effort
                </Text>
              </View>
              <View style={styles.graphBarRow}>
                <Text variant="caption" style={styles.graphBarLabel}>
                  With Crave:
                </Text>
                <View style={styles.graphBarTrack}>
                  <View style={[styles.graphBarFill, { width: '25%', backgroundColor: '#34d399' }]} />
                </View>
                <Text variant="caption" style={styles.graphBarValue}>
                  Low effort
                </Text>
              </View>
              <Text variant="body" weight="bold" style={styles.graphCallout}>
                4x less time and effort. At {diningFrequencyPerMonth} times/month, that's {formatCurrency(regretGraphData.monthlySpendAverage * 0.33)}/month saved from disappointing meals.
              </Text>
            </View>
          );
        case 'regret-rate': {
          const {
            frequencyLabel,
            monthlyMealRangeText,
            perMealLabel,
            monthlySpendRangeLabel,
            monthlySpendAverage,
            baselineWaste,
            craveWaste,
            regretSavings,
            baselineRegretRate,
            craveRegretRate,
          } = regretGraphData;

          return (
            <View style={styles.graphContainer}>
              <Text variant="caption" style={styles.graphLabel}>
                Meals you regret after ordering
              </Text>
              <Text variant="body" style={styles.graphBody}>
                {`Based on your ${frequencyLabel ?? 'current'} habit (${monthlyMealRangeText}) at ${perMealLabel}, you're putting ${monthlySpendRangeLabel}/mo into eating out.`}
              </Text>
              <Text variant="caption" style={styles.graphDetailText}>
                ~ {formatCurrency(monthlySpendAverage)} each month on food.
              </Text>
              <View style={styles.graphBarRow}>
                <Text variant="caption" style={styles.graphBarLabel}>
                  Missing intel ({Math.round(baselineRegretRate * 100)}%):
                </Text>
                <View style={styles.graphBarTrack} onLayout={handleRegretTrackLayout}>
                  {graphTrackWidth > 0 ? (
                    <Animated.View
                      style={[styles.graphBarFill, styles.graphBarFillBaseline, { width: regretBaselineAnim }]}
                    />
                  ) : (
                    <View style={[styles.graphBarFill, styles.graphBarFillBaseline, styles.graphBarFillFull]} />
                  )}
                </View>
                <Text variant="caption" style={styles.graphBarValue}>
                  {formatCurrency(baselineWaste)}/mo wasted
                </Text>
              </View>
              <View style={styles.graphBarRow}>
                <Text variant="caption" style={styles.graphBarLabel}>
                  Using Crave ({Math.round(craveRegretRate * 100)}%):
                </Text>
                <View style={styles.graphBarTrack}>
                  {graphTrackWidth > 0 ? (
                    <Animated.View
                      style={[styles.graphBarFill, styles.graphBarFillCrave, { width: regretCraveAnim }]}
                    />
                  ) : (
                    <View style={[styles.graphBarFill, styles.graphBarFillCrave, styles.graphBarFillPartial]} />
                  )}
                </View>
                <Text variant="caption" style={styles.graphBarValue}>
                  {formatCurrency(craveWaste)}/mo wasted
                </Text>
              </View>
              <Text variant="body" weight="bold" style={styles.graphCallout}>
                Crave keeps roughly {formatCurrency(Math.max(regretSavings, 0))} of that budget in play every month.
              </Text>
            </View>
          );
        }
        case 'discovery-curve':
          return (
            <View style={styles.graphContainer}>
              <Text variant="caption" style={styles.graphLabel}>
                Time to find 10 spots you love
              </Text>
              <View style={styles.graphBarColumn}>
                <View style={styles.graphBarRow}>
                  <Text variant="caption" style={styles.graphBarLabel}>
                    Trial & Error:
                  </Text>
                  <View style={styles.graphBarTrack}>
                    <View style={[styles.graphBarFill, { width: '100%', backgroundColor: '#fca5a5' }]} />
                  </View>
                  <Text variant="caption" style={styles.graphBarValue}>
                    6 months
                  </Text>
                </View>
                <View style={styles.graphBarRow}>
                  <Text variant="caption" style={styles.graphBarLabel}>
                    Friend Recs:
                  </Text>
                  <View style={styles.graphBarTrack}>
                    <View style={[styles.graphBarFill, { width: '50%', backgroundColor: '#fbbf24' }]} />
                  </View>
                  <Text variant="caption" style={styles.graphBarValue}>
                    3 months
                  </Text>
                </View>
                <View style={styles.graphBarRow}>
                  <Text variant="caption" style={styles.graphBarLabel}>
                    Crave:
                  </Text>
                  <View style={styles.graphBarTrack}>
                    <View style={[styles.graphBarFill, { width: '11%', backgroundColor: '#34d399' }]} />
                  </View>
                  <Text variant="caption" style={styles.graphBarValue}>
                    2 weeks
                  </Text>
                </View>
              </View>
            </View>
          );
        default:
          return null;
      }
    };

    return (
      <View style={styles.graphScreenContainer}>
        <Text variant="subtitle" weight="bold" style={styles.graphTitle}>
          {step.title}
        </Text>
        <View style={styles.graphContentGroup}>
          <View style={styles.graphBundle}>
            {renderGraphVisualization()}
            <Text variant="body" style={styles.graphBody}>
              {step.body}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderNotification = (step: Extract<OnboardingStep, { type: 'notification' }>) => {
    const selected = answers[step.id];
    return (
      <View>
        <Text variant="subtitle" weight="bold" style={styles.questionTitle}>
          {step.title}
        </Text>
        <Text variant="body" style={styles.helperText}>
          {step.body}
        </Text>
        <View style={styles.notificationFeatureList}>
          <Text variant="body" weight="semibold" style={styles.notificationFeatureTitle}>
            What you'll get:
          </Text>
          {step.features.map((feature) => (
            <View key={feature} style={styles.notificationFeatureRow}>
              <Text style={styles.notificationFeatureBullet}>•</Text>
              <Text variant="body" style={styles.notificationFeatureText}>
                {feature}
              </Text>
            </View>
          ))}
        </View>
        <Text variant="body" weight="semibold" style={styles.notificationOptionsTitle}>
          How often:
        </Text>
        <View style={styles.choiceColumn}>
          {step.options.map((option) => {
            const isActive = selected === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => updateAnswer(step.id, option.id)}
                style={[styles.choiceCard, isActive && styles.choiceCardActive]}
              >
                <View style={styles.notificationOptionRow}>
                  <Text variant="body" weight="semibold" style={styles.choiceCardLabel}>
                    {option.label}
                  </Text>
                  {option.recommended ? (
                    <View style={styles.recommendedBadge}>
                      <Text variant="caption" weight="semibold" style={styles.recommendedBadgeText}>
                        RECOMMENDED
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  const renderStep = () => {
    switch (currentStep.type) {
      case 'hero':
        return renderHero(currentStep);
      case 'summary':
        return renderSummary(currentStep);
      case 'single-choice':
        return renderSingleChoice(currentStep);
      case 'multi-choice':
        return renderMultiChoice(currentStep);
      case 'location':
        return renderLocation(currentStep);
      case 'comparison':
        return renderComparison(currentStep);
      case 'rating':
        return renderRating(currentStep);
      case 'processing':
        return renderProcessing(currentStep);
      case 'account':
        return renderAccount(currentStep);
      case 'graph':
        return renderGraph(currentStep);
      case 'notification':
        return renderNotification(currentStep);
      default:
        return null;
    }
  };

  const canContinue =
    isStepComplete && (currentStep.type === 'processing' ? processingReady : true);
  const canGoBack = stepIndex > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable
            style={[styles.backButton, !canGoBack && styles.backButtonDisabled]}
            onPress={handleBack}
            disabled={!canGoBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text variant="body" weight="bold" style={styles.backButtonIcon}>
              ‹
            </Text>
          </Pressable>
          <View style={styles.progressArea}>
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${((stepIndex + 1) / totalSteps) * 100}%` }]}
              />
            </View>
            <View style={styles.headerBrand}>
              <Text variant="body" weight="bold" style={styles.headerTitle}>
                crave
              </Text>
              <View style={styles.betaChip}>
                <Text variant="caption" weight="semibold" style={styles.betaChipText}>
                  BETA
                </Text>
              </View>
            </View>
          </View>
        </View>
        <ScrollView
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          {renderStep()}
        </ScrollView>
        <View style={styles.footer}>
          <Button
            label={continueLabel}
            onPress={handleContinue}
            disabled={!canContinue}
            style={styles.ctaButton}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonDisabled: {
    opacity: 0.4,
  },
  backButtonIcon: {
    color: '#be123c',
    fontSize: 22,
    lineHeight: 34,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontWeight: '400',
    transform: [{ translateY: -1 }],
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 18,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: '#111827',
  },
  betaChip: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  betaChipText: {
    color: '#be123c',
    fontSize: 10,
  },
  progressArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#fee2e2',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#f97384',
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 16,
  },
  heroContainer: {
    alignItems: 'flex-start',
    gap: 16,
  },
  heroImageWrapper: {
    position: 'relative',
    width: '100%',
    alignItems: 'center',
  },
  heroImage: {
    width: '80%',
    height: 220,
  },
  screenshotBadge: {
    position: 'absolute',
    bottom: 8,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fbbf24',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  screenshotBadgeText: {
    color: '#92400e',
    fontSize: 10,
  },
  heroTitle: {
    textAlign: 'left',
    color: '#0f172a',
    fontSize: 24,
    lineHeight: 32,
  },
  heroDescription: {
    textAlign: 'left',
    color: '#475569',
  },
  questionTitle: {
    color: '#0f172a',
    marginBottom: 8,
    fontSize: 24,
    lineHeight: 32,
  },
  helperText: {
    color: '#64748b',
    marginBottom: 16,
  },
  choiceColumn: {
    gap: 12,
  },
  choiceCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    backgroundColor: '#ffffff',
  },
  choiceCardActive: {
    borderColor: '#a78bfa',
    backgroundColor: '#f5f3ff',
  },
  choiceCardLabel: {
    color: '#111827',
  },
  choiceCardDetail: {
    color: '#475569',
    marginTop: 4,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  chipActive: {
    borderColor: '#fb7185',
    backgroundColor: '#fff1f2',
  },
  chipLabel: {
    color: '#0f172a',
  },
  chipLabelActive: {
    color: '#be123c',
  },
  chipCustom: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#f87171',
    backgroundColor: '#fff1f2',
  },
  customInputRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  customInputField: {
    flex: 1,
  },
  addCustomButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f97384',
  },
  addCustomButtonDisabled: {
    backgroundColor: '#fed7d7',
  },
  addCustomButtonText: {
    color: '#ffffff',
  },
  addCustomButtonTextDisabled: {
    color: '#ffffff',
    opacity: 0.6,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0f172a',
  },
  locationDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 16,
  },
  locationDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  locationDividerText: {
    color: '#94a3b8',
  },
  waitlistMessage: {
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#93c5fd',
    gap: 12,
  },
  waitlistMessageTitle: {
    color: '#1e40af',
  },
  waitlistMessageText: {
    color: '#1e3a8a',
    lineHeight: 20,
  },
  waitlistPreferenceChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  waitlistPreferenceChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#bfdbfe',
    color: '#1e3a8a',
    fontSize: 12,
  },
  waitlistBenefits: {
    gap: 6,
    marginTop: 4,
  },
  waitlistBenefitTitle: {
    color: '#1e40af',
    marginBottom: 4,
  },
  waitlistBenefitText: {
    color: '#1e3a8a',
    lineHeight: 18,
  },
  comparisonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  comparisonColumn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    gap: 8,
  },
  comparisonColumnHighlight: {
    borderColor: '#a78bfa',
    backgroundColor: '#faf5ff',
    borderWidth: 2,
  },
  comparisonColumnTitle: {
    color: '#0f172a',
    marginBottom: 4,
  },
  comparisonRowText: {
    color: '#475569',
    lineHeight: 20,
  },
  comparisonBodyText: {
    color: '#0f172a',
    marginTop: 16,
    textAlign: 'left',
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  ratingStar: {
    padding: 12,
  },
  ratingStarText: {
    fontSize: 32,
    color: '#e2e8f0',
  },
  ratingStarFilled: {
    color: '#fbbf24',
  },
  processingContainer: {
    gap: 16,
  },
  processingProgressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    overflow: 'hidden',
  },
  processingProgressFill: {
    height: '100%',
    backgroundColor: '#a78bfa',
  },
  processingTitle: {
    color: '#0f172a',
  },
  processingChecklist: {
    gap: 12,
  },
  processingChecklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  processingBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingBadgeComplete: {
    backgroundColor: '#dcfce7',
  },
  processingBadgePending: {
    backgroundColor: '#f1f5f9',
  },
  processingBadgeText: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  processingBadgeTextComplete: {
    color: '#15803d',
  },
  processingBadgeTextPending: {
    color: '#94a3b8',
  },
  processingChecklistLabel: {
    color: '#0f172a',
    flex: 1,
  },
  processingHighlights: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 12,
    backgroundColor: '#fafafa',
  },
  processingHighlightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  processingHighlightLabel: {
    color: '#94a3b8',
  },
  processingHighlightValue: {
    color: '#0f172a',
    textAlign: 'right',
    flex: 1,
    marginLeft: 12,
  },
  processingSpinnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  processingSpinnerLabel: {
    color: '#94a3b8',
  },
  summaryContainer: {
    gap: 12,
  },
  summaryBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  summaryBulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    backgroundColor: '#a78bfa',
  },
  summaryBulletText: {
    color: '#475569',
    flex: 1,
  },
  accountButtons: {
    marginTop: 24,
    gap: 12,
  },
  accountButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  accountButtonText: {
    color: '#0f172a',
  },
  disclaimerContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  disclaimerText: {
    color: '#94a3b8',
    textAlign: 'left',
    lineHeight: 18,
  },
  disclaimerLink: {
    color: '#a78bfa',
    textDecorationLine: 'underline',
  },
  // Graph styles
  graphScreenContainer: {
    flex: 1,
  },
  graphContentGroup: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  graphBundle: {
    width: '100%',
    gap: 16,
  },
  graphContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 16,
  },
  graphLabel: {
    color: '#64748b',
    textAlign: 'left',
    marginBottom: 8,
  },
  graphDetailText: {
    color: '#64748b',
    marginBottom: 4,
  },
  graphBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  graphBarColumn: {
    gap: 12,
  },
  graphBarLabel: {
    color: '#475569',
    width: 100,
  },
  graphBarTrack: {
    flex: 1,
    height: 24,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  graphBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  graphBarFillBaseline: {
    backgroundColor: '#fca5a5',
  },
  graphBarFillCrave: {
    backgroundColor: '#34d399',
  },
  graphBarFillFull: {
    width: '100%',
  },
  graphBarFillPartial: {
    width: '16%',
  },
  graphBarValue: {
    color: '#475569',
    width: 70,
    textAlign: 'right',
  },
  graphCallout: {
    color: '#334155',
    textAlign: 'center',
    marginTop: 8,
    fontSize: 13,
    maxWidth: '100%',
    alignSelf: 'center',
  },
  graphTitle: {
    color: '#0f172a',
    textAlign: 'left',
    fontSize: 24,
    lineHeight: 32,
    paddingHorizontal: 4,
    marginBottom: 0,
  },
  graphBody: {
    color: '#475569',
    textAlign: 'left',
    lineHeight: 22,
  },
  // Calendar graph styles
  calendarComparisonRow: {
    flexDirection: 'row',
    gap: 16,
  },
  calendarColumn: {
    flex: 1,
    gap: 8,
    alignItems: 'center',
  },
  calendarColumnLabel: {
    color: '#0f172a',
    textAlign: 'center',
    fontWeight: '600',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'flex-start',
    maxWidth: 140,
  },
  calendarDay: {
    width: 16,
    height: 16,
    borderRadius: 3,
  },
  calendarDayNone: {
    backgroundColor: '#e2e8f0',
  },
  calendarDayGood: {
    backgroundColor: '#86efac',
  },
  calendarDayBad: {
    backgroundColor: '#fca5a5',
  },
  calendarStat: {
    color: '#0f172a',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 100,
    alignSelf: 'center',
  },
  // Notification styles
  notificationFeatureList: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
    marginBottom: 20,
  },
  notificationFeatureTitle: {
    color: '#0f172a',
    marginBottom: 4,
  },
  notificationFeatureRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  notificationFeatureBullet: {
    color: '#a78bfa',
    fontSize: 16,
    fontWeight: 'bold',
  },
  notificationFeatureText: {
    color: '#475569',
    flex: 1,
  },
  notificationOptionsTitle: {
    color: '#0f172a',
    marginBottom: 12,
  },
  notificationOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recommendedBadge: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recommendedBadgeText: {
    color: '#15803d',
    fontSize: 10,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'stretch',
  },
  ctaButton: {
    width: '100%',
  },
});

export default OnboardingScreen;
