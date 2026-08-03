import type { ImageSourcePropType } from 'react-native';
import {
  CONTEXT_OPTION_IDS,
  CRAVING_OPTION_IDS,
  CUISINE_OPTION_IDS,
  LIVE_CITY_VALUES,
  labelledOptions,
} from '@crave-search/shared';

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

const CITY_OPTION_IDS = { Austin: 'austin', 'New York': 'new-york' } as const;
const CITY_LABELS = {
  Austin: '🤠 Austin',
  'New York': '🗽 New York',
} as const;

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

interface TeaserStep extends BaseStep {
  type: 'teaser';
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
  | ProcessingStep
  | AccountStep
  | UsernameStep
  | GraphStep
  | CarouselStep
  | NotificationStep
  | TeaserStep;

// Single source of truth for step ids. Consumers (recap, waitlist chips,
// notification personalization, visibility rules) must reference these
// constants — a hand-typed stale id string can then no longer compile once the
// step is removed or renamed (the class of bug behind the dead
// 'outing-types'/'ambiance' recap rows).
export const STEP_IDS = {
  hero: 'hero',
  useCases: 'use-cases',
  attribution: 'attribution',
  diningFrequency: 'dining-frequency',
  budget: 'budget',
  decideHow: 'decide-how',
  calendarGraph: 'calendar-graph',
  cuisines: 'cuisines',
  alwaysCraving: 'always-craving',
  contexts: 'contexts',
  dietaryNeeds: 'dietary-needs',
  spice: 'spice',
  spotYouLove: 'spot-you-love',
  diningGoals: 'dining-goals',
  notifications: 'notifications',
  teaser: 'teaser',
  location: 'location',
  waitlistInfo: 'waitlist-info',
  accountLive: 'account-live',
  accountWaitlist: 'account-waitlist',
  username: 'username',
} as const;

export type OnboardingStepId = (typeof STEP_IDS)[keyof typeof STEP_IDS];

export const onboardingSteps: OnboardingStep[] = [
  // PHASE 1: HOOK & EASY QUESTIONS (5 screens)
  {
    id: STEP_IDS.hero,
    type: 'hero',
    title: 'Know what to order, not just where to go',
    description:
      'Dinner decided in five minutes, not an hour of reviews. We read everything your city says about its food — and keep score.',
    image: placeholderImage,
    showAppScreenshot: true,
    ctaLabel: 'Show me how',
  },
  {
    id: STEP_IDS.useCases,
    type: 'carousel',
    title: 'Sound familiar?',
    slides: [
      {
        scenario: '“What do you feel like?” …silence',
        visual: 'map-icon',
        copy: "The nightly scroll that ends at the same three spots — while the best thing five minutes away stays a stranger. Crave shows you what you've been missing, ranked.",
      },
      {
        scenario: 'New city, one dinner, zero clue',
        visual: 'explore-icon',
        copy: 'Google hands you a wall of 4.6s. Crave hands you the answer — pan the map and see the dishes actually worth your one night there.',
      },
      {
        scenario: 'Right restaurant, wrong order',
        visual: 'menu-icon',
        copy: "The menu won't tell you what's good. We will — every dish scored by the people who ate it and came back raving.",
      },
    ],
    ctaLabel: "Let's go",
  },
  {
    id: STEP_IDS.attribution,
    type: 'single-choice',
    question: 'How did you hear about us?',
    options: [
      { id: 'app-store', label: 'App Store' },
      { id: 'tiktok', label: 'TikTok' },
      { id: 'youtube', label: 'YouTube' },
      { id: 'instagram', label: 'Instagram' },
      { id: 'x-twitter', label: 'X (Twitter)' },
      { id: 'facebook', label: 'Facebook' },
      { id: 'reddit', label: 'Reddit' },
      { id: 'google', label: 'Google' },
      { id: 'friend-family', label: 'Friend or family' },
      { id: 'other', label: 'Other' },
    ],
    required: false,
  },
  {
    id: STEP_IDS.location,
    type: 'location',
    question: 'Where are you eating?',
    helper: "Pick a live city or request yours—we'll tailor everything around it.",
    // `value` is what lands on the profile and what the API's teaser matches
    // on, so the live-city list is shared too.
    allowedCities: LIVE_CITY_VALUES.map((value) => ({
      id: CITY_OPTION_IDS[value],
      label: CITY_LABELS[value],
      value,
    })),
    placeholder: 'Enter your city',
    required: true,
    ctaLabel: 'Continue',
  },
  {
    id: STEP_IDS.waitlistInfo,
    type: 'summary',
    title: "We're building your city next",
    description:
      'Crave is live in Austin and NYC today. Cities come off the waitlist in order of demand — save your spot, bring your friends, and when your city is ready we walk you through everything fresh.',
  },
  {
    id: STEP_IDS.diningFrequency,
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
    id: STEP_IDS.budget,
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

  // PHASE 2: PAIN (name the broken toolkit, then price the pain)
  {
    id: STEP_IDS.decideHow,
    type: 'multi-choice',
    question: 'How do you pick a spot today?',
    helper: 'Pick everything you actually use',
    options: [
      { id: 'google-maps', label: '🗺️ Google Maps ratings' },
      { id: 'review-sites', label: '⭐ Yelp & review sites' },
      { id: 'tiktok-ig', label: '📱 TikTok / Instagram' },
      { id: 'ask-friends', label: '💬 Ask friends & group chats' },
      { id: 'reddit-threads', label: '🧵 Reddit threads' },
      { id: 'wander', label: '🚶 Wander in and hope' },
    ],
    required: true,
    minSelect: 1,
    ctaLabel: 'Continue',
  },
  {
    id: STEP_IDS.calendarGraph,
    type: 'graph',
    graphType: 'calendar-comparison',
    title: 'Never waste another meal',
    ctaLabel: "Let's do it",
  },

  // PHASE 3: TASTE PROFILE (the teaser's inputs — every answer feeds something real)
  {
    id: STEP_IDS.cuisines,
    type: 'multi-choice',
    question: 'What are you craving lately?',
    helper: 'Helps us personalize your recommendations. Pick at least 3.',
    // Ids come from the SHARED vocabulary — the API's teaser reads them off
    // the profile. Renaming one here without renaming it there used to
    // silently degrade the teaser; now it will not compile.
    options: labelledOptions(CUISINE_OPTION_IDS, {
      mexican: '🌮 Mexican',
      bbq: '🍖 BBQ',
      japanese: '🍣 Japanese',
      italian: '🍝 Italian',
      mediterranean: '🥙 Mediterranean',
      coffee: '☕ Coffee & bakeries',
      american: '🍔 American',
      asian: '🍜 Asian fusion',
    }),
    required: true,
    minSelect: 3,
    ctaLabel: 'Looks delicious',
  },
  {
    id: STEP_IDS.alwaysCraving,
    type: 'multi-choice',
    question: 'What are you always in the mood for?',
    helper: 'Your go-to orders—the dishes you never turn down. Pick a few.',
    options: labelledOptions(CRAVING_OPTION_IDS, {
      pizza: '🍕 Pizza',
      tacos: '🌮 Tacos',
      burgers: '🍔 A great burger',
      sushi: '🍣 Sushi',
      ramen: '🍜 Ramen & noodles',
      wings: '🍗 Wings',
      'fried-chicken': '🍗 Fried chicken',
      pasta: '🍝 Pasta',
      dumplings: '🥟 Dumplings',
      bbq: '🍖 BBQ & brisket',
      steak: '🥩 A good steak',
      brunch: '🍳 Brunch',
      'salad-bowls': '🥗 Fresh salads & bowls',
      sweets: '🍰 Dessert & sweets',
    }),
    required: true,
    minSelect: 2,
    allowCustomInput: true,
    customPlaceholder: 'Add your own go-to (e.g. pho, shawarma)',
    ctaLabel: 'Continue',
  },
  {
    id: STEP_IDS.contexts,
    type: 'multi-choice',
    question: 'Which of these are you regularly picking spots for?',
    helper: 'So Crave fits the ways you actually eat out.',
    options: labelledOptions(CONTEXT_OPTION_IDS, {
      'date-nights': '💕 Date nights',
      family: '👨‍👩‍👧 Family meals',
      business: '👔 Business meals & clients',
      'group-hangs': '🎉 Group hangs',
      'solo-everyday': '🍱 Solo & everyday eats',
      'special-occasions': '🥂 Special occasions',
    }),
    required: true,
    minSelect: 1,
    ctaLabel: 'Continue',
  },
  {
    id: STEP_IDS.dietaryNeeds,
    type: 'multi-choice',
    question: 'Any dietary needs?',
    helper: "We'll keep these front and center in your results. Skip if none.",
    options: [
      { id: 'vegetarian', label: '🥦 Vegetarian' },
      { id: 'vegan', label: '🌱 Vegan' },
      { id: 'pescatarian', label: '🐟 Pescatarian' },
      { id: 'gluten-free', label: '🌾 Gluten-free' },
      { id: 'dairy-free', label: '🥛 Dairy-free' },
      { id: 'halal', label: '☪️ Halal' },
      { id: 'kosher', label: '✡️ Kosher' },
      { id: 'nut-allergy', label: '🥜 Nut allergy' },
    ],
    required: false,
    ctaLabel: 'Continue',
  },
  {
    id: STEP_IDS.spice,
    type: 'single-choice',
    question: 'How do you feel about heat?',
    options: [
      { id: 'mild', label: '🧊 Keep it mild' },
      { id: 'medium', label: '🌶️ Some kick is good' },
      { id: 'hot', label: '🌶️🌶️ The spicier the better' },
      { id: 'extreme', label: '🔥 Bring the pain' },
    ],
    required: true,
  },
  {
    id: STEP_IDS.spotYouLove,
    type: 'multi-choice',
    question: 'Name a spot you already love',
    helper:
      'One or two favorites, anywhere — it anchors your taste so day one feels right. Optional.',
    options: [],
    required: false,
    allowCustomInput: true,
    customPlaceholder: 'e.g. Franklin Barbecue, your corner ramen bar',
    ctaLabel: 'Continue',
  },
  {
    id: STEP_IDS.diningGoals,
    type: 'multi-choice',
    question: 'What matters most when you eat out?',
    helper: 'Helps us personalize your recommendations. Pick 2-3.',
    options: [
      { id: 'trending', label: '🔥 Trending & buzzy' },
      { id: 'reliable', label: '⭐ Reliable classics' },
      { id: 'wow-factor', label: '✨ Show-stopping' },
      { id: 'healthy', label: '🥗 Healthy options' },
      { id: 'hidden-gems', label: '💎 Hidden gems — surprise me' },
    ],
    required: true,
    minSelect: 2,
  },
  // PHASE 4: CLOSE (notifications → city → account)
  {
    id: STEP_IDS.notifications,
    type: 'notification',
    title: "Get notified about dishes you'd care about",
    body: "We'll keep you updated on what's worth trying.",
    features: [
      'Ranking moves: a dish you saved just climbed — or got dethroned',
      'Weekly digest: what actually changed in your city this week',
      'Tuesday polls: vote on "Best tacos" in 30 seconds',
    ],
    options: [
      { id: '2-3-week', label: '2-3 times per week', recommended: true },
      { id: 'weekly', label: 'Weekly digest only' },
      { id: 'poll-only', label: 'Just the Tuesday poll' },
      { id: 'manual', label: "I'll check the app myself" },
    ],
    ctaLabel: 'Enable notifications',
  },

  // PHASE 5: WAITLIST PREVIEW + ACCOUNT
  {
    id: STEP_IDS.teaser,
    type: 'teaser',
    ctaLabel: 'Unlock every answer',
  },
  {
    id: STEP_IDS.accountLive,
    type: 'account',
    title: 'Your answers are waiting',
    description:
      'Create your account so your rankings, saves, and taste profile follow you everywhere.',
    disclaimer:
      "By continuing, you agree to Crave's Terms of Service and Privacy Policy. We'll never sell your data.",
    ctaLabel: 'Create account',
  },
  {
    id: STEP_IDS.accountWaitlist,
    type: 'account',
    title: 'Save your waitlist spot',
    description:
      'Create an account to save your waitlist spot — we notify you the day your city goes live, and your signup counts toward its build order.',
    disclaimer:
      "By continuing, you agree to Crave's Terms of Service and Privacy Policy. We'll never sell your data.",
    ctaLabel: 'Join waitlist',
  },
  {
    id: STEP_IDS.username,
    type: 'username',
    title: 'Pick your username',
    helper: 'This is how people find you. You can change it later.',
    placeholder: '@yourname',
    ctaLabel: 'Continue',
  },
];

// Helper to get readable label for a single-choice answer
export const getSingleChoiceLabel = (
  stepId: OnboardingStepId,
  value: string
): string | undefined => {
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
export const getMultiChoiceLabels = (stepId: OnboardingStepId, values: string[]): string[] => {
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
