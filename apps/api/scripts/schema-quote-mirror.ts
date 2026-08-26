/**
 * THE QUOTE-MIRROR CHECK (schema-description policy, ratified 2026-08-14).
 *
 * A schema description has exactly two jobs: mechanical shape, and
 * distance-bridging — the governing rule's NAME plus a short VERBATIM quote,
 * for the emission moment that sits far from the rule text. The failure mode
 * this buys out: a description paraphrases doctrine, the prompt evolves, and
 * the decode layer quietly enforces a rule the prompt no longer states —
 * proven twice ("related food terms" caused cuisine-in-categories; a
 * well-meaning description rewrite regressed ghost-best 6/6 -> 1/3).
 *
 * The contract this script enforces, mechanically:
 *   - Every double-quoted span in a schema description that is marked as
 *     doctrine (backtick spans and example literals are exempt — see below)
 *     must appear VERBATIM in the paired prompt file(s).
 *   - Every named test referenced as `THE <X> TEST` must appear by that name
 *     in the paired prompt file(s).
 *
 * Exemptions, so the rule stays honest instead of noisy:
 *   - Quoted spans that are EXAMPLE LITERALS ("Best", "SRC001") rather than
 *     doctrine sentences: a span of <= 3 words is treated as an example and
 *     exempted. Doctrine travels as sentences; examples travel as tokens.
 *   - Schemas with no paired prompt (pure-mechanical lanes) declare `null`
 *     and are skipped for mirroring but still listed, so a new schema cannot
 *     dodge the audit by omission — adding a schema without adding a row
 *     here fails the check.
 *
 *   yarn ts-node -T scripts/schema-quote-mirror.ts          # check (exit 1 on drift)
 *   yarn ts-node -T scripts/schema-quote-mirror.ts --report # list every obligation
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schemas from '../src/modules/external-integrations/llm/prompts/llm-response-schemas';

const PROMPT_DIR = join(
  __dirname,
  '../src/modules/external-integrations/llm/prompts',
);

/**
 * Every exported *_JSON_SCHEMA must have a row. The value is the prompt
 * file(s) whose text governs that schema's lane — the mirror target(s).
 * `null` = the lane is pure-mechanical (no doctrine may appear in its
 * descriptions at all: any >3-word quoted span there is itself a failure).
 */
const PAIRS: Record<string, readonly string[] | null> = {
  SEARCH_QUERY_RESPONSE_JSON_SCHEMA: ['residue-prompt.md'],
  CUISINE_EXTRACTION_RESPONSE_JSON_SCHEMA: ['cuisine-prompt.md'],
  PLACE_CHOOSER_RESPONSE_JSON_SCHEMA: ['restaurant-place-chooser.prompt.ts'],
  MODERATION_RESPONSE_JSON_SCHEMA: ['moderation-prompt.md'],
  ATTRIBUTE_NAME_RESPONSE_JSON_SCHEMA: ['attribute-name-prompt.md'],
  ATTRIBUTE_PLACEMENT_RESPONSE_JSON_SCHEMA: ['attribute-placement-prompt.md'],
  ENTITY_MATCH_RESPONSE_JSON_SCHEMA: ['entity-match-prompt.md'],
  ENTITY_MATCH_BATCH_RESPONSE_JSON_SCHEMA: ['entity-match-prompt.md'],
  POLL_SUBJECT_RESPONSE_JSON_SCHEMA: ['poll-subject-prompt.md'],
  COLLECTION_RESPONSE_JSON_SCHEMA: [
    'collection-prompt.md',
    'collection-prompt.candidate.md',
  ],
  CUISINE_HUB_CLASSIFY_RESPONSE_JSON_SCHEMA: ['cuisine-hub-prompt.md'],
  RELEVANCE_GATE_RESPONSE_JSON_SCHEMA: ['relevance-gate-prompt.md'],
  DISH_KNOWLEDGE_RESPONSE_JSON_SCHEMA: ['dish-knowledge-prompt.md'],
};

type Obligation = {
  schema: string;
  path: string;
  kind: 'quote' | 'named-test';
  needle: string;
};

/**
 * KNOWN DRIFT, each entry with its death date. Two admissible reasons:
 * (1) the schema follows the CANDIDATE prompt's doctrine while the LIVE
 * prompt is an older registered version that activation will replace —
 * live prompt files are never edited outside the shadow->activation flow;
 * (2) the description belongs to a CERTIFIED prompt+schema pairing and
 * re-mirroring it is itself a behavior change that must wait for the next
 * certification window (proven 2026-08-17: aligning the item quote to the
 * rhino's rephrased C.1 line flipped V15h 6/6 -> 0/6 deterministically —
 * schema descriptions are load-bearing prompt text, which is why they are
 * folded into the fingerprint). An entry that STOPS drifting fails the
 * check too (a stale allowlist is its own lie).
 */
