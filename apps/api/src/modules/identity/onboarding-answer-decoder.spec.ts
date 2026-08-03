/**
 * D40 §1.1 — THE DECODER IS THE ONLY READER OF A STORED ANSWER DOCUMENT.
 *
 * The defect it replaces was a single line in the curated-list builder:
 *
 *     const cuisines = (responses as Record<string, unknown>).cuisines;
 *
 * A hand-respelled mobile step id. Renaming the question would have produced
 * zero personal lists, no error, and no failing test — the same drift class
 * the shared OPTION vocabulary was written to end, one level up on the KEYS.
 *
 * These cases pin the two laws that make the decoder trustworthy, and both
 * can show RED:
 *
 *  - "unknown keys are PRESERVED on write, reported at read" — RED recipe:
 *    make `parseOnboardingAnswers` drop or rewrite unknown keys and the
 *    preservation case fails.
 *  - "unknown option ids are DROPPED at read, and COUNTED" — RED recipe:
 *    let an unknown id through into `answers.cuisines`, or stop pushing to
 *    `droppedOptionIds`, and the counting case fails.
 *
 * The API-side test lives here (not in packages/shared, which has no runner)
 * because the API is the consumer whose silent zero this prevents.
 */
import {
  ONBOARDING_QUESTION_IDS,
  ONBOARDING_QUESTION_SET_VERSION,
  parseOnboardingAnswers,
} from '@crave-search/shared';

describe('parseOnboardingAnswers — the one reader of a stored answer document', () => {
  it('decodes the real document shape mobile writes', () => {
    const decoded = parseOnboardingAnswers(ONBOARDING_QUESTION_SET_VERSION, {
      [ONBOARDING_QUESTION_IDS.cuisines]: ['mexican', 'japanese'],
      [ONBOARDING_QUESTION_IDS.alwaysCraving]: ['tacos', 'pho'],
      [ONBOARDING_QUESTION_IDS.contexts]: ['date-nights'],
      [ONBOARDING_QUESTION_IDS.dietaryNeeds]: ['vegan'],
      [ONBOARDING_QUESTION_IDS.spice]: 'hot',
      [ONBOARDING_QUESTION_IDS.budget]: '40-70',
      [ONBOARDING_QUESTION_IDS.location]: 'Austin',
      [ONBOARDING_QUESTION_IDS.username]: 'brandon',
    });
    expect(decoded.answers.cuisines).toEqual(['mexican', 'japanese']);
    expect(decoded.answers.contexts).toEqual(['date-nights']);
    expect(decoded.answers.dietaryNeeds).toEqual(['vegan']);
    expect(decoded.answers.spice).toBe('hot');
    expect(decoded.answers.budget).toBe('40-70');
    expect(decoded.answers.location).toBe('Austin');
    expect(decoded.answers.username).toBe('brandon');
    expect(decoded.droppedOptionIds).toEqual([]);
    expect(decoded.unknownQuestionIds).toEqual([]);
  });

  it('a free-text go-to dish is the ANSWER, not drift — kept verbatim, never counted as a drop', () => {
    const decoded = parseOnboardingAnswers(null, {
      [ONBOARDING_QUESTION_IDS.alwaysCraving]: ['tacos', 'shawarma'],
      [ONBOARDING_QUESTION_IDS.spotYouLove]: ['Franklin Barbecue'],
    });
    expect(decoded.answers.cravings).toEqual(['tacos']);
    expect(decoded.answers.customCravings).toEqual(['shawarma']);
    expect(decoded.answers.spotsYouLove).toEqual(['Franklin Barbecue']);
    expect(decoded.droppedOptionIds).toEqual([]);
  });

  it('an unknown OPTION id is dropped at read AND counted (never a silent zero)', () => {
    const decoded = parseOnboardingAnswers(null, {
      [ONBOARDING_QUESTION_IDS.cuisines]: ['mexican', 'mexicano'],
      [ONBOARDING_QUESTION_IDS.spice]: 'nuclear',
    });
    expect(decoded.answers.cuisines).toEqual(['mexican']);
    expect(decoded.answers.spice).toBeNull();
    expect(decoded.droppedOptionIds).toEqual([
      { questionId: 'cuisines', optionId: 'mexicano' },
      { questionId: 'spice', optionId: 'nuclear' },
    ]);
  });

  it('an unknown QUESTION key is reported, never edited away — the document is the user testimony', () => {
    const stored = {
      [ONBOARDING_QUESTION_IDS.cuisines]: ['mexican'],
      'a-question-this-server-has-not-learned': 'some answer',
    };
    const decoded = parseOnboardingAnswers(null, stored);
    expect(decoded.unknownQuestionIds).toEqual([
      'a-question-this-server-has-not-learned',
    ]);
    // The input object is untouched: the decoder has opinions at READ only.
    expect(stored['a-question-this-server-has-not-learned']).toBe(
      'some answer',
    );
  });

  it('a legacy row with NO stored question-set version decodes as v1 — the set those keys belong to', () => {
    const decoded = parseOnboardingAnswers(null, {
      [ONBOARDING_QUESTION_IDS.cuisines]: ['bbq'],
    });
    expect(decoded.questionSetVersion).toBe(ONBOARDING_QUESTION_SET_VERSION);
    expect(decoded.answers.cuisines).toEqual(['bbq']);
  });

  it('never throws on garbage — a document we cannot read yields NO answers, which is the honest reading', () => {
    for (const garbage of [null, undefined, 42, 'nope', [], { cuisines: 7 }]) {
      const decoded = parseOnboardingAnswers(null, garbage);
      expect(decoded.answers.cuisines).toEqual([]);
    }
  });
});
