import { JudgeContract } from '../judge-contract';

/**
 * THE EXTRACTOR — reads posts, writes down who praised what. The one site
 * with the FULL ideal shape on the prompt side: llm_prompts registry
 * (ACTIVE v16, v17 candidate certified 173/173 ×3 at 337352b57),
 * fingerprint over text AND schema, activation as a governed switch,
 * shadow-replay iteration (the /reextract machinery).
 * Site verified: reddit-collector/extraction-pipeline.service.ts; the
 * observed-span contract (place-name-contract.ts) is its deterministic code
 * half — v17 law: spans must be literally present in the cited source.
 */
export const COLLECTION_EXTRACTOR_CONTRACT: JudgeContract = {
  plainName: 'the Extractor',
  lane: 'content_extraction',
  site: 'modules/content-processing/reddit-collector/extraction-pipeline.service.ts',
  promptKind: 'collection-prompt.md',
  rule: {
    unversionedRule:
      'No *-rule.ts — the registry version IS the rule identity here (prompt+schema fingerprinted together), which is the shape the others should converge to.',
  },
  claimKeySpec:
    'Per source document: collection_source_documents.active_extraction_run_id is the pointer (one ACTIVE extraction per doc; supersede = pointer flip).',
  foldParticipation: 'UNFOLDED',
  reopenOn: 'prompt_hash', // a registry activation re-extracts via shadow replay + pointer flip
  ledger: {
    ownTable:
      'collection_source_documents.active_extraction_run_id + extraction runs',
    why: 'Not a verdict lane — extraction is testimony transcription; the activation pointer is its buy-once memory.',
  },
  record: false,
  effectSeparation: true, // shadow runs never touch the live graph until activation
  responseSchema: {
    source:
      'modules/external-integrations/llm/prompts/llm-response-schemas.ts (extraction mentions schema; fingerprinted with the prompt by the registry)',
  },
  reasonPolicy: {
    none: 'Extraction emits mentions with quoted spans (the observed-span contract is the evidence-grounding mechanism), not per-verdict reasons.',
  },
  context:
    'Chunked source documents (LLM_CHUNK_MAX_DOCS=30, settled by the bundle-size experiment) — full post + comment text.',
  batching: 'batch_rail', // COLLECTION_LLM_MODE; batch is half price
  spend: {
    caller: 'content.extract',
    // Extraction submits Gemini batch jobs under this purpose
    // (extraction-pipeline.service.ts); the ledger tag is
    // gemini-batch.collection_extraction.
    batchPurposes: ['collection_extraction'],
    workClass: 'gemini.reddit_extraction',
  },
  failure: {
    posture: 'fail_closed',
    quarantine:
      'batch failure taxonomy + lease/quarantine machinery (07-08 audit)',
  },
  certSuite: {
    script: 'scripts/prompt-ab.ts',
    fixtures: 'scripts/fixtures/prompt-ab-cases.json',
  },
};
