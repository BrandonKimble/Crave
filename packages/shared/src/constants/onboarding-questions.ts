/**
 * THE ONBOARDING ANSWER **KEYS** ARE A CONTRACT TOO — AND THEY WERE NOT
 * SHARED (D40 §1.1).
 *
 * `onboarding-vocabulary.ts` shares the OPTION ids because a rename silently
 * broke the teaser. It stopped one level short: the KEYS those options are
 * filed under — the mobile step ids — were never shared, and the API
 * re-spelled one by hand:
 *
 *     // curated-list-builder.service.ts, deleted 2026-08-03
 *     const cuisines = (responses as Record<string, unknown>).cuisines;
 *
 * Renaming the `cuisines` step would have produced zero personal lists, no
 * error, and no failing test — the exact drift class the vocabulary file
 * exists to end, one level up.
 *
 * So the keys live HERE, the API reads stored answers ONLY through
 * `parseOnboardingAnswers`, and mobile builds `STEP_IDS` from these ids.
 *
 * TWO LAWS THIS FILE ENCODES:
 *
 *  1. **Unknown keys are preserved on WRITE.** The stored document is the
 *     user's testimony; the decoder never edits it. A key this version does
 *     not know is reported in `unknownQuestionIds`, not deleted.
 *  2. **Unknown option ids are dropped at READ.** A retired option stays in
 *     the stored answers forever (history is honest) but never reaches a
 *     recipe, and every drop is COUNTED so the drop can be seen.
 *
 * VERSIONING IS SERVER-OWNED. `ONBOARDING_QUESTION_SET_VERSION` is the
 * server's own statement of which question set it understands; the client's
 * `onboardingVersion` says which set it RENDERED. They are stored separately
 * so a mismatch is a visible fact instead of an assumption. Question-set
 * changes are additive-with-a-new-version and the decoder keeps a branch per
 * version — deleting a question never rewrites stored answers.
 */

import {
  CONTEXT_OPTION_IDS,
  CRAVING_OPTION_IDS,
  CUISINE_OPTION_IDS,
  type ContextOptionId,
  type CravingOptionId,
  type CuisineOptionId,
} from './onboarding-vocabulary';

/**
 * The server's question-set version. Bumped ONLY when the set of questions
 * changes (a new question, a retired one, a renamed key) — never for a
 * copy edit and never for an option-list change, which the option
 * vocabularies already cover.
 */
export const ONBOARDING_QUESTION_SET_VERSION = 1;

/**
 * THE ANSWER KEYS. Every id here is a key in `users.onboarding_responses`
 * and in every `user_onboarding_responses` row. Mobile's STEP_IDS spreads
 * this record, so a rename is a compile error on both sides.
 *
 * Presentation-only steps (hero, carousels, graphs, account screens) are NOT
 * here: they carry no answer and never cross the wire.
 */
export const ONBOARDING_QUESTION_IDS = {
  attribution: 'attribution',
  location: 'location',
  diningFrequency: 'dining-frequency',
  budget: 'budget',
  decideHow: 'decide-how',
  cuisines: 'cuisines',
  alwaysCraving: 'always-craving',
  contexts: 'contexts',
  dietaryNeeds: 'dietary-needs',
  spice: 'spice',
  spotYouLove: 'spot-you-love',
  diningGoals: 'dining-goals',
  notifications: 'notifications',
  username: 'username',
} as const;

export type OnboardingQuestionId =
  (typeof ONBOARDING_QUESTION_IDS)[keyof typeof ONBOARDING_QUESTION_IDS];

export const ALL_ONBOARDING_QUESTION_IDS = Object.values(
  ONBOARDING_QUESTION_IDS
) as readonly OnboardingQuestionId[];

// ---------------------------------------------------------------------------
// The remaining CLOSED option vocabularies.
//
// `onboarding-vocabulary.ts` shared three (cravings, contexts, cuisines)
// because the teaser read those three. The decoder types every question, so
// every closed set moves here for the same reason and under the same law: an
// id the API can name is an id mobile cannot rename silently. Labels stay
// mobile's business (see `labelledOptions`).
// ---------------------------------------------------------------------------

/** "How did you hear about us?" */
export const ATTRIBUTION_OPTION_IDS = [
  'app-store',
  'tiktok',
  'youtube',
  'instagram',
  'x-twitter',
  'facebook',
  'reddit',
  'google',
  'friend-family',
  'other',
] as const;
export type AttributionOptionId = (typeof ATTRIBUTION_OPTION_IDS)[number];

