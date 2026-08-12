import { Injectable } from '@nestjs/common';
import { PooledBatchRunner } from '../external-integrations/llm/pooled-batch-runner';
import { LoggerService } from '../../shared';
import {
  type GeneratedLabel,
  type GenerationOptions,
  type GenerationOutcome,
  type LabelGenerationRequest,
  type LabelGenerator,
} from './label-generator';

/**
 * THE VOCABULARY GENERATOR — the real implementation of the LabelGenerator
 * seam, and the highest-value item in the concept-graph plan.
 *
 * MEASURED, not asserted: one pass of this shape over the 110 concepts the
 * Spanish gold corpus expects moved the launch gate from 77.3% to 96.7%
 * (single_noun 75.0 -> 97.5, compound 50.0 -> 96.7, attribute 70.0 -> 100),
 * flipping three of four threshold clauses GREEN. Failure analysis of the
 * pre-pass state found MISSING_CONCEPT = 0 and 27 of 34 failures were
 * "the concept exists, it just has no alias in this language" — which is
 * exactly what this produces.
 *
 * IT EMITS LABELS **AND** ALIASES. One judgment about one concept in one
 * language, so paying for it twice would be waste; they are stored apart
 * because display and matching have different laws.
 *
 * WHY THE PROMPT IS STRICTLY TRANSLATIONAL (P0-c). The same measured run
 * produced exactly one regression: `soup -> caldo` and `caldo -> sopa`, two
 * same-language near-synonyms emitted as aliases. `caldo` already existed as
 * an entity NAME, so the inferred surface ground a different concept at
 * confidence 1.0. A near-synonym is a RELATION, not a translation; it belongs
 * to the substitutability pass. An advisory "omit ambiguous words" did not
 * prevent it, so the rule here is structural — and P0-b's collision guard is
 * the deterministic backstop underneath.
 *
 * NO CONSENSUS SAMPLING — AND THE REASON IS THE PROMPT, NOT LUCK (corrected
 * 2026-08-09). The "100% agreement, 3 runs x 6 anchors" measurement that used
 * to justify this line was taken on SPANISH ONLY, and it did not generalize:
 * on Vietnamese the same pass answered `soup` with `súp` one run and
 * `canh, súp` the next, flipping the word SET on 60% of identical re-asks.
 * That was never model noise. v4's prompt asked the generator to CURATE —
 * "be generous WITHIN the rules", then "if a word commonly ALSO means
 * something else, OMIT it" — an instruction to make a judgment call with no
 * stated threshold, so the call came out differently every draw. Consensus
 * sampling would have averaged a coin flip and paid three times for it.
 * v5 removes the choice instead: the generator ENUMERATES (every word a
 * speaker really types, most common first), and the word-claim adjudicator —
 * which exists, and is the only thing in the system that can see BOTH
 * claimants — decides ownership. A single draw is right when the question
 * has one answer.
 */
/** Bumped when prompt WORDING changes what the corpus should contain.
 *  v1 = pre-gender-complete labels (implicit, DB default); v2 = the
 *  gender/plural-complete + dietary-boundary prompt. The sweep re-offers
 *  labels below this — one re-pay per bump. */
export const VOCABULARY_PROMPT_VERSION = 6;
// v6 (2026-08-12): THE COMPLETENESS DEFINITION GREW THE CASE IT WAS MISSING —
// the BARE HEAD NOUN. v5 defined completeness as every word a speaker really
// types and then enumerated the axes it expected them to vary along: gender,
// number, region. Every one of those is an INFLECTION of a whole name, and
// the case that matters most in Vietnamese is a SHORTENING of one: v5 returns
// 'thịt bò' for beef and never 'bò', 'thịt gà' and never 'gà' — while 'bò' is
// what a speaker actually types. This is not a new rule bolted on; it is the
// same definition ("the words they really type") applied to a word that is
// shorter than the name rather than a variant form of it, and it is bounded
// by the BOUNDARY test that was already there — the short form is in only if
// it names THIS concept alone. The missing-vocabulary crisis was exactly
// these words, so the omission was the expensive kind.
// v5 (2026-08-09): THE PROMPT REDERIVED — the pass stopped curating and
// started enumerating. v4 was a task statement followed by six HARD RULES
// accreted one measured failure at a time (caldo, the dietary boundary, the
// proper-noun case), and two of them contradicted each other: "be generous"
// versus "if a word commonly ALSO means something else, OMIT it". Asked to be
// generous and cautious at once with no test for either, the model re-decided
// per draw — measured 60% word-SET flip on identical re-asks in vi, where the
// competing words are real (canh/súp) rather than the near-duplicates Spanish
// offered. v5 states the lens first (a speaker reading a chip, and the same
// speaker typing into a search box), then makes completeness a DEFINITION
// rather than a taste — every word that speaker really types, most common
// first, label = the first of them — and hands the ambiguity question to the
// judge that was built for it. The dietary boundary survives verbatim: it is
// the one rule that is a principle, not a curation call.
// v4 (2026-08-09): again not a wording change — THE CLAIM UNIT BECAME THE FORM.
// The guard adjudicated on the accent-destroying recall fold, so in Vietnamese
// (where tone marks are phonemic) every offer collided with an unrelated word:
// bò/bơ/bó are one folded `bo`, and the top-frequency vocabulary — bò, canh,
// cháo, chả, nem, gỏi, cuốn, nóng — lost hearings that were never real. Those
// surfaces are bankable now, so the pass owes every concept one re-offer. Same
// shape as v3, one law down.
// v3 (2026-08-06): not a wording change — the collision guard became
// same-type-only (the `picante` ruling), so surfaces v2 offered and the old
// guard refused are now bankable. The version is the PASS's output contract,
// not just the prompt text.

