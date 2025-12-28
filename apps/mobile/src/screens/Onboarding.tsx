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
  useWindowDimensions,
} from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { makeRedirectUri } from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { StackScreenProps } from '@react-navigation/stack';
import { useAuth } from '@clerk/clerk-expo';
import { Text, Button } from '../components';
import EmailAuthModal from '../components/EmailAuthModal';
import { colors as themeColors } from '../constants/theme';
import { useClerkOAuth } from '../hooks/useClerkOAuth';
import { FONT_SIZES, LINE_HEIGHTS } from '../constants/typography';
import {
  onboardingSteps,
  getSingleChoiceLabel,
  getMultiChoiceLabels,
  type OnboardingStep,
} from '../constants/onboarding';
import { useOnboardingStore } from '../store/onboardingStore';
import type { RootStackParamList } from '../types/navigation';
import { logger } from '../utils';
import { authService } from '../services/auth';
import { usersService, type UsernameAvailability } from '../services/users';

type OnboardingProps = StackScreenProps<RootStackParamList, 'Onboarding'>;

type AnswerValue = string | string[] | number | undefined;

const PRIMARY_ACCENT_COLOR = themeColors.primary ?? '#F97383';
const CTA_BUTTON_COLOR = themeColors.accentDark ?? PRIMARY_ACCENT_COLOR;
const SCREEN_BACKGROUND = '#ffffff';
const SCREEN_BACKGROUND_TINT = 'rgba(249, 115, 131, 0.03)';
const CTA_BUTTON_PULSE_COLOR = 'rgba(249, 115, 131, 0.7)';
const CRAVE_ACCENT = PRIMARY_ACCENT_COLOR;
const CRAVE_ACCENT_LIGHT = 'rgba(249, 115, 131, 0.25)';
const CRAVE_ACCENT_DARK = PRIMARY_ACCENT_COLOR;
const PRIMARY_TEXT = '#0f172a';
const SECONDARY_TEXT = themeColors.textBody;
const MUTED_TEXT = themeColors.textBody;
const SURFACE_COLOR = '#ffffff';
const CTA_PRESS_SCALE = 0.95;
const CTA_OVERSHOOT_SCALE = 1.05;
const CTA_PRESS_DURATION_MS = 110;
const CTA_RELEASE_DURATION_MS = 230;
const CTA_PRESS_EASING = Easing.bezier(0.3, 0.8, 0.4, 1);
const CTA_RELEASE_EASING = Easing.bezier(0.2, 0, 0, 1);
const CTA_OVERSHOOT_EASING_OUT = Easing.bezier(0.22, 1, 0.36, 1);
const CTA_OVERSHOOT_EASING_IN = Easing.bezier(0.4, 0, 0.2, 1);
const CTA_PULSE_EASING = Easing.bezier(0.4, 0, 0.2, 1);
const DOT_COLOR_LIGHT = 'rgba(249, 115, 131, 0.25)';
const DOT_COLOR_MEDIUM = 'rgba(249, 115, 131, 0.65)';
const DOT_COLOR_DARK = 'rgba(249, 115, 131, 1)';
const TRANSITION_DURATION_MS = 620;
const TRANSITION_EASING = Easing.bezier(0.7, 0, 0.35, 1);
const PROGRESS_DOT_BASE_WIDTH = 8;
const PROGRESS_DOT_ACTIVE_WIDTH = 28;
const INTERACTIVE_BORDER_WIDTH = 2;
const INTERACTIVE_SHADOW = {
  shadowColor: '#111827',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.05,
  shadowRadius: 10,
  elevation: 1,
};

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

type CarouselStepType = Extract<OnboardingStep, { type: 'carousel' }>;

const isLocationStep = (
  step: OnboardingStep
): step is Extract<OnboardingStep, { id: 'location'; type: 'location' }> =>
  step.id === 'location' && step.type === 'location';

const locationStepDefinition = onboardingSteps.find(isLocationStep) as
  | Extract<OnboardingStep, { type: 'location' }>
  | undefined;

const locationAllowedCityValues =
  locationStepDefinition?.allowedCities.map((city) => city.value) ?? [];

const CarouselStepView: React.FC<{ step: CarouselStepType }> = ({ step }) => {
  const [currentSlide, setCurrentSlide] = React.useState(0);
  const totalSlides = step.slides.length;

  React.useEffect(() => {
    setCurrentSlide(0);
  }, [step.id]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % totalSlides);
    }, 3200);
    return () => clearInterval(timer);
  }, [totalSlides]);

  const slide = step.slides[currentSlide];

  const getVisualIcon = (visual: string) => {
    switch (visual) {
      case 'map-icon':
        return '🗺️';
      case 'menu-icon':
        return '🍽️';
      case 'explore-icon':
        return '🧭';
      default:
        return '✨';
    }
  };

  return (
    <View style={styles.carouselContainer}>
      <Text variant="subtitle" weight="bold" style={styles.questionTitle}>
        {step.title}
      </Text>
      {step.subtitle ? (
        <Text variant="body" style={styles.helperText}>
          {step.subtitle}
        </Text>
      ) : null}
      <View style={styles.carouselSlide}>
        <View style={styles.carouselVisual}>
          <Text style={styles.carouselIcon}>{getVisualIcon(slide.visual)}</Text>
        </View>
        <Text variant="body" weight="semibold" style={styles.carouselScenario}>
          {slide.scenario}
        </Text>
        <Text variant="body" style={styles.carouselCopy}>
          {slide.copy}
        </Text>
      </View>
      <View style={styles.carouselControls}>
        <Pressable
          onPress={() => setCurrentSlide((prev) => Math.max(prev - 1, 0))}
          disabled={currentSlide === 0}
          style={[styles.carouselArrow, currentSlide === 0 && styles.carouselArrowDisabled]}
        >
          <Text style={styles.carouselArrowText}>←</Text>
        </Pressable>
        <View style={styles.carouselDots}>
          {step.slides.map((_, index) => (
            <View
              key={index}
              style={[styles.carouselDot, index === currentSlide && styles.carouselDotActive]}
            />
          ))}
        </View>
        <Pressable
          onPress={() => setCurrentSlide((prev) => Math.min(prev + 1, totalSlides - 1))}
          disabled={currentSlide === totalSlides - 1}
          style={[
            styles.carouselArrow,
            currentSlide === totalSlides - 1 && styles.carouselArrowDisabled,
          ]}
        >
          <Text style={styles.carouselArrowText}>→</Text>
        </Pressable>
      </View>
    </View>
  );
};

