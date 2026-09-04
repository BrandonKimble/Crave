/**
 * @script-class: probe
 * @finding: banked per-run in the commit message of each prompt rederivation
 *   (2026-08-12: moderation v2, relevance-gate v2, poll-subject v2).
 *
 * GOLD-CASE A/B for the SMALL judge prompts — the prompt-ab.ts pattern
 * applied to the classifier lanes: moderation, relevance gate, poll subject,
 * and (prompt-fleet queue, 2026-08-12) the place chooser, dish knowledge,
 * cuisine, attribute placement, and vocabulary lanes. For .md-system-prompt
 * lanes the --live/--candidate files select the two texts; for BUILDER lanes
 * (chooser, vocabulary) the predecessor builder is pinned under
 * scripts/fixtures/ and the candidate is the current src import, so the file
 * args are ignored.
 *
 * prompt-ab.ts grades the collection prompt's `mentions`; nothing in it is
 * reusable for a boolean/enum classifier, and the canon requires that every
 * contested boundary be pinned by a REAL gold case on BOTH sides. This is that
 * harness for these three lanes: same shape (two prompt files, --repeat runs
 * per case, PASS/FLAKY/FAIL, explicit regression report), same law (goes
 * through LlmService — never a second Gemini client), never writes anything.
 *
 *   yarn workspace api ts-node scripts/prompt-gold.ts \
 *     --kind=moderation|relevance-gate|poll-subject \
 *     --case-file=scripts/fixtures/<kind>-gold-cases.json \
 *     --live=<path-to-old-prompt> --candidate=prompts/<kind>-prompt.md \
 *     [--repeat=3] [--only=<caseId>] [--out=<results.json>]
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { readFileSync, writeFileSync } from 'fs';
import { join, isAbsolute } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { GeminiCallerTag } from '../src/modules/external-integrations/llm/gemini-caller-profiles';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import {
  ATTRIBUTE_PLACEMENT_RESPONSE_JSON_SCHEMA,
  CUISINE_EXTRACTION_RESPONSE_JSON_SCHEMA,
  DISH_KNOWLEDGE_RESPONSE_JSON_SCHEMA,
  MODERATION_RESPONSE_JSON_SCHEMA,
  POLL_SUBJECT_RESPONSE_JSON_SCHEMA,
  RELEVANCE_GATE_RESPONSE_JSON_SCHEMA,
  PLACE_CHOOSER_RESPONSE_JSON_SCHEMA,
  jsonSchemaToTypedSchema,
} from '../src/modules/external-integrations/llm/prompts/llm-response-schemas';
import { buildPlaceChooserPrompt } from '../src/modules/external-integrations/llm/prompts/restaurant-place-chooser.prompt';
import { LLMPlaceChooserInput } from '../src/modules/external-integrations/llm/llm.types';
import {
  VOCABULARY_RESPONSE_SCHEMA,
  buildVocabularyPrompt,
} from '../src/modules/entity-display/vocabulary-generator';
import { LabelGenerationRequest } from '../src/modules/entity-display/label-generator';
import { buildPlaceChooserPromptPred } from './fixtures/restaurant-place-chooser.pred.prompt';
import {
  buildVocabularyPromptV4,
  buildVocabularyPromptV6,
} from './fixtures/vocabulary-v6-prompt';
import { buildVocabularyPromptV7 } from './fixtures/vocabulary-v7-prompt';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

const PROMPT_DIR = join(
  __dirname,
  '../src/modules/external-integrations/llm/prompts',
);

type Kind =
  | 'moderation'
  | 'relevance-gate'
  | 'poll-subject'
  | 'chooser'
  | 'dish-knowledge'
  | 'cuisine'
  | 'attribute-placement'
  | 'vocabulary';

type GoldCase = {
  id: string;
  /** Why this case exists — the boundary or fail-direction it pins. */
  why: string;
  /** moderation + poll-subject: the user text / poll question. */
  text?: string;
  /** relevance-gate: one post. */
  post?: { title: string; body?: string };
  /** chooser: the full production input (builder-rendered per variant). */
  chooserInput?: LLMPlaceChooserInput;
  /** dish-knowledge: one dish name. */
  dish?: string;
  /** cuisine: the editorial summary (may be empty — name-only venues). */
  summary?: string;
  /** cuisine: the venue's own name (first-class evidence, 2026-08-30). */
  venueName?: string;
  /** cuisine: the venue's Google place types (context for the judge). */
  types?: string[];
  /** attribute-placement: the term + vocabulary + candidate shortlist. */
  term?: string;
  attrKind?: 'place_attribute' | 'item_attribute';
  candidates?: Array<{ id: string; name: string }>;
  /** vocabulary: one concept (builder-rendered per variant). */
  concept?: {
    name: string;
    entityType: string;
    locale: string;
    hint?: string;
  };
  expect: {
    allowed?: boolean;
    keep?: boolean;
    mode?: 'ranked' | 'discussion';
    targetType?: 'dish' | 'place';
    constraintKind?: string;
    constraintValue?: string;
    anchor?: string | null;
    marketHint?: string | null;
    /** chooser */
    decision?: 'select' | 'reject';
    candidateId?: string;
    /** dish-knowledge */
    ingredients?: string[];
    notIngredients?: string[];
    aliases?: string[];
    notAliases?: string[];
    emptyIngredients?: boolean;
    emptyAliases?: boolean;
    /** cuisine (venue-facts lane) + dish-knowledge cuisine facet */
    cuisines?: string[];
    notCuisines?: string[];
    emptyCuisines?: boolean;
    /** dish-knowledge category facet (D4) */
    categories?: string[];
    notCategories?: string[];
    emptyCategories?: boolean;
    /** cuisine lane S4: venue attributes (THE FILTER TEST). */
    attributes?: string[];
    notAttributes?: string[];
    emptyAttributes?: boolean;
    /** attribute-placement */
    placement?: 'match' | 'new' | 'reject';
    matchCandidateId?: string;
    /** vocabulary */
    label?: string;
    notLabel?: string[];
    aliasesInclude?: string[];
    abstain?: boolean;
  };
};