@Injectable()
export class VocabularyGenerator implements LabelGenerator {
  readonly name = 'llm-vocabulary';
  /** It really asks — every concept it is handed is a question posed to the
   *  model, so every one of them belongs in the run ledger. */
  readonly dryRun = false;

  /** Concepts per LLM call. Matches the sibling knowledge pass's batch size. */
  private static readonly PER_CALL = 20;

  private readonly logger: LoggerService;

  constructor(
    private readonly pooled: PooledBatchRunner,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('VocabularyGenerator');
  }

  async generate(
    requests: readonly LabelGenerationRequest[],
    options?: GenerationOptions,
  ): Promise<GenerationOutcome> {
    // POOLED BATCH, one job for the whole sweep (prompt-fleet audit
    // 2026-08-11): nobody awaits a label interactively — the sweep is
    // watermark-driven — so this lane pays batch rates (half the sync
    // price; 1,573 sync calls last 30d). An unanswered chunk yields
    // NOTHING for those concepts — never a fabricated label, and never a
    // ledgered ask: unanswered ids are REPORTED so the sweep's KL-A
    // watermark keeps them due (the no-fake-estimates law, applied to
    // text). The rail's deadline arrives here as options.deadlineAt and
    // becomes the pooled runner's bounded wait — the runner cancels the
    // provider job at expiry, so a wedged batch can neither bill for
    // unread work nor hold the rail past its own period.
    const chunks: Array<readonly LabelGenerationRequest[]> = [];
    for (let i = 0; i < requests.length; i += VocabularyGenerator.PER_CALL) {
      chunks.push(requests.slice(i, i + VocabularyGenerator.PER_CALL));
    }
    const unanswered = new Set<string>();
    if (!chunks.length) return { labels: [], unanswered };
    const remainingMs = options?.deadlineAt
      ? options.deadlineAt - Date.now()
      : null;
    if (remainingMs !== null && remainingMs <= 0) {
      // The deadline elapsed before any ask was posed: nothing was asked,
      // so EVERYTHING is unanswered and nothing may be ledgered.
      for (const request of requests) unanswered.add(request.entityId);
      return { labels: [], unanswered };
    }
    const responses = await this.pooled.generateMany({
      caller: 'labels.vocabulary',
      items: chunks.map((chunk, index) => ({
        key: `chunk-${index}`,
        prompt: buildVocabularyPrompt(chunk),
      })),
      generationConfig: {
        // ZERO, NOT 0.2 (2026-08-09). This pass ENUMERATES a set that either
        // is or is not what speakers say — there is nothing here that a
        // little sampling variety improves, and the variety was measurable
        // harm: at 0.2 the rederived prompt still flipped 3 of 20 vi concepts
        // across identical re-asks (`gà` in or out of chicken, `rau sống` in
        // or out of herbs), and at 0 the same 20 came back identical 5 times
        // running. The prompt is what makes the answer RIGHT; this is what
        // makes it the SAME answer twice. Consensus sampling was the other
        // candidate and is not needed: it would pay three times to average a
        // draw that no longer varies.
        temperature: 0,
        responseMimeType: 'application/json',
        // Raw JSON Schema here; the pooled runner's assembler converts it to
        // the TYPED responseSchema form the batch backend enforces (the
        // json-schema field is rejected there — collection path's lesson).
        responseJsonSchema: VOCABULARY_RESPONSE_SCHEMA,
      },
      ...(remainingMs !== null ? { timeoutMs: remainingMs } : {}),
    });
    const out: GeneratedLabel[] = [];
    chunks.forEach((chunk, index) => {
      const text = responses.get(`chunk-${index}`);
      if (!text) {
        // No response is NOT an abstention: these asks never completed and
        // must stay due, so the sweep is told exactly which ids to keep
        // out of the run ledger.
        for (const request of chunk) unanswered.add(request.entityId);
        this.logger.warn('Vocabulary chunk unanswered (concepts stay due)', {
          locale: chunk[0]?.locale ?? null,
          size: chunk.length,
        });
        return;
      }
      out.push(...this.parseBatch(chunk, text));
    });
    return { labels: out, unanswered };
  }

