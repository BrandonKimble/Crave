/**
 * @script-class: probe
 *
 * WILD-SAMPLE A/B — named-offering rederivation (2026-08-29).
 *
 * Runs TWO prompt files over real corpus threads: (a) TARGET threads from
 * the named-offering fragmentation study (Vixen's Wedding chef's tasting,
 * Estancia executive lunch, P Thai's khao man gai combo, Hecho mole plate,
 * TCP lazybones special, Chuy's Elvis Presley combo) and prints every
 * mention row base-vs-cand for eyeball diffing; (b) random CONTROL posts,
 * scored for volume + junk-shape deltas. Read-only; never touches the
 * prompt registry.
 *
 *   yarn workspace api ts-node scripts/wild-ab-named-offering.ts \
 *     --base-prompt=/abs/path/base.md [--control=30] \
 *     [--community=austinfood] --out=/abs/path/out.json
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

const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');

const PROMPT_DIR = join(
  __dirname,
  '../src/modules/external-integrations/llm/prompts',
);

const TARGET_POSTS = [
  't3_15lv2g5', // Vixen's Wedding chef's tasting (vegetarian ask)
  't3_15fjloi', // chef's tastings list (Lenoir/Hestia/Vixen's)
  't3_15e0npk', // Hestia chef's tasting report
  't3_16ciolb', // elevated chef's tastings
  't3_15s6cl3', // Estancia executive lunch (deals masterlist ask)
  't3_16uufzy', // P Thai's khao man gai combo (pro-form shape)
  't3_159dw08', // Hecho three mole plate
  't3_15xa0zo', // TCP lazybones special (title caption)
  't3_16ffj0d', // Chuy's Elvis Presley combo
];

type Mention = Record<string, unknown>;
type Doc = { source_id: string; title: string | null; body: string | null };
type CommentRow = {
  source_id: string;
  body: string | null;
  parent_source_id: string;
};

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Junk shapes AFTER the named-offering ruling: formats that are now legit
 *  dishes (tasting menu, prix fixe, special, combo, plate) are removed from
 *  the junk set; occasions/cuisines/wrappers that must never be items stay. */
const JUNK_ITEM_TERMS = new Set([
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
  'lunch',
  'dinner',
  'late night',
  'happy hour',
  'takeout',
  'delivery',
  'dine in',
  'comfort food',
  'street food',
  'brunch',
  'menu',
  'deal',
  'food',
  'restaurant',
]);

function mentionShapes(mentions: Mention[]): {
  real: number;
  junk: number;
  junkRows: string[];
} {
  let real = 0;
  let junk = 0;
  const junkRows: string[] = [];
  for (const m of mentions) {
    const place =
      typeof m.place_observed === 'string' ? fold(m.place_observed) : '';
    const item = typeof m.item === 'string' ? fold(m.item) : '';
    const isJunk =
      !place ||
      JUNK_ITEM_TERMS.has(place) ||
      (item && JUNK_ITEM_TERMS.has(item));
    if (isJunk) {
      junk += 1;
      junkRows.push(
        `place="${asStr(m.place_observed)}" item="${asStr(m.item)}"`,
      );
    } else real += 1;
  }
  return { real, junk, junkRows };
}

