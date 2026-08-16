import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * THE 40TH NAME-EMISSION CANNOT APPEAR.
 *
 * Same shape as extraction-scope-lockdown.spec.ts and
 * gemini-gateway-lockdown.spec.ts: a boundary that a code review cannot hold
 * on its own gets an executable frozen list.
 *
 * THE LAW (N10/A3): a concept's `name` is its CANONICAL ENGLISH STRING, not a
 * display string. Any file that renders `<something>.name` into a field a
 * human reads is either
 *   (a) routed through EntityDisplayService — the ONE display function; or
 *   (b) emitting a PROPER NOUN or a SOURCE-FAITHFUL surface form
 *       (restaurants, dishes, places, user text), which the plan's NEVER list
 *       forbids translating at all; or
 *   (c) not user-facing (pipeline, ops, LLM plumbing, write-time fallbacks).
 *
 * Every file below is classified. A NEW file emitting `name: x.name` fails
 * this spec, and the fix is to classify it — which forces the author to
 * answer "is this a concept a Spanish user will read?" exactly once, at the
 * moment they can still answer it cheaply. At 574 attributes that question is
 * free; at 8,272 renamed concept nouns it is archaeology.
 *
 * PROVEN RED: delete any entry from ALLOWLIST, or add a `name: entity.name`
 * emission to a file not listed, and this fails.
 */

const SRC = join(__dirname, '..', '..');

/**
 * The emission shape: a DISPLAY-ISH DTO field assigned from some object's
 * `.name`. Deliberately narrow — it is the shape that puts a stored name in
 * front of a user, and a broad "mentions .name" scan would be noise nobody
 * maintains.
 */
const EMISSION_SOURCE = String.raw`(?<![\w.])(?:name|label|subLabel|title|placeName|itemName|displayName)\s*:\s*[A-Za-z_$][\w$]*(?:\??\.[\w$]+)*\.name\b`;

/** A FRESH regex per file: a shared /g regex carries `lastIndex` between
 *  `.test()` calls and silently skips files (it did, on the first run). */
const emits = (text: string): boolean => new RegExp(EMISSION_SOURCE).test(text);

type Verdict = 'routed' | 'proper-noun' | 'not-user-facing';

