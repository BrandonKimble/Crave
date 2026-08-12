/**
 * @script-class: probe
 * @finding: vocabulary-pass word-set instability on identical re-asks — the
 *   flip that motivated "the pass ENUMERATES and the judge decides"
 *   (d85def24b). Kept so that finding stays reproducible per locale.
 *
 * FLIP-RATE PROBE — how stable is the vocabulary pass's WORD SET on identical
 * re-asks? Runs the PREVIOUS prompt version and the LIVE one N times each over
 * the same concept batch and reports, per concept, how many DISTINCT alias
 * sets came back. 1 = deterministic. Read-only: no DB writes.
 *
 *   npx ts-node -T <this> --locale vi --runs 5
 *
 * THE BASELINE ARM MOVES WITH THE PROMPT. It was v4-verbatim while v5 was
 * live; it is v5-verbatim now that v6 is. A version bump that changes what
 * the corpus should contain re-pins its predecessor here, so the probe always
 * answers "what did this change do", not "what did some 2026-08-09 change
 * do". v6 (2026-08-12) added the BARE HEAD NOUN to the completeness
 * definition, so the run also reports HEAD-NOUN COVERAGE: whether the short
 * form a speaker types alone ('bò', not only 'thịt bò') is in the set.
 *
 * v6 RESULT, vi, runs=5 temp=0.2, two independent rounds:
 *   HEAD NOUNS — every-run coverage 6/10 -> 9/10, both rounds. The headline
 *     gap closes outright: beef 0/5 -> 5/5 ('thịt bò' -> 'bò, thịt bò'),
 *     chicken 3-4/5 -> 5/5, duck 3-4/5 -> 5/5. `pork` is the one that does
 *     not: 'heo' appears on 1-2 of 5 asks, because Vietnamese has TWO
 *     regional words for the animal (heo/lợn) and the model keeps the
 *     compound when it lists both. Recorded, not papered over.
 *   FLIP — prev {7, 6} of 27, live {5, 8} of 27. The two arms overlap: v6
 *     neither stabilises nor destabilises the pass, it moves inside v5's own
 *     noise. NOTE FOR WHOEVER READS v5's HEADLINE: the "~0% flip" figure v5
 *     was banked on does NOT reproduce today on this set — v5 itself flips
 *     22-26% here, on the same concepts, at the same temperature, under
 *     gemini-3-flash-preview. The flippers are the genuinely multi-word
 *     concepts (pancake, herbs, vegan, noodle soup), not the head nouns.
 *   BOUNDARIES — dietary never crosses (vegetarian 'chay|ăn chay', vegan
 *     'thuần chay|vegan', in every run of both arms). The first draft of the
 *     v6 bullet DID break the concept boundary: it read the short form as
 *     "any part of the name", so grilled pork came back 'thịt nướng'
 *     (grilled MEAT) on 5 of 5 runs. The bullet now says which part — keep
 *     the DISTINGUISHING word, drop the generic one — and grilled pork is
 *     byte-identical to v5's answer again. That failure is why the bullet
 *     carries an example of the wrong direction.
 *   es (runs=3): a near no-op, which is the correct answer — Spanish has no
 *     classifier construction to shorten, and already returned the bare
 *     'res' and 'cerdo' under v5. Word sets unchanged concept for concept;
 *     grilled pork, vegan and vegetarian all identical.
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
// HEAD-NOUN GAPS, measured on v5 before the change: each of these is a
// concept whose vi name is a compound ('thịt bò') and whose BARE head noun
// ('bò') is what a speaker types. The expected short form is stated so the
// probe can show red per concept rather than by eye.
const HEAD_NOUN_EXPECTED: Record<string, Record<string, string>> = {
  vi: {
    beef: 'bò',
    chicken: 'gà',
    pork: 'heo',
    fish: 'cá',
    shrimp: 'tôm',
    crab: 'cua',
    duck: 'vịt',
    egg: 'trứng',
    tofu: 'đậu hũ',
    snail: 'ốc',
  },
};

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
  // The head-noun class (v6). 'beef', 'chicken' and 'shrimp' are already
  // above; these complete the ten the change was measured on.
  ['pork', 'ingredient'],
  ['fish', 'ingredient'],
  ['crab', 'ingredient'],
  ['duck', 'ingredient'],
  ['egg', 'ingredient'],
  ['tofu', 'ingredient'],
  ['snail', 'ingredient'],
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

  const buildLive = vg.buildVocabularyPrompt;
  const buildPrev = buildV5Prompt;

  const results: Record<string, Map<string, string[]>> = {};
  for (const [tag, build] of [
    ['prev', buildPrev],
    ['live', buildLive],
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
    const a = results.prev.get(name) ?? [];
    const b = results.live.get(name) ?? [];
    const da = new Set(a).size;
    const db = new Set(b).size;
    if (da > 1) flipped4 += 1;
    if (db > 1) flipped5 += 1;
    rows.push(
      `${name.padEnd(14)} prev distinct=${da}/${a.length}  live distinct=${db}/${b.length}`,
    );
    if (da > 1 || db > 1) {
      rows.push(`    prev: ${Array.from(new Set(a)).join('  ||  ')}`);
      rows.push(`    live: ${Array.from(new Set(b)).join('  ||  ')}`);
    } else {
      rows.push(`    prev: ${a[0] ?? '-'}`);
      rows.push(`    live: ${b[0] ?? '-'}`);
    }
  }

  // HEAD-NOUN COVERAGE (v6). A run COVERS the concept when the bare head noun
  // is one of the words returned; the rate is over runs, so a word that shows
  // up on 3 of 5 asks reads as 3/5 and not as a pass.
  const expected = HEAD_NOUN_EXPECTED[LOCALE.split('-')[0]] ?? {};
  const headRows: string[] = [];
  let prevCovered = 0;
  let liveCovered = 0;
  const headNames = Object.keys(expected).filter((n) =>
    CONCEPTS.some(([c]) => c === n),
  );
  for (const name of headNames) {
    const want = expected[name].toLowerCase();
    const hits = (arr: string[]) =>
      arr.filter((joined) => joined.split('|').includes(want)).length;
    const a = results.prev.get(name) ?? [];
    const b = results.live.get(name) ?? [];
    const ha = hits(a);
    const hb = hits(b);
    if (ha === a.length && a.length > 0) prevCovered += 1;
    if (hb === b.length && b.length > 0) liveCovered += 1;
    headRows.push(
      `${name.padEnd(10)} want '${want}'  prev ${ha}/${a.length}  live ${hb}/${b.length}`,
    );
  }
  rows.push('', '=== HEAD-NOUN COVERAGE (bare form a speaker types alone) ===');
  rows.push(...headRows);
  rows.push(
    `every-run coverage: prev ${prevCovered}/${headNames.length}  live ${liveCovered}/${headNames.length}`,
  );
  process.stdout.write(rows.join('\n') + '\n');
  process.stdout.write(
    `\nLOCALE=${LOCALE} runs=${RUNS} temp=${TEMP}\n` +
      `v4 flip-rate: ${flipped4}/${CONCEPTS.length} = ${((100 * flipped4) / CONCEPTS.length).toFixed(1)}%\n` +
      `v5 flip-rate: ${flipped5}/${CONCEPTS.length} = ${((100 * flipped5) / CONCEPTS.length).toFixed(1)}%\n`,
  );
  await app.close();
}

/** v5 VERBATIM — the prompt as it stood before the v6 completeness change.
 *  Identical to the live builder except that it lacks the SHORT-FORM bullet.
 *  (The v4 arm this probe used to carry is in git history at d85def24b^.) */
