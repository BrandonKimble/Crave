// p-limit is ESM-only; jest's CJS transform chokes on it when the pipeline
// service's import chain pulls in llm-concurrent-processing. Stub it — this
// spec never runs concurrent LLM work.
jest.mock('p-limit', () => ({
  __esModule: true,
  default:
    () =>
    (fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
      Promise.resolve(fn(...args)),
}));

import {
  ContractRefusalRow,
  ExtractionPipelineService,
} from './extraction-pipeline.service';
import { CollectionEvidenceService } from './collection-evidence.service';
import type {
  LLMMention,
  LLMPost,
  LLMProcessingInput,
} from '../../external-integrations/llm/llm.types';

/**
 * CONTEXT-ONLY DOCUMENTS (reply-chain windows, 2026-09-04). A window
 * carries its ancestor chain as `context_only` comments (and a
 * context-riding post body as extract_from_post=false). Three laws:
 *   1. a context-only source is never a `source_id` — a mention emitted
 *      FROM it is a banked refusal, never data and never a quarantine;
 *   2. a context-only source MAY be the `place_source_id` — that is where
 *      "the one on Burnet" was named, and the span check verifies against
 *      its text exactly as for any source;
 *   3. an input's document links (its coverage claims) are written only
 *      for the documents it emits for.
 */

function buildPipeline(): ExtractionPipelineService {
  const service = new ExtractionPipelineService(
    { setContext: jest.fn().mockReturnThis() } as never,
    {} as never,
    {} as never,
    { getSystemPrompt: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { markDirty: jest.fn() } as never,
    { emit: jest.fn() } as never,
  );
  (service as unknown as { logger: unknown }).logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return service;
}

// Post p1; c1 (top, names the place) -> c2 (context-only ancestor in this
// window) -> c3 (the window's emitting comment: "+1, get the brisket").
const llmPosts: LLMPost[] = [
  {
    id: 'p1',
    title: 'Best brisket in town?',
    content: 'Looking for brisket recs around Mueller.',
    comments: [
      {
        id: 'c1',
        parent_id: 'p1',
        content: "Franklin's, obviously.",
        score: 9,
      },
      { id: 'c2', parent_id: 'c1', content: 'Worth the line?', score: 2 },
      { id: 'c3', parent_id: 'c2', content: '+1, get the brisket.', score: 5 },
    ],
  } as unknown as LLMPost,
];

const sourceMap = {
  SRC001: { canonical_id: 'p1', source_type: 'post' },
  SRC002: { canonical_id: 'c1', source_type: 'comment' },
  SRC003: { canonical_id: 'c2', source_type: 'comment' },
  SRC004: { canonical_id: 'c3', source_type: 'comment' },
} as const;

/** The window the model saw: post as context, c1 + c2 context-only, c3 emits. */
const windowInput: LLMProcessingInput = {
  posts: [
    {
      id: 'SRC001',
      extract_from_post: false,
      title: 'Best brisket in town?',
      content: 'Looking for brisket recs around Mueller.',
      comments: [
        {
          id: 'SRC002',
          parent_id: 'SRC001',
          content: "Franklin's, obviously.",
          context_only: true,
        },
        {
          id: 'SRC003',
          parent_id: 'SRC002',
          content: 'Worth the line?',
          context_only: true,
        },
        { id: 'SRC004', parent_id: 'SRC003', content: '+1, get the brisket.' },
      ],
    },
  ],
  source_map: sourceMap,
} as unknown as LLMProcessingInput;

function admit(mention: Partial<LLMMention>): {
  admitted: { place_source_id: string; source_id: string } | null;
  refusals: ContractRefusalRow[];
} {
  const service = buildPipeline();
  const enrichment = (
    service as unknown as {
      buildSourceEnrichmentMaps: (posts: LLMPost[]) => unknown;
    }
  ).buildSourceEnrichmentMaps(llmPosts);
  const refusals: ContractRefusalRow[] = [];
  const admitted = (
    service as unknown as {
      admitWireMention: (
        wireMention: unknown,
        chunkResult: unknown,
        enrichment: unknown,
        extractionInputId: string | null,
        sourceDocumentIdBySourceKey: Map<string, string>,
        refusals: ContractRefusalRow[],
      ) => { place_source_id: string; source_id: string } | null;
    }
  ).admitWireMention(
    { temp_id: 't1', item: 'brisket', ...mention },
    { chunkId: 'chunk_0', input: windowInput },
    enrichment,
    null,
    new Map(),
    refusals,
  );
  return { admitted, refusals };
}

describe('context-only sources in admitWireMention', () => {
  it('ACCEPTS a place_source_id that points at a context-only ancestor (the span is verified against its text)', () => {
    const { admitted, refusals } = admit({
      source_id: 'SRC004',
      place_observed: "franklin's",
      place_source_id: 'SRC002',
    });
    expect(refusals).toHaveLength(0);
    expect(admitted).toMatchObject({ source_id: 'c3', place_source_id: 'c1' });
  });

  it('REFUSES (banks) a mention whose source_id is a context-only ancestor', () => {
    const { admitted, refusals } = admit({
      source_id: 'SRC002',
      place_observed: "franklin's",
      place_source_id: 'SRC002',
    });
    expect(admitted).toBeNull();
    expect(refusals).toHaveLength(1);
    expect(refusals[0].reason).toBe('source_is_context_only');
  });

  it('REFUSES (banks) a mention emitted from a context-riding post body', () => {
    const { admitted, refusals } = admit({
      source_id: 'SRC001',
      place_observed: "franklin's",
      place_source_id: 'SRC002',
    });
    expect(admitted).toBeNull();
    expect(refusals[0].reason).toBe('source_is_context_only');
  });
});

describe('input→document links are coverage claims for EMITTING documents only', () => {
  it('links the emitting comment, never the context-only ancestors or the context-riding post', () => {
    const docIds = new Map<string, string>([
      ['post:p1', 'doc-p1'],
      ['comment:c1', 'doc-c1'],
      ['comment:c2', 'doc-c2'],
      ['comment:c3', 'doc-c3'],
    ]);
    const links = (
      CollectionEvidenceService.prototype as unknown as {
        buildInputDocumentLinks: (
          input: LLMProcessingInput,
          map: Map<string, string>,
        ) => Array<{ documentId: string; ordinal: number }>;
      }
    ).buildInputDocumentLinks(windowInput, docIds);
    expect(links).toEqual([{ documentId: 'doc-c3', ordinal: 0 }]);
  });

  it('links the post body when the window extracts from it', () => {
    const docIds = new Map<string, string>([
      ['post:p1', 'doc-p1'],
      ['comment:c3', 'doc-c3'],
    ]);
    const input = {
      ...windowInput,
      posts: [{ ...windowInput.posts[0], extract_from_post: true }],
    } as LLMProcessingInput;
    const links = (
      CollectionEvidenceService.prototype as unknown as {
        buildInputDocumentLinks: (
          input: LLMProcessingInput,
          map: Map<string, string>,
        ) => Array<{ documentId: string; ordinal: number }>;
      }
    ).buildInputDocumentLinks(input, docIds);
    expect(links.map((l) => l.documentId)).toEqual(['doc-p1', 'doc-c3']);
  });
});
