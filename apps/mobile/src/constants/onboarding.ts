import type { ImageSourcePropType } from 'react-native';

// TODO: Replace with actual app screenshot showing search results
import placeholderImage from '../assets/splash.png';

interface BaseStep {
  id: string;
  ctaLabel?: string;
}

interface HeroStep extends BaseStep {
  type: 'hero';
  title: string;
  description?: string;
  image?: ImageSourcePropType;
  showAppScreenshot?: boolean;
}

interface SummaryStep extends BaseStep {
  type: 'summary';
  title: string;
  description: string;
  bullets?: string[];
}

interface SingleChoiceStep extends BaseStep {
  type: 'single-choice';
  question: string;
  helper?: string;
  options: Array<{ id: string; label: string; detail?: string; icon?: string }>;
  required?: boolean;
  allowCustomInput?: boolean;
  customPlaceholder?: string;
  customKeyboard?: 'default' | 'numeric';
}

interface MultiChoiceStep extends BaseStep {
  type: 'multi-choice';
  question: string;
  helper?: string;
  options: Array<{ id: string; label: string }>;
  required?: boolean;
  minSelect?: number;
  allowCustomInput?: boolean;
  customPlaceholder?: string;
}

interface LocationStep extends BaseStep {
  type: 'location';
  question: string;
  helper?: string;
  allowedCities: Array<{ id: string; label: string; value: string; icon?: string }>;
  placeholder?: string;
  required?: boolean;
}

interface ComparisonStep extends BaseStep {
  type: 'comparison';
  title: string;
  helper?: string;
  left: {
    title: string;
    rows: string[];
  };
  right: {
    title: string;
    rows: string[];
  };
  body?: string;
}

interface RatingStep extends BaseStep {
  type: 'rating';
  question: string;
  helper?: string;
  maxRating?: number;
  required?: boolean;
}

type ChecklistStatus = 'pending' | 'complete';

interface ProcessingStep extends BaseStep {
  type: 'processing';
  title: string;
  subtitle: string;
  progress: number; // 0-1
  checklist: Array<{ label: string; status: ChecklistStatus }>;
  showSummary?: boolean;
  durationMs?: number;
  isAnimated?: boolean; // True for the single animated screen
}

interface AccountStep extends BaseStep {
  type: 'account';
  title: string;
  description: string;
  disclaimer?: string;
}

interface UsernameStep extends BaseStep {
  type: 'username';
  title: string;
  helper?: string;
  placeholder?: string;
}

// New graph step types
interface GraphStep extends BaseStep {
  type: 'graph';
  graphType: 'time-saved' | 'regret-rate' | 'discovery-curve' | 'calendar-comparison';
  title: string;
  body?: string;
  subtitle?: string; // For calendar graph explanation
}

// Use cases carousel step
interface CarouselStep extends BaseStep {
  type: 'carousel';
  title: string;
  subtitle?: string;
  slides: Array<{
    scenario: string;
    visual: string;
    copy: string;
  }>;
}

// New notification permission step
interface NotificationStep extends BaseStep {
  type: 'notification';
  title: string;
  body: string;
  features: string[];
  options: Array<{ id: string; label: string; recommended?: boolean }>;
}

export type OnboardingStep =
  | HeroStep
  | SummaryStep
  | SingleChoiceStep
  | MultiChoiceStep
  | LocationStep
  | ComparisonStep
  | RatingStep
  | ProcessingStep
  | AccountStep
  | UsernameStep
  | GraphStep
  | CarouselStep
  | NotificationStep;

