import { JudgeContract } from '../judge-contract';

/**
 * PHOTO IS-FOOD GATE — Gemini vision classifying an approved photo as
 * food-vs-not. Site verified: photos/photo-vision.service.ts (caller
 * 'photos.is_food'). THE INLINE PROMPT: the one classifier whose prompt is
 * not a file in prompts/ at all — invisible to prompt-dir audits (map
 * "inline prompt" flag). Safety moderation is Vision SafeSearch — separate,
 * fail-closed, not an LLM lane.
 */
export const PHOTO_IS_FOOD_CONTRACT: JudgeContract = {
  plainName: 'Photo Is-Food Gate',
  lane: 'photos_is_food',
  site: 'modules/photos/photo-vision.service.ts',
  promptKind: {
    inline:
      'Prompt is a string literal in photo-vision.service.ts — not an .md, not in llm_prompts, invisible to prompt-dir audits.',
  },
  rule: { unversionedRule: 'No release file.' },
  claimKeySpec: 'None — one classification per photo.',
  foldParticipation: { noClaimKey: 'per-photo, never re-asked' },
  reopenOn: {
    final:
      'Permanent by accident — a prompt change never re-classifies old photos; nobody has ruled that intended.',
    debt: true,
  },
  ledger: { unledgered: 'Topicality status lands on the photo row only.' },
  record: false,
  effectSeparation: { violated: 'Verdict writes the status directly.' },
  responseSchema: {
    unschemad:
      'Vision call parses a free-text/loose response — no schema-forced structured output.',
  },
  reasonPolicy: { none: 'Boolean topicality only.' },
  context: 'The thumb variant image bytes; no text evidence.',
  batching: 'interactive',
  spend: { caller: 'photos.is_food', workClass: 'gemini.interactive_pipeline' },
  failure: { posture: 'fail_open' }, // errors keep the photo visible (safety is SafeSearch's job)
  certSuite: { uncertified: 'No gold ×3 gate.' },
};