  private parseBatch(
    batch: readonly LabelGenerationRequest[],
    text: string,
  ): GeneratedLabel[] {
    const locale = batch[0].locale;
    const parsed = parseVocabularyResponse(text);
    const results: GeneratedLabel[] = [];
    batch.forEach((request, index) => {
      const item = parsed.get(index + 1);
      if (!item || item.abstain || !item.canonical_label) {
        return;
      }

      const label = item.canonical_label.trim();
      if (!label) {
        return;
      }
      // A PROPER NOUN IS ITS OWN LABEL IN EVERY LANGUAGE. `Royale with
      // Cheese` renders identically in Spanish, so writing the label is the
      // TRUTH, not a fabricated translation — and writing it is what stops the
      // `NOT EXISTS a label row` watermark re-offering (and re-paying for)
      // every branded dish on every future run, forever.
      //
      // But it gets NO locale-tagged surfaces: claiming the English name is
      // also a Spanish *search word* would be the fabrication. The name is
      // already reachable through the identity/name arms in any locale.
      // The canonical label is itself a search surface for a real
      // translation — someone who reads "camarones" on a chip will also type
      // it — so it is declared EXPLICITLY here rather than bolted on by the
      // writer. A proper noun declares none: it is its own label in every
      // language, but it is not a Spanish word.
      const aliases = item.proper_noun
        ? []
        : Array.from(
            new Set(
              [label, ...(item.aliases ?? [])]
                .map((alias) => (alias ?? '').trim())
                .filter(Boolean),
            ),
          );
      results.push({
        entityId: request.entityId,
        locale,
        form: label,
        description: item.description?.trim() || null,
        status: 'active',
        aliases,
      });
    });
    return results;
  }
}

interface VocabularyItem {
  n?: number;
  canonical_label?: string;
  aliases?: string[];
  description?: string;
  proper_noun?: boolean;
  abstain?: boolean;
}

/** Gemini structured-output schema — the verdict shape is enforced, not parsed
 *  hopefully. */
export const VOCABULARY_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          n: { type: 'number' },
          canonical_label: { type: 'string' },
          aliases: { type: 'array', items: { type: 'string' } },
          description: { type: 'string' },
          proper_noun: { type: 'boolean' },
          abstain: { type: 'boolean' },
        },
        required: ['n', 'canonical_label', 'aliases', 'abstain'],
      },
    },
  },
  required: ['items'],
};

/**
 * THE VOCABULARY PROMPT (P0-c), rederived at v5.
 *
 * ITS SHAPE IS THE FIX. The order is the order the question is actually
 * thought through — the lens (who is on the other side of this word), then
 * what completeness MEANS (the pass's one real decision, defined so it has
 * one answer), then the boundary of the concept, then the two places where
 * being wrong hurts a person, then the input, then the contract. v4's rules
 * were a pile in the order their incidents happened, and the pile disagreed
 * with itself; a rule added here must be folded into whichever of those parts
 * it belongs to, never appended.
 *
 * WHAT THIS PASS IS NOT ALLOWED TO DO: choose between two real words. That is
 * the word-claim adjudicator's job, and it is the only stage that can see the
 * other claimant. Asking the generator to pre-empt it was what made the pass
 * nondeterministic.
 */
export function buildVocabularyPrompt(
  batch: readonly LabelGenerationRequest[],
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
    `- Speakers type the SHORT form as readily as the full one. When part of`,
    `  a name names this concept BY ITSELF — the word they would type alone`,
    `  into a search box and still be understood to mean this — that short`,
    `  form is one of the words they really type and belongs in the set. What`,
    `  makes a short form the SAME concept is that it keeps the`,
    `  DISTINGUISHING word and drops only a generic one: for beef, the word`,
    `  for the animal standing alone, with the word for "meat" dropped. Drop`,
    `  the distinguishing word instead and what is left is a BROADER concept,`,
    `  which the boundary below already excludes — "grilled meat" does not`,
    `  name grilled pork.`,
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

function parseVocabularyResponse(text: string): Map<number, VocabularyItem> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return new Map();
  }
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      items?: VocabularyItem[];
    };
    return new Map(
      (parsed.items ?? [])
        .filter((item) => typeof item.n === 'number')
        .map((item) => [item.n as number, item]),
    );
  } catch {
    return new Map();
  }
}
