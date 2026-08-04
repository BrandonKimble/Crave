/**
 * @script-class: operational
 *
 * (One-off per language, but OPERATIONAL: enabling a new locale re-runs it.)
 *
 * SEED THE SPINE's per-locale display labels.
 *
 * WHAT THE SPINE IS (N8/P2.3): the CLOSED, filterable vocabulary — the 59
 * cuisine-facet attributes, the curated dietary set (`constraint_class =
 * 'dietary'`), and the occasion words the curated-list recipes already name.
 * ~70-80 concepts. That is the whole reason this is a script and not the
 * nightly sweep: the spine is small, Zipf-heavy, and worth spending a real
 * model on ONCE per language ("an afternoon per language", per the plan).
 * The 8,272-concept TAIL is the sweep's job and is deliberately not here.
 *
 * R5-10 CONSENSUS: three independent samples per batch, majority wins.
 * Single-word context-free terms are exactly where single-judgment noise is
 * worst, so a term the samples disagree on is NOT published — it lands
 * `status='candidate'` for review. Agreement lands `status='active'`.
 *
 * R5-6(a): each label carries a short per-locale DESCRIPTION. Labels collide
 * ("pan"), and the disambiguator is what a reviewer — and later the
 * judge-merge gate — actually needs.
 *
 * COST: five generation calls at most (one per sample per batch, batches of
 * ~40), Flash-Lite tier, low temperature. Metered through the usage ledger
 * like every other call because it goes through the ONE gateway.
 *
 * Run:
 *   npx ts-node -T scripts/seed-spine-labels.ts --locale es           # dry run
 *   npx ts-node -T scripts/seed-spine-labels.ts --locale es --apply   # write
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import { LabelSweepService } from '../src/modules/entity-display/label-sweep.service';
import {
  AUTO_APPROVE_SCORE,
  CONSENSUS_SAMPLES,
  consensusOf,
  type GeneratedLabel,
} from '../src/modules/entity-display/label-generator';
import { CONTEXT_RECIPES } from '../src/modules/home/curated-lists.constants';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

const BATCH_SIZE = 40;
const CALLER = 'labels.seed_spine';

interface SpineConcept {
  entity_id: string;
  name: string;
  type: string;
  kind: 'cuisine' | 'dietary' | 'occasion';
}

interface CliOptions {
  locale: string;
  apply: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { locale: 'es', apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--locale' && argv[i + 1]) {
      options.locale = argv[i + 1];
    }
    if (argv[i] === '--apply') {
      options.apply = true;
    }
  }
  return options;
}

/**
 * THE SPINE QUERY. Three arms, each a DECLARED fact in the schema or the
 * code — never a guess about what "important" means:
 *   - facet = 'cuisine'            (the 59)
 *   - constraint_class = 'dietary' (the curated dietary set)
 *   - the occasion vocabularies the curated-list CONTEXT_RECIPES already name
 */
async function loadSpine(prisma: PrismaService): Promise<SpineConcept[]> {
  const occasionNames = CONTEXT_RECIPES.flatMap(
    (recipe) => recipe.attributeNames,
  ).map((name) => name.toLowerCase());

  const rows = await prisma.$queryRawUnsafe<SpineConcept[]>(
    `
    SELECT entity_id, name, type::text AS type,
           CASE
             WHEN facet = 'cuisine' THEN 'cuisine'
             WHEN constraint_class = 'dietary' THEN 'dietary'
             ELSE 'occasion'
           END AS kind
    FROM core_entities
    WHERE status = 'active'
      AND type::text IN ('restaurant_attribute', 'food_attribute')
      AND (facet = 'cuisine'
           OR constraint_class = 'dietary'
           OR lower(name) = ANY($1::text[]))
    ORDER BY 4, 2
    `,
    occasionNames,
  );
  return rows;
}

function buildPrompt(concepts: SpineConcept[], locale: string): string {
  const list = concepts
    .map((concept, index) => `${index + 1}. ${concept.name} [${concept.kind}]`)
    .join('\n');
  return [
    `You are localizing a FOOD-DISCOVERY app's filter vocabulary into ${locale}.`,
    '',
    'For each numbered English term, give:',
    `- "form": how a native ${locale} speaker would see this filter labeled in a food app. Use the form people actually use, lowercase unless the language requires capitals.`,
    `- "description": a SHORT ${locale} phrase (max 8 words) disambiguating the term.`,
    '',
    'RULES:',
    '- Cuisine names that are used untranslated in the target language STAY untranslated (e.g. "sushi", "ramen", "tex-mex"). Do not invent a translation for a word the culture already borrowed.',
    '- Never translate a proper noun or a dish name into a description of it.',
    '- Dietary terms must be the standard label used on menus in that language.',
    '- If you are unsure, return the English term unchanged rather than guessing.',
    '',
    'Return ONLY a JSON array, one object per input, in input order:',
    '[{"n":1,"form":"...","description":"..."}]',
    '',
    list,
  ].join('\n');
}

