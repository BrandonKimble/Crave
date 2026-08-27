import {
  readPromptAsset,
  resolvePromptRule,
  type ResolvedPromptRule,
  type RuleRelease,
} from './prompt-rule-release';

/**
 * THE DISH-KNOWLEDGE RULE — versioned through the release ledger (P7 docket
 * item 4, 2026-08-17). The synthesis pass used to be gated by a bare
 * timestamp (`knowledgeSynthesizedAt`): once stamped, a dish was done
 * FOREVER, so improving the prompt could never re-open past syntheses —
 * the same disease the relevance gate and the hand-maintained vocabulary
 * constant had. Now every stamp carries the version of the rule that
 * produced it, and the sweep's due predicate re-offers any dish stamped
 * below the current version — one re-pay per deliberate bump, never a
 * silent one (an unledgered edit to the .md throws at load).
 */
const DISH_KNOWLEDGE_RULE_RELEASES: readonly RuleRelease[] = [
  {
    version: 1,
    fingerprint: '6ed39bb6a8ba',
    note: 'The timestamp-era text, ledgered as-is: identity-modifier test + world-knowledge-never-testimony law. Existing stamps are backfilled to this version, so nothing comes due from the move itself.',
  },
  {
    version: 2,
    fingerprint: 'c2df681bee2a',
    note: 'S4 knowledge widening (2026-08-26): the response gains a `cuisines` facet per dish — the cooking tradition(s) the dish NAME itself entails (TRADITION TEST), stored as canonical facet=cuisine attribute ids in knowledge_cuisines. Re-opens every v1 stamp (the whole dish population owes a cuisine hearing).',
  },
];

export const DISH_KNOWLEDGE_RULE: ResolvedPromptRule = resolvePromptRule(
  'dish.knowledge_synthesize',
  'dish-knowledge-rule.ts',
  readPromptAsset(__dirname, 'dish-knowledge-prompt.md'),
  DISH_KNOWLEDGE_RULE_RELEASES,
);