const CALLER: Record<Kind, GeminiCallerTag> = {
  moderation: 'moderation.classify',
  'relevance-gate': 'relevance-gate.judgeBatch',
  'poll-subject': 'poll.infer_subject',
  chooser: 'places.choose_candidate',
  'dish-knowledge': 'dish.knowledge_synthesize',
  cuisine: 'cuisine.extract',
  'attribute-placement': 'attribute.place',
  vocabulary: 'labels.vocabulary',
};

/** Kinds whose prompt is a TS BUILDER, not an .md system instruction — the
 *  variant picks the builder (predecessor pinned in fixtures/), and the
 *  --live/--candidate file args are ignored. */
const BUILDER_KINDS: ReadonlySet<Kind> = new Set(['chooser', 'vocabulary']);

function payload(kind: Kind, testCase: GoldCase): string {
  if (kind === 'moderation') return JSON.stringify({ text: testCase.text });
  if (kind === 'poll-subject')
    return JSON.stringify({ question: testCase.text });
  if (kind === 'dish-knowledge')
    return JSON.stringify({ dishes: [{ index: 0, name: testCase.dish }] });
  if (kind === 'cuisine')
    return JSON.stringify({
      name: testCase.venueName ?? '',
      summary: testCase.summary ?? '',
      types: testCase.types ?? [],
    });
  if (kind === 'attribute-placement')
    return JSON.stringify({
      term: testCase.term,
      kind: testCase.attrKind,
      candidates: testCase.candidates ?? [],
    });
  return `## Posts\n\n${JSON.stringify([
    {
      index: 0,
      title: testCase.post?.title ?? '',
      body: testCase.post?.body ?? '',
    },
  ])}`;
}