function parseSamples(
  text: string,
): Array<{ n: number; form: string; description: string | null }> {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) {
    return [];
  }
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Array<{
      n?: number;
      form?: string;
      description?: string;
    }>;
    return parsed.flatMap((row) =>
      typeof row.n === 'number' && typeof row.form === 'string'
        ? [
            {
              n: row.n,
              form: row.form.trim(),
              description: row.description?.trim() || null,
            },
          ]
        : [],
    );
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (message: string) => process.stdout.write(`${message}\n`);

  try {
    const prisma = app.get(PrismaService);
    const llm = app.get(LLMService);
    const sweep = app.get(LabelSweepService);

    const spine = await loadSpine(prisma);
    out(
      `spine concepts: ${spine.length} ` +
        `(cuisine ${spine.filter((c) => c.kind === 'cuisine').length}, ` +
        `dietary ${spine.filter((c) => c.kind === 'dietary').length}, ` +
        `occasion ${spine.filter((c) => c.kind === 'occasion').length})`,
    );

    const batches: SpineConcept[][] = [];
    for (let i = 0; i < spine.length; i += BATCH_SIZE) {
      batches.push(spine.slice(i, i + BATCH_SIZE));
    }

    const generated: GeneratedLabel[] = [];
    for (const [batchIndex, batch] of batches.entries()) {
      const prompt = buildPrompt(batch, options.locale);
      // CONSENSUS_SAMPLES independent draws of the SAME prompt. Temperature
      // is low but non-zero: at 0 the three samples are one sample wearing
      // three hats, and the consensus would be theatre.
      const samples: Array<
        Map<number, { form: string; description: string | null }>
      > = [];
      for (let s = 0; s < CONSENSUS_SAMPLES; s += 1) {
        const text = await llm.generateForCaller({
          caller: CALLER,
          prompt,
          generationConfig: { temperature: 0.2 },
        });
        const parsed = parseSamples(text);
        out(`batch ${batchIndex + 1} sample ${s + 1}: ${parsed.length} rows`);
        samples.push(new Map(parsed.map((row) => [row.n, row])));
      }

      batch.forEach((concept, index) => {
        const n = index + 1;
        const drawn = samples
          .map((sample) => sample.get(n))
          .filter((row): row is { form: string; description: string | null } =>
            Boolean(row?.form),
          );
        if (!drawn.length) {
          return;
        }
        const verdict = consensusOf(drawn);
        // The MQM score here is a CONSENSUS measurement, not a fabricated
        // quality judgement: it is the share of samples that agreed. Calling
        // it 95 because the output "looked good" would be a fake estimate.
        const score = Math.round((verdict.votes / verdict.samples) * 100);
        generated.push({
          entityId: concept.entity_id,
          locale: options.locale,
          form: verdict.form,
          description: verdict.description,
          judgement: {
            score,
            errorSpans: verdict.agreed
              ? []
              : [
                  {
                    category: 'terminology',
                    severity: 'major',
                    text: concept.name,
                    note: `samples disagreed: ${drawn
                      .map((row) => row.form)
                      .join(' | ')}`,
                  },
                ],
            autoApprove: verdict.agreed && score >= AUTO_APPROVE_SCORE,
          },
          status:
            verdict.agreed && score >= AUTO_APPROVE_SCORE
              ? 'active'
              : 'candidate',
          consensusVotes: verdict.votes,
          consensusSamples: verdict.samples,
        });
      });
    }

    const nameById = new Map(spine.map((c) => [c.entity_id, c.name]));
    out('');
    out('kind\tenglish\tlocale_form\tstatus\tvotes\tdescription');
    for (const label of generated) {
      out(
        [
          nameById.get(label.entityId) ?? '?',
          label.form,
          label.status,
          `${label.consensusVotes}/${label.consensusSamples}`,
          label.description ?? '',
        ].join('\t'),
      );
    }
    out('');
    out(
      `generated ${generated.length}: active ${
        generated.filter((l) => l.status === 'active').length
      }, candidate ${generated.filter((l) => l.status === 'candidate').length}`,
    );

    if (!options.apply) {
      out('DRY RUN — nothing written. Re-run with --apply.');
      return;
    }
    const written = await sweep.writeLabels(generated, 'seed');
    out(`wrote ${written} entity_labels rows for locale ${options.locale}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