/** file (relative to src/) → why it is allowed to emit a raw `.name`. */
const ALLOWLIST: Readonly<Record<string, { verdict: Verdict; why: string }>> = {
  'modules/content-processing/entity-resolver/restaurant-name-hearing.service.ts':
    {
      verdict: 'not-user-facing',
      why: 'the restaurant-name court — entity names go onto the evidence card shown to the JUDGE LLM (the sanctioned evidence-card use), never a user DTO',
    },
  'modules/external-integrations/llm/entity-match-prompt.ts': {
    verdict: 'not-user-facing',
    why: 'the entity-match judge payload — candidate names/aliases go to the JUDGE LLM as evidence (same sanctioned class as the hearing court), never a user DTO',
  },
  'modules/content-processing/entity-resolver/word-claim-adjudicator.service.ts':
    {
      verdict: 'not-user-facing',
      why: 'claim-judge LLM plumbing — entity names go into the adjudication prompt and log lines, never a user DTO',
    },
  'modules/entity-display/entity-display.service.ts': {
    verdict: 'routed',
    why: 'THE display function itself — canonical-name fallback and submitToken emission are its contract',
  },
  // ---------------- (a) ROUTED through the display function ----------------
  'modules/autocomplete/autocomplete.service.ts': {
    verdict: 'routed',
    why: 'lanes build canonical rows; localizeMatches() localizes the whole response and attaches submitToken',
  },
  'modules/autocomplete/entity-search.service.ts': {
    verdict: 'routed',
    why: 'recall core — returns canonical names to autocomplete, which is the display boundary',
  },
  'modules/home/home-feed.service.ts': {
    verdict: 'routed',
    why: 'N6: titles render via renderListTitles(); item labels are dish/restaurant proper nouns',
  },
  'modules/polls/polls.service.ts': {
    verdict: 'routed',
    why: 'D1: templated questions render via localizePollQuestions(); user prose is never rendered',
  },
  'modules/search/search.controller.ts': {
    verdict: 'routed',
    why: 'the tag-chip localizer itself',
  },
  'modules/entity-display/label-sweep.service.ts': {
    verdict: 'routed',
    why: 'the display layer — it WRITES labels',
  },

  // ---------------- (b) PROPER NOUNS / source-faithful surfaces -------------
  'modules/places/live-cities.reader.ts': {
    verdict: 'proper-noun',
    why: 'place names',
  },
  'modules/places/places.controller.ts': {
    verdict: 'proper-noun',
    why: 'place names',
  },
  'modules/places/viewport-verdict.service.ts': {
    verdict: 'proper-noun',
    why: 'place names',
  },
  'modules/polls/restaurant-mentions.service.ts': {
    verdict: 'proper-noun',
    why: 'restaurant names',
  },
  'modules/restaurant-enrichment/restaurant-entity-merge.service.ts': {
    verdict: 'proper-noun',
    why: 'restaurant names (and N2/A4: a localized displayName lands as a tagged alias, never over `name`)',
  },
  'modules/restaurant-enrichment/restaurant-location-enrichment.service.ts': {
    verdict: 'proper-noun',
    why: 'restaurant/location names from Places',
  },
  'modules/user-lists/user-list.mappers.ts': {
    verdict: 'proper-noun',
    why: 'USER DATA — a saved list keeps the name its owner gave it',
  },
  'modules/user-lists/user-lists.service.ts': {
    verdict: 'proper-noun',
    why: 'USER DATA — list names and saved restaurant/dish names',
  },
  'modules/user-lists/user-list-provisioning.service.ts': {
    verdict: 'proper-noun',
    why: 'USER DATA — default list names at provisioning',
  },

  // ---------------- (c) NOT USER-FACING ------------------------------------
  'modules/attribute-ontology/attribute-ontology.service.ts': {
    verdict: 'not-user-facing',
    why: 'the ontology worker — canonical identity work, and the one place renames happen',
  },
  'modules/search/demand-vocabulary.service.ts': {
    verdict: 'not-user-facing',
    why: 'offline demand->vocabulary sweep — candidate names go INTO the identity-judge prompt and never reach a user; its output is an alias row',
  },
  'modules/content-processing/entity-resolver/concept-satisfies.service.ts': {
    verdict: 'not-user-facing',
    why: 'offline substitutability pass — canonical names go INTO an LLM prompt and never reach a user; the verdict it stores is a pair of entity ids, not a name',
  },
  'modules/content-processing/entity-resolver/dish-knowledge-synthesis.service.ts':
    {
      verdict: 'not-user-facing',
      why: 'offline synthesis prompt inputs',
    },
  'modules/content-processing/entity-resolver/entity-resolution.service.ts': {
    verdict: 'not-user-facing',
    why: 'resolver internals',
  },
  'modules/content-processing/entity-resolver/food-dedupe-merge.service.ts': {
    verdict: 'not-user-facing',
    why: 'merge/fold internals',
  },
  'modules/content-processing/reddit-collector/archive/archive-stream-processor.service.ts':
    {
      verdict: 'not-user-facing',
      why: 'archive file/stream names',
    },
  'modules/content-processing/reddit-collector/archive/archive-zstd-decompressor.service.ts':
    {
      verdict: 'not-user-facing',
      why: 'archive file names',
    },
  'modules/content-processing/reddit-collector/collector-source-registry.service.ts':
    {
      verdict: 'not-user-facing',
      why: 'collection source names',
    },
  'modules/content-processing/reddit-collector/keyword-search-orchestrator.service.ts':
    {
      verdict: 'not-user-facing',
      why: 'collection orchestration',
    },
  'modules/entity-text-search/entity-text-search.service.ts': {
    verdict: 'not-user-facing',
    why: 'the MATCHER — canonical strings by law',
  },
  'modules/entity-text-search/gazetteer-spans.ts': {
    verdict: 'not-user-facing',
    why: 'the MATCHER — grounding spans',
  },
  'modules/external-integrations/governance/pool-registry.ts': {
    verdict: 'not-user-facing',
    why: 'infra pool names',
  },
  'modules/external-integrations/llm/gemini-context-cache.registry.ts': {
    verdict: 'not-user-facing',
    why: 'cache/model names',
  },
  'modules/external-integrations/llm/llm.service.ts': {
    verdict: 'not-user-facing',
    why: 'prompt inputs and model names',
  },
  'modules/external-integrations/shared/spend-campaign.service.ts': {
    verdict: 'not-user-facing',
    why: 'campaign names (ops)',
  },
  'modules/home/curated-list-builder.service.ts': {
    verdict: 'not-user-facing',
    why: 'WRITE-time fallback strings only — the read renders from the recipe (N6)',
  },
  'modules/ops-dashboard/ops-summary.service.ts': {
    verdict: 'not-user-facing',
    why: 'internal ops dashboard',
  },
  'modules/polls/poll-entity-seed.service.ts': {
    verdict: 'not-user-facing',
    why: 'entity seeding at poll creation — resolution, not display',
  },
  'modules/polls/supply/poll-weekly-ritual.service.ts': {
    verdict: 'not-user-facing',
    why: 'WRITE-time templated titles, marked title_source=template and re-rendered at read (D1)',
  },
  'modules/restaurant-enrichment/restaurant-cuisine-extraction.service.ts': {
    verdict: 'not-user-facing',
    why: 'matches extracted cuisine strings against attribute names + banked recall surfaces — resolution, not display (the raw SELECT that trips the scanner arrived when core_entities.aliases[] was retired)',
  },
  'modules/search/engine-coverage.service.ts': {
    verdict: 'not-user-facing',
    why: 'coverage/ops reads',
  },
  'modules/search/search-entity-expansion.service.ts': {
    verdict: 'not-user-facing',
    why: 'query expansion — canonical strings',
  },
  'modules/search/search-query.executor.ts': {
    verdict: 'not-user-facing',
    why: 'builds canonical rows; chips are localized at the controller boundary',
  },
  'modules/search/search.service.ts': {
    verdict: 'not-user-facing',
    why: 'orchestration over canonical rows',
  },
  'modules/signals/signal-demand-read.service.ts': {
    verdict: 'not-user-facing',
    why: 'the demand ledger (A10: term subjects gain a lang tag in the i18n phase)',
  },
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

function emittingFiles(): string[] {
  return walk(SRC)
    .filter((file) => emits(readFileSync(file, 'utf-8')))
    .map((file) =>
      file
        .slice(SRC.length + 1)
        .split('\\')
        .join('/'),
    )
    .sort();
}

describe('concept display is routed through ONE function (N10 lockdown)', () => {
  it('every file emitting a raw entity name into a DTO field is classified', () => {
    const found = emittingFiles();
    const unclassified = found.filter((file) => !(file in ALLOWLIST));
    // The message is the point: this failure should teach, not just fail.
    const hint =
      'A new user-facing name emission appeared. Either route it through EntityDisplayService.displayLabel/localizeRows, or add it to ALLOWLIST with the reason it is a proper noun / not user-facing.';
    expect({ unclassified, hint }).toEqual({ unclassified: [], hint });
  });

  it('the allowlist has no stale entries (a deleted site must leave the list)', () => {
    const found = new Set(emittingFiles());
    const stale = Object.keys(ALLOWLIST).filter((file) => !found.has(file));
    expect(stale).toEqual([]);
  });

  it('the display function exists and is the only thing that reads entity_surface for display', () => {
    const service = readFileSync(
      join(SRC, 'modules/entity-display/entity-display.service.ts'),
      'utf-8',
    );
    expect(service).toContain('displayLabel(');
    expect(service).toContain('entitySurface.findMany');

    // The DISPLAY predicate: recall-only surfaces are never rendered, and
    // labels are scoped by the ONE locale chain.
    //
    // The gate follows the MECHANISM, not a spelling. This used to assert the
    // literal `role: { not: 'recall' }` in this service — which passed for as
    // long as the predicate was hand-written here, i.e. for exactly as long
    // as the defect it was meant to prevent (a second locale semantics living
    // in this file) was present. The predicate now lives in the locale read
    // door, so the gate asserts BOTH halves of the real invariant: this
    // service reads through the door, and the door still excludes recall
    // rows. Break either half and this goes red; a hand-rolled predicate
    // reappearing here fails the door assertion.
    expect(service).toContain('displayScopeWhere(locale)');
    const door = readFileSync(
      join(SRC, 'shared/locale/surface-scope.ts'),
      'utf-8',
    );
    expect(door).toContain("role: { not: 'recall' }");
    expect(door).toContain('localeLookupChain');

    const otherReaders = walk(SRC)
      .filter((file) => !file.includes('entity-display'))
      .filter((file) =>
        readFileSync(file, 'utf-8').includes('entitySurface.findMany'),
      )
      .map((file) => file.slice(SRC.length + 1));
    expect(otherReaders).toEqual([]);
  });

  it('every localized read surface also emits a submit token (the matching dependency)', () => {
    // Round 4: the attribute-tap submits the DISPLAYED string. A localized
    // name with no canonical token is a silent match break.
    const autocompleteDto = readFileSync(
      join(SRC, 'modules/autocomplete/dto/autocomplete.dto.ts'),
      'utf-8',
    );
    expect(autocompleteDto).toContain('submitToken');

    for (const file of [
      'modules/autocomplete/autocomplete.service.ts',
      'modules/search/search.controller.ts',
    ]) {
      expect(readFileSync(join(SRC, file), 'utf-8')).toContain('submitToken');
    }
  });
});