/** For BUILDER_KINDS: render the full user prompt for the given variant. */
function builderPrompt(
  kind: Kind,
  variant: 'live' | 'candidate',
  testCase: GoldCase,
): string {
  if (kind === 'chooser') {
    const build =
      variant === 'live'
        ? buildPlaceChooserPromptPred
        : buildPlaceChooserPrompt;
    return build(testCase.chooserInput as LLMPlaceChooserInput);
  }
  const concept = testCase.concept!;
  const batch: LabelGenerationRequest[] = [
    {
      entityId: 'gold-case',
      entityType: concept.entityType,
      name: concept.name,
      locale: concept.locale,
      ...(concept.hint ? { hint: concept.hint } : {}),
    } as LabelGenerationRequest,
  ];
  if (variant === 'candidate') return buildVocabularyPrompt(batch);
  // --vocab-pred=v4 pins the sweep era that PRODUCED the measured drift;
  // --vocab-pred=v6 the pre-boundary-test era; default v7 is the immediate
  // predecessor text.
  return process.argv.includes('--vocab-pred=v4')
    ? buildVocabularyPromptV4(batch)
    : process.argv.includes('--vocab-pred=v6')
      ? buildVocabularyPromptV6(batch)
      : buildVocabularyPromptV7(batch);
}

function schemaFor(kind: Kind): Record<string, unknown> {
  if (kind === 'moderation')
    return { responseJsonSchema: MODERATION_RESPONSE_JSON_SCHEMA };
  if (kind === 'poll-subject')
    return { responseJsonSchema: POLL_SUBJECT_RESPONSE_JSON_SCHEMA };
  if (kind === 'chooser')
    return {
      responseJsonSchema: PLACE_CHOOSER_RESPONSE_JSON_SCHEMA,
    };
  if (kind === 'dish-knowledge')
    return { responseJsonSchema: DISH_KNOWLEDGE_RESPONSE_JSON_SCHEMA };
  if (kind === 'cuisine')
    return { responseJsonSchema: CUISINE_EXTRACTION_RESPONSE_JSON_SCHEMA };
  if (kind === 'attribute-placement')
    return { responseJsonSchema: ATTRIBUTE_PLACEMENT_RESPONSE_JSON_SCHEMA };
  if (kind === 'vocabulary')
    return { responseJsonSchema: VOCABULARY_RESPONSE_SCHEMA };
  return {
    responseSchema: jsonSchemaToTypedSchema(
      RELEVANCE_GATE_RESPONSE_JSON_SCHEMA,
    ),
  };
}

/** Enum comparison — underscores are SIGNIFICANT here (`restaurant_attribute`
 *  is not `restaurant attribute`); norm() below is for free-text values. */
function normEnum(value: unknown): string {
  return (typeof value === 'string' ? value : '').toLowerCase().trim();
}