/** "How often do you eat out?" */
export const DINING_FREQUENCY_OPTION_IDS = ['rarely', 'weekly', 'often', 'daily'] as const;
export type DiningFrequencyOptionId = (typeof DINING_FREQUENCY_OPTION_IDS)[number];

/** "What's your usual spend per person?" */
export const BUDGET_OPTION_IDS = ['under-20', '20-40', '40-70', '70-plus'] as const;
export type BudgetOptionId = (typeof BUDGET_OPTION_IDS)[number];

/** "How do you pick a spot today?" */
export const DECIDE_HOW_OPTION_IDS = [
  'google-maps',
  'review-sites',
  'tiktok-ig',
  'ask-friends',
  'reddit-threads',
  'wander',
] as const;
export type DecideHowOptionId = (typeof DECIDE_HOW_OPTION_IDS)[number];

/** "Any dietary needs?" — a CONSTRAINT, never a weight (D40 §4). */
export const DIETARY_NEED_OPTION_IDS = [
  'vegetarian',
  'vegan',
  'pescatarian',
  'gluten-free',
  'dairy-free',
  'halal',
  'kosher',
  'nut-allergy',
] as const;
export type DietaryNeedOptionId = (typeof DIETARY_NEED_OPTION_IDS)[number];

/** "How do you feel about heat?" */
export const SPICE_OPTION_IDS = ['mild', 'medium', 'hot', 'extreme'] as const;
export type SpiceOptionId = (typeof SPICE_OPTION_IDS)[number];

/** "What matters most when you eat out?" */
export const DINING_GOAL_OPTION_IDS = [
  'trending',
  'reliable',
  'wow-factor',
  'healthy',
  'hidden-gems',
] as const;
export type DiningGoalOptionId = (typeof DINING_GOAL_OPTION_IDS)[number];

/** Notification cadence choice. */
export const NOTIFICATION_CADENCE_OPTION_IDS = [
  '2-3-week',
  'weekly',
  'poll-only',
  'manual',
] as const;
export type NotificationCadenceOptionId = (typeof NOTIFICATION_CADENCE_OPTION_IDS)[number];

// ---------------------------------------------------------------------------
// The decoded shape
// ---------------------------------------------------------------------------

/**
 * Question-set v1, decoded. Single-choice questions are `id | null`;
 * multi-choice are arrays of KNOWN ids only.
 *
 * Two questions accept free text and keep it: `always-craving` (custom go-to
 * dishes) and `spot-you-love` (restaurant names). Their free text is NOT a
 * dropped option — it is the answer — so it lands in its own field rather
 * than being counted as drift.
 */
export interface OnboardingAnswersV1 {
  attribution: AttributionOptionId | null;
  /** The live-city VALUE (or a free-typed waitlist city). Never an option id. */
  location: string | null;
  diningFrequency: DiningFrequencyOptionId | null;
  budget: BudgetOptionId | null;
  decideHow: DecideHowOptionId[];
  cuisines: CuisineOptionId[];
  cravings: CravingOptionId[];
  /** User-typed go-to dishes ("pho", "shawarma") — verbatim. */
  customCravings: string[];
  contexts: ContextOptionId[];
  dietaryNeeds: DietaryNeedOptionId[];
  spice: SpiceOptionId | null;
  /** Restaurant names the user typed — verbatim, no vocabulary. */
  spotsYouLove: string[];
  diningGoals: DiningGoalOptionId[];
  notifications: NotificationCadenceOptionId | null;
  username: string | null;
}

export interface DecodedOnboardingAnswers {
  /** The question-set version this document was decoded AS. */
  questionSetVersion: number;
  answers: OnboardingAnswersV1;
  /**
   * Option ids present in the document that this version's vocabulary does
   * not know. Dropped from `answers`, COUNTED here — a silent drop is the
   * defect; a counted one is a fact a spec can turn red on.
   */
  droppedOptionIds: Array<{ questionId: string; optionId: string }>;
  /** Keys in the document that are not questions in this version. */
  unknownQuestionIds: string[];
}

