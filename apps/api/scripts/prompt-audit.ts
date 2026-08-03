/**
 * @script-class: probe
 * @finding: NOT YET BANKED — record what this probe answered, or delete it.
 *
 * A banked probe's value is the RECORDED RESULT, kept so the finding stays
 * reproducible. This one has no runner and no written-down finding: the
 * F414 sweep (2026-08-02) could establish the first fact mechanically but
 * not the second, and inventing one would be worse than leaving it visible.
 * Until a finding is written here, this file is a deletion candidate.
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReplayService } from '../src/modules/content-processing/reddit-collector/replay.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/**
 * PRE-RELOAD PROMPT AUDIT (charter §4). The reload costs real money, so the
 * prompt must be proven right BEFORE we spend, not discovered wrong after.
 *
 * Replays a RANDOM sample of Austin documents under the CURRENT prompt, then
 * grades the resulting events with mechanical detectors — one per known
 * failure class. Every detector reports its own denominator and prints real
 * examples, because a detector that can only ever read 0 is a detector that
 * proves nothing.
 *
 *   yarn workspace api ts-node scripts/prompt-audit.ts [--docs=120] [--grade-only]
 */

type Row = Record<string, unknown>;

/**
 * OCCASION AND SERVICE words — things that answer WHEN, WHERE, or HOW you
 * get food, never WHAT it is. That is the §4.3 discriminator, and it is the
 * only thing this detector may flag.
 *
 * The first version of this list was WRONG and inflated the class to 7.5%:
 * it included dessert, coffee, beer, cocktail — all of which name a kind of
 * thing in the cup or on the plate and are legitimate categories. The data
 * settled it: 'coffee' splits 817 category / 401 dish, almost exactly like
 * 'steak' at 695/301. A detector measuring its own bad list is worse than no
 * detector, because it reads as evidence.
 */