const OnboardingScreen: React.FC<OnboardingProps> = ({ navigation }) => {
  const [stepIndex, setStepIndexState] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, AnswerValue>>({});
  const [processingReady, setProcessingReady] = React.useState(true);
  const [usernameValue, setUsernameValue] = React.useState('');
  const [usernameStatus, setUsernameStatus] = React.useState<UsernameAvailability | null>(null);
  const [usernameLoading, setUsernameLoading] = React.useState(false);
  const [usernameError, setUsernameError] = React.useState<string | null>(null);
  const [usernameSubmitting, setUsernameSubmitting] = React.useState(false);
  const usernameDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const usernameRequestIdRef = React.useRef(0);
  const completeOnboarding = useOnboardingStore((state) => state.completeOnboarding);
  const activeStep = onboardingSteps[stepIndex];
  const regretBaselineAnim = React.useRef(new Animated.Value(0)).current;
  const regretCraveAnim = React.useRef(new Animated.Value(0)).current;
  const [graphTrackWidth, setGraphTrackWidth] = React.useState(0);
  const calendarAnimation = React.useRef<Animated.CompositeAnimation | null>(null);
  const calendarDayAnims = React.useRef<Animated.Value[]>([]).current;
  const calendarColorAnims = React.useRef<Animated.Value[]>([]).current;
  if (calendarDayAnims.length === 0) {
    for (let i = 0; i < 60; i += 1) {
      calendarDayAnims.push(new Animated.Value(0));
      calendarColorAnims.push(new Animated.Value(0));
    }
  }
  const { width: viewportWidth } = useWindowDimensions();
  const progress = React.useRef(new Animated.Value(0)).current;
  const ctaPulse = React.useRef(new Animated.Value(0)).current;
  const ctaPressScale = React.useRef(new Animated.Value(1)).current;
  const ctaTransitionScale = React.useRef(new Animated.Value(1)).current;
  const [isAnimating, setIsAnimating] = React.useState(false);
  const auth = useAuth();
  const { isSignedIn } = auth;
  const setActiveSession =
    typeof auth.setActive === 'function'
      ? (auth.setActive as (params: { session: string }) => Promise<void>)
      : undefined;
  const hasCompletedOnboarding = useOnboardingStore((state) => state.hasCompletedOnboarding);
  const appleOAuth = useClerkOAuth('oauth_apple');
  const googleOAuth = useClerkOAuth('oauth_google');
  const [oauthStatus, setOauthStatus] = React.useState<'idle' | 'apple' | 'google'>('idle');
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [emailModalVisible, setEmailModalVisible] = React.useState(false);
  const [nativeAppleAvailable, setNativeAppleAvailable] = React.useState(false);
  const redirectUrl = React.useMemo(
    () =>
      makeRedirectUri({
        path: 'oauth-native-callback',
      }),
    []
  );

  React.useEffect(() => {
    logger.info('[Auth] Redirect URI', { redirectUrl });
  }, [redirectUrl]);

  React.useEffect(() => {
    if (Platform.OS !== 'ios') {
      setNativeAppleAvailable(false);
      return;
    }
    let cancelled = false;
    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (!cancelled) {
          setNativeAppleAvailable(available);
        }
      })
      .catch((error) => {
        logger.warn('Unable to determine AppleAuthentication availability', error);
        if (!cancelled) {
          setNativeAppleAvailable(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const locationValue = typeof answers.location === 'string' ? answers.location.trim() : '';
  const isLiveCitySelection =
    locationValue.length > 0 && locationAllowedCityValues.includes(locationValue);
  const isWaitlistSelection = locationValue.length > 0 && !isLiveCitySelection;

  const waitlistCityLabel = React.useMemo(() => {
    if (!isWaitlistSelection) {
      return '';
    }
    if (!locationValue) {
      return 'your city';
    }
    return locationValue
      .split(' ')
      .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ''))
      .filter(Boolean)
      .join(' ');
  }, [isWaitlistSelection, locationValue]);

  const isStepVisible = React.useCallback(
    (step: OnboardingStep) => {
      if (
        step.id === 'waitlist-info' ||
        step.id === 'waitlist-preview' ||
        step.id === 'account-waitlist'
      ) {
        return isWaitlistSelection;
      }
      if (step.id === 'account-live') {
        return isLiveCitySelection;
      }
      return true;
    },
    [isLiveCitySelection, isWaitlistSelection]
  );

  const findNextVisibleIndex = React.useCallback(
    (startIndex: number) => {
      for (let i = startIndex + 1; i < onboardingSteps.length; i += 1) {
        if (isStepVisible(onboardingSteps[i])) {
          return i;
        }
      }
      return startIndex;
    },
    [isStepVisible]
  );

  const findPreviousVisibleIndex = React.useCallback(
    (startIndex: number) => {
      for (let i = startIndex - 1; i >= 0; i -= 1) {
        if (isStepVisible(onboardingSteps[i])) {
          return i;
        }
      }
      return startIndex;
    },
    [isStepVisible]
  );

  React.useEffect(() => {
    const step = onboardingSteps[stepIndex];
    if (step && !isStepVisible(step)) {
      const previousIndex = findPreviousVisibleIndex(stepIndex);
      if (previousIndex !== stepIndex) {
        setStepIndexState(previousIndex);
        return;
      }
      const nextIndex = findNextVisibleIndex(stepIndex);
      if (nextIndex !== stepIndex) {
        setStepIndexState(nextIndex);
      }
    }
  }, [findNextVisibleIndex, findPreviousVisibleIndex, isStepVisible, stepIndex]);

  const getPositionForIndex = React.useCallback(
    (index: number) => {
      let position = 0;
      for (let i = 0; i <= index; i += 1) {
        if (isStepVisible(onboardingSteps[i])) {
          position += 1;
        }
      }
      return Math.max(1, position);
    },
    [isStepVisible]
  );

  const currentStepPosition = React.useMemo(
    () => getPositionForIndex(stepIndex),
    [getPositionForIndex, stepIndex]
  );

  const isFinalStep = React.useMemo(
    () => findNextVisibleIndex(stepIndex) === stepIndex,
    [findNextVisibleIndex, stepIndex]
  );
  const visibleSteps = React.useMemo(() => onboardingSteps.filter(isStepVisible), [isStepVisible]);

  React.useEffect(() => {
    if (!isAnimating) {
      progress.setValue(currentStepPosition - 1);
    }
  }, [currentStepPosition, isAnimating, progress]);

  const goToTabs = React.useCallback(() => {
    completeOnboarding();
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  }, [completeOnboarding, navigation]);

  React.useEffect(() => {
    if (isSignedIn && hasCompletedOnboarding) {
      goToTabs();
    }
  }, [goToTabs, hasCompletedOnboarding, isSignedIn]);

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

  const handleOAuthPress = React.useCallback(
    (provider: 'apple' | 'google') => {
      if (oauthStatus !== 'idle') {
        return;
      }
      const client = provider === 'apple' ? appleOAuth : googleOAuth;
      if (!client?.startOAuthFlow) {
        setAuthError('Unable to start that sign-in right now. Please try again.');
        return;
      }
      const run = async () => {
        try {
          setAuthError(null);
          setOauthStatus(provider);
          const { createdSessionId, sessionId, setActive } = await client.startOAuthFlow({
            redirectUrl,
          });
          const resolvedSessionId = createdSessionId ?? sessionId;
          if (resolvedSessionId && setActive) {
            await setActive({ session: resolvedSessionId });
          }
        } catch (error) {
          logger.error('OAuth sign-in failed', error);
          const message =
            error instanceof Error
              ? error.message
              : 'We could not connect that account. Please try again.';
          setAuthError(message);
        } finally {
          setOauthStatus('idle');
        }
      };
      void run();
    },
    [appleOAuth, googleOAuth, oauthStatus, redirectUrl, setAuthError]
  );

  const handleNativeAppleSignIn = React.useCallback(() => {
    if (oauthStatus !== 'idle') {
      return;
    }
    const run = async () => {
      try {
        setAuthError(null);
        setOauthStatus('apple');
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          ],
        });
        if (!credential.identityToken || !credential.authorizationCode) {
          throw new Error('Apple did not return the required tokens.');
        }
        const result = await authService.signInWithAppleNative({
          identityToken: credential.identityToken,
          authorizationCode: credential.authorizationCode,
          email: credential.email ?? undefined,
          givenName: credential.fullName?.givenName ?? undefined,
          familyName: credential.fullName?.familyName ?? undefined,
        });
        if (!result.sessionId) {
          throw new Error('Native Apple sign-in was not completed.');
        }
        if (setActiveSession) {
          await setActiveSession({ session: result.sessionId });
        }
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error) {
          const typedError = error as { code?: string; message?: string };
          if (typedError.code === 'ERR_CANCELED') {
            setAuthError(null);
            setOauthStatus('idle');
            return;
          }
        }
        logger.error('Native Apple sign-in failed', error);
        const message =
          error instanceof Error
            ? error.message
            : 'We were unable to sign you in with Apple. Please try again.';
        setAuthError(message);
      } finally {
        setOauthStatus('idle');
      }
    };
    void run();
  }, [oauthStatus, setActiveSession, setAuthError, setOauthStatus]);

  const handleApplePress = React.useCallback(() => {
    if (nativeAppleAvailable) {
      handleNativeAppleSignIn();
      return;
    }
    handleOAuthPress('apple');
  }, [handleNativeAppleSignIn, handleOAuthPress, nativeAppleAvailable]);

  const openEmailModal = React.useCallback(() => {
    setAuthError(null);
    setEmailModalVisible(true);
  }, []);

  const normalizeUsernameInput = React.useCallback((value: string) => {
    return value.trim().toLowerCase().replace(/\s+/g, '').replace(/@/g, '');
  }, []);

  const handleUsernameChange = React.useCallback(
    (value: string) => {
      const normalized = normalizeUsernameInput(value);
      setUsernameValue(normalized);
      setUsernameStatus(null);
      setUsernameError(null);
      updateAnswer('username', normalized);
    },
    [normalizeUsernameInput, updateAnswer]
  );

  const usernameNormalized = React.useMemo(
    () => normalizeUsernameInput(usernameValue),
    [normalizeUsernameInput, usernameValue]
  );

  React.useEffect(() => {
    if (activeStep.type !== 'username') {
      return;
    }
    if (!usernameNormalized) {
      setUsernameStatus(null);
      setUsernameError(null);
      setUsernameLoading(false);
      return;
    }
    if (!isSignedIn) {
      setUsernameStatus(null);
      setUsernameLoading(false);
      setUsernameError('Sign in to check your username.');
      return;
    }

    if (usernameDebounceRef.current) {
      clearTimeout(usernameDebounceRef.current);
    }

    const requestId = ++usernameRequestIdRef.current;
    setUsernameLoading(true);
    setUsernameError(null);
    usernameDebounceRef.current = setTimeout(() => {
      usersService
        .checkUsername(usernameNormalized)
        .then((result) => {
          if (requestId !== usernameRequestIdRef.current) {
            return;
          }
          setUsernameStatus(result);
          setUsernameError(null);
        })
        .catch((error) => {
          if (requestId !== usernameRequestIdRef.current) {
            return;
          }
          const message =
            error instanceof Error ? error.message : 'Unable to check that username. Try again.';
          setUsernameStatus(null);
          setUsernameError(message);
        })
        .finally(() => {
          if (requestId === usernameRequestIdRef.current) {
            setUsernameLoading(false);
          }
        });
    }, 420);

    return () => {
      if (usernameDebounceRef.current) {
        clearTimeout(usernameDebounceRef.current);
      }
    };
  }, [activeStep.type, isSignedIn, usernameNormalized]);

  const handleRegretTrackLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setGraphTrackWidth((prev) => (Math.abs(prev - width) < 1 ? prev : width));
  }, []);

  const startCalendarAnimation = React.useCallback(() => {
    if (calendarDayAnims.length === 0) {
      for (let i = 0; i < 60; i++) {
        calendarDayAnims.push(new Animated.Value(0));
        calendarColorAnims.push(new Animated.Value(0));
      }
    }
    calendarAnimation.current?.stop();
    calendarAnimation.current = null;
    calendarDayAnims.forEach((anim) => anim.setValue(0));
    calendarColorAnims.forEach((anim) => anim.setValue(0));

    const firstDayAnims = calendarDayAnims.slice(0, 30);
    const secondDayAnims = calendarDayAnims.slice(30);
    const firstColorAnims = calendarColorAnims.slice(0, 30);
    const secondColorAnims = calendarColorAnims.slice(30);
    const createAppear = (animations: Animated.Value[]) =>
      Animated.stagger(
        10,
        animations.map((anim) =>
          Animated.timing(anim, {
            toValue: 1,
            duration: 110,
            easing: Easing.out(Easing.ease),
            useNativeDriver: false,
          })
        )
      );
    const createColor = (animations: Animated.Value[]) =>
      Animated.stagger(
        25,
        animations.map((anim) =>
          Animated.timing(anim, {
            toValue: 1,
            duration: 240,
            easing: Easing.out(Easing.ease),
            useNativeDriver: false,
          })
        )
      );

    const animationSequence = Animated.sequence([
      createAppear(firstDayAnims),
      Animated.delay(40),
      createColor(firstColorAnims),
      Animated.delay(140),
      createAppear(secondDayAnims),
      Animated.delay(40),
      createColor(secondColorAnims),
    ]);
    calendarAnimation.current = animationSequence;
    requestAnimationFrame(() => {
      calendarAnimation.current?.start(() => {
        calendarAnimation.current = null;
      });
    });
  }, [calendarColorAnims, calendarDayAnims]);

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
      typeof answers['dining-frequency'] === 'string'
        ? (answers['dining-frequency'] as string)
        : undefined;
    const budgetSelection =
      typeof answers.budget === 'string' ? (answers.budget as string) : undefined;
    const frequencyLabel = frequencySelection
      ? getSingleChoiceLabel('dining-frequency', frequencySelection)
      : undefined;
    const budgetLabel = budgetSelection
      ? getSingleChoiceLabel('budget', budgetSelection)
      : undefined;
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
    if (activeStep.type === 'processing') {
      setProcessingReady(false);
      const duration = activeStep.durationMs ?? 2000;
      const timer = setTimeout(() => setProcessingReady(true), duration);
      return () => clearTimeout(timer);
    }
    setProcessingReady(true);
    return undefined;
  }, [activeStep]);

  React.useEffect(() => {
    if (
      activeStep.type === 'graph' &&
      activeStep.graphType === 'regret-rate' &&
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
    activeStep,
    graphTrackWidth,
    regretBaselineAnim,
    regretCraveAnim,
    regretGraphData.baselineWaste,
    regretGraphData.craveWaste,
  ]);

  React.useEffect(() => {
    if (activeStep.id === 'calendar-graph') {
      startCalendarAnimation();
    }
    return () => {
      calendarAnimation.current?.stop();
      calendarAnimation.current = null;
    };
  }, [activeStep.id, startCalendarAnimation]);

  const isStepComplete = React.useMemo(() => {
    switch (activeStep.type) {
      case 'hero':
      case 'summary':
      case 'comparison':
      case 'processing':
      case 'account':
        return true;
      case 'graph':
      case 'carousel':
        return true;
      case 'single-choice': {
        const selected = answers[activeStep.id];
        return activeStep.required ? typeof selected === 'string' && selected.length > 0 : true;
      }
      case 'multi-choice': {
        const selected = answers[activeStep.id];
        const count = Array.isArray(selected) ? selected.length : 0;
        const min = activeStep.minSelect ?? (activeStep.required ? 1 : 0);
        return count >= min;
      }
      case 'location': {
        const value = answers[activeStep.id];
        return typeof value === 'string' && value.trim().length > 0;
      }
      case 'rating': {
        const value = answers[activeStep.id];
        if (!activeStep.required) {
          return true;
        }
        return typeof value === 'number' && value > 0;
      }
      case 'notification': {
        const selected = answers[activeStep.id];
        return typeof selected === 'string' && selected.length > 0;
      }
      case 'username': {
        return (
          usernameNormalized.length > 0 &&
          Boolean(usernameStatus?.available) &&
          !usernameLoading &&
          !usernameSubmitting
        );
      }
      default:
        return true;
    }
  }, [
    activeStep,
    answers,
    isSignedIn,
    usernameLoading,
    usernameNormalized,
    usernameStatus,
    usernameSubmitting,
  ]);

  const continueLabel = React.useMemo(() => {
    if (activeStep.ctaLabel) {
      return activeStep.ctaLabel;
    }
    return isFinalStep ? 'Finish' : 'Continue';
  }, [activeStep, isFinalStep]);

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

  const renderSummary = (step: Extract<OnboardingStep, { type: 'summary' }>) => {
    const isWaitlistSummary = step.id === 'waitlist-info';
    const waitlistDisplay = waitlistCityLabel || 'your city';
    const summaryTitle = isWaitlistSummary ? `We're building ${waitlistDisplay} next` : step.title;
    const summaryDescription = isWaitlistSummary
      ? `Crave is live in Austin and NYC today. ${waitlistDisplay
          .charAt(0)
          .toUpperCase()}${waitlistDisplay.slice(
          1
        )} is coming soon. Join the waitlist and get 5 preview searches while we build it.`
      : step.description;

    return (
      <View style={styles.summaryContainer}>
        <Text variant="title" weight="bold" style={styles.heroTitle}>
          {summaryTitle}
        </Text>
        <Text variant="body" style={styles.heroDescription}>
          {summaryDescription}
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
  };

  const renderChoicePanelHeader = (question: string, helper?: string) => (
    <View style={styles.choicePanelHeader}>
      <Text variant="subtitle" weight="bold" style={styles.questionTitle}>
        {question}
      </Text>
      {helper ? (
        <Text variant="body" style={styles.helperText}>
          {helper}
        </Text>
      ) : null}
    </View>
  );

  const renderSingleChoiceOptionsContent = (
    step: Extract<OnboardingStep, { type: 'single-choice' }>,
    centerContent: boolean
  ) => {
    const selected = answers[step.id];

    return (
      <View
        style={[styles.choiceColumnWrapper, centerContent && styles.choiceColumnWrapperCentered]}
      >
        <View style={styles.choiceColumn}>
          {renderChoicePanelHeader(step.question, step.helper)}
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

  const renderSingleChoice = (step: Extract<OnboardingStep, { type: 'single-choice' }>) => {
    const centerContent = step.id === 'attribution';

    return (
      <View style={[styles.choiceStep, centerContent && styles.choiceStepCentered]}>
        {renderSingleChoiceOptionsContent(step, centerContent)}
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
      <View style={styles.choiceStep}>
        <View style={styles.choiceColumnWrapper}>
          <View style={styles.choiceColumn}>
            {renderChoicePanelHeader(step.question, step.helper)}
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
                  <Text
                    variant="body"
                    weight="semibold"
                    style={[styles.chipLabel, styles.chipLabelActive]}
                  >
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
                  placeholderTextColor={MUTED_TEXT}
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
        </View>
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
        <View style={styles.choiceColumnWrapper}>
          <View style={styles.choiceColumn}>
            {renderChoicePanelHeader(step.question, step.helper)}
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
          placeholderTextColor={MUTED_TEXT}
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
              You just told us what you crave ({cuisineLabels.join(', ') || 'top dishes'}), your
              spend {budgetLabel ? `(~${budgetLabel})` : ''} and how often you go out{' '}
              {frequencyLabel ? `(${frequencyLabel})` : ''}. Finish setup so we can point curated
              drops, polls, and early alerts at {requestedCity} while we scout the neighborhoods
              that matter to you.
            </Text>
            {budgetLabel || frequencyLabel || outingLabels.length || cuisineLabels.length ? (
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
            <ActivityIndicator color={CRAVE_ACCENT} size="small" />
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
          <View style={styles.waitlistBenefits}>
            <Text variant="caption" weight="semibold" style={styles.waitlistBenefitTitle}>
              Your waitlist benefits:
            </Text>
            <Text variant="caption" style={styles.waitlistBenefitText}>
              ✓ Early access notification (est. Q2 2025)
            </Text>
            <Text variant="caption" style={styles.waitlistBenefitText}>
              ✓ 2-3 free searches in Austin & NYC today
            </Text>
            <Text variant="caption" style={styles.waitlistBenefitText}>
              ✓ Priority access to vote on neighborhoods we rank first
            </Text>
          </View>
        ) : null}
        <View style={styles.accountButtons}>
          <Pressable
            style={styles.accountButton}
            onPress={handleApplePress}
            disabled={oauthStatus !== 'idle'}
          >
            <Text variant="body" weight="semibold" style={styles.accountButtonText}>
              {oauthStatus === 'apple' ? '🍎 Connecting…' : '🍎 Continue with Apple'}
            </Text>
          </Pressable>
          <Pressable
            style={styles.accountButton}
            onPress={() => handleOAuthPress('google')}
            disabled={oauthStatus !== 'idle'}
          >
            <Text variant="body" weight="semibold" style={styles.accountButtonText}>
              {oauthStatus === 'google' ? '🔍 Connecting…' : '🔍 Continue with Google'}
            </Text>
          </Pressable>
          <Pressable
            style={styles.accountButton}
            onPress={openEmailModal}
            disabled={oauthStatus !== 'idle'}
          >
            <Text variant="body" weight="semibold" style={styles.accountButtonText}>
              ✉️ Continue with email
            </Text>
          </Pressable>
        </View>
        {authError ? (
          <Text variant="caption" style={styles.authErrorText}>
            {authError}
          </Text>
        ) : null}
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

  const getUsernameStatusCopy = React.useCallback((status: UsernameAvailability) => {
    switch (status.reason) {
      case 'available':
        return 'Available — this one is yours.';
      case 'taken':
        return 'That username is already taken.';
      case 'reserved':
        return 'That name is reserved by Crave.';
      case 'invalid_format':
        return 'Use letters, numbers, dots, or underscores.';
      case 'too_short':
        return 'Usernames need at least 3 characters.';
      case 'too_long':
        return 'Usernames can be up to 20 characters.';
      case 'blocked_word':
        return 'Please avoid names that imply official accounts.';
      case 'profanity':
        return 'That name was flagged — try another.';
      case 'cooldown':
        return 'You can only change your username every 30 days.';
      default:
        return 'Pick another username.';
    }
  }, []);

  const renderUsername = (step: Extract<OnboardingStep, { type: 'username' }>) => {
    const statusText = usernameStatus ? getUsernameStatusCopy(usernameStatus) : null;
    const statusStyle = usernameStatus?.available
      ? styles.usernameStatusSuccess
      : styles.usernameStatusError;

    return (
      <View style={styles.usernameContainer}>
        <Text variant="title" weight="bold" style={styles.heroTitle}>
          {step.title}
        </Text>
        {step.helper ? (
          <Text variant="body" style={styles.heroDescription}>
            {step.helper}
          </Text>
        ) : null}
        <View style={styles.usernameInputRow}>
          <Text style={styles.usernamePrefix}>@</Text>
          <TextInput
            value={usernameValue}
            onChangeText={handleUsernameChange}
            placeholder={step.placeholder?.replace('@', '') ?? 'yourname'}
            placeholderTextColor={MUTED_TEXT}
            style={styles.usernameInput}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
          />
        </View>
        <Text variant="caption" style={styles.usernameHint}>
          3-20 characters · letters, numbers, dots, or underscores
        </Text>
        {usernameLoading ? (
          <View style={styles.usernameStatusRow}>
            <ActivityIndicator size="small" color={CRAVE_ACCENT} />
            <Text variant="caption" style={styles.usernameStatusText}>
              Checking availability…
            </Text>
          </View>
        ) : null}
        {usernameError ? (
          <Text variant="caption" style={styles.usernameErrorText}>
            {usernameError}
          </Text>
        ) : null}
        {statusText && !usernameLoading ? (
          <View style={[styles.usernameStatusRow, statusStyle]}>
            <Text variant="caption" style={styles.usernameStatusText}>
              {statusText}
            </Text>
          </View>
        ) : null}
        {usernameStatus?.suggestions?.length ? (
          <View style={styles.usernameSuggestions}>
            <Text variant="caption" style={styles.usernameSuggestionLabel}>
              Try one of these:
            </Text>
            <View style={styles.usernameSuggestionRow}>
              {usernameStatus.suggestions.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  style={styles.usernameSuggestionChip}
                  onPress={() => handleUsernameChange(suggestion)}
                >
                  <Text variant="caption" weight="semibold" style={styles.usernameSuggestionText}>
                    @{suggestion}
                  </Text>
                </Pressable>
              ))}
            </View>
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
          const frequencyLabel =
            frequencySelection && frequencyMap[frequencySelection]
              ? frequencyMap[frequencySelection]
              : 'regularly';

          // Map frequency to meals per week for visualization
          const mealsPerWeekMap: Record<string, number> = {
            rarely: 1.5, // 1-2 times/week
            weekly: 3.5, // 3-4 times/week
            often: 5.5, // 5-6 times/week
            daily: 7, // every day
          };
          const mealsPerWeek =
            frequencySelection && mealsPerWeekMap[frequencySelection]
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
          const budgetLabel =
            budgetSelection && budgetMap[budgetSelection] ? budgetMap[budgetSelection] : '$20-$40';

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
            eatingDays.forEach((day) => {
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
            const shuffledIndices = finalEatingDays
              .map((_, i) => i)
              .sort(() => Math.random() - 0.5);

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
              <LinearGradient
                colors={['rgba(252, 165, 165, 0.18)', 'rgba(252, 165, 165, 0.05)', 'transparent']}
                locations={[0, 0.4, 1]}
                start={{ x: 0, y: 0.8 }}
                end={{ x: 0.5, y: 0.4 }}
                style={styles.calendarGradientBackground}
              />
              <LinearGradient
                colors={['transparent', 'rgba(126, 232, 154, 0.05)', 'rgba(126, 232, 154, 0.14)']}
                locations={[0, 0.6, 1]}
                start={{ x: 0.5, y: 0.4 }}
                end={{ x: 1, y: 0.8 }}
                style={styles.calendarGradientBackground}
              />
              <LinearGradient
                colors={['rgba(255, 250, 245, 0.6)', 'rgba(255, 250, 245, 0.2)', 'transparent']}
                locations={[0, 0.4, 1]}
                start={{ x: 1, y: 0 }}
                end={{ x: 0.4, y: 0.6 }}
                style={styles.calendarGradientBackground}
              />
              <Text variant="body" weight="semibold" style={styles.calendarGraphTitle}>
                Your Month
              </Text>
              <View style={styles.calendarComparisonRow}>
                <View style={styles.calendarColumn}>
                  <Text variant="caption" style={styles.calendarColumnLabel}>
                    Without Crave
                  </Text>
                  <View style={styles.calendarGrid}>
                    {withoutCraveCalendar.map((dayType, index) => {
                      const appearAnim = calendarDayAnims[index] || new Animated.Value(1);
                      const colorAnim = calendarColorAnims[index] || new Animated.Value(1);

                      // Interpolate background color from gray to final color
                      const backgroundColor = colorAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange:
                          dayType === 'none'
                            ? ['#d8d8d8', '#d8d8d8']
                            : dayType === 'good'
                            ? ['#d8d8d8', '#8ce48b']
                            : ['#d8d8d8', '#fb6b6b'],
                      });

                      return (
                        <Animated.View
                          key={index}
                          style={[
                            styles.calendarDay,
                            {
                              opacity: appearAnim,
                              transform: [{ scale: appearAnim }],
                              backgroundColor,
                            },
                          ]}
                        />
                      );
                    })}
                  </View>
                  <Text variant="caption" style={styles.calendarStat}>
                    1 in 3 meals miss
                  </Text>
                </View>
                <View style={styles.calendarColumn}>
                  <Text variant="caption" style={styles.calendarColumnLabel}>
                    With Crave
                  </Text>
                  <View style={styles.calendarGrid}>
                    {withCraveCalendar.map((dayType, index) => {
                      const appearAnim = calendarDayAnims[index + 30] || new Animated.Value(1);
                      const colorAnim = calendarColorAnims[index + 30] || new Animated.Value(1);

                      // Interpolate background color from gray to final color
                      const backgroundColor = colorAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange:
                          dayType === 'none'
                            ? ['#d8d8d8', '#d8d8d8']
                            : dayType === 'good'
                            ? ['#d8d8d8', '#8ce48b']
                            : ['#d8d8d8', '#fb6b6b'],
                      });

                      return (
                        <Animated.View
                          key={index}
                          style={[
                            styles.calendarDay,
                            {
                              opacity: appearAnim,
                              transform: [{ scale: appearAnim }],
                              backgroundColor,
                            },
                          ]}
                        />
                      );
                    })}
                  </View>
                  <Text variant="caption" style={styles.calendarStat}>
                    11 in 12 meals hit
                  </Text>
                </View>
              </View>
              <Text variant="caption" style={styles.graphCallout}>
                At {frequencyLabel} and {budgetLabel} per meal, you'll redirect ~
                {formatCurrency(regretGraphData.regretSavings)}/month toward meals actually worth
                your time and money.
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
                  <View
                    style={[styles.graphBarFill, { width: '100%', backgroundColor: '#fca5a5' }]}
                  />
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
                  <View
                    style={[styles.graphBarFill, { width: '25%', backgroundColor: '#34d399' }]}
                  />
                </View>
                <Text variant="caption" style={styles.graphBarValue}>
                  Low effort
                </Text>
              </View>
              <Text variant="body" weight="bold" style={styles.graphCallout}>
                4x less time and effort. At {diningFrequencyPerMonth} times/month, that's{' '}
                {formatCurrency(regretGraphData.monthlySpendAverage * 0.33)}/month saved from
                disappointing meals.
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
                {`Based on your ${
                  frequencyLabel ?? 'current'
                } habit (${monthlyMealRangeText}) at ${perMealLabel}, you're putting ${monthlySpendRangeLabel}/mo into eating out.`}
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
                      style={[
                        styles.graphBarFill,
                        styles.graphBarFillBaseline,
                        { width: regretBaselineAnim },
                      ]}
                    />
                  ) : (
                    <View
                      style={[
                        styles.graphBarFill,
                        styles.graphBarFillBaseline,
                        styles.graphBarFillFull,
                      ]}
                    />
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
                      style={[
                        styles.graphBarFill,
                        styles.graphBarFillCrave,
                        { width: regretCraveAnim },
                      ]}
                    />
                  ) : (
                    <View
                      style={[
                        styles.graphBarFill,
                        styles.graphBarFillCrave,
                        styles.graphBarFillPartial,
                      ]}
                    />
                  )}
                </View>
                <Text variant="caption" style={styles.graphBarValue}>
                  {formatCurrency(craveWaste)}/mo wasted
                </Text>
              </View>
              <Text variant="body" weight="bold" style={styles.graphCallout}>
                Crave keeps roughly {formatCurrency(Math.max(regretSavings, 0))} of that budget in
                play every month.
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
                    <View
                      style={[styles.graphBarFill, { width: '100%', backgroundColor: '#fca5a5' }]}
                    />
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
                    <View
                      style={[styles.graphBarFill, { width: '50%', backgroundColor: '#fbbf24' }]}
                    />
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
                    <View
                      style={[styles.graphBarFill, { width: '11%', backgroundColor: '#34d399' }]}
                    />
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
            {step.body ? (
              <Text
                variant="body"
                style={[
                  styles.graphBody,
                  step.graphType === 'calendar-comparison' && styles.graphBodyCentered,
                ]}
              >
                {step.body}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const renderNotification = (step: Extract<OnboardingStep, { type: 'notification' }>) => {
    const selected = answers[step.id];
    const barrierSelections = Array.isArray(answers.barriers) ? (answers.barriers as string[]) : [];
    const notificationBody = barrierSelections.includes('no-time')
      ? "You said finding time to research is hard. We'll do the work for you."
      : barrierSelections.length === 0
      ? "We'll keep you updated on what's worth trying."
      : step.body;
    return (
      <View>
        <Text variant="subtitle" weight="bold" style={styles.questionTitle}>
          {step.title}
        </Text>
        <Text variant="body" style={styles.helperText}>
          {notificationBody}
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

  const stepHasHeader = (step: OnboardingStep) => step.type !== 'hero';
  const stepShouldScroll = (step: OnboardingStep) =>
    step.id === 'attribution' ||
    step.type === 'graph' ||
    step.type === 'carousel' ||
    step.type === 'location' ||
    step.type === 'username';

  const renderStepBody = (step: OnboardingStep) => {
    switch (step.type) {
      case 'hero':
        return renderHero(step);
      case 'summary':
        return renderSummary(step);
      case 'single-choice':
        return renderSingleChoice(step);
      case 'multi-choice':
        return renderMultiChoice(step);
      case 'location':
        return renderLocation(step);
      case 'comparison':
        return renderComparison(step);
      case 'rating':
        return renderRating(step);
      case 'processing':
        return renderProcessing(step);
      case 'account':
        return renderAccount(step);
      case 'username':
        return renderUsername(step);
      case 'graph':
        return renderGraph(step);
      case 'carousel':
        return <CarouselStepView step={step} />;
      case 'notification':
        return renderNotification(step);
      default:
        return null;
    }
  };

  const renderStepContent = (step: OnboardingStep) => {
    const paddingTop = stepHasHeader(step) ? 4 : 24;
    const containerStyle = [styles.contentContainer, { paddingTop }];
    const body = renderStepBody(step);
    if (stepShouldScroll(step)) {
      return (
        <ScrollView
          contentContainerStyle={containerStyle}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
        >
          {body}
        </ScrollView>
      );
    }
    return <View style={containerStyle}>{body}</View>;
  };

  const transitionToStep = React.useCallback(
    (nextIndex: number) => {
      if (nextIndex === stepIndex || isAnimating) {
        return;
      }
      const targetPosition = getPositionForIndex(nextIndex) - 1;
      setIsAnimating(true);
      setStepIndexState(nextIndex);
      const isForward = nextIndex > stepIndex;
      if (isForward) {
        ctaPulse.setValue(0);
        ctaTransitionScale.setValue(1);
        Animated.parallel([
          Animated.timing(progress, {
            toValue: targetPosition,
            duration: TRANSITION_DURATION_MS,
            easing: TRANSITION_EASING,
            useNativeDriver: false,
          }),
          Animated.timing(ctaPulse, {
            toValue: 1,
            duration: TRANSITION_DURATION_MS,
            easing: CTA_PULSE_EASING,
            useNativeDriver: false,
          }),
          Animated.sequence([
            Animated.timing(ctaTransitionScale, {
              toValue: CTA_OVERSHOOT_SCALE,
              duration: TRANSITION_DURATION_MS / 2,
              easing: CTA_OVERSHOOT_EASING_OUT,
              useNativeDriver: false,
            }),
            Animated.timing(ctaTransitionScale, {
              toValue: 1,
              duration: TRANSITION_DURATION_MS / 2,
              easing: CTA_OVERSHOOT_EASING_IN,
              useNativeDriver: false,
            }),
          ]),
        ]).start(() => {
          progress.setValue(targetPosition);
          ctaPulse.setValue(0);
          setIsAnimating(false);
        });
        return;
      }
      ctaPulse.setValue(0);
      ctaTransitionScale.setValue(1);
      Animated.timing(progress, {
        toValue: targetPosition,
        duration: TRANSITION_DURATION_MS,
        easing: TRANSITION_EASING,
        useNativeDriver: false,
      }).start(() => {
        progress.setValue(targetPosition);
        setIsAnimating(false);
      });
    },
    [ctaPulse, ctaTransitionScale, getPositionForIndex, isAnimating, progress, stepIndex]
  );

  const requiresAuthToAdvance = React.useMemo(
    () => activeStep.type === 'account' && !isSignedIn,
    [activeStep.type, isSignedIn]
  );

  const handleUsernameSubmit = React.useCallback(async () => {
    if (!isSignedIn) {
      setUsernameError('Please sign in to claim a username.');
      return false;
    }
    if (!usernameNormalized) {
      setUsernameError('Pick a username to continue.');
      return false;
    }

    setUsernameSubmitting(true);
    setUsernameError(null);
    try {
      const status =
        usernameStatus?.normalized === usernameNormalized
          ? usernameStatus
          : await usersService.checkUsername(usernameNormalized);
      setUsernameStatus(status);

      if (!status.available) {
        setUsernameError(getUsernameStatusCopy(status));
        return false;
      }

      await usersService.claimUsername(usernameNormalized);
      setUsernameStatus({
        ...status,
        available: true,
        reason: 'available',
        suggestions: [],
      });
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to claim that username right now.';
      setUsernameError(message);
      return false;
    } finally {
      setUsernameSubmitting(false);
    }
  }, [getUsernameStatusCopy, isSignedIn, usernameNormalized, usernameStatus]);

  const handleContinue = React.useCallback(() => {
    if (requiresAuthToAdvance) {
      setAuthError('Please sign in to keep going.');
      setEmailModalVisible(true);
      return;
    }
    if (activeStep.type === 'username') {
      void (async () => {
        const ok = await handleUsernameSubmit();
        if (!ok) {
          return;
        }
        const nextIndex = findNextVisibleIndex(stepIndex);
        if (nextIndex === stepIndex) {
          logger.info('Onboarding preferences', answers);
          goToTabs();
          return;
        }
        transitionToStep(nextIndex);
      })();
      return;
    }

    const nextIndex = findNextVisibleIndex(stepIndex);
    if (nextIndex === stepIndex) {
      logger.info('Onboarding preferences', answers);
      goToTabs();
      return;
    }
    transitionToStep(nextIndex);
  }, [
    answers,
    activeStep.type,
    findNextVisibleIndex,
    goToTabs,
    handleUsernameSubmit,
    requiresAuthToAdvance,
    setEmailModalVisible,
    stepIndex,
    transitionToStep,
  ]);

  const handleBack = React.useCallback(() => {
    const previousIndex = findPreviousVisibleIndex(stepIndex);
    if (previousIndex === stepIndex) {
      return;
    }
    transitionToStep(previousIndex);
  }, [findPreviousVisibleIndex, stepIndex, transitionToStep]);

  const canContinue = isStepComplete && (activeStep.type === 'processing' ? processingReady : true);
  const isCTAInteractionDisabled = !canContinue || isAnimating;
  const handleCTAPressIn = React.useCallback(() => {
    if (isCTAInteractionDisabled) {
      return;
    }
    Animated.timing(ctaPressScale, {
      toValue: CTA_PRESS_SCALE,
      duration: CTA_PRESS_DURATION_MS,
      easing: CTA_PRESS_EASING,
      useNativeDriver: false,
    }).start();
  }, [ctaPressScale, isCTAInteractionDisabled]);
  const handleCTAPressOut = React.useCallback(() => {
    Animated.timing(ctaPressScale, {
      toValue: 1,
      duration: CTA_RELEASE_DURATION_MS,
      easing: CTA_RELEASE_EASING,
      useNativeDriver: false,
    }).start();
  }, [ctaPressScale]);
  const canGoBack = findPreviousVisibleIndex(stepIndex) !== stepIndex;
  const showHeader = stepHasHeader(activeStep);
  const translateX = React.useMemo(
    () => Animated.multiply(progress, -viewportWidth),
    [progress, viewportWidth]
  );
  const renderProgressDots = React.useCallback(
    () => (
      <View style={styles.progressDots}>
        {visibleSteps.map((step, index) => {
          const width = progress.interpolate({
            inputRange: [index - 1, index, index + 1],
            outputRange: [
              PROGRESS_DOT_BASE_WIDTH,
              PROGRESS_DOT_ACTIVE_WIDTH,
              PROGRESS_DOT_BASE_WIDTH,
            ],
            extrapolate: 'clamp',
          });
          const backgroundColor = progress.interpolate({
            inputRange: [index - 1, index, index + 1],
            outputRange: [DOT_COLOR_LIGHT, DOT_COLOR_DARK, DOT_COLOR_MEDIUM],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View key={step.id} style={[styles.progressDot, { width, backgroundColor }]} />
          );
        })}
      </View>
    ),
    [progress, visibleSteps]
  );
  const progressDots = renderProgressDots();
  const ctaBackgroundColor = ctaPulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [CTA_BUTTON_COLOR, CTA_BUTTON_PULSE_COLOR, CTA_BUTTON_COLOR],
  });
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View pointerEvents="none" style={styles.backgroundTint} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {showHeader ? (
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <View style={styles.headerSide} />
              <View style={styles.progressArea}>{progressDots}</View>
              <View style={[styles.headerSide, styles.headerSideRight]}>
                <View style={styles.betaChip}>
                  <Text variant="caption" weight="semibold" style={styles.betaChipText}>
                    BETA
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.header, styles.heroHeader]}>
            <View style={styles.headerTopRow}>
              <View style={styles.headerSide} />
              <View style={styles.progressArea}>{progressDots}</View>
              <View style={[styles.headerSide, styles.headerSideRight]}>
                <View style={styles.betaChip}>
                  <Text variant="caption" weight="semibold" style={styles.betaChipText}>
                    BETA
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}
        <View style={styles.stepContentArea}>
          <Animated.View
            style={[
              styles.pagerStrip,
              {
                width: Math.max(visibleSteps.length, 1) * viewportWidth,
                transform: [{ translateX }],
              },
            ]}
          >
            {visibleSteps.map((step) => (
              <View key={step.id} style={[styles.stepPane, { width: viewportWidth }]}>
                {renderStepContent(step)}
              </View>
            ))}
          </Animated.View>
        </View>
        <View pointerEvents="box-none" style={styles.ctaFloatingWrapper}>
          <View style={styles.ctaRow}>
            <Pressable
              style={[styles.backButton, styles.ctaBackButton]}
              onPress={handleBack}
              disabled={!canGoBack || isAnimating}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Text variant="body" weight="bold" style={styles.backButtonIcon}>
                ←
              </Text>
            </Pressable>
            <Animated.View
              style={[
                styles.ctaButtonWrapper,
                {
                  transform: [{ scale: ctaPressScale }, { scale: ctaTransitionScale }],
                  backgroundColor: ctaBackgroundColor,
                },
              ]}
            >
              <Button
                label={continueLabel}
                onPress={handleContinue}
                onPressIn={handleCTAPressIn}
                onPressOut={handleCTAPressOut}
                disabled={isCTAInteractionDisabled}
                style={[
                  styles.ctaButton,
                  isCTAInteractionDisabled ? styles.ctaButtonDisabled : null,
                ]}
              />
            </Animated.View>
          </View>
        </View>
      </KeyboardAvoidingView>
      <EmailAuthModal visible={emailModalVisible} onClose={() => setEmailModalVisible(false)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCREEN_BACKGROUND,
    position: 'relative',
  },
  backgroundTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SCREEN_BACKGROUND_TINT,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 12,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerSide: {
    minWidth: 64,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerSideRight: {
    alignItems: 'flex-end',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: SURFACE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  backButtonIcon: {
    color: MUTED_TEXT,
    fontSize: FONT_SIZES.title,
    lineHeight: LINE_HEIGHTS.title,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontWeight: '400',
    transform: [{ translateY: 0 }],
  },
  betaChip: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(249, 115, 131, 0.15)',
    marginLeft: 8,
  },
  betaChipText: {
    color: CRAVE_ACCENT_DARK,
    fontSize: FONT_SIZES.caption,
    lineHeight: LINE_HEIGHTS.caption,
  },
  progressArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  heroHeader: {
    paddingBottom: 8,
  },
  progressDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  progressDot: {
    width: PROGRESS_DOT_BASE_WIDTH,
    height: 8,
    borderRadius: 4,
    backgroundColor: CRAVE_ACCENT_LIGHT,
  },
  stepContentArea: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
  pagerStrip: {
    flexDirection: 'row',
    flex: 1,
  },
  stepPane: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
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
    fontSize: FONT_SIZES.caption,
    lineHeight: LINE_HEIGHTS.caption,
  },
  heroTitle: {
    textAlign: 'left',
    color: '#0f172a',
    fontSize: FONT_SIZES.title,
    lineHeight: LINE_HEIGHTS.title,
  },
  heroDescription: {
    textAlign: 'left',
    color: SECONDARY_TEXT,
  },
  questionTitle: {
    color: '#0f172a',
    marginBottom: 8,
    fontSize: FONT_SIZES.title,
    lineHeight: LINE_HEIGHTS.title,
  },
  helperText: {
    color: SECONDARY_TEXT,
    marginBottom: 12,
  },
  choiceStep: {
    flex: 1,
    minHeight: 0,
  },
  choiceStepCentered: {
    minHeight: 0,
    paddingBottom: 24,
  },
  choicePanelHeader: {
    gap: 4,
    marginBottom: 8,
    alignSelf: 'stretch',
  },
  choiceColumnWrapper: {
    width: '100%',
    marginTop: 12,
  },
  choiceColumnWrapperCentered: {
    flexGrow: 1,
    width: '100%',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  choiceColumn: {
    gap: 12,
    alignSelf: 'stretch',
    alignItems: 'stretch',
  },
  choiceCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: SURFACE_COLOR,
    width: '100%',
    maxWidth: 360,
    borderWidth: INTERACTIVE_BORDER_WIDTH,
    borderColor: 'transparent',
    ...INTERACTIVE_SHADOW,
  },
  choiceCardActive: {
    borderColor: CRAVE_ACCENT,
  },
  choiceCardLabel: {
    color: '#111827',
  },
  choiceCardDetail: {
    color: SECONDARY_TEXT,
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
    borderWidth: INTERACTIVE_BORDER_WIDTH,
    borderColor: 'transparent',
    backgroundColor: SURFACE_COLOR,
    ...INTERACTIVE_SHADOW,
  },
  chipActive: {
    borderColor: CRAVE_ACCENT,
  },
  chipLabel: {
    color: '#0f172a',
  },
  chipLabelActive: {
    color: CRAVE_ACCENT,
  },
  chipCustom: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: INTERACTIVE_BORDER_WIDTH,
    borderColor: CRAVE_ACCENT,
    backgroundColor: SURFACE_COLOR,
    ...INTERACTIVE_SHADOW,
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
    borderRadius: 12,
    backgroundColor: SURFACE_COLOR,
    borderWidth: INTERACTIVE_BORDER_WIDTH,
    borderColor: 'transparent',
    ...INTERACTIVE_SHADOW,
  },
  addCustomButtonDisabled: {
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
  addCustomButtonText: {
    color: CRAVE_ACCENT,
  },
  addCustomButtonTextDisabled: {
    color: CRAVE_ACCENT,
    opacity: 0.4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
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
    color: MUTED_TEXT,
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
    lineHeight: LINE_HEIGHTS.body,
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
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
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
    lineHeight: LINE_HEIGHTS.caption,
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
    borderColor: CRAVE_ACCENT,
    backgroundColor: '#fff5f7',
    borderWidth: 2,
  },
  comparisonColumnTitle: {
    color: '#0f172a',
    marginBottom: 4,
  },
  comparisonRowText: {
    color: SECONDARY_TEXT,
    lineHeight: LINE_HEIGHTS.caption,
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
    fontSize: FONT_SIZES.title,
    lineHeight: LINE_HEIGHTS.title,
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
    backgroundColor: CRAVE_ACCENT,
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
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
  },
  processingBadgeTextComplete: {
    color: '#15803d',
  },
  processingBadgeTextPending: {
    color: MUTED_TEXT,
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
    color: MUTED_TEXT,
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
    color: MUTED_TEXT,
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
    backgroundColor: CRAVE_ACCENT,
  },
  summaryBulletText: {
    color: SECONDARY_TEXT,
    flex: 1,
  },
  accountButtons: {
    marginTop: 24,
    gap: 12,
  },
  accountButton: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: SURFACE_COLOR,
    borderWidth: INTERACTIVE_BORDER_WIDTH,
    borderColor: 'transparent',
    ...INTERACTIVE_SHADOW,
  },
  accountButtonText: {
    color: '#0f172a',
  },
  authErrorText: {
    color: '#dc2626',
    textAlign: 'center',
    marginTop: 8,
  },
  disclaimerContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  disclaimerText: {
    color: MUTED_TEXT,
    textAlign: 'left',
    lineHeight: LINE_HEIGHTS.caption,
  },
  disclaimerLink: {
    color: CRAVE_ACCENT,
    textDecorationLine: 'underline',
  },
  usernameContainer: {
    gap: 12,
  },
  usernameInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
  },
  usernamePrefix: {
    color: SECONDARY_TEXT,
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    marginRight: 6,
  },
  usernameInput: {
    flex: 1,
    color: '#0f172a',
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    paddingVertical: 12,
  },
  usernameHint: {
    color: MUTED_TEXT,
  },
  usernameStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  usernameStatusSuccess: {
    backgroundColor: '#ecfdf3',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  usernameStatusError: {
    backgroundColor: '#fef2f2',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  usernameStatusText: {
    color: '#0f172a',
  },
  usernameErrorText: {
    color: '#dc2626',
  },
  usernameSuggestions: {
    marginTop: 8,
    gap: 8,
  },
  usernameSuggestionLabel: {
    color: SECONDARY_TEXT,
  },
  usernameSuggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  usernameSuggestionChip: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  usernameSuggestionText: {
    color: '#0f172a',
  },
  // Graph styles
  graphScreenContainer: {
    flex: 1,
  },
  graphContentGroup: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingTop: 95,
  },
  graphBundle: {
    width: '100%',
    gap: 20,
  },
  graphContainer: {
    backgroundColor: '#fafbfc',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    gap: 16,
    overflow: 'hidden',
  },
  graphLabel: {
    color: SECONDARY_TEXT,
    textAlign: 'left',
    marginBottom: 8,
  },
  graphDetailText: {
    color: SECONDARY_TEXT,
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
    color: SECONDARY_TEXT,
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
    backgroundColor: CRAVE_ACCENT,
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
    color: SECONDARY_TEXT,
    width: 70,
    textAlign: 'right',
  },
  graphCallout: {
    color: SECONDARY_TEXT,
    textAlign: 'center',
    marginTop: 8,
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    maxWidth: '100%',
    alignSelf: 'center',
  },
  graphTitle: {
    color: '#0f172a',
    textAlign: 'left',
    fontSize: FONT_SIZES.title,
    lineHeight: LINE_HEIGHTS.title,
    paddingHorizontal: 4,
    marginBottom: 0,
  },
  graphBody: {
    color: '#0f172a',
    textAlign: 'left',
    lineHeight: LINE_HEIGHTS.body,
  },
  graphBodyCentered: {
    textAlign: 'center',
  },
  // Calendar graph styles
  calendarGradientBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 16,
    opacity: 0.6,
  },
  calendarGraphTitle: {
    color: '#0f172a',
    textAlign: 'left',
    marginBottom: 16,
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
  },
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
    backgroundColor: '#d8d8d8',
  },
  calendarDayGood: {
    backgroundColor: '#8ce48b',
  },
  calendarDayBad: {
    backgroundColor: '#fb6b6b',
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
    color: CRAVE_ACCENT,
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    fontWeight: 'bold',
  },
  notificationFeatureText: {
    color: SECONDARY_TEXT,
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
    fontSize: FONT_SIZES.caption,
    lineHeight: LINE_HEIGHTS.caption,
  },
  carouselContainer: {
    gap: 24,
  },
  carouselSlide: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff5f5',
    padding: 24,
    gap: 16,
    alignItems: 'center',
  },
  carouselVisual: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: CRAVE_ACCENT_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselIcon: {
    fontSize: FONT_SIZES.title,
    lineHeight: LINE_HEIGHTS.title,
  },
  carouselScenario: {
    color: PRIMARY_TEXT,
    textAlign: 'center',
    fontSize: FONT_SIZES.title,
    lineHeight: LINE_HEIGHTS.title,
  },
  carouselCopy: {
    color: SECONDARY_TEXT,
    textAlign: 'center',
    lineHeight: LINE_HEIGHTS.body,
  },
  carouselControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  carouselArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: INTERACTIVE_BORDER_WIDTH,
    borderColor: 'transparent',
    backgroundColor: SURFACE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    ...INTERACTIVE_SHADOW,
  },
  carouselArrowDisabled: {
    opacity: 0.35,
    shadowOpacity: 0,
    elevation: 0,
  },
  carouselArrowText: {
    fontSize: FONT_SIZES.title,
    lineHeight: LINE_HEIGHTS.title,
    color: CRAVE_ACCENT,
  },
  carouselDots: {
    flexDirection: 'row',
    gap: 6,
  },
  carouselDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
  },
  carouselDotActive: {
    backgroundColor: CRAVE_ACCENT,
    width: 22,
  },
  ctaFloatingWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    paddingHorizontal: 24,
    alignItems: 'flex-end',
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  ctaBackButton: {
    alignSelf: 'center',
  },
  ctaButtonWrapper: {
    alignSelf: 'flex-end',
    width: '34%',
    minWidth: 150,
    maxWidth: 220,
    borderRadius: 999,
    shadowColor: CTA_BUTTON_COLOR,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 18,
  },
  ctaButton: {
    borderRadius: 999,
    width: '100%',
    backgroundColor: 'transparent',
    height: 54,
  },
  ctaButtonDisabled: {
    opacity: 1,
  },
});

export default OnboardingScreen;