function norm(value: unknown): string {
  // Unicode-aware (same lesson as prompt-ab.ts, multilingual ruling R6): the
  // vocabulary gold set carries vi/es needles, and an ascii-only class would
  // reduce "bò" to "b". Identical behavior for ascii values.
  return (typeof value === 'string' ? value : '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Grade one raw model response against the case. */
function grade(
  kind: Kind,
  testCase: GoldCase,
  raw: Record<string, unknown>,
): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  const expect = testCase.expect;

  if (kind === 'moderation') {
    // Same default-allow reading the service uses (parseModerationResponse).
    const allowed = raw.allowed !== false;
    if (expect.allowed !== undefined && allowed !== expect.allowed)
      failures.push(
        `expected allowed=${expect.allowed}, got ${allowed} (reason="${norm(raw.reason)}")`,
      );
  } else if (kind === 'relevance-gate') {
    const verdicts = Array.isArray(raw)
      ? (raw as unknown[])
      : ((raw.verdicts as unknown[]) ?? []);
    const first = verdicts[0] as
      | { keep?: unknown; reason?: unknown }
      | undefined;
    if (!first) failures.push('no verdict returned');
    else {
      const keep = Boolean(first.keep);
      if (expect.keep !== undefined && keep !== expect.keep)
        failures.push(
          `expected keep=${expect.keep}, got ${keep} (reason="${norm(first.reason)}")`,
        );
    }
  } else if (kind === 'chooser') {
    const decision = raw.decision === 'select' ? 'select' : 'reject';
    if (expect.decision && decision !== expect.decision)
      failures.push(
        `expected decision=${expect.decision}, got ${decision} (reason="${norm(raw.reason)}")`,
      );
    if (
      expect.candidateId &&
      normEnum(raw.candidateId) !== normEnum(expect.candidateId)
    )
      failures.push(
        `expected candidateId=${expect.candidateId}, got ${normEnum(raw.candidateId)}`,
      );
  } else if (kind === 'dish-knowledge') {
    const first = (
      Array.isArray(raw.dishes) ? (raw.dishes as unknown[])[0] : undefined
    ) as
      | {
          ingredients?: unknown;
          aliases?: unknown;
          cuisines?: unknown;
          categories?: unknown;
        }
      | undefined;
    const list = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter((v): v is string => typeof v === 'string').map(norm)
        : [];
    const ingredients = list(first?.ingredients);
    const aliases = list(first?.aliases);
    for (const want of expect.ingredients ?? [])
      if (!ingredients.includes(norm(want)))
        failures.push(
          `missing ingredient "${want}" (got: ${ingredients.join(', ')})`,
        );
    for (const banned of expect.notIngredients ?? [])
      if (ingredients.includes(norm(banned)))
        failures.push(`FORBIDDEN ingredient "${banned}"`);
    for (const want of expect.aliases ?? [])
      if (!aliases.includes(norm(want)))
        failures.push(`missing alias "${want}" (got: ${aliases.join(', ')})`);
    for (const banned of expect.notAliases ?? [])
      if (aliases.includes(norm(banned)))
        failures.push(`FORBIDDEN alias "${banned}"`);
    if (expect.emptyIngredients && ingredients.length)
      failures.push(
        `expected EMPTY ingredients, got: ${ingredients.join(', ')}`,
      );
    if (expect.emptyAliases && aliases.length)
      failures.push(`expected EMPTY aliases, got: ${aliases.join(', ')}`);
    // S4 cuisine facet: the same expectation fields the cuisine lane uses.
    const dishCuisines = list(first?.cuisines);
    for (const want of expect.cuisines ?? [])
      if (!dishCuisines.includes(norm(want)))
        failures.push(
          `missing cuisine "${want}" (got: ${dishCuisines.join(', ') || 'nothing'})`,
        );
    for (const banned of expect.notCuisines ?? [])
      if (dishCuisines.includes(norm(banned)))
        failures.push(`FORBIDDEN cuisine "${banned}"`);
    if (expect.emptyCuisines && dishCuisines.length)
      failures.push(`expected EMPTY cuisines, got: ${dishCuisines.join(', ')}`);
    // D4 category facet: broader orderable dish classes from the NAME.
    const dishCategories = list(first?.categories);
    for (const want of expect.categories ?? [])
      if (!dishCategories.includes(norm(want)))
        failures.push(
          `missing category "${want}" (got: ${dishCategories.join(', ') || 'nothing'})`,
        );
    for (const banned of expect.notCategories ?? [])
      if (dishCategories.includes(norm(banned)))
        failures.push(`FORBIDDEN category "${banned}"`);
    if (expect.emptyCategories && dishCategories.length)
      failures.push(
        `expected EMPTY categories, got: ${dishCategories.join(', ')}`,
      );
  } else if (kind === 'cuisine') {
    const cuisines = (
      Array.isArray(raw.cuisines) ? (raw.cuisines as unknown[]) : []
    )
      .filter((v): v is string => typeof v === 'string')
      .map(norm);
    for (const want of expect.cuisines ?? [])
      if (!cuisines.includes(norm(want)))
        failures.push(
          `missing cuisine "${want}" (got: ${cuisines.join(', ') || 'nothing'})`,
        );
    for (const banned of expect.notCuisines ?? [])
      if (cuisines.includes(norm(banned)))
        failures.push(`FORBIDDEN cuisine "${banned}"`);
    if (expect.emptyCuisines && cuisines.length)
      failures.push(`expected EMPTY cuisines, got: ${cuisines.join(', ')}`);
    // S4 venue-facts widening: the attributes array (THE FILTER TEST).
    const attrs = (
      Array.isArray(raw.attributes) ? (raw.attributes as unknown[]) : []
    )
      .filter((v): v is string => typeof v === 'string')
      .map(norm);
    for (const want of expect.attributes ?? [])
      if (!attrs.includes(norm(want)))
        failures.push(
          `missing attribute "${want}" (got: ${attrs.join(', ') || 'nothing'})`,
        );
    for (const banned of expect.notAttributes ?? [])
      if (attrs.includes(norm(banned)))
        failures.push(`FORBIDDEN attribute "${banned}"`);
    if (expect.emptyAttributes && attrs.length)
      failures.push(`expected EMPTY attributes, got: ${attrs.join(', ')}`);
  } else if (kind === 'attribute-placement') {
    const decision = normEnum(raw.decision);
    if (expect.placement && decision !== expect.placement)
      failures.push(
        `expected decision=${expect.placement}, got ${decision} (reason="${norm(raw.reason)}")`,
      );
    // candidate_id is an INTEGER in the enforced schema — stringify to compare.
    const rawId = raw.candidate_id;
    const gotId =
      typeof rawId === 'number' || typeof rawId === 'string'
        ? String(rawId)
        : '';
    if (expect.matchCandidateId && gotId !== String(expect.matchCandidateId))
      failures.push(
        `expected candidate_id=${expect.matchCandidateId}, got ${gotId || 'null'}`,
      );
  } else if (kind === 'vocabulary') {
    const first = (
      Array.isArray(raw.items) ? (raw.items as unknown[])[0] : undefined
    ) as
      | { canonical_label?: unknown; aliases?: unknown; abstain?: unknown }
      | undefined;
    const label = norm(first?.canonical_label);
    const aliases = (Array.isArray(first?.aliases) ? first.aliases : [])
      .filter((v): v is string => typeof v === 'string')
      .map(norm);
    if (expect.abstain !== undefined) {
      const abstained = first?.abstain === true;
      if (abstained !== expect.abstain)
        failures.push(`expected abstain=${expect.abstain}, got ${abstained}`);
    }
    if (expect.label && label !== norm(expect.label))
      failures.push(`expected label="${expect.label}", got "${label}"`);
    // notLabel bans the LABEL only: the measured drift class was the display
    // label renaming to a neighbour ("gyro" -> "gyro meat"); a material word
    // appearing among typed aliases is a different (and sometimes true) claim.
    for (const banned of expect.notLabel ?? [])
      if (label === norm(banned))
        failures.push(`FORBIDDEN label "${banned}" (the drift name)`);
    for (const want of expect.aliasesInclude ?? [])
      if (!aliases.includes(norm(want)))
        failures.push(`missing alias "${want}" (got: ${aliases.join(', ')})`);
    // notAliases bans the SET (v8 orthographic gold): a wrong abbreviation
    // expansion or a proper-noun translation banked as an alias is a wrong
    // recall surface at confidence 1.0.
    for (const banned of expect.notAliases ?? [])
      if (aliases.includes(norm(banned)))
        failures.push(`FORBIDDEN alias "${banned}"`);
  } else {
    const mode = raw.mode === 'ranked' ? 'ranked' : 'discussion';
    if (expect.mode && mode !== expect.mode)
      failures.push(`expected mode=${expect.mode}, got ${mode}`);
    const axis = (raw.axis ?? null) as Record<string, unknown> | null;
    if (expect.targetType && normEnum(axis?.target_type) !== expect.targetType)
      failures.push(
        `expected target_type=${expect.targetType}, got ${norm(axis?.target_type)}`,
      );
    const constraint = (axis?.constraint ?? null) as Record<
      string,
      unknown
    > | null;
    if (
      expect.constraintKind &&
      normEnum(constraint?.kind) !== expect.constraintKind
    )
      failures.push(
        `expected constraint.kind=${expect.constraintKind}, got ${norm(constraint?.kind)}`,
      );
    if (
      expect.constraintValue &&
      !norm(constraint?.value).includes(norm(expect.constraintValue))
    )
      failures.push(
        `expected constraint.value~${expect.constraintValue}, got ${norm(constraint?.value)}`,
      );
    if (expect.anchor && !norm(axis?.anchor).includes(norm(expect.anchor)))
      failures.push(
        `expected anchor~${expect.anchor}, got ${norm(axis?.anchor)}`,
      );
    if (expect.anchor === null && axis?.anchor)
      failures.push(`expected anchor=null, got ${norm(axis?.anchor)}`);
    if (
      expect.marketHint &&
      !norm(axis?.market_hint).includes(norm(expect.marketHint))
    )
      failures.push(
        `expected market_hint~${expect.marketHint}, got ${norm(axis?.market_hint)}`,
      );
  }
  return { pass: failures.length === 0, failures };
}

async function runOnce(
  llm: LLMService,
  kind: Kind,
  variant: 'live' | 'candidate',
  systemPrompts: { live: string; candidate: string } | null,
  testCase: GoldCase,
): Promise<Record<string, unknown>> {
  const text = await llm.generateForCaller({
    caller: CALLER[kind],
    ...(systemPrompts ? { systemInstruction: systemPrompts[variant] } : {}),
    prompt: systemPrompts
      ? payload(kind, testCase)
      : builderPrompt(kind, variant, testCase),
    maxRetries: 0,
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      ...schemaFor(kind),
    },
  });
  const start = text.indexOf('{');
  const arrayStart = text.indexOf('[');
  const from =
    start >= 0 && (arrayStart < 0 || start < arrayStart) ? start : arrayStart;
  return JSON.parse(from >= 0 ? text.slice(from) : text || '{}') as Record<
    string,
    unknown
  >;
}

