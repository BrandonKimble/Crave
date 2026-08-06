import { Injectable } from '@nestjs/common';
import { LLMService } from '../external-integrations/llm/llm.service';
import { LoggerService } from '../../shared';
import {
  type GeneratedLabel,
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
 * NO CONSENSUS SAMPLING. The seam supports it and the spine seeder uses it,
 * but it is not used here: 3 runs x 6 anchors at this temperature produced
 * 100% agreement with zero unstable verdicts, including non-food types.
 * Sampling three times would triple the cost to re-measure a stable answer.
 * What DID move results was prompt WORDING — hence the version-pinned prompt.
 */
@Injectable()
export class VocabularyGenerator implements LabelGenerator {
  readonly name = 'llm-vocabulary';

  /** Concepts per LLM call. Matches the sibling knowledge pass's batch size. */
  private static readonly PER_CALL = 20;

  private readonly logger: LoggerService;

  constructor(
    private readonly llm: LLMService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('VocabularyGenerator');
  }

  async generate(
    requests: readonly LabelGenerationRequest[],
  ): Promise<GeneratedLabel[]> {
    const out: GeneratedLabel[] = [];
    for (let i = 0; i < requests.length; i += VocabularyGenerator.PER_CALL) {
      const batch = requests.slice(i, i + VocabularyGenerator.PER_CALL);
      try {
        out.push(...(await this.generateBatch(batch)));
      } catch (error) {
        // A failed batch produces NOTHING for those concepts — never a
        // fabricated label. They stay unlabeled and the watermark re-offers
        // them next run (the no-fake-estimates law, applied to text).
        this.logger.warn('Vocabulary batch failed (concepts left unlabeled)', {
          locale: batch[0]?.locale ?? null,
          size: batch.length,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
    return out;
  }

  private async generateBatch(
    batch: readonly LabelGenerationRequest[],
  ): Promise<GeneratedLabel[]> {
    const locale = batch[0].locale;
    const text = await this.llm.generateForCaller({
      caller: 'labels.vocabulary',
      prompt: buildVocabularyPrompt(batch),
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        // responseJsonSchema, NOT responseSchema: the latter is Gemini's TYPED
        // Schema field (OBJECT/STRING) and silently ignores a raw JSON Schema,
        // so the "enforced" shape would not have been enforced at all.
        responseJsonSchema: VOCABULARY_RESPONSE_SCHEMA,
      },
    });

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
 * THE VOCABULARY PROMPT (P0-c). Every rule here is load-bearing and most were
 * bought with a measured failure — do not soften them without re-running the
 * launch gate.
 */
export function buildVocabularyPrompt(
  batch: readonly LabelGenerationRequest[],
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