const EMPTY_ANSWERS = (): OnboardingAnswersV1 => ({
  attribution: null,
  location: null,
  diningFrequency: null,
  budget: null,
  decideHow: [],
  cuisines: [],
  cravings: [],
  customCravings: [],
  contexts: [],
  dietaryNeeds: [],
  spice: null,
  spotsYouLove: [],
  diningGoals: [],
  notifications: null,
  username: null,
});

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Decode a stored answer document.
 *
 * `version` is the QUESTION-SET version the document was written under.
 * Legacy rows (written before the server owned a version) carry `null` and
 * decode as v1 — the set they were actually written against.
 *
 * This function NEVER throws and never mutates `raw`: a garbage document
 * decodes to empty answers, which is the honest reading of "we cannot tell
 * what they said", and is exactly what "skips honestly" downstream means.
 */
export function parseOnboardingAnswers(
  version: number | null | undefined,
  raw: unknown
): DecodedOnboardingAnswers {
  const questionSetVersion = version ?? ONBOARDING_QUESTION_SET_VERSION;
  const answers = EMPTY_ANSWERS();
  const droppedOptionIds: Array<{ questionId: string; optionId: string }> = [];
  const unknownQuestionIds: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      questionSetVersion,
      answers,
      droppedOptionIds,
      unknownQuestionIds,
    };
  }
  const doc = raw as Record<string, unknown>;

  const knownKeys = new Set<string>(ALL_ONBOARDING_QUESTION_IDS);
  for (const key of Object.keys(doc)) {
    if (!knownKeys.has(key)) {
      unknownQuestionIds.push(key);
    }
  }

  const single = <Id extends string>(
    questionId: OnboardingQuestionId,
    vocabulary: readonly Id[]
  ): Id | null => {
    const value = asString(doc[questionId]);
    if (value == null) {
      return null;
    }
    if ((vocabulary as readonly string[]).includes(value)) {
      return value as Id;
    }
    droppedOptionIds.push({ questionId, optionId: value });
    return null;
  };

  const multi = <Id extends string>(
    questionId: OnboardingQuestionId,
    vocabulary: readonly Id[]
  ): Id[] => {
    const kept: Id[] = [];
    for (const value of asStringArray(doc[questionId])) {
      if ((vocabulary as readonly string[]).includes(value)) {
        kept.push(value as Id);
      } else {
        droppedOptionIds.push({ questionId, optionId: value });
      }
    }
    return kept;
  };

  answers.attribution = single(ONBOARDING_QUESTION_IDS.attribution, ATTRIBUTION_OPTION_IDS);
  answers.location = asString(doc[ONBOARDING_QUESTION_IDS.location]);
  answers.diningFrequency = single(
    ONBOARDING_QUESTION_IDS.diningFrequency,
    DINING_FREQUENCY_OPTION_IDS
  );
  answers.budget = single(ONBOARDING_QUESTION_IDS.budget, BUDGET_OPTION_IDS);
  answers.decideHow = multi(ONBOARDING_QUESTION_IDS.decideHow, DECIDE_HOW_OPTION_IDS);
  answers.cuisines = multi(ONBOARDING_QUESTION_IDS.cuisines, CUISINE_OPTION_IDS);
  answers.contexts = multi(ONBOARDING_QUESTION_IDS.contexts, CONTEXT_OPTION_IDS);
  answers.dietaryNeeds = multi(ONBOARDING_QUESTION_IDS.dietaryNeeds, DIETARY_NEED_OPTION_IDS);
  answers.spice = single(ONBOARDING_QUESTION_IDS.spice, SPICE_OPTION_IDS);
  answers.diningGoals = multi(ONBOARDING_QUESTION_IDS.diningGoals, DINING_GOAL_OPTION_IDS);
  answers.notifications = single(
    ONBOARDING_QUESTION_IDS.notifications,
    NOTIFICATION_CADENCE_OPTION_IDS
  );
  answers.username = asString(doc[ONBOARDING_QUESTION_IDS.username]);

  // The two free-text questions. A value outside the vocabulary is the
  // user's own words, not drift — it is KEPT, and never counted as a drop.
  const cravingVocabulary = CRAVING_OPTION_IDS as readonly string[];
  for (const value of asStringArray(doc[ONBOARDING_QUESTION_IDS.alwaysCraving])) {
    if (cravingVocabulary.includes(value)) {
      answers.cravings.push(value as CravingOptionId);
    } else {
      answers.customCravings.push(value);
    }
  }
  answers.spotsYouLove = asStringArray(doc[ONBOARDING_QUESTION_IDS.spotYouLove]);

  return { questionSetVersion, answers, droppedOptionIds, unknownQuestionIds };
}
