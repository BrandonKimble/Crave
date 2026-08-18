import type { ImageSourcePropType } from 'react-native';
import {
  ATTRIBUTION_OPTION_IDS,
  BUDGET_OPTION_IDS,
  CONTEXT_OPTION_IDS,
  CRAVING_OPTION_IDS,
  CUISINE_OPTION_IDS,
  DECIDE_HOW_OPTION_IDS,
  DIETARY_NEED_OPTION_IDS,
  DINING_FREQUENCY_OPTION_IDS,
  DINING_GOAL_OPTION_IDS,
  LIVE_CITY_VALUES,
  NOTIFICATION_CADENCE_OPTION_IDS,
  ONBOARDING_QUESTION_IDS,
  SPICE_OPTION_IDS,
  labelledOptions,
} from '@crave-search/shared';

// OWNER 2026-08-17: placeholder asset — the hero step ships the splash image
// until an actual app screenshot (search results) is produced; owner-owned
// asset decision, not a code task.
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

/**
 * Build a labelled option list where each option also carries a `detail`
 * line. Same law as `labelledOptions`: a renamed or added shared id without a
 * label here is a compile error.
 */
const detailedOptions = <Id extends string>(
  ids: readonly Id[],
  entries: Record<Id, { label: string; detail: string }>
): Array<{ id: Id; label: string; detail: string }> => ids.map((id) => ({ id, ...entries[id] }));

// Single source of truth for step ids. Consumers (recap, waitlist chips,
// notification personalization, visibility rules) must reference these
// constants — a hand-typed stale id string can then no longer compile once the
// step is removed or renamed (the class of bug behind the dead
// 'outing-types'/'ambiance' recap rows).
//
// D40: the ANSWER-BEARING ids are no longer declared here. They cross the
// network as the keys of `users.onboarding_responses`, so they live in
// `@crave-search/shared` (ONBOARDING_QUESTION_IDS) beside the option ids, and
// the API reads them only through `parseOnboardingAnswers`. Renaming one is
// now a compile error on BOTH sides instead of a silently empty personal
// list. What stays local is exactly what never leaves the device: the
// presentation-only steps, which carry no answer.
export const STEP_IDS = {
  ...ONBOARDING_QUESTION_IDS,
  hero: 'hero',
  useCases: 'use-cases',
  calendarGraph: 'calendar-graph',
  teaser: 'teaser',
  waitlistInfo: 'waitlist-info',
  accountLive: 'account-live',
  accountWaitlist: 'account-waitlist',
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
    options: labelledOptions(ATTRIBUTION_OPTION_IDS, {
      'app-store': 'App Store',
      tiktok: 'TikTok',
      youtube: 'YouTube',
      instagram: 'Instagram',
      'x-twitter': 'X (Twitter)',
      facebook: 'Facebook',
      reddit: 'Reddit',
      google: 'Google',
      'friend-family': 'Friend or family',
      other: 'Other',
    }),
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
    options: detailedOptions(DINING_FREQUENCY_OPTION_IDS, {
      rarely: { label: '1-2 times/week', detail: 'Mostly cook at home' },
      weekly: { label: '3-4 times/week', detail: 'Regular lunches + dinner' },
      often: { label: '5-6 times/week', detail: 'Always on the go' },
      daily: { label: 'Every day', detail: 'Professional food scout' },
    }),
    required: true,
  },
  {
    id: STEP_IDS.budget,
    type: 'single-choice',
    question: "What's your usual spend per person?",
    helper: 'Helps us personalize your recommendations',
    options: detailedOptions(BUDGET_OPTION_IDS, {
      'under-20': { label: '$', detail: 'Under $20 • Quick bites & value' },
      '20-40': { label: '$$', detail: '$20–$40 • Solid everyday spots' },
      '40-70': { label: '$$$', detail: '$40–$70 • Nice dinners & dates' },
      '70-plus': { label: '$$$$', detail: '$70+ • Special experiences' },
    }),
    required: true,
  },

  // PHASE 2: PAIN (name the broken toolkit, then price the pain)
  {
    id: STEP_IDS.decideHow,
    type: 'multi-choice',
    question: 'How do you pick a spot today?',
    helper: 'Pick everything you actually use',
    options: labelledOptions(DECIDE_HOW_OPTION_IDS, {
      'google-maps': '🗺️ Google Maps ratings',
      'review-sites': '⭐ Yelp & review sites',
      'tiktok-ig': '📱 TikTok / Instagram',
      'ask-friends': '💬 Ask friends & group chats',
      'reddit-threads': '🧵 Reddit threads',
      wander: '🚶 Wander in and hope',
    }),
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
    options: labelledOptions(DIETARY_NEED_OPTION_IDS, {
      vegetarian: '🥦 Vegetarian',
      vegan: '🌱 Vegan',
      pescatarian: '🐟 Pescatarian',
      'gluten-free': '🌾 Gluten-free',
      'dairy-free': '🥛 Dairy-free',
      halal: '☪️ Halal',
      kosher: '✡️ Kosher',
      'nut-allergy': '🥜 Nut allergy',
    }),
    required: false,
    ctaLabel: 'Continue',
  },
  {
    id: STEP_IDS.spice,
    type: 'single-choice',
    question: 'How do you feel about heat?',
    options: labelledOptions(SPICE_OPTION_IDS, {
      mild: '🧊 Keep it mild',
      medium: '🌶️ Some kick is good',
      hot: '🌶️🌶️ The spicier the better',
      extreme: '🔥 Bring the pain',
    }),
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
    options: labelledOptions(DINING_GOAL_OPTION_IDS, {
      trending: '🔥 Trending & buzzy',
      reliable: '⭐ Reliable classics',
      'wow-factor': '✨ Show-stopping',
      healthy: '🥗 Healthy options',
      'hidden-gems': '💎 Hidden gems — surprise me',
    }),
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
    options: labelledOptions(NOTIFICATION_CADENCE_OPTION_IDS, {
      '2-3-week': '2-3 times per week',
      weekly: 'Weekly digest only',
      'poll-only': 'Just the Tuesday poll',
      manual: "I'll check the app myself",
    }).map((option) => ({
      ...option,
      recommended: option.id === '2-3-week',
    })),
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
