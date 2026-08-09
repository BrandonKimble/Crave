/**
 * FLIP-RATE PROBE — how stable is the vocabulary pass's WORD SET on identical
 * re-asks? Runs the v4 prompt and the v5 (rederived) prompt N times each over
 * the same concept batch and reports, per concept, how many DISTINCT alias
 * sets came back. 1 = deterministic. Read-only: no DB writes.
 *
 *   npx ts-node -T <this> --locale vi --runs 5
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

const A = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = A.indexOf(k);
  return i >= 0 ? A[i + 1] : d;
};
const LOCALE = arg('--locale', 'vi');
const RUNS = Number(arg('--runs', '5'));
const TEMP = Number(arg('--temp', '0.2'));

// The instability set: broad concepts where a locale genuinely has more than
// one real word (the shape that made vi flip), plus the dietary and
// proper-noun boundaries the prompt must not lose.
const CONCEPTS: Array<[string, string]> = [
  ['soup', 'food'],
  ['noodle soup', 'food'],
  ['salad', 'food'],
  ['spring roll', 'food'],
  ['egg roll', 'food'],
  ['rice', 'food'],
  ['porridge', 'food'],
  ['sandwich', 'food'],
  ['dumpling', 'food'],
  ['pancake', 'food'],
  ['grilled pork', 'food'],
  ['beef', 'ingredient'],
  ['shrimp', 'ingredient'],
  ['chicken', 'ingredient'],
  ['fish sauce', 'ingredient'],
  ['herbs', 'ingredient'],
  ['spicy', 'attribute'],
  ['vegetarian', 'attribute'],
  ['vegan', 'attribute'],
  ['grilled', 'attribute'],
];

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const { stopCronsForScript } = await import('../src/shared/utils/stop-crons');
  stopCronsForScript(app);
  const { LLMService } = await import(
    '../src/modules/external-integrations/llm/llm.service'
  );
  const vg = await import('../src/modules/entity-display/vocabulary-generator');
  const llm = app.get(LLMService);

  const batch = CONCEPTS.map(([name, entityType]) => ({
    entityId: `x-${name}`,
    name,
    entityType,
    locale: LOCALE,
  }));

  const buildV5 = vg.buildVocabularyPrompt;
  const buildV4 = buildV4Prompt;

  const results: Record<string, Map<string, string[]>> = {};
  for (const [tag, build] of [
    ['v4', buildV4],
    ['v5', buildV5],
  ] as const) {
    const perConcept = new Map<string, string[]>();
    for (let run = 0; run < RUNS; run += 1) {
      const text = await llm.generateForCaller({
        caller: 'labels.vocabulary',
        prompt: (build as (b: unknown) => string)(batch),
        generationConfig: {
          temperature: TEMP,
          responseMimeType: 'application/json',
          responseJsonSchema: vg.VOCABULARY_RESPONSE_SCHEMA,
        },
      });
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      const parsed = JSON.parse(text.slice(start, end + 1)) as {
        items?: Array<{
          n?: number;
          canonical_label?: string;
          aliases?: string[];
          abstain?: boolean;
        }>;
      };
      for (const item of parsed.items ?? []) {
        const idx = (item.n ?? 0) - 1;
        if (idx < 0 || idx >= CONCEPTS.length) continue;
        const key = CONCEPTS[idx][0];
        const set = item.abstain
          ? ['<abstain>']
          : Array.from(
              new Set(
                [item.canonical_label ?? '', ...(item.aliases ?? [])]
                  .map((s) => (s ?? '').trim().toLowerCase())
                  .filter(Boolean),
              ),
            ).sort();
        const arr = perConcept.get(key) ?? [];
        arr.push(set.join('|'));
        perConcept.set(key, arr);
      }
      process.stderr.write(`${tag} run ${run + 1}/${RUNS} done\n`);
    }
    results[tag] = perConcept;
  }

  let flipped4 = 0;
  let flipped5 = 0;
  const rows: string[] = [];
  for (const [name] of CONCEPTS) {
    const a = results.v4.get(name) ?? [];
    const b = results.v5.get(name) ?? [];
    const da = new Set(a).size;
    const db = new Set(b).size;
    if (da > 1) flipped4 += 1;
    if (db > 1) flipped5 += 1;
    rows.push(
      `${name.padEnd(14)} v4 distinct=${da}/${a.length}  v5 distinct=${db}/${b.length}`,
    );
    if (da > 1 || db > 1) {
      rows.push(`    v4: ${Array.from(new Set(a)).join('  ||  ')}`);
      rows.push(`    v5: ${Array.from(new Set(b)).join('  ||  ')}`);
    } else {
      rows.push(`    v4: ${a[0] ?? '-'}`);
      rows.push(`    v5: ${b[0] ?? '-'}`);
    }
  }
  process.stdout.write(rows.join('\n') + '\n');
  process.stdout.write(
    `\nLOCALE=${LOCALE} runs=${RUNS} temp=${TEMP}\n` +
      `v4 flip-rate: ${flipped4}/${CONCEPTS.length} = ${((100 * flipped4) / CONCEPTS.length).toFixed(1)}%\n` +
      `v5 flip-rate: ${flipped5}/${CONCEPTS.length} = ${((100 * flipped5) / CONCEPTS.length).toFixed(1)}%\n`,
  );
  await app.close();
}

/** v4 VERBATIM — the prompt as it stood before the rederivation. */
function buildV4Prompt(
  batch: ReadonlyArray<{
    name: string;
    entityType: string;
    locale: string;
    hint?: string;
  }>,
): string {
  const locale = batch[0].locale;
  return [
    `You are localizing a food-discovery app's CONCEPTS into the locale "${locale}".`,
    `For EACH numbered concept below, return how that concept is NAMED in ${locale}.`,
    ``,
    `Return per concept:`,
    `1. "canonical_label" — the single most natural way a native speaker sees this`,
    `   on a filter or chip in a food app (the most typical register and form).`,
    `2. "aliases" — every distinct way a native speaker would TYPE this exact`,
    `   concept when searching: gender variants, singular AND plural, and regional`,
    `   variants. This is what makes search work; be generous WITHIN the rules.`,
    `3. "description" — a short ${locale} gloss, max 8 words.`,
    ``,
    `HARD RULES — this is TRANSLATION, not association:`,
    `- An alias must be THIS concept expressed in ${locale}. A DIFFERENT but`,
    `  related concept is never an alias, not even in the same language:`,
    `  "caldo" (broth) is NOT an alias for "soup", and "pepperoni pizza" is NOT`,
    `  an alias for "cheese pizza". Near-synonyms are a relation, not a name.`,
    `- DIETARY AND RELIGIOUS TERMS ARE NEVER INTERCHANGEABLE. vegan is not`,
    `  vegetarian, halal is not kosher, gluten-free is not dairy-free, and`,
    `  neither direction is acceptable. If the concept name carries one of`,
    `  these, its ${locale} form must carry the SAME one: "vegan pizza" is`,
    `  "pizza vegana", never "pizza vegetariana". Someone eats by these words.`,
    `- If a word commonly ALSO means something else, OMIT it. A narrower, safer`,
    `  set beats a broader, ambiguous one — a wrong alias sends a user to the`,
    `  wrong food.`,
    `- Never translate a proper noun, brand or place name into a description of`,
    `  it. Return it unchanged and set "proper_noun": true.`,
    `- A word the culture uses untranslated stays untranslated ("sushi",`,
    `  "ramen", "taco", "brunch").`,
    `- If the concept is ALREADY in ${locale}, return it unchanged with any`,
    `  spelling/accent normalized, plus its inflections.`,
    `- If you are not confident this concept has a real ${locale} form, set`,
    `  "abstain": true with empty aliases. An omission costs nothing; an`,
    `  invention corrupts search.`,
    ``,
    `Return ONLY JSON matching the enforced schema, covering every input number.`,
    ``,
    ...batch.map(
      (request, index) =>
        `${index + 1}. ${request.name} [${request.entityType}]` +
        (request.hint ? ` (${request.hint})` : ''),
    ),
  ].join('\n');
}

void main();