const KNOWN_DRIFT: ReadonlyArray<{
  path: string;
  file: string;
  needle: string;
  dies: string;
}> = [
  {
    path: 'COLLECTION_RESPONSE_JSON_SCHEMA.properties.mentions.items.anyOf.1.properties.item',
    file: 'collection-prompt.md',
    needle: 'THE ORDER TEST',
    dies: 'v15 activation replaces the v1 live prompt, which predates the named-test doctrine',
  },
  {
    path: 'COLLECTION_RESPONSE_JSON_SCHEMA.properties.mentions.items.anyOf.1.properties.item_attributes',
    file: 'collection-prompt.md',
    needle: 'THE STANDALONE TEST',
    dies: 'v15 activation replaces the v1 live prompt, which predates the named-test doctrine',
  },
  {
    path: 'COLLECTION_RESPONSE_JSON_SCHEMA.properties.mentions.items.anyOf.1.properties.item',
    file: 'collection-prompt.md',
    needle: 'anything orderable — drinks included',
    dies: 'v15 activation replaces the v1 live prompt, which predates the inclusive-scope clauses (owner/⭐05 consensus 2026-08-15)',
  },
  {
    path: 'COLLECTION_RESPONSE_JSON_SCHEMA.properties.mentions.items.anyOf.1.properties.item',
    file: 'collection-prompt.candidate.md',
    needle: 'anything orderable — drinks included',
    dies: 'v15 activation certifies the re-mirrored pairing as a whole (reason 2: the rhino C.1 rewrite rephrased this line; aligning the description now would change certified behavior — V15h 6/6 -> 0/6 measured 2026-08-17)',
  },
];

/** Prompts are hard-wrapped markdown: match with whitespace collapsed. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function collectDescriptions(
  node: unknown,
  path: string,
  out: Array<{ path: string; text: string }>,
): void {
  if (!node || typeof node !== 'object') return;
  const rec = node as Record<string, unknown>;
  if (typeof rec.description === 'string') {
    out.push({ path, text: rec.description });
  }
  for (const [key, value] of Object.entries(rec)) {
    if (key === 'description') continue;
    if (value && typeof value === 'object') {
      collectDescriptions(value, `${path}.${key}`, out);
    }
  }
}

function obligationsOf(schemaName: string, schema: unknown): Obligation[] {
  const descriptions: Array<{ path: string; text: string }> = [];
  collectDescriptions(schema, schemaName, descriptions);
  const out: Obligation[] = [];
  for (const { path, text } of descriptions) {
    for (const match of text.matchAll(/"([^"]+)"/g)) {
      const span = match[1];
      if (span.trim().split(/\s+/).length <= 3) continue; // example literal
      out.push({ schema: schemaName, path, kind: 'quote', needle: span });
    }
    for (const match of text.matchAll(/THE [A-Z][A-Z-]+(?: [A-Z-]+)* TEST/g)) {
      out.push({
        schema: schemaName,
        path,
        kind: 'named-test',
        needle: match[0],
      });
    }
  }
  return out;
}

function main(): void {
  const report = process.argv.includes('--report');
  const failures: string[] = [];

  const exported = Object.entries(schemas).filter(([name]) =>
    name.endsWith('_JSON_SCHEMA'),
  );
  for (const [name] of exported) {
    if (!(name in PAIRS)) {
      failures.push(
        `${name}: no PAIRS row — every schema must declare its prompt pairing (or null for pure-mechanical)`,
      );
    }
  }

  for (const [name, promptFiles] of Object.entries(PAIRS)) {
    const schema = (schemas as Record<string, unknown>)[name];
    if (!schema) {
      failures.push(`PAIRS names ${name} but the schema export is gone`);
      continue;
    }
    const obligations = obligationsOf(name, schema);
    if (promptFiles === null) {
      for (const o of obligations) {
        failures.push(
          `${o.path}: pure-mechanical lane carries doctrine (${o.kind}): "${o.needle}"`,
        );
      }
      continue;
    }
    const prompts = promptFiles.map((f) => ({
      file: f,
      text: normalize(readFileSync(join(PROMPT_DIR, f), 'utf-8')),
    }));
    for (const o of obligations) {
      if (report) {
        console.log(`${o.path} [${o.kind}] -> ${o.needle}`);
      }
      for (const p of prompts) {
        const excused = KNOWN_DRIFT.find(
          (k) =>
            k.path === o.path && k.file === p.file && k.needle === o.needle,
        );
        const found = p.text.includes(normalize(o.needle));
        if (!found && !excused) {
          failures.push(
            `${o.path}: ${o.kind} not found verbatim in ${p.file}: "${o.needle}"`,
          );
        }
        if (found && excused) {
          failures.push(
            `${o.path}: KNOWN_DRIFT entry is stale — "${o.needle}" now IS in ${p.file}; delete the entry (${excused.dies})`,
          );
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error(`\nQUOTE-MIRROR DRIFT (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('quote-mirror: every schema obligation is mirrored verbatim');
}

main();