function buildV5Prompt(
  batch: ReadonlyArray<{
    name: string;
    entityType: string;
    locale: string;
    hint?: string;
  }>,
): string {
  const locale = batch[0].locale;
  return [
    `You give a food-discovery app's CONCEPTS their words in the locale`,
    `"${locale}". For each numbered concept below, report how ${locale}`,
    `speakers name it.`,
    ``,
    `THE LENS — one person, doing two things. They READ a chip or filter in a`,
    `food app, and they TYPE into its search box. What they read is one word:`,
    `the one they would use themselves, in the register a menu uses. What they`,
    `type is anything at all — whichever of their words came to mind, however`,
    `they inflect it. Answer for that person, not for a dictionary.`,
    ``,
    `THE DECISION RULE — you ENUMERATE, you do not CURATE. "aliases" is the`,
    `COMPLETE set of words ${locale} speakers really type for this exact`,
    `concept, ORDERED most-common first, and "canonical_label" is the first of`,
    `them. Completeness is not a matter of taste:`,
    `- If two or more words are BOTH in real use for the concept, list BOTH.`,
    `  Never pick a favourite and drop the rest — the ordering already says`,
    `  which is most common, and a word you leave out is a search that returns`,
    `  nothing.`,
    `- List every FORM of each word a speaker would type: gender variants,`,
    `  singular and plural, and regional variants.`,
    `- Write each word the way the locale properly writes it, accents and all.`,
    `  The app matches accent-insensitively on its own, so a de-accented`,
    `  respelling is not another word and does not belong in the list.`,
    `- A word being ambiguous is NOT a reason to omit it. When two concepts`,
    `  claim the same word, a later stage that can see both of them decides`,
    `  who gets it. You cannot see the other concept, so do not try — report`,
    `  what speakers say and let that stage do its work.`,
    `- Ask the same question twice and the answer must be the same set. If you`,
    `  find yourself weighing whether a real word is worth including, it is.`,
    ``,
    `THE BOUNDARY — a word must NAME this concept, not merely sit near it. The`,
    `test: a speaker who typed it, and was shown this concept, would think`,
    `"yes, that is the thing I asked for" — not "close, but I asked for`,
    `something else". A neighbouring concept fails that test even in the same`,
    `language: "caldo" (broth) does not name soup, and "pepperoni pizza" does`,
    `not name cheese pizza. Relatedness is a relation between two concepts;`,
    `this pass reports the names of one.`,
    ``,
    `WHERE BEING WRONG HURTS A PERSON — the two cases that override everything`,
    `above:`,
    `- DIETARY AND RELIGIOUS TERMS ARE NEVER INTERCHANGEABLE. vegan is not`,
    `  vegetarian, halal is not kosher, gluten-free is not dairy-free, and`,
    `  neither direction is acceptable. If the concept carries one of these,`,
    `  every ${locale} form of it must carry the SAME one: "vegan pizza" is`,
    `  "pizza vegana", never "pizza vegetariana". Someone eats by these words.`,
    `- INVENTION IS WORSE THAN SILENCE. If you do not actually know that`,
    `  ${locale} speakers have a word for this, set "abstain": true with empty`,
    `  aliases. A concept left unnamed is asked again later; a fabricated word`,
    `  is indistinguishable from a real one forever after.`,
    ``,
    `NAMES THAT ARE ALREADY THE ANSWER:`,
    `- A proper noun, brand or place name is its own name in every language.`,
    `  Return it unchanged, never described or translated, and set`,
    `  "proper_noun": true.`,
    `- A word the culture has taken in untranslated stays untranslated`,
    `  ("sushi", "ramen", "taco", "brunch") — that IS what speakers type.`,
    `- A concept already in ${locale} keeps its word, spelled properly, plus`,
    `  its other forms.`,
    ``,
    `Also return "description": a short ${locale} gloss, max 8 words.`,
    ``,
    `THE CONCEPTS:`,
    ...batch.map(
      (request, index) =>
        `${index + 1}. ${request.name} [${request.entityType}]` +
        (request.hint ? ` (${request.hint})` : ''),
    ),
    ``,
    `Return ONLY JSON matching the enforced schema, one item per number above,`,
    `covering every one of them.`,
  ].join('\n');
}

void main();