async function main(): Promise<void> {
  const arg = (name: string, fallback?: string): string | undefined => {
    const found = process.argv.find((a) => a.startsWith(`--${name}=`));
    return found ? found.split('=').slice(1).join('=') : fallback;
  };
  const basePromptPath = arg('base-prompt');
  if (!basePromptPath) throw new Error('--base-prompt required');
  const controlCount = parseInt(arg('control', '30') as string, 10);
  const community = arg('community', 'austinfood');
  const outFile = arg('out');
  const commentCap = parseInt(arg('comment-cap', '30') as string, 10);

  const prompts = {
    base: readFileSync(basePromptPath, 'utf-8'),
    cand: readFileSync(
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

  async function buildThread(
    postSid: string,
  ): Promise<{ id: string; payload: unknown } | null> {
    const post = (
      await prisma.$queryRawUnsafe<Doc[]>(
        `SELECT source_id, title, body FROM collection_source_documents
          WHERE source_id = $1 AND source_type = 'post'`,
        postSid,
      )
    )[0];
    if (!post) return null;
    const comments = await prisma.$queryRawUnsafe<CommentRow[]>(
      `WITH RECURSIVE thread AS (
         SELECT source_id, body, parent_source_id
           FROM collection_source_documents
          WHERE parent_source_id = $1 AND source_type = 'comment'
         UNION ALL
         SELECT c.source_id, c.body, c.parent_source_id
           FROM collection_source_documents c
           JOIN thread t ON c.parent_source_id = t.source_id
          WHERE c.source_type = 'comment')
       SELECT * FROM thread ORDER BY source_id`,
      postSid,
    );
    const chosen = comments.slice(0, commentCap);
    return {
      id: postSid,
      payload: {
        posts: [
          {
            id: postSid,
            title: post.title ?? '',
            content: post.body ?? '',
            extract_from_post: true,
            comments: chosen.map((c) => ({
              id: c.source_id,
              content: c.body ?? '',
              parent_id: c.parent_source_id,
            })),
          },
        ],
      },
    };
  }

  type Job = { docId: string; panel: 'target' | 'control'; payload: unknown };
  const jobs: Job[] = [];
  for (const sid of TARGET_POSTS) {
    const thread = await buildThread(sid);
    if (thread)
      jobs.push({ docId: sid, panel: 'target', payload: thread.payload });
    else console.log(`  target ${sid}: not found / empty`);
  }
  const controlPosts = await prisma.$queryRawUnsafe<Doc[]>(
    `SELECT d.source_id, d.title, d.body
       FROM collection_source_documents d
      WHERE d.source_type = 'post'
        AND d.community = $1
        AND EXISTS (SELECT 1 FROM collection_source_documents c
                     WHERE c.parent_source_id = d.source_id
                       AND c.source_type = 'comment')
      ORDER BY random() LIMIT $2`,
    community,
    controlCount,
  );
  for (const post of controlPosts) {
    const thread = await buildThread(post.source_id);
    if (thread)
      jobs.push({
        docId: post.source_id,
        panel: 'control',
        payload: thread.payload,
      });
  }

  console.log(`WILD A/B named-offering — ${jobs.length} docs x 2 prompts`);

  const units: Array<{ job: Job; variant: 'base' | 'cand' }> = [];
  for (const job of jobs) {
    units.push({ job, variant: 'base' });
    units.push({ job, variant: 'cand' });
  }
  const results = new Map<string, { base?: Mention[]; cand?: Mention[] }>();
  const errors: string[] = [];
  let cursor = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (;;) {
        const unit = units[cursor++];
        if (!unit) return;
        try {
          const parsed = await llm.processContent(
            unit.job.payload as never,
            prompts[unit.variant],
          );
          const mentions = Array.isArray(parsed?.mentions)
            ? (parsed.mentions as unknown as Mention[])
            : [];
          const entry = results.get(unit.job.docId) ?? {};
          entry[unit.variant] = mentions;
          results.set(unit.job.docId, entry);
        } catch (error) {
          errors.push(
            `${unit.job.docId}/${unit.variant}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        done += 1;
        if (done % 20 === 0) console.log(`  ...${done}/${units.length}`);
      }
    }),
  );

  const row = (m: Mention) =>
    `${asStr(m.place_observed)} / item=${asStr(m.item) || '-'} / attrs=${JSON.stringify(m.place_attributes ?? null)}${m.item_attributes ? ` itemAttrs=${JSON.stringify(m.item_attributes)}` : ''}${m.ingredients && (m.ingredients as unknown[]).length ? ` ingr=${JSON.stringify(m.ingredients)}` : ''} @${asStr(m.source_id)}${m.general_praise === true ? ' [praise]' : ''}`;

  const out: Record<string, unknown> = { jobs: [], errors };
  const control = {
    docs: 0,
    baseMentions: 0,
    candMentions: 0,
    baseReal: 0,
    candReal: 0,
    baseJunk: 0,
    candJunk: 0,
    flagged: [] as string[],
  };
  for (const job of jobs) {
    const entry = results.get(job.docId);
    if (!entry?.base || !entry?.cand) continue;
    const jrow: Record<string, unknown> = {
      docId: job.docId,
      panel: job.panel,
      baseRows: entry.base.map(row),
      candRows: entry.cand.map(row),
    };
    if (job.panel === 'target') {
      console.log(`\n=== TARGET ${job.docId} ===`);
      console.log('  BASE:');
      entry.base.forEach((m) => console.log(`    ${row(m)}`));
      console.log('  CAND:');
      entry.cand.forEach((m) => console.log(`    ${row(m)}`));
    } else {
      const b = mentionShapes(entry.base);
      const c = mentionShapes(entry.cand);
      control.docs += 1;
      control.baseMentions += entry.base.length;
      control.candMentions += entry.cand.length;
      control.baseReal += b.real;
      control.candReal += c.real;
      control.baseJunk += b.junk;
      control.candJunk += c.junk;
      jrow.baseShapes = b;
      jrow.candShapes = c;
      if (c.junk > b.junk || c.real < b.real) control.flagged.push(job.docId);
    }
    (out.jobs as unknown[]).push(jrow);
  }
  out.control = control;
  console.log('\n=== CONTROL SUMMARY ===');
  console.log(JSON.stringify(control, null, 2));
  if (errors.length) console.log(`ERRORS ${errors.length}`, errors.slice(0, 5));
  if (outFile) {
    writeFileSync(outFile, JSON.stringify(out, null, 2));
    console.log(`wrote ${outFile}`);
  }
  await app.close();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
