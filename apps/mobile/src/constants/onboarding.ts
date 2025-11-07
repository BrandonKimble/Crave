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
  showAppScreenshot?: boolean; // Flag to indicate this should be real screenshot
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
}

interface MultiChoiceStep extends BaseStep {
  type: 'multi-choice';
  question: string;
  helper?: string;
  options: Array<{ id: string; label: string }>;
  required?: boolean;
  minSelect?: number;
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
  durationMs?: number; // How long to show this screen
}

interface AccountStep extends BaseStep {
  type: 'account';
  title: string;
  description: string;
  disclaimer?: string;
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
  | AccountStep;

export const onboardingSteps: OnboardingStep[] = [
  // PHASE 1: HOOK & VALUE PROP (2 screens)
  {
    id: 'hero',
    type: 'hero',
    title: 'Know what to order, not just where to go',
    description:
      'Every dish ranked by real votes. Skip the menu roulette—see what actually hits before you order.',
    image: placeholderImage,
    showAppScreenshot: true, // TODO: Replace placeholder with actual screenshot
    ctaLabel: 'Show me how',
  },
  {
    id: 'value-proof',
    type: 'summary',
    title: 'Why Crave beats Yelp & Google',
    description:
      'Google ranks restaurants by everything—service, parking, even bathroom reviews. We rank by the only thing that matters: the food.',
    bullets: [
      'Dish-level scores: See what\'s worth ordering before you commit',
      'Vote-powered: Every upvote counts as much as the original review',
      'Already at the restaurant? Search it and know what to order in 10 seconds',
    ],
    ctaLabel: 'Set up my feed',
  },

  // PHASE 2: LIGHT DATA COLLECTION (3 screens)
  {
    id: 'location',
    type: 'location',
    question: 'Where are you eating?',
    helper: 'We\'re live in Austin & NYC. Request early access for your city below.',
    allowedCities: [
      { id: 'austin', label: '🤠 Austin', value: 'Austin' },
      { id: 'new-york', label: '🗽 New York', value: 'New York' },
    ],
    placeholder: 'Request another city',
    required: true,
    ctaLabel: 'Continue',
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

  // PHASE 3: DEEPER PERSONALIZATION (5 screens)
  {
    id: 'cuisines',
    type: 'multi-choice',
    question: 'What are you craving lately?',
    helper: 'Pick at least 3 so we can mix it up for you.',
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
    id: 'outing-types',
    type: 'multi-choice',
    question: 'What kind of outings do you plan most?',
    helper: 'Pick all that apply so we match the right vibe.',
    options: [
      { id: 'solo', label: '🍱 Solo lunch' },
      { id: 'date', label: '💕 Date night' },
      { id: 'team', label: '👔 Business dinners' },
      { id: 'friends', label: '🎉 Friends & hangs' },
      { id: 'late-night', label: '🌙 Late-night bites' },
      { id: 'special', label: '🎂 Special occasions' },
    ],
    required: true,
    minSelect: 1,
    ctaLabel: 'Continue',
  },
  {
    id: 'dining-goals',
    type: 'multi-choice',
    question: 'What matters most when you eat out?',
    helper: 'Pick 2-3 to shape your rankings.',
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
    id: 'ambiance',
    type: 'single-choice',
    question: 'What vibe are you usually after?',
    helper: 'We\'ll match restaurants to your mood.',
    options: [
      { id: 'romantic', label: '💕 Romantic & intimate', detail: 'Perfect for dates' },
      { id: 'lively', label: '🎉 Lively & social', detail: 'High energy buzz' },
      { id: 'chill', label: '🧘 Quiet & chill', detail: 'Conversation-friendly' },
      { id: 'trendy', label: '✨ Trendy & Instagrammable', detail: 'Scene & aesthetics' },
    ],
    required: true,
  },
  {
    id: 'pain-points',
    type: 'multi-choice',
    question: 'What frustrates you most about finding good food?',
    helper: 'We\'ve solved these exact problems. Pick all that apply.',
    options: [
      { id: 'mediocre', label: '😤 Too many mediocre options' },
      { id: 'reviews', label: '⭐ Can\'t trust online reviews' },
      { id: 'overhyped', label: '💸 Waste money on overhyped spots' },
      { id: 'no-time', label: '⏰ No time to research everything' },
      { id: 'lost', label: '🤷 Don\'t know what\'s good anymore' },
      { id: 'new-area', label: '📍 Hard to find gems in new areas' },
    ],
    required: false,
  },

  // PHASE 4: SOCIAL PROOF & COMMITMENT (3 screens)
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
        '📍 Can\'t tell what to order',
        '😤 Wasted meals on wrong dishes',
      ],
    },
    right: {
      title: 'Crave',
      rows: [
        '🍽️ Dish-level rankings',
        '👍 Quick upvotes = more signal',
        '✅ Food quality rises above noise',
        '⚡ Know what\'s good in 10 seconds',
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
    id: 'notifications',
    type: 'single-choice',
    question: 'When should we notify you about new spots?',
    helper: 'We\'ll only send updates worth your attention.',
    options: [
      { id: 'daily', label: '🔥 Daily', detail: 'Hot new dishes every morning' },
      { id: 'weekly', label: '📅 Few times a week', detail: 'Top trends, no spam' },
      { id: 'alerts', label: '🚨 Only major alerts', detail: 'Rare gems & big openings' },
      { id: 'manual', label: '🔕 I\'ll check manually', detail: 'No notifications' },
    ],
    required: true,
    ctaLabel: 'Save preferences',
  },

  // PHASE 5: PROCESSING THEATER (3 screens)
  {
    id: 'processing-data',
    type: 'processing',
    title: 'Analyzing 500+ restaurants in your city…',
    subtitle: 'Crunching data from 50,000+ real diner reviews.',
    progress: 0.35,
    checklist: [
      { label: 'Loading restaurant database', status: 'complete' },
      { label: 'Processing quality scores', status: 'pending' },
      { label: 'Ranking by your preferences', status: 'pending' },
      { label: 'Personalizing your feed', status: 'pending' },
    ],
    durationMs: 2500,
    ctaLabel: 'Processing…',
  },
  {
    id: 'processing-ranking',
    type: 'processing',
    title: 'Ranking dishes based on your taste…',
    subtitle: 'Prioritizing your budget, cuisines, and vibe preferences.',
    progress: 0.75,
    checklist: [
      { label: 'Loading restaurant database', status: 'complete' },
      { label: 'Processing quality scores', status: 'complete' },
      { label: 'Ranking by your preferences', status: 'complete' },
      { label: 'Personalizing your feed', status: 'pending' },
    ],
    durationMs: 2500,
    ctaLabel: 'Almost there…',
  },
  {
    id: 'processing-summary',
    type: 'processing',
    title: 'Your personalized feed is ready!',
    subtitle: 'Here\'s what we prioritized based on your answers:',
    progress: 1,
    checklist: [
      { label: 'Preferences applied', status: 'complete' },
      { label: 'Neighborhood intel loaded', status: 'complete' },
      { label: 'Trend alerts queued up', status: 'complete' },
      { label: 'Custom rankings built', status: 'complete' },
    ],
    showSummary: true,
    durationMs: 1500,
    ctaLabel: 'Show my feed',
  },

  // PHASE 6: ACCOUNT CREATION
  {
    id: 'account',
    type: 'account',
    title: 'Save your personalized feed',
    description:
      'Create an account so your preferences, bookmarks, and search history sync across all devices.',
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
  return option?.label.replace(/[^\w\s$]/g, '').trim(); // Strip emoji but keep $
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
      return option?.label.replace(/[^\w\s&]/g, '').trim(); // Strip emoji
    })
    .filter((label): label is string => Boolean(label));
};
