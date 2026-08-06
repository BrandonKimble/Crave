/**
 * @script-class: probe
 * @finding: see plans/data-audit-2026-08.md "PHASE 4 — CORPUS A/B".
 *
 * CORPUS A/B (data-audit 2026-08, Phase 4b).
 *
 * The graded gold set (scripts/prompt-ab.ts) proves the candidate fixes the
 * defects it was DESIGNED against. It cannot prove the candidate is not
 * over-suppressing, because I wrote those cases and most of them assert that
 * nothing should be emitted. A prompt that refuses everything scores 17/17.
 *
 * This runs both prompts over a RANDOM sample of real posts-with-comments and
 * measures what the gold set structurally cannot:
 *   - EMISSION VOLUME (the recall proxy): mentions, distinct restaurants,
 *     distinct dishes. A large drop is the over-suppression alarm.
 *   - DEFECT RATES from mechanical detectors, on both sides, same denominator.
 *   - DIVERGENCE: documents where one prompt emitted and the other did not,
 *     written out so they can be read by hand rather than trusted.
 *
 * Read-only: it never writes events, entities, or the prompt registry.
 *
 *   yarn workspace api ts-node scripts/prompt-corpus-ab.ts \
 *     [--posts=120] [--community=austinfood] [--out=corpus.json]
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

const PROMPT_DIR = join(
  __dirname,
  '../src/modules/external-integrations/llm/prompts',
);

/** Words that name WHEN/HOW food reaches you, never WHAT it is. Deliberately
 *  excludes breakfast/brunch/dessert/coffee/beer — those predict a kind of
 *  food and are legitimate categories (the 346c97dc6 ruling). A detector
 *  measuring its own bad list reads as evidence; this list has been wrong
 *  twice before in this repo's history. */
const NON_CATEGORY_TERMS = new Set([
  'lunch',
  'dinner',
  'late night',
  'happy hour',
  'takeout',
  'delivery',
  'dine in',
  'comfort food',
  'street food',
  'buffet',
  'combo plate',
  'tasting menu',
  'omakase',
  'prix fixe',
  'special',
  'daily special',
  'a la carte',
  'plate',
  'menu',
]);

/** Bare intensity/vintage words: meaningless once severed from their noun. */
const NON_ATTRIBUTE_TERMS = new Set([
  'rich',
  'light',
  'thin',
  'thick',
  'heavy',
  'simple',
  'hearty',
  'old school',
  'classic',
  'authentic',
  'traditional',
  'generous portions',
  'bright',
  'clean',
  'filling',
  'delicious',
  'amazing',
  'best',
  'solid',
  'incredible',
  'tasty',
  'elite',
  'top notch',
  'favorite',
  'iconic',
  'famous',
  'must try',
  'hidden gem',
  'worth the trip',
]);

const CUISINE_TERMS = new Set([
  'mexican',
  'italian',
  'japanese',
  'chinese',
  'thai',
  'indian',
  'korean',
  'vietnamese',
  'french',
  'greek',
  'mediterranean',
  'tex mex',
  'american',
  'bbq',
  'sicilian',
  'cajun',
  'peruvian',
  'halal',
  'vegan',
  'vegetarian',
  'gluten free',
]);

type Mention = Record<string, unknown>;

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type Tally = {
  docsEmitting: number;
  mentions: number;
  restaurants: Set<string>;
  foods: Set<string>;
  categories: number;
  attributes: number;
  praiseMentions: number;
  /** defect counters */
  cuisineAsFood: string[];
  formatAsFood: string[];
  badAttribute: string[];
  emptyRestaurantName: number;
};

function newTally(): Tally {
  return {
    docsEmitting: 0,
    mentions: 0,
    restaurants: new Set(),
    foods: new Set(),
    categories: 0,
    attributes: 0,
    praiseMentions: 0,
    cuisineAsFood: [],
    formatAsFood: [],
    badAttribute: [],
    emptyRestaurantName: 0,
  };
}

