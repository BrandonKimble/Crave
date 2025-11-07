import type { ImageSourcePropType } from 'react-native';
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
  options: Array<{ id: string; label: string; detail?: string }>;
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
  allowedCities: Array<{ id: string; label: string; value: string }>;
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
}

interface AccountStep extends BaseStep {
  type: 'account';
  title: string;
  description: string;
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
  {
    id: 'hero',
    type: 'hero',
    title: 'Never settle or gamble on your next meal',
    description:
      'Only spend on food worth your time and money—Crave keeps scores on every hot dish in town.',
    image: placeholderImage,
    ctaLabel: 'Get started',
  },
  {
    id: 'value-proof',
    type: 'summary',
    title: 'Make every tab count',
    description: 'The average meal costs $93. Crave makes sure every dollar counts.',
    bullets: [
      'Signals from real locals eating those dishes this week.',
      'Skip overrated spots before they drain your budget.',
      'Fewer regret tabs = hundreds saved each quarter.',
    ],
    ctaLabel: 'Sounds great',
  },
  {
    id: 'location',
    type: 'location',
    question: 'Where should we launch next for you?',
    helper: 'We’re live in Austin & NYC only. Request early access for your city below.',
    allowedCities: [
      { id: 'austin', label: 'Austin', value: 'Austin' },
      { id: 'new-york', label: 'New York', value: 'New York' },
    ],
    placeholder: 'Request another city',
    required: true,
    ctaLabel: 'Lock it in',
  },
  {
    id: 'budget',
    type: 'single-choice',
    question: 'What’s your usual budget per person?',
    options: [
      { id: 'under-20', label: '$', detail: 'Under $20' },
      { id: '20-40', label: '$$', detail: '$20–$40' },
      { id: '40-70', label: '$$$', detail: '$40–$70' },
      { id: '70-plus', label: '$$$$', detail: '$70+' },
    ],
    required: true,
  },
  {
    id: 'dining-frequency',
    type: 'single-choice',
    question: 'How often do you eat out in a typical week?',
    helper: 'We use this to pace recommendations and mix hits with discoveries.',
    options: [
      { id: 'rarely', label: 'Once or twice', detail: 'Mostly home meals' },
      { id: 'weekly', label: '3–4 outings', detail: 'Lunches + a dinner' },
      { id: 'often', label: '5–6 outings', detail: 'I’m on the go' },
      { id: 'daily', label: 'Every day', detail: 'Always scouting food' },
    ],
    required: true,
  },
  {
    id: 'cuisines',
    type: 'multi-choice',
    question: 'Cravings we should lean into right now?',
    helper: 'Pick as many as you like. You can change these later.',
    options: [
      { id: 'mexican', label: '🌮 Mexican' },
      { id: 'bbq', label: '🔥 BBQ' },
      { id: 'japanese', label: '🍣 Japanese' },
      { id: 'italian', label: '🍝 Italian' },
      { id: 'mediterranean', label: '🥙 Mediterranean' },
      { id: 'coffee', label: '☕ Coffee & bakeries' },
    ],
    required: false,
  },
  {
    id: 'outing-types',
    type: 'multi-choice',
    question: 'Which kinds of outings do you plan most?',
    helper: 'We’ll tailor rankings to the moments you care about.',
    options: [
      { id: 'solo', label: '💼 Solo power lunch' },
      { id: 'date', label: '💕 Date night' },
      { id: 'team', label: '🤝 Team / client dinners' },
      { id: 'friends', label: '🎉 Friends & hangs' },
      { id: 'late-night', label: '🌙 Late-night bites' },
      { id: 'special', label: '🎂 Special occasions' },
    ],
    required: true,
    minSelect: 1,
    ctaLabel: 'Looks good',
  },
  {
    id: 'dining-goals',
    type: 'multi-choice',
    question: 'What should Crave prioritize for you?',
    helper: 'Helps us rank dishes the way you like.',
    options: [
      { id: 'trending', label: '🔥 Trending dishes' },
      { id: 'reliable', label: '✅ Rock-solid classics' },
      { id: 'value', label: '💸 Great value spots' },
      { id: 'wow-factor', label: '✨ Show-stopping experiences' },
    ],
    required: true,
    minSelect: 1,
  },
  {
    id: 'ambiance',
    type: 'single-choice',
    question: 'What vibe are you usually after?',
    helper: 'We’ll match restaurants to your mood.',
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
    question: 'What frustrates you about finding good food?',
    helper: 'We’ve solved these problems. Pick all that apply.',
    options: [
      { id: 'mediocre', label: '😤 Too many mediocre options' },
      { id: 'reviews', label: '⭐ Can’t trust online reviews' },
      { id: 'overhyped', label: '💸 Waste money on overhyped spots' },
      { id: 'no-time', label: '⏰ No time to research' },
      { id: 'lost', label: '🤷 Don’t know what’s good anymore' },
      { id: 'new-area', label: '📍 Hard to find gems in new areas' },
    ],
    required: false,
  },
  {
    id: 'discovery-methods',
    type: 'multi-choice',
    question: 'How do you usually find new restaurants?',
    helper: 'Honest answers help us beat your current routine.',
    options: [
      { id: 'google', label: '📱 Google / Yelp reviews' },
      { id: 'friends', label: '👥 Friends’ recommendations' },
      { id: 'social', label: '📸 Instagram / TikTok' },
      { id: 'walking', label: '🗺️ Walking around neighborhoods' },
      { id: 'blogs', label: '📰 Food blogs / critics' },
      { id: 'wing-it', label: '🎲 Just wing it' },
    ],
    required: false,
  },
  {
    id: 'comparison',
    type: 'comparison',
    title: 'The old way vs. Crave',
    helper: 'See why thousands switched.',
    left: {
      title: 'Without Crave',
      rows: [
        '🕒 30 min of scrolling reviews',
        '💸 2–3 “meh” meals every month',
        '⭐ Ratings inflated by tourists',
        '📍 No neighborhood context',
        '😩 ~$200 wasted monthly',
      ],
    },
    right: {
      title: 'With Crave',
      rows: [
        '⚡ 30-second decision flow',
        '✅ Every meal hits the vibe',
        '📊 Live scores from real diners',
        '🗺️ Hyperlocal rankings & maps',
        '💰 Pays for itself in one saved meal',
      ],
    },
    body: 'Join 12,000 Austin food lovers who stopped gambling on meals.',
    ctaLabel: 'I’m convinced',
  },
  {
    id: 'rating',
    type: 'rating',
    question: 'Mind sharing some love before we finish?',
    helper: 'Ratings from excited early users help us grow.',
    maxRating: 5,
    required: false,
    ctaLabel: 'Submit rating',
  },
  {
    id: 'notifications',
    type: 'single-choice',
    question: 'When should we notify you?',
    helper: 'We’ll only send updates worth your attention.',
    options: [
      { id: 'daily', label: '🔥 Daily', detail: 'Hot new dishes every morning' },
      { id: 'weekly', label: '📅 Few times a week', detail: 'Top trends, no spam' },
      { id: 'alerts', label: '🚨 Only major alerts', detail: 'Rare gems & big openings' },
      { id: 'manual', label: '🔕 I’ll check the app', detail: 'No notifications' },
    ],
    required: true,
    ctaLabel: 'Save preferences',
  },
  {
    id: 'processing-data',
    type: 'processing',
    title: 'Analyzing 500+ restaurants in Austin…',
    subtitle: 'This takes only a moment.',
    progress: 0.42,
    checklist: [
      { label: 'Loading restaurant data', status: 'complete' },
      { label: 'Processing quality scores', status: 'pending' },
      { label: 'Ranking based on your preferences', status: 'pending' },
      { label: 'Personalizing your feed', status: 'pending' },
    ],
    ctaLabel: 'Hold tight',
  },
  {
    id: 'processing-ranking',
    type: 'processing',
    title: 'Ranking dishes based on your taste…',
    subtitle: 'We’ll surface the sure bets first.',
    progress: 0.78,
    checklist: [
      { label: 'Loading restaurant data', status: 'complete' },
      { label: 'Processing quality scores', status: 'complete' },
      { label: 'Ranking based on your preferences', status: 'complete' },
      { label: 'Personalizing your feed', status: 'pending' },
    ],
    ctaLabel: 'Almost there',
  },
  {
    id: 'processing-summary',
    type: 'processing',
    title: 'Your personalized feed is ready',
    subtitle: 'Here’s what we’ll prioritize for you:',
    progress: 1,
    checklist: [
      { label: 'Preferences applied', status: 'complete' },
      { label: 'Neighborhood intel loaded', status: 'complete' },
      { label: 'Trend alerts queued up', status: 'complete' },
      { label: 'Recommendations curated', status: 'complete' },
    ],
    showSummary: true,
    ctaLabel: 'Continue',
  },
  {
    id: 'account',
    type: 'account',
    title: 'Save your personalized feed',
    description: 'Create an account so your preferences sync across devices.',
    ctaLabel: 'Start exploring',
  },
];
