import { Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { EntityTextSearchService } from '../entity-text-search/entity-text-search.service';
import type { TextMatchEvidence } from '../entity-text-search/entity-text-search.service';

export interface EntitySearchResult {
  entityId: string;
  name: string;
  type: EntityType;
  similarity: number;
  evidence: TextMatchEvidence;
}

// Below this length a query is a fragment ("sh") with no meaningful embedding —
// prefix/lexical matching owns that range, so the dense lane stays gated.
const MIN_DENSE_QUERY_LENGTH = 3;

// Type-ahead confidence is the lexical EVIDENCE TIER, in bounded bands — NOT a
// max() of non-commensurate lane scores. The gaps are wide enough that the
// downstream popularity/affinity boost (≤1.35×) only re-ranks WITHIN a tier,
// never across it: a prefix (0.9) can never lose to an infix/fuzzy hit no matter
// how popular. `weak` (levenshtein-only — the ham/rum class) and `phonetic`
// (dmetaphone) are dropped from type-ahead entirely (undefined ⇒ filtered).
const EVIDENCE_CONFIDENCE: Partial<Record<TextMatchEvidence, number>> = {
  exact: 1.0,
  prefix: 0.9, // name starts with what you typed — the strongest type-ahead signal
  name: 0.6, // FTS token match inside the name
  contains: 0.55, // typed term is a whole word of the name ("ram" ⊂ "banh it ram")
  alias: 0.6,
  fuzzy: 0.4,
  edit: 0.4, // within edit budget ("piza"→"pizza") — same band as fuzzy
  embedding: 0.35, // pure semantic (post-commit only); surfaces below any lexical hit
};

@Injectable()
export class EntitySearchService {
  constructor(private readonly textSearch: EntityTextSearchService) {}

  /**
   * Hybrid recall for autocomplete. The dense (semantic) lane is useless — and
   * noisy — on a half-typed token: you want prefix matches for "ra", not concept
   * neighbors ("ra" has no stable meaning to embed). So it runs ONLY after a
   * committed word. Confidence is the lexical evidence TIER (not a max() of lane
   * scores), so a true prefix always outranks an infix / fuzzy / semantic hit.
   */
  async searchEntitiesHybrid(
    term: string,
    entityTypes: EntityType[],
    limit: number,
  ): Promise<EntitySearchResult[]> {
    // Dense on ONLY after a committed word: ≥1 completed token AND the current
    // tail is empty (trailing space) or itself long enough to embed (≥3 chars).
    // A bare fragment ("ram") stays lexical/prefix-only — no fragment-noise, and
    // no wasted embedding call on the hot per-keystroke path.
    const raw = term ?? '';
    const endsWithSpace = /\s$/.test(raw);
    const tokens = raw.trim().split(/\s+/).filter(Boolean);
    const completedTokens = endsWithSpace ? tokens.length : tokens.length - 1;
    const tail = endsWithSpace ? '' : (tokens[tokens.length - 1] ?? '');
    const denseMode =
      completedTokens >= 1 &&
      (tail.length === 0 || tail.length >= MIN_DENSE_QUERY_LENGTH)
        ? 'always'
        : 'none';
    const candidates = await this.textSearch.retrieveCandidates(
      term,
      entityTypes,
      limit,
      {
        denseMode,
      },
    );
    return candidates.flatMap((c) => {
      const evidence = c.sparseEvidence ?? 'embedding';
      const confidence = EVIDENCE_CONFIDENCE[evidence];
      if (confidence === undefined) {
        return []; // weak / phonetic → not a type-ahead suggestion
      }
      return [
        {
          entityId: c.entityId,
          name: c.name,
          type: c.type,
          similarity: confidence,
          evidence,
        },
      ];
    });
  }

  async searchAttributeAutocompleteEntities(
    term: string,
    entityTypes: EntityType[],
    limit: number,
  ): Promise<EntitySearchResult[]> {
    const matches = await this.textSearch.searchAttributeAutocompleteEntities(
      term,
      entityTypes,
      limit,
    );
    return matches.map((row) => ({
      entityId: row.entityId,
      name: row.name,
      type: row.type,
      similarity: row.similarity,
      evidence: row.evidence,
    }));
  }
}