function absorb(tally: Tally, mentions: Mention[]): void {
  if (mentions.length) tally.docsEmitting += 1;
  tally.mentions += mentions.length;
  for (const mention of mentions) {
    const restaurant =
      typeof mention.restaurant === 'string' ? norm(mention.restaurant) : '';
    if (!restaurant) tally.emptyRestaurantName += 1;
    else tally.restaurants.add(restaurant);

    if (mention.general_praise === true) tally.praiseMentions += 1;

    const food = typeof mention.food === 'string' ? norm(mention.food) : '';
    if (food) tally.foods.add(food);

    const categories = Array.isArray(mention.food_categories)
      ? (mention.food_categories as unknown[])
      : [];
    tally.categories += categories.length;

    const foodTerms = [food, ...categories.map((c) => norm(String(c)))].filter(
      Boolean,
    );
    for (const term of foodTerms) {
      if (CUISINE_TERMS.has(term)) tally.cuisineAsFood.push(term);
      if (NON_CATEGORY_TERMS.has(term)) tally.formatAsFood.push(term);
    }

    const attributes = [
      ...(Array.isArray(mention.food_attributes)
        ? (mention.food_attributes as unknown[])
        : []),
      ...(Array.isArray(mention.restaurant_attributes)
        ? (mention.restaurant_attributes as unknown[])
        : []),
    ].map((a) => norm(String(a)));
    tally.attributes += attributes.length;
    for (const attribute of attributes) {
      if (NON_ATTRIBUTE_TERMS.has(attribute))
        tally.badAttribute.push(attribute);
    }
  }
}

function report(label: string, tally: Tally, docs: number): void {
  const top = (list: string[]) => {
    const counts = new Map<string, number>();
    list.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([v, n]) => `${v}:${n}`)
      .join(', ');
  };
  console.log(`\n--- ${label} ---`);
  console.log(
    `docs emitting      ${tally.docsEmitting}/${docs} (${((100 * tally.docsEmitting) / docs).toFixed(1)}%)`,
  );
  console.log(`mentions           ${tally.mentions}`);
  console.log(`distinct rests     ${tally.restaurants.size}`);
  console.log(`distinct dishes    ${tally.foods.size}`);
  console.log(`category slots     ${tally.categories}`);
  console.log(`attribute slots    ${tally.attributes}`);
  console.log(`praise mentions    ${tally.praiseMentions}`);
  console.log(
    `DEFECT cuisine-as-food  ${tally.cuisineAsFood.length}  [${top(tally.cuisineAsFood)}]`,
  );
  console.log(
    `DEFECT format-as-food   ${tally.formatAsFood.length}  [${top(tally.formatAsFood)}]`,
  );
  console.log(
    `DEFECT bad-attribute    ${tally.badAttribute.length}  [${top(tally.badAttribute)}]`,
  );
  console.log(`DEFECT empty rest name  ${tally.emptyRestaurantName}`);
}