function resolvePrompt(value: string): string {
  return isAbsolute(value)
    ? value
    : join(PROMPT_DIR, value.replace(/^prompts\//, ''));
}

async function main(): Promise<void> {
  const arg = (name: string, fallback?: string): string | undefined => {
    const found = process.argv.find((a) => a.startsWith(`--${name}=`));
    return found ? found.split('=').slice(1).join('=') : fallback;
  };

  const kind = arg('kind') as Kind | undefined;
  if (!kind || !CALLER[kind])
    throw new Error(`--kind=${Object.keys(CALLER).join('|')} is required`);
  const caseFile = arg('case-file');
  if (!caseFile) throw new Error('--case-file=<path> is required');
  const repeat = parseInt(arg('repeat', '3') as string, 10);
  const only = arg('only');
  const outFile = arg('out');

  const isBuilderKind = BUILDER_KINDS.has(kind);
  const livePath = isBuilderKind
    ? '(builder: predecessor pinned in scripts/fixtures/)'
    : resolvePrompt(arg('live', `${kind}-prompt.md`) as string);
  const candidatePath = isBuilderKind
    ? '(builder: current src import)'
    : resolvePrompt(arg('candidate', `${kind}-prompt.md`) as string);
  const prompts = isBuilderKind
    ? null
    : {
        live: readFileSync(livePath, 'utf-8'),
        candidate: readFileSync(candidatePath, 'utf-8'),
      };
  let cases = JSON.parse(readFileSync(caseFile, 'utf-8')) as GoldCase[];
  if (only) cases = cases.filter((c) => c.id === only);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  stopCronsForScript(app);
  const llm = app.get(LLMService);

  console.log(
    `\nPROMPT GOLD (${kind}) — ${cases.length} cases x ${repeat} runs x 2 prompts = ${cases.length * repeat * 2} calls`,
  );
  console.log(`live=${livePath}\ncandidate=${candidatePath}\n`);

  type Unit = {
    testCase: GoldCase;
    variant: 'live' | 'candidate';
    run: number;
  };
  const units: Unit[] = [];
  for (const testCase of cases)
    for (const variant of ['live', 'candidate'] as const)
      for (let i = 0; i < repeat; i += 1)
        units.push({ testCase, variant, run: i });

  const key = (c: string, v: string) => `${c}::${v}`;
  const outcomes = new Map<
    string,
    { raw?: Record<string, unknown>; error?: string }[]
  >();
  units.forEach((u) => {
    const k = key(u.testCase.id, u.variant);
    if (!outcomes.has(k)) outcomes.set(k, []);
  });

  const CONCURRENCY = 6;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const unit = units[cursor++];
        if (!unit) return;
        const k = key(unit.testCase.id, unit.variant);
        try {
          const raw = await runOnce(
            llm,
            kind,
            unit.variant,
            prompts,
            unit.testCase,
          );
          outcomes.get(k)!.push({ raw });
        } catch (error) {
          outcomes.get(k)!.push({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }),
  );

  const results: Array<Record<string, unknown>> = [];
  for (const testCase of cases) {
    const row: Record<string, unknown> = { id: testCase.id, why: testCase.why };
    for (const variant of ['live', 'candidate'] as const) {
      let passes = 0;
      const allFailures: string[] = [];
      let sample: Record<string, unknown> | undefined;
      for (const outcome of outcomes.get(key(testCase.id, variant)) ?? []) {
        if (outcome.error) {
          allFailures.push(`ERROR: ${outcome.error}`);
          continue;
        }
        sample ??= outcome.raw;
        const graded = grade(kind, testCase, outcome.raw ?? {});
        if (graded.pass) passes += 1;
        else allFailures.push(...graded.failures);
      }
      row[variant] = {
        passes,
        of: repeat,
        verdict: passes === repeat ? 'PASS' : passes === 0 ? 'FAIL' : 'FLAKY',
        failures: Array.from(new Set(allFailures)).slice(0, 6),
        sample,
      };
    }
    const liveVerdict = (row.live as { verdict: string }).verdict;
    const candVerdict = (row.candidate as { verdict: string }).verdict;
    const arrow =
      liveVerdict === candVerdict
        ? '  ='
        : candVerdict === 'PASS'
          ? ' ✅'
          : liveVerdict === 'PASS'
            ? ' ❌REGRESSION'
            : '  ~';
    console.log(
      `${testCase.id.padEnd(34)} live=${liveVerdict.padEnd(6)} candidate=${candVerdict.padEnd(6)}${arrow}`,
    );
    (row.candidate as { failures: string[] }).failures.forEach((f) =>
      console.log(`      candidate: ${f}`),
    );
    (row.live as { failures: string[] }).failures.forEach((f) =>
      console.log(`      live:      ${f}`),
    );
    results.push(row);
  }

  const summary = (variant: 'live' | 'candidate') => {
    const counts = { PASS: 0, FLAKY: 0, FAIL: 0 } as Record<string, number>;
    results.forEach((r) => {
      counts[(r[variant] as { verdict: string }).verdict] += 1;
    });
    return counts;
  };
  console.log('\n--- SUMMARY ---');
  console.log('live     ', JSON.stringify(summary('live')));
  console.log('candidate', JSON.stringify(summary('candidate')));
  const regressions = results.filter(
    (r) =>
      (r.live as { verdict: string }).verdict === 'PASS' &&
      (r.candidate as { verdict: string }).verdict !== 'PASS',
  );
  if (regressions.length)
    console.log(
      `\n❌ ${regressions.length} REGRESSION(S): ${regressions.map((r) => r.id).join(', ')}`,
    );
  const wins = results.filter(
    (r) =>
      (r.live as { verdict: string }).verdict !== 'PASS' &&
      (r.candidate as { verdict: string }).verdict === 'PASS',
  );
  if (wins.length)
    console.log(
      `✅ ${wins.length} FIX(ES): ${wins.map((r) => r.id).join(', ')}`,
    );

  if (outFile) {
    writeFileSync(outFile, JSON.stringify(results, null, 2));
    console.log(`\nwrote ${outFile}`);
  }
  await app.close();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
