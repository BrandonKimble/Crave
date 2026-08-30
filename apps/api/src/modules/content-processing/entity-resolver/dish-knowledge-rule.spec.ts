import { DISH_KNOWLEDGE_RULE } from './dish-knowledge-rule';
import { resolvePromptRule } from './prompt-rule-release';

/**
 * P7 docket item 4 (2026-08-17): the dish-knowledge pass was gated by a bare
 * timestamp — once stamped, done forever; a prompt improvement could never
 * re-open past syntheses. The mutations these pin: (1) editing
 * dish-knowledge-prompt.md without a ledger entry throws at load naming the
 * next version, instead of silently stamping new work with a stale version;
 * (2) the resolved version is what stamps carry and what the due predicate
 * compares, so a bump re-opens exactly the below-version population.
 */
describe('dish-knowledge rule is versioned through the ledger', () => {
  it('resolves the current asset to the ledgered version', () => {
    // v4: the D4 category facet (2026-08-30).
    expect(DISH_KNOWLEDGE_RULE.version).toBe(4);
    expect(DISH_KNOWLEDGE_RULE.fingerprint).toBe('e4dec514f61b');
  });

  it('an unledgered asset edit fails loudly with the next version', () => {
    expect(() =>
      resolvePromptRule(
        'dish.knowledge_synthesize',
        'dish-knowledge-rule.ts',
        `${DISH_KNOWLEDGE_RULE.prompt}\nEDITED WITHOUT A BUMP`,
        [{ version: 1, fingerprint: '6ed39bb6a8ba', note: 'current' }],
      ),
    ).toThrow(/version: 2/);
  });
});