async function main(): Promise<void> {
  const arg = (name: string, fallback?: string): string | undefined => {
    const found = process.argv.find((a) => a.startsWith(`--${name}=`));
    return found ? found.split('=').slice(1).join('=') : fallback;
  };
  const postCount = parseInt(arg('posts', '120') as string, 10);
  const community = arg('community');
  const outFile = arg('out');

  const prompts = {
    live: readFileSync(join(PROMPT_DIR, 'collection-prompt.md'), 'utf-8'),
    candidate: readFileSync(
      join(PROMPT_DIR, 'collection-prompt.candidate.md'),
      'utf-8',
    ),
  };

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  stopCronsForScript(app);
  const prisma = app.get(PrismaService);
  const llm = app.get(LLMService);

  // Real posts that actually carry a discussion — a post with no comments
  // exercises almost none of the pipeline.
  const posts = await prisma.$queryRawUnsafe<
    Array<{ source_id: string; title: string | null; body: string | null }>
  >(
    `SELECT d.source_id, d.title, d.body
       FROM collection_source_documents d
      WHERE d.source_type = 'post'
        ${community ? `AND d.community = '${community.replace(/'/g, '')}'` : ''}
        AND EXISTS (
          SELECT 1 FROM collection_source_documents c
           WHERE c.parent_source_id = d.source_id AND c.source_type = 'comment')
      ORDER BY random()
      LIMIT ${postCount}`,
  );

  const cases: Array<{ id: string; payload: unknown }> = [];
  for (const post of posts) {
    const comments = await prisma.$queryRawUnsafe<
      Array<{ source_id: string; body: string | null }>
    >(
      `SELECT source_id, body FROM collection_source_documents
        WHERE parent_source_id = $1 AND source_type = 'comment'
        ORDER BY source_id LIMIT 25`,
      post.source_id,
    );
    if (!comments.length) continue;
    cases.push({
      id: post.source_id,
      payload: {
        posts: [
          {
            id: post.source_id,
            title: post.title ?? '',
            content: post.body ?? '',
            extract_from_post: true,
            comments: comments.map((c) => ({
              id: c.source_id,
              content: c.body ?? '',
              parent_id: post.source_id,
            })),
          },
        ],
      },
    });
  }

  console.log(
    `\nCORPUS A/B — ${cases.length} real posts-with-comments x 2 prompts${community ? ` (community=${community})` : ''}`,
  );

  const tallies = { live: newTally(), candidate: newTally() };
  const divergences: Array<Record<string, unknown>> = [];
  const errors: string[] = [];

  const CONCURRENCY = 6;
  let cursor = 0;
  const perDoc = new Map<string, { live?: Mention[]; candidate?: Mention[] }>();
  const units: Array<{
    id: string;
    payload: unknown;
    variant: 'live' | 'candidate';
  }> = [];
  for (const c of cases) {
    units.push({ ...c, variant: 'live' });
    units.push({ ...c, variant: 'candidate' });
  }

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const unit = units[cursor++];
        if (!unit) return;
        try {
          const parsed = await llm.processContent(
            unit.payload as never,
            prompts[unit.variant],
          );
          const mentions = Array.isArray(parsed?.mentions)
            ? (parsed.mentions as unknown as Mention[])
            : [];
          const entry = perDoc.get(unit.id) ?? {};
          entry[unit.variant] = mentions;
          perDoc.set(unit.id, entry);
        } catch (error) {
          errors.push(
            `${unit.id}/${unit.variant}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }),
  );

  let compared = 0;
  for (const [id, entry] of perDoc) {
    if (!entry.live || !entry.candidate) continue;
    compared += 1;
    absorb(tallies.live, entry.live);
    absorb(tallies.candidate, entry.candidate);
    if (
      (entry.live.length > 0 && entry.candidate.length === 0) ||
      (entry.candidate.length > 0 && entry.live.length === 0)
    ) {
      divergences.push({
        id,
        liveCount: entry.live.length,
        candidateCount: entry.candidate.length,
        live: entry.live.map((m) => ({ r: m.restaurant, f: m.food })),
        candidate: entry.candidate.map((m) => ({ r: m.restaurant, f: m.food })),
      });
    }
  }

  report('LIVE', tallies.live, compared);
  report('CANDIDATE', tallies.candidate, compared);

  const delta = (a: number, b: number) =>
    a === 0 ? 'n/a' : `${(((b - a) / a) * 100).toFixed(1)}%`;
  console.log('\n--- CANDIDATE vs LIVE ---');
  console.log(
    `mentions        ${delta(tallies.live.mentions, tallies.candidate.mentions)}`,
  );
  console.log(
    `distinct rests  ${delta(tallies.live.restaurants.size, tallies.candidate.restaurants.size)}`,
  );
  console.log(
    `distinct dishes ${delta(tallies.live.foods.size, tallies.candidate.foods.size)}`,
  );
  console.log(
    `docs emitting   ${delta(tallies.live.docsEmitting, tallies.candidate.docsEmitting)}`,
  );
  console.log(
    `\nONE-SIDED DOCS (read these by hand): ${divergences.length} of ${compared}`,
  );
  const lostOnly = divergences.filter(
    (d) => (d.candidateCount as number) === 0,
  );
  console.log(`  candidate emitted NOTHING where live did: ${lostOnly.length}`);
  console.log(
    `  candidate emitted where live did NOT:     ${divergences.length - lostOnly.length}`,
  );
  if (errors.length)
    console.log(`\nERRORS: ${errors.length}`, errors.slice(0, 3));

  if (outFile) {
    // Save EVERY mention from both sides, not just the divergences: the
    // aggregate counters say a defect rate moved, and the only way to learn
    // WHY is to read the rows. Round 1 of the corpus A/B had to be re-run
    // (and re-paid for) because this file held only the one-sided docs.
    writeFileSync(
      outFile,
      JSON.stringify(
        {
          compared,
          divergences,
          errors,
          perDoc: Array.from(perDoc.entries()).map(([id, entry]) => ({
            id,
            live: entry.live ?? [],
            candidate: entry.candidate ?? [],
          })),
        },
        null,
        2,
      ),
    );
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
