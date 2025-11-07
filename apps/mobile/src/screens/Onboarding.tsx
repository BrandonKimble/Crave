import React from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import { Text, Button } from '../components';
import { onboardingSteps, type OnboardingStep } from '../constants/onboarding';
import { useOnboardingStore } from '../store/onboardingStore';
import type { RootStackParamList } from '../types/navigation';
import { logger } from '../utils';

type OnboardingProps = StackScreenProps<RootStackParamList, 'Onboarding'>;

type AnswerValue = string | string[] | number | undefined;

const OnboardingScreen: React.FC<OnboardingProps> = ({ navigation }) => {
  const [stepIndex, setStepIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, AnswerValue>>({});
  const [processingReady, setProcessingReady] = React.useState(true);
  const completeOnboarding = useOnboardingStore((state) => state.completeOnboarding);
  const currentStep = onboardingSteps[stepIndex];
  const totalSteps = onboardingSteps.length;

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

  React.useEffect(() => {
    if (currentStep.type === 'processing') {
      setProcessingReady(false);
      const timer = setTimeout(() => setProcessingReady(true), 1400);
      return () => clearTimeout(timer);
    }
    setProcessingReady(true);
    return undefined;
  }, [currentStep]);

  const isStepComplete = React.useMemo(() => {
    switch (currentStep.type) {
      case 'hero':
      case 'summary':
      case 'comparison':
      case 'processing':
      case 'account':
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

  const stepMap = React.useMemo(() => {
    const map = new Map<string, OnboardingStep>();
    onboardingSteps.forEach((step) => map.set(step.id, step));
    return map;
  }, []);

  const getSingleLabel = React.useCallback(
    (stepId: string) => {
      const step = stepMap.get(stepId);
      const value = answers[stepId];
      if (!step || typeof value !== 'string') {
        return undefined;
      }
      if (step.type === 'single-choice') {
        return step.options.find((option) => option.id === value)?.label;
      }
      if (step.type === 'location') {
        return value;
      }
      return undefined;
    },
    [answers, stepMap]
  );

  const getMultiLabels = React.useCallback(
    (stepId: string) => {
      const step = stepMap.get(stepId);
      const selected = answers[stepId];
      if (!step || !Array.isArray(selected)) {
        return [];
      }
      if (step.type === 'multi-choice') {
        return selected
          .map((value) => step.options.find((option) => option.id === value)?.label ?? '')
          .filter(Boolean);
      }
      return [];
    },
    [answers, stepMap]
  );

  const renderHero = (step: Extract<OnboardingStep, { type: 'hero' }>) => (
    <View style={styles.heroContainer}>
      {step.image ? (
        <Image source={step.image} style={styles.heroImage} resizeMode="contain" />
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
        </View>
      </View>
    );
  };

  const renderLocation = (step: Extract<OnboardingStep, { type: 'location' }>) => {
    const rawValue = (answers[step.id] as string) ?? '';
    const activeCity = step.allowedCities.find((city) => city.value === rawValue);
    const requestValue = activeCity ? '' : rawValue;
    const showWaitlistMessage = requestValue.trim().length > 0;

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
            <Text variant="caption" style={styles.waitlistMessageText}>
              We’ll notify you when we launch in {requestValue.trim()}. 2,847 people are waiting for
              Chicago.
            </Text>
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
        {[step.left, step.right].map((column) => (
          <View key={column.title} style={styles.comparisonColumn}>
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
        <Text variant="body" style={styles.helperText}>
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
    const highlights = step.showSummary
      ? [
          { label: 'Budget', value: getSingleLabel('budget') ?? 'Flexible' },
          {
            label: 'Cravings',
            value: getMultiLabels('cuisines').join(', ') || 'Open to anything',
          },
          {
            label: 'Vibe',
            value: getSingleLabel('ambiance') ?? 'Any vibe',
          },
          {
            label: 'Outings',
            value: getMultiLabels('outing-types').join(', ') || 'All outings',
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
                  {item.status === 'complete' ? '✓' : '•'}
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
                <Text variant="body" weight="semibold" style={styles.processingHighlightValue}>
                  {highlight.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {!processingReady ? (
          <View style={styles.processingSpinnerRow}>
            <ActivityIndicator color="#f97384" />
            <Text variant="caption" style={styles.processingSpinnerLabel}>
              Working…
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  const renderAccount = (step: Extract<OnboardingStep, { type: 'account' }>) => (
    <View>
      <Text variant="title" weight="bold" style={styles.heroTitle}>
        {step.title}
      </Text>
      <Text variant="body" style={styles.heroDescription}>
        {step.description}
      </Text>
      <View style={styles.accountButtons}>
        <Pressable style={styles.accountButtonStub}>
          <Text variant="body" style={styles.accountButtonText}>
            Continue with Apple
          </Text>
        </Pressable>
        <Pressable style={styles.accountButtonStub}>
          <Text variant="body" style={styles.accountButtonText}>
            Continue with Google
          </Text>
        </Pressable>
      </View>
      <Text variant="caption" style={styles.accountDisclaimer}>
        (Stub) Account creation coming soon. Continue to explore your feed.
      </Text>
    </View>
  );

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
      default:
        return null;
    }
  };

  const canContinue =
    isStepComplete && (currentStep.type === 'processing' ? processingReady : true);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text variant="body" weight="bold" style={styles.headerTitle}>
              crave
            </Text>
            <View style={styles.betaChip}>
              <Text variant="caption" weight="semibold" style={styles.betaChipText}>
                BETA
              </Text>
            </View>
          </View>
          <View style={styles.progressWrapper}>
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${((stepIndex + 1) / totalSteps) * 100}%` }]}
              />
            </View>
            <Text variant="caption" style={styles.progressLabel}>
              {stepIndex + 1} / {totalSteps}
            </Text>
          </View>
        </View>
        <ScrollView
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          {renderStep()}
        </ScrollView>
        <View style={styles.footer}>
          {stepIndex > 0 ? (
            <Button label="Back" variant="ghost" onPress={handleBack} style={styles.halfButton} />
          ) : (
            <View style={[styles.halfButton, styles.buttonSpacer]} />
          )}
          <Button
            label={continueLabel}
            onPress={handleContinue}
            disabled={!canContinue}
            style={styles.halfButton}
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
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  },
  progressWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginLeft: 16,
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
  progressLabel: {
    color: '#94a3b8',
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 16,
  },
  heroContainer: {
    alignItems: 'center',
    gap: 16,
  },
  heroImage: {
    width: '80%',
    height: 220,
  },
  heroTitle: {
    textAlign: 'center',
    color: '#0f172a',
  },
  heroDescription: {
    textAlign: 'center',
    color: '#475569',
  },
  questionTitle: {
    color: '#0f172a',
    marginBottom: 8,
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
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fefce8',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  waitlistMessageText: {
    color: '#92400e',
  },
  comparisonRow: {
    flexDirection: 'row',
    gap: 16,
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
  comparisonColumnTitle: {
    color: '#0f172a',
  },
  comparisonRowText: {
    color: '#475569',
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  ratingStar: {
    padding: 12,
  },
  ratingStarText: {
    fontSize: 28,
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
    backgroundColor: '#fee2e2',
  },
  processingBadgeText: {
    fontWeight: 'bold',
  },
  processingBadgeTextComplete: {
    color: '#15803d',
  },
  processingBadgeTextPending: {
    color: '#b91c1c',
  },
  processingChecklistLabel: {
    color: '#0f172a',
  },
  processingHighlights: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 12,
  },
  processingHighlightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  processingHighlightLabel: {
    color: '#94a3b8',
  },
  processingHighlightValue: {
    color: '#0f172a',
    textAlign: 'right',
  },
  processingSpinnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    marginTop: 16,
    gap: 12,
  },
  accountButtonStub: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 14,
    alignItems: 'center',
  },
  accountButtonText: {
    color: '#0f172a',
  },
  accountDisclaimer: {
    color: '#94a3b8',
    marginTop: 8,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  halfButton: {
    flex: 1,
  },
  buttonSpacer: {
    opacity: 0,
  },
});

export default OnboardingScreen;
