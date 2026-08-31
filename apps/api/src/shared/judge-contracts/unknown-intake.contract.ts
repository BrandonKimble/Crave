import { JudgeContract } from '../judge-contract';

/**
 * UNKNOWN-SEARCH INTAKE (segmentation step) — one door for unknown search
 * text: staged residue is segmented by one interpretResidue call per
 * DISTINCT text, fold-known filtered, then (flag-gated) alias-matched via
 * the Same-Thing Judge (which is the entity_match contract's lane — one
 * matcher since the 2026-08-30 one-intake merge).
 * Site verified: search/unknown-search-intake.service.ts; the ONLY caller
 * of llm.service.ts interpretResidue ('residue.interpret').
 * NOTE: search QUERY UNDERSTANDING itself is zero-LLM (gazetteer-first,
 * ladder deleted 2026-08-02) and is deliberately NOT a contract here.
 */
export const UNKNOWN_INTAKE_CONTRACT: JudgeContract = {
  plainName: 'Unknown-Search Intake',
  lane: 'residue_segmentation',
  site: 'modules/search/unknown-search-intake.service.ts',
  promptKind: {
    unversioned:
      'D6 residue — residue-prompt.md loads from disk, outside llm_prompts.',
  },
  rule: { unversionedRule: 'No release file.' },
  claimKeySpec:
    'Distinct staged residue text (one interpret call per distinct text per drain).',
  foldParticipation: { noClaimKey: 'no ledger rows; dedupe is per-drain' },
  reopenOn: {
    final:
      'DECLARED DEBT: segmentation results are consumed inline; a prompt change never re-segments already-drained residue (usually harmless — the residue is gone — but undeclared until now).',
  },
  ledger: {
    unledgered:
      'Segmentation writes no verdict rows; outputs become on-demand requests / signals / banked aliases downstream.',
  },
  record: false,
  effectSeparation: true, // segmentation is read-only; effects go through the judge/demand rails
  responseSchema: {
    source:
      'modules/external-integrations/llm/prompts/llm-response-schemas.ts (residue interpretation schema)',
  },
  reasonPolicy: { none: 'Segmentation output only.' },
  context:
    'The raw unknown residue text, batch-drained by the 10-min cron — zero per-search LLM by design.',
  batching: 'interactive',
  spend: {
    caller: 'residue.interpret',
    workClass: 'gemini.interactive_pipeline',
  },
  failure: { posture: 'fail_closed' }, // undrained residue stays staged
  certSuite: {
    uncertified:
      'residue-ab-cases.json exists for A/B (scripts/fixtures/), but no standing gold ×3 gate.',
  },
};
