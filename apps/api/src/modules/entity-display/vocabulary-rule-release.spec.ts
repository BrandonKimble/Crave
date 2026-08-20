import {
  VOCABULARY_PROMPT_VERSION,
  VOCABULARY_RULE_TEXT,
} from './vocabulary-generator';
import { resolvePromptRule } from '../content-processing/entity-resolver/prompt-rule-release';

/**
 * P7 docket item 3 (2026-08-17): VOCABULARY_PROMPT_VERSION was the fleet's
 * last hand-maintained version constant — an edit to buildVocabularyPrompt
 * without a bump was undetectable, and the label sweep's due predicate would
 * see nothing owed. The mutation these pin: edit the template (fingerprint
 * changes) and module load THROWS naming the release entry to add, instead
 * of silently serving stale-versioned labels.
 */
describe('vocabulary prompt version is derived, not declared', () => {
  it('resolves the current template to the ledgered version', () => {
    expect(VOCABULARY_PROMPT_VERSION).toBe(7);
  });

  it('an unledgered template edit fails loudly with the next version', () => {
    expect(() =>
      resolvePromptRule(
        'labels.vocabulary',
        'vocabulary-generator.ts',
        `${VOCABULARY_RULE_TEXT}\nEDITED WITHOUT A BUMP`,
        [{ version: 7, fingerprint: '44c6dd662cfd', note: 'current' }],
      ),
    ).toThrow(/version: 8/);
  });
});
