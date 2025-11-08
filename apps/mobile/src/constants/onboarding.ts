import type { ImageSourcePropType } from 'react-native';

// TODO: Replace with actual app screenshot showing search results
import placeholderImage from '../assets/onboarding/placeholder.png';

interface BaseStep {
  id: string;
  ctaLabel?: string;
}

interface HeroStep extends BaseStep {
  type: 'hero';
  title: string;
  description: string;
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

// New graph step types
interface GraphStep extends BaseStep {
  type: 'graph';
  graphType: 'time-saved' | 'regret-rate' | 'discovery-curve' | 'calendar-comparison';
  title: string;
  body: string;
  subtitle?: string; // For calendar graph explanation
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
  | GraphStep
  | NotificationStep;

export const onboardingSteps: OnboardingStep[] = [
  // PHASE 1: HOOK & EASY QUESTIONS (5 screens)
  {
    id: 'hero',
    type: 'hero',
    title: 'Know what to order, not just where to go',
    description:
      'Every dish ranked by community votes so you can see what actually hits before you order.',
    image: placeholderImage,
    showAppScreenshot: true,
    ctaLabel: 'Show me how',
  },
  {
    id: 'identity',
    type: 'single-choice',
    question: 'How do you like to be addressed?',
    helper: 'Helps us personalize copy and saved profiles later.',
    options: [
      { id: 'woman', label: 'Woman' },
      { id: 'man', label: 'Man' },
      { id: 'non-binary', label: 'Non-binary' },
      { id: 'prefer-not', label: 'Prefer not to say' },
    ],
    required: false,
  },
  {
    id: 'dining-frequency',
    type: 'single-choice',
    question: 'How often do you eat out?',
    helper: 'We\'ll pace notifications based on your habits.',
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
    question: 'What\'s your usual spend per person?',
    helper: 'We\'ll prioritize spots in your price range.',
    options: [
      { id: 'under-20', label: '$', detail: 'Under $20 • Quick bites & value' },
      { id: '20-40', label: '$$', detail: '$20–$40 • Solid everyday spots' },
      { id: '40-70', label: '$$$', detail: '$40–$70 • Nice dinners & dates' },
      { id: '70-plus', label: '$$$$', detail: '$70+ • Special experiences' },
    ],
    required: true,
  },
  {
    id: 'attribution',
    type: 'single-choice',
    question: 'How did you hear about us?',
    helper: 'Helps us understand what\'s working so we can reach more food lovers like you.',
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

  // PHASE 2: VALUE PROP GRAPH + EXPLANATION (1 combined screen)
  {
    id: 'calendar-graph',
    type: 'graph',
    graphType: 'calendar-comparison',
    title: 'Crave eliminates disappointing meals',
    body: 'We rank dishes, not just restaurants—so you always order the best.',
    ctaLabel: 'Makes sense',
  },

  // PHASE 3: NOTIFICATION PERSONALIZATION (4 screens)
  {
    id: 'occasion-vibe',
    type: 'multi-choice',
    question: 'What kind of experience are you planning?',
    helper: 'This helps us send you perfectly timed recommendations.',
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
    helper: 'This helps us send you perfectly timed recommendations. Pick at least 3.',
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
    helper: 'This helps us send you perfectly timed recommendations. Pick 2-3.',
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

  // PHASE 4: PERSONALIZED EFFORT GRAPH (1 screen)
  {
    id: 'effort-savings',
    type: 'graph',
    graphType: 'time-saved',
    title: 'Finding great food, simplified',
    body: 'With Crave, you get 4x less time and effort to find amazing meals. That means more time enjoying food, less time researching it.',
    ctaLabel: 'Save my time',
  },

  // PHASE 5: OBJECTION HANDLING (1 screen)
  {
    id: 'barriers',
    type: 'multi-choice',
    question: 'What stops you from finding great food consistently?',
    helper: 'We\'ve solved these exact problems. Pick all that apply.',
    options: [
      { id: 'no-time', label: '⏰ No time to research every meal' },
      { id: 'cant-afford', label: '💸 Can\'t afford to gamble on mediocre spots' },
      { id: 'no-trust', label: '🤷 Can\'t trust online reviews anymore' },
      { id: 'new-neighborhoods', label: '📍 Hard to find quality in new neighborhoods' },
      { id: 'friends-taste', label: '👥 Friends\' taste is hit-or-miss for me' },
      { id: 'paralysis', label: '😤 Menu paralysis - too many options' },
    ],
    required: false,
  },

  // PHASE 4: SOCIAL PROOF & COMMITMENT (2 screens)
  {
    id: 'comparison',
    type: 'comparison',
    title: 'The Crave difference',
    helper: 'Why dishes beat restaurants.',
    left: {
      title: 'Google / Yelp',
      rows: [
        '⭐ Restaurant-level ratings',
        '📝 Long reviews you skip',
        '🤷 Great chef, bad service = low rating',
        'Can\'t tell what to order',
        '😤 Wasted meals on wrong dishes',
      ],
    },
    right: {
      title: 'Crave',
      rows: [
        '🍽️ Dish-level rankings',
        '👍 Quick votes = more signal',
        '✅ Food quality rises above noise',
        'Know what\'s good in 10 seconds',
        '🎯 Every order is the right order',
      ],
    },
    body: 'Crave ranks restaurants by their food, not their parking lot.',
    ctaLabel: 'Makes sense',
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
  {
    id: 'location',
    type: 'location',
    question: 'Which city should we scout for you?',
    helper:
      'Austin + NYC have full coverage today. If you’re elsewhere, request your city—we’ll tailor notifications/polls around your taste and give you a handful of free searches in our live markets so you can see Crave in action.',
    allowedCities: [
      { id: 'austin', label: '🤠 Austin', value: 'Austin' },
      { id: 'new-york', label: '🗽 New York', value: 'New York' },
    ],
    placeholder: 'Enter your city',
    required: true,
    ctaLabel: 'Continue',
  },

  // PHASE 5: PROCESSING - "BUILDING YOUR FEED" (3 screens)
  {
    id: 'pre-loading',
    type: 'processing',
    title: 'Let\'s cut through the noise',
    subtitle:
      'Austin has 2,000+ restaurants. We\'re about to filter 12,000+ dishes down to the ones you\'d actually want to know about.',
    progress: 0,
    checklist: [],
    durationMs: 0,
    isAnimated: false,
    ctaLabel: 'Show me what\'s relevant',
  },
  {
    id: 'processing-feed',
    type: 'processing',
    title: 'Filtering the noise...',
    subtitle: 'Prioritizing spots with 50+ votes for accuracy',
    progress: 0.68,
    checklist: [
      { label: 'Scanned 2,147 restaurants in Austin', status: 'complete' },
      { label: 'Found 487 dishes in your cuisines', status: 'complete' },
      { label: 'Filtered to your price range', status: 'complete' },
      { label: 'Ranking by community vote strength', status: 'pending' },
      { label: 'Mapping your 3 neighborhoods', status: 'pending' },
    ],
    durationMs: 4000,
    isAnimated: true,
    ctaLabel: 'Processing...',
  },
  {
    id: 'feed-ready',
    type: 'processing',
    title: 'Your feed is live',
    subtitle: 'You\'re now seeing the top 10% of Austin dishes—the stuff people who eat like you actually love.',
    progress: 1,
    checklist: [
      { label: '2,147 restaurants scanned', status: 'complete' },
      { label: '487 dishes matched your taste', status: 'complete' },
      { label: 'Focused on your price range', status: 'complete' },
      { label: '3 neighborhoods mapped', status: 'complete' },
      { label: '50+ community votes minimum', status: 'complete' },
    ],
    showSummary: true,
    durationMs: 0,
    isAnimated: false,
    ctaLabel: 'Show me what\'s hot',
  },

  // PHASE 6: DISCOVERY PROJECTION & ACCOUNT (3 screens)
  {
    id: 'discovery-curve',
    type: 'graph',
    graphType: 'discovery-curve',
    title: 'Find your favorites 10x faster',
    body: 'Most people take 4-6 months to find 10 solid spots in a new city. Crave users find their first 10 in 2 weeks—because we surface what people like you already love.',
    ctaLabel: 'Fast-track my discovery',
  },
  {
    id: 'notifications',
    type: 'notification',
    title: 'Get notified when something hits your feed',
    body: 'Now that we know your taste, we\'ll only notify you about stuff you\'d actually care about.',
    features: [
      'Tuesday polls: Vote on "Best tacos" or "Date night pasta"',
      'New discoveries: Spots matching your taste just got added',
      'Score updates: A saved spot just jumped in rankings',
    ],
    options: [
      { id: '2-3-week', label: '2-3 times per week', recommended: true },
      { id: 'weekly', label: 'Weekly digest only' },
      { id: 'poll-only', label: 'Just the Tuesday poll' },
      { id: 'manual', label: 'I\'ll check the app myself' },
    ],
    ctaLabel: 'Enable notifications',
  },
  {
    id: 'account',
    type: 'account',
    title: 'Save your taste profile',
    description:
      'Create an account so your taste cues, curated notifications, and saved spots sync everywhere. Search and bookmarking stay totally in your control.',
    disclaimer:
      'By continuing, you agree to Crave\'s Terms of Service and Privacy Policy. We\'ll never sell your data.',
    ctaLabel: 'Create account',
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