const NON_CATEGORY_TERMS = new Set([
  // NOT breakfast/brunch: they predict a recognizable kind of food and are
  // legitimate categories by the 4.3 ruling — a detector flagging compliant
  // output is measuring itself (this list has been wrong twice already).
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
  'vegetarian',
  'vegan',
  'gluten free',
]);

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main(): Promise<void> {
  const docsArg = process.argv.find((a) => a.startsWith('--docs='));
  const targetDocs = docsArg ? parseInt(docsArg.split('=')[1], 10) : 120;
  const gradeOnly = process.argv.includes('--grade-only');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);

  try {
    const prisma = app.get(PrismaService);
    const replay = app.get(ReplayService);

    // RANDOM, not curated: a sample we hand-pick can only confirm the
    // failure classes we already know about, and §4.3 is explicitly about
    // finding the ones we have not looked for.
    const runs = await prisma.$queryRaw<Array<{ runId: string; docs: number }>>`
      SELECT d.active_extraction_run_id AS "runId",
             count(DISTINCT d.document_id)::int AS docs
      FROM collection_source_documents d
      WHERE d.active_extraction_run_id IS NOT NULL
        AND d.community = 'austinfood'
      GROUP BY d.active_extraction_run_id
      HAVING count(DISTINCT d.document_id) BETWEEN 10 AND 200
      ORDER BY random()
      LIMIT 40
    `;
    const picked: typeof runs = [];
    let docs = 0;
    for (const run of runs) {
      if (docs >= targetDocs) break;
      picked.push(run);
      docs += run.docs;
    }
    out(`sample: ${picked.length} runs / ${docs} docs (austinfood, random)`);

    const runIds = picked.map((r) => r.runId);
    if (!gradeOnly) {
      const started = Date.now();
      let ok = 0;
      for (const [i, run] of picked.entries()) {
        try {
          await replay.replayExtractionRun({
            sourceExtractionRunId: run.runId,
            activate: true,
          });
          ok += 1;
          out(`[${i + 1}/${picked.length}] ${run.runId} (${run.docs} docs) ok`);
        } catch (error) {
          out(
            `[${i + 1}/${picked.length}] ${run.runId} FAILED: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      out(
        `\nreplayed ${ok}/${picked.length} runs in ${Math.round(
          (Date.now() - started) / 1000,
        )}s`,
      );
    }

    // The replay creates NEW extraction runs; grade the newest run per
    // source document in the sample rather than the ids we replayed FROM.
    const events = await prisma.$queryRaw<Row[]>`
      SELECT e.event_id, e.entity_type, e.evidence_type, e.is_menu_item,
             e.source_document_id, e.restaurant_id,
             ent.name AS entity_name, r.name AS restaurant_name,
             d.title, d.body,
             -- ASK-INHERITANCE (§5.2.2) is legitimate: a reply of bare
             -- restaurant names inherits the ASK's dish. Grading the reply's
             -- own text alone read 19% "hallucinated" on the first pass, all
             -- of it one ask thread ("Singapore noodles?"). The parent's text
             -- is part of the claim's grounding.
             p.title AS parent_title, p.body AS parent_body
      FROM core_restaurant_entity_events e
      JOIN core_entities ent ON ent.entity_id = e.entity_id
      JOIN core_entities r ON r.entity_id = e.restaurant_id
      JOIN collection_source_documents d
        ON d.document_id = e.source_document_id
       AND d.active_extraction_run_id = e.extraction_run_id
      LEFT JOIN collection_source_documents p
        ON p.source_id = d.parent_source_id
      WHERE d.active_extraction_run_id = ANY(${runIds}::uuid[])
         OR e.extraction_run_id IN (
           SELECT active_extraction_run_id FROM collection_source_documents
           WHERE document_id IN (
             SELECT source_document_id FROM core_restaurant_entity_events
             WHERE extraction_run_id = ANY(${runIds}::uuid[])
           )
         )
    `;

    out(`\n=== GRADED EVENTS: ${events.length}`);
    if (!events.length) {
      out(
        'NO EVENTS — sample produced nothing to grade (that is itself a finding).',
      );
      return;
    }

    const byType = new Map<string, number>();
    for (const event of events) {
      const key = `${String(event.entity_type)}/${String(event.evidence_type)}`;
      byType.set(key, (byType.get(key) ?? 0) + 1);
    }
    out('\n-- event mix --');
    for (const [key, count] of [...byType.entries()].sort(
      (a, b) => b[1] - a[1],
    )) {
      out(`  ${key}: ${count}`);
    }

    const report = (
      label: string,
      hits: Row[],
      denominator: number,
      show: (row: Row) => string,
    ): void => {
      const pct = denominator
        ? ((hits.length / denominator) * 100).toFixed(1)
        : '0.0';
      out(`\n-- ${label}: ${hits.length}/${denominator} (${pct}%)`);
      for (const row of hits.slice(0, 8)) {
        out(`   ${show(row)}`);
      }
    };

    // CLASS 1 — namespace leakage: meal periods / styles / drinks emitted as
    // food categories, which §4.3 explicitly bans.
    const categoryEvents = events.filter(
      (e) => String(e.evidence_type) === 'food_category',
    );
    report(
      'CLASS 1 namespace leakage (meal-period/style as food_category)',
      categoryEvents.filter((e) =>
        NON_CATEGORY_TERMS.has(norm(String(e.entity_name))),
      ),
      categoryEvents.length,
      (r) => `${String(r.entity_name)} @ ${String(r.restaurant_name)}`,
    );

    // CLASS 2 — dish nouns leaking into the attribute namespace.
    const attributeEvents = events.filter((e) =>
      String(e.entity_type).endsWith('_attribute'),
    );
    const foodNames = new Set(
      events
        .filter((e) => String(e.entity_type) === 'food')
        .map((e) => norm(String(e.entity_name))),
    );
    report(
      'CLASS 2 dish noun emitted as an attribute',
      attributeEvents.filter((e) => foodNames.has(norm(String(e.entity_name)))),
      attributeEvents.length,
      (r) => `${String(r.entity_name)} [${String(r.entity_type)}]`,
    );

    // CLASS 3 — over-extraction / hallucination: the food's name does not
    // appear in the document that supposedly said it. Token-level (not exact
    // substring) so plural/spelling variants do not read as false hits.
    const foodEvents = events.filter((e) => String(e.entity_type) === 'food');
    // DIRECT claims only. Category events are INFERRED parents ("stew" over a
    // named dish) and are not expected to appear verbatim — grading them as
    // hallucinations read 36.5% on the baseline and was measuring the
    // detector, not the prompt.
    const directFoodEvents = foodEvents.filter((e) =>
      ['menu_item_food', 'food_mention'].includes(String(e.evidence_type)),
    );
    const ungrounded = directFoodEvents.filter((e) => {
      const text = norm(
        [e.title, e.body, e.parent_title, e.parent_body]
          .map((part) => (typeof part === 'string' ? part : ''))
          .join(' '),
      );
      const tokens = norm(String(e.entity_name))
        .split(' ')
        .filter((t) => t.length > 3);
      if (!tokens.length) return false;
      return !tokens.some((t) =>
        text.includes(t.slice(0, Math.max(4, t.length - 1))),
      );
    });
    report(
      'CLASS 3 food name absent from its own source document',
      ungrounded,
      directFoodEvents.length,
      (r) => `"${String(r.entity_name)}" @ ${String(r.restaurant_name)}`,
    );

    // CLASS 4 — fan-out: one document attaching the SAME food to many
    // restaurants (the carbonara-udon pattern: an ask template pattern-
    // matched onto a comment that had its own dish text).
    const fanout = new Map<string, Set<string>>();
    for (const event of foodEvents) {
      const key = `${String(event.source_document_id)}::${norm(String(event.entity_name))}`;
      const set = fanout.get(key) ?? new Set<string>();
      set.add(String(event.restaurant_id));
      fanout.set(key, set);
    }
    const fannedOut = [...fanout.entries()].filter(([, set]) => set.size >= 4);
    out(
      `\n-- CLASS 4 fan-out (one doc, same food, >=4 restaurants): ${fannedOut.length}/${fanout.size} doc-food pairs`,
    );
    for (const [key, set] of fannedOut.slice(0, 8)) {
      out(`   ${key.split('::')[1]} -> ${set.size} restaurants`);
    }

    // CLASS 5 — menu-item labeling: the ratio the audit tracks. Not a
    // pass/fail on its own; a collapse in either direction is the signal.
    const menuItems = foodEvents.filter((e) => e.is_menu_item === true).length;
    out(
      `\n-- CLASS 5 menu-item labeling: ${menuItems}/${foodEvents.length} food events flagged is_menu_item (${(
        (menuItems / Math.max(1, foodEvents.length)) *
        100
      ).toFixed(1)}%)`,
    );

    // CLASS 6 — restaurant-name quality: a "restaurant" that is really a
    // generic noun is a resolution poison pill (it becomes a magnet entity).
    const restaurantNames = new Map<string, number>();
    for (const event of events) {
      const name = String(event.restaurant_name);
      restaurantNames.set(name, (restaurantNames.get(name) ?? 0) + 1);
    }
    // A short one-word name is usually a REAL restaurant (Canje, Siti, Poeta
    // all tripped the first version). The actual poison pill is a name made
    // only of generic nouns — a magnet entity every loose mention resolves
    // onto.
    const GENERIC_NAME_WORDS = new Set([
      'community',
      'garden',
      'place',
      'spot',
      'restaurant',
      'food',
      'truck',
      'market',
      'store',
      'shop',
      'bar',
      'cafe',
      'kitchen',
      'the',
      'a',
      'my',
      'downtown',
      'austin',
      'city',
      'local',
      'here',
      'home',
      'work',
    ]);
    const suspicious = [...restaurantNames.keys()].filter((name) => {
      const words = norm(name).split(' ').filter(Boolean);
      return words.length > 0 && words.every((w) => GENERIC_NAME_WORDS.has(w));
    });
    out(
      `\n-- CLASS 6 suspicious restaurant names (single short token): ${suspicious.length}/${restaurantNames.size}`,
    );
    for (const name of suspicious.slice(0, 10)) out(`   "${name}"`);

    out(`\nSAMPLE_DOCS=${docs} EVENTS=${events.length}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