export const onboardingSteps: OnboardingStep[] = [
  // PHASE 1: HOOK & EASY QUESTIONS (5 screens)
  {
    id: 'hero',
    type: 'hero',
    title: 'Know what to order, not just where to go',
    description: "We rank dishes, not just restaurants—so you know what's worth ordering.",
    image: placeholderImage,
    showAppScreenshot: true,
    ctaLabel: 'Show me how',
  },
  {
    id: 'attribution',
    type: 'single-choice',
    question: 'How did you hear about us?',
    options: [
      { id: 'app-store', label: 'App Store' },
      { id: 'tiktok', label: 'TikTok' },
      { id: 'youtube', label: 'YouTube' },
      { id: 'instagram', label: 'Instagram' },
      { id: 'x-twitter', label: 'X (Twitter)' },
      { id: 'facebook', label: 'Facebook' },
      { id: 'google', label: 'Google' },
      { id: 'friend-family', label: 'Friend or family' },
      { id: 'other', label: 'Other' },
    ],
    required: false,
  },
  {
    id: 'dining-frequency',
    type: 'single-choice',
    question: 'How often do you eat out?',
    helper: 'Helps us personalize your recommendations',
    options: [
      { id: 'rarely', label: '1-2 times/week', detail: 'Mostly cook at home' },
      { id: 'weekly', label: '3-4 times/week', detail: 'Regular lunches + dinner' },
      { id: 'often', label: '5-6 times/week', detail: 'Always on the go' },
      { id: 'daily', label: 'Every day', detail: 'Professional food scout' },
    ],
    required: true,
  },
  {
    id: 'budget',
    type: 'single-choice',
    question: "What's your usual spend per person?",
    helper: 'Helps us personalize your recommendations',
    options: [
      { id: 'under-20', label: '$', detail: 'Under $20 • Quick bites & value' },
      { id: '20-40', label: '$$', detail: '$20–$40 • Solid everyday spots' },
      { id: '40-70', label: '$$$', detail: '$40–$70 • Nice dinners & dates' },
      { id: '70-plus', label: '$$$$', detail: '$70+ • Special experiences' },
    ],
    required: true,
  },

  // PHASE 2: FINANCIAL PROOF (1 screen)
  {
    id: 'calendar-graph',
    type: 'graph',
    graphType: 'calendar-comparison',
    title: 'Never waste money on disappointing meals',
    ctaLabel: "Let's do it",
  },

  // PHASE 3: PERSONALIZATION (4 screens)
  {
    id: 'occasion-vibe',
    type: 'multi-choice',
    question: 'What kind of experience are you planning?',
    helper: 'Helps us personalize your recommendations',
    options: [
      { id: 'date', label: '💕 Romantic date nights' },
      { id: 'family', label: '👨‍👩‍👧 Family-friendly outings' },
      { id: 'team', label: '👔 Business meals' },
      { id: 'solo', label: '🍱 Quick solo meals' },
      { id: 'friends', label: '🎉 Casual hangouts with friends' },
      { id: 'adventure', label: '✨ Adventurous food discoveries' },
      { id: 'upscale', label: '🍷 Upscale & refined dining' },
      { id: 'chill', label: '🧘 Quiet & conversation-friendly' },
    ],
    required: true,
    minSelect: 1,
    ctaLabel: 'Continue',
  },
  {
    id: 'cuisines',
    type: 'multi-choice',
    question: 'What are you craving lately?',
    helper: 'Helps us personalize your recommendations. Pick at least 3.',
    options: [
      { id: 'mexican', label: '🌮 Mexican' },
      { id: 'bbq', label: '🍖 BBQ' },
      { id: 'japanese', label: '🍣 Japanese' },
      { id: 'italian', label: '🍝 Italian' },
      { id: 'mediterranean', label: '🥙 Mediterranean' },
      { id: 'coffee', label: '☕ Coffee & bakeries' },
      { id: 'american', label: '🍔 American' },
      { id: 'asian', label: '🍜 Asian fusion' },
    ],
    required: true,
    minSelect: 3,
    ctaLabel: 'Looks delicious',
  },
  {
    id: 'dining-goals',
    type: 'multi-choice',
    question: 'What matters most when you eat out?',
    helper: 'Helps us personalize your recommendations. Pick 2-3.',
    options: [
      { id: 'trending', label: '🔥 Trending & buzzy' },
      { id: 'reliable', label: '⭐ Reliable classics' },
      { id: 'value', label: '💰 Great value' },
      { id: 'wow-factor', label: '✨ Show-stopping' },
      { id: 'healthy', label: '🥗 Healthy options' },
      { id: 'dietary', label: '🌱 Dietary friendly' },
    ],
    required: true,
    minSelect: 2,
  },
  {
    id: 'barriers',
    type: 'multi-choice',
    question: 'What makes finding great food hard for you?',
    helper: 'Pick all that apply',
    options: [
      { id: 'no-time', label: '⏰ Limited time to research' },
      { id: 'dont-know-menus', label: "📋 Don't know what restaurants offer" },
      { id: 'cant-afford-misses', label: "💸 Can't afford to gamble on mediocre spots" },
      { id: 'review-fatigue', label: "🤷 Can't trust online reviews anymore" },
      { id: 'new-neighborhoods', label: '📍 New to the area' },
      { id: 'menu-paralysis', label: '😤 Too many options, hard to choose' },
    ],
    required: false,
    ctaLabel: 'Continue',
  },
  // PHASE 4: DEMONSTRATION & COMMITMENT (3 shared screens)
  {
    id: 'use-cases',
    type: 'carousel',
    title: 'Crave works for every food decision',
    slides: [
      {
        scenario: 'Planning where to eat',
        visual: 'map-icon',
        copy: 'Type “ramen” or “birthday dinner” and see ranked dishes with real vote counts.',
      },
      {
        scenario: 'Stuck in line at a new spot',
        visual: 'menu-icon',
        copy: 'Open the menu view and get instant guidance on the top-performing dishes.',
      },
      {
        scenario: 'Exploring a new neighborhood',
        visual: 'explore-icon',
        copy: "Drag the map anywhere—results follow the area you're looking at in real time.",
      },
    ],
    ctaLabel: "Let's go",
  },
  {
    id: 'notifications',
    type: 'notification',
    title: "Get notified about dishes you'd care about",
    body: "We'll keep you updated on what's worth trying.",
    features: [
      'Tuesday polls: Vote on "Best tacos" in 30 seconds',
      'New spots: Dishes matching your taste just got added',
      'Your saves: A bookmarked spot just jumped in rankings',
    ],
    options: [
      { id: '2-3-week', label: '2-3 times per week', recommended: true },
      { id: 'weekly', label: 'Weekly digest only' },
      { id: 'poll-only', label: 'Just the Tuesday poll' },
      { id: 'manual', label: "I'll check the app myself" },
    ],
    ctaLabel: 'Enable notifications',
  },
  {
    id: 'rating',
    type: 'rating',
    question: 'Excited to try Crave? Drop us a rating!',
    helper: 'Early ratings help us grow and serve more cities. Totally optional.',
    maxRating: 5,
    required: false,
    ctaLabel: 'Continue',
  },

  // PHASE 5: LOCATION & BRANCHING
  {
    id: 'location',
    type: 'location',
    question: 'Where are you eating?',
    helper: "Pick a live city or request yours—we'll tailor everything around it.",
    allowedCities: [
      { id: 'austin', label: '🤠 Austin', value: 'Austin' },
      { id: 'new-york', label: '🗽 New York', value: 'New York' },
    ],
    placeholder: 'Enter your city',
    required: true,
    ctaLabel: 'Continue',
  },
  {
    id: 'waitlist-info',
    type: 'summary',
    title: "We're building your city next",
    description:
      'Crave is live in Austin and NYC today. Join the waitlist and get 5 free preview searches while we build your city.',
  },
  {
    id: 'waitlist-preview',
    type: 'single-choice',
    question: 'Where do you want to preview?',
    helper: 'Pick a live city to explore while we finish yours.',
    options: [
      { id: 'preview-austin', label: '🤠 Austin', detail: '5 free searches' },
      { id: 'preview-new-york', label: '🗽 New York', detail: '5 free searches' },
    ],
    required: true,
  },
  {
    id: 'account-live',
    type: 'account',
    title: 'Save your progress',
    description:
      'Create an account so your bookmarks, preferences, and saved searches sync everywhere.',
    disclaimer:
      "By continuing, you agree to Crave's Terms of Service and Privacy Policy. We'll never sell your data.",
    ctaLabel: 'Create account',
  },
  {
    id: 'account-waitlist',
    type: 'account',
    title: 'Save your waitlist spot',
    description:
      'Create an account to keep your preferences saved, get notified when your city launches, and use your 5 preview searches.',
    disclaimer:
      "By continuing, you agree to Crave's Terms of Service and Privacy Policy. We'll never sell your data.",
    ctaLabel: 'Join waitlist',
  },
  {
    id: 'username',
    type: 'username',
    title: 'Pick your username',
    helper: 'This is how people find you. You can change it later.',
    placeholder: '@yourname',
    ctaLabel: 'Continue',
  },
];

// Helper to get readable label for a single-choice answer
export const getSingleChoiceLabel = (stepId: string, value: string): string | undefined => {
  const step = onboardingSteps.find((s) => s.id === stepId);
  if (!step || (step.type !== 'single-choice' && step.type !== 'location')) {
    return undefined;
  }
  if (step.type === 'location') {
    const city = step.allowedCities.find((c) => c.value === value);
    return city?.label.replace(/[^\w\s]/g, '').trim(); // Strip emoji
  }
  const option = step.options.find((o) => o.id === value);
  if (option) {
    return option.label.replace(/[^\w\s$]/g, '').trim();
  }
  return value;
};

// Helper to get readable labels for multi-choice answers
export const getMultiChoiceLabels = (stepId: string, values: string[]): string[] => {
  const step = onboardingSteps.find((s) => s.id === stepId);
  if (!step || step.type !== 'multi-choice') {
    return [];
  }
  return values
    .map((v) => {
      const option = step.options.find((o) => o.id === v);
      if (option) {
        return option.label.replace(/[^\w\s&]/g, '').trim();
      }
      return v.trim();
    })
    .filter((label): label is string => Boolean(label));
};
