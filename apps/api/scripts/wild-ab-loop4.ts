/**
 * @script-class: probe
 *
 * WILD-SAMPLE A/B — loop-4 instrument (2026-08-28).
 *
 * The 135/144-case fixture suite stayed green across loop-3 while the wild
 * replay lost the loop-2 adoption recoveries (12 -> 2; see
 * logs/bench-review-20260828-035716.lost-support.report.md Part 2). This
 * script is the cheap wild gate that was missing: it runs TWO prompt files
 * over real corpus threads and scores three panels:
 *
 *   (a) ADOPTION  — known adoption-miss reply sids: does any mention cite the
 *       reply's source id (i.e. the assent itself carries the mention)?
 *   (b) SHARED    — multi-name shared-verdict replies: are ALL names credited?
 *   (c) CONTROL   — random posts-with-comments; emission volume + junk-shape
 *       deltas to catch collateral damage.
 *
 * Read-only against the DB (SELECT only). Never touches the prompt registry.
 *
 *   yarn workspace api ts-node scripts/wild-ab-loop4.ts \
 *     --base-prompt=/abs/path/v16-registry.md \
 *     --adoption-file=... --shared-file=... --control=120 \
 *     [--community=austinfood] --out=/abs/path/wild-ab-loop4.json
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

/** SHARED-VERDICT targets: reply sid -> name groups; each group is a set of
 *  acceptable folded substrings for ONE establishment. */
const SHARED_TARGETS: Record<string, string[][]> = {
  t1_k1k3326: [['captain brad'], ['captain tom']],
  t1_jylgsjf: [['altdorf'], ['hye thai']],
  t1_k4cufax: [['tierra caliente', 'pasteleria'], ['mi tradicion']],
  t1_jtwmh83: [['chinese dragon'], ['jasmine'], ['neighbor']],
  t1_jyq8ac8: [['dittydog', 'ditty dog'], ['mission dog'], ['billy']],
};

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
  'buffet',
  'tasting menu',
  'prix fixe',
  'special',
  'daily special',
  'plate',
  'menu',
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

function citesSid(m: Mention, sid: string): boolean {
  return m.source_id === sid || m.place_source_id === sid;
}

async function main(): Promise<void> {
  const arg = (name: string, fallback?: string): string | undefined => {
    const found = process.argv.find((a) => a.startsWith(`--${name}=`));
    return found ? found.split('=').slice(1).join('=') : fallback;
  };
  const basePromptPath = arg('base-prompt');
  if (!basePromptPath) throw new Error('--base-prompt required');
  const adoptionFile = arg('adoption-file');
  const sharedFile = arg('shared-file');
  const controlCount = parseInt(arg('control', '120') as string, 10);
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

  const readSids = (file?: string): string[] =>
    file
      ? readFileSync(file, 'utf-8')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
      : [];

  /** Walk a comment sid up to its t3_ root post. */
  async function rootOf(sid: string): Promise<string | null> {
    let cur = sid;
    for (let hops = 0; hops < 20; hops++) {
      if (cur.startsWith('t3_')) return cur;
      const rows = await prisma.$queryRawUnsafe<
        Array<{ parent_source_id: string | null }>
      >(
        `SELECT parent_source_id FROM collection_source_documents WHERE source_id = $1`,
        cur,
      );
      const parent = rows[0]?.parent_source_id;
      if (!parent) return null;
      cur = parent;
    }
    return null;
  }

  /** Full thread under a post (BFS), capped, but always keeping the target
   *  sids and their ancestor chains. */
  async function buildThread(
    postSid: string,
    mustKeep: string[],
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
    if (!comments.length) return null;
    // ancestor chains of must-keep sids
    const byId = new Map(comments.map((c) => [c.source_id, c]));
    const keep = new Set<string>();
    for (const sid of mustKeep) {
      let cur: CommentRow | undefined = byId.get(sid);
      while (cur) {
        keep.add(cur.source_id);
        cur = byId.get(cur.parent_source_id);
      }
    }
    const chosen: CommentRow[] = [];
    for (const c of comments) {
      if (keep.has(c.source_id) || chosen.length < commentCap) chosen.push(c);
    }
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

  // ---- assemble the doc set --------------------------------------------
  type Job = {
    docId: string;
    panel: 'adoption' | 'shared' | 'control';
    targets: string[]; // reply sids scored on this doc
    payload: unknown;
  };
  const jobs: Job[] = [];
  const missingRoots: string[] = [];

  // panels a + b: group target sids by root post
  for (const [panel, sids] of [
    ['adoption', readSids(adoptionFile)],
    ['shared', readSids(sharedFile)],
  ] as const) {
    const byRoot = new Map<string, string[]>();
    for (const sid of sids) {
      const root = await rootOf(sid);
      if (!root) {
        missingRoots.push(sid);
        continue;
      }
      byRoot.set(root, [...(byRoot.get(root) ?? []), sid]);
    }
    for (const [root, targets] of byRoot) {
      const thread = await buildThread(root, targets);
      if (!thread) {
        missingRoots.push(...targets);
        continue;
      }
      jobs.push({ docId: root, panel, targets, payload: thread.payload });
    }
  }

  // panel c: random control
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
    const thread = await buildThread(post.source_id, []);
    if (thread)
      jobs.push({
        docId: post.source_id,
        panel: 'control',
        targets: [],
        payload: thread.payload,
      });
  }

  console.log(
    `WILD A/B loop-4 — ${jobs.length} docs (${jobs.filter((j) => j.panel === 'adoption').length} adoption / ${jobs.filter((j) => j.panel === 'shared').length} shared / ${jobs.filter((j) => j.panel === 'control').length} control) x 2 prompts`,
  );
  if (missingRoots.length)
    console.log(`  UNRESOLVED sids (skipped): ${missingRoots.join(', ')}`);

  // ---- run --------------------------------------------------------------
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
        if (done % 25 === 0) console.log(`  ...${done}/${units.length}`);
      }
    }),
  );

  // ---- score ------------------------------------------------------------
  const out: Record<string, unknown> = { jobs: [], errors };
  const panelSummary = {
    adoption: { targets: 0, baseHit: 0, candHit: 0 },
    shared: {
      names: 0,
      baseHit: 0,
      candHit: 0,
      docsAllBase: 0,
      docsAllCand: 0,
      docs: 0,
    },
    control: {
      docs: 0,
      baseMentions: 0,
      candMentions: 0,
      baseReal: 0,
      candReal: 0,
      baseJunk: 0,
      candJunk: 0,
      flagged: [] as string[],
    },
  };

  for (const job of jobs) {
    const entry = results.get(job.docId);
    if (!entry?.base || !entry?.cand) continue;
    const row: Record<string, unknown> = {
      docId: job.docId,
      panel: job.panel,
      baseCount: entry.base.length,
      candCount: entry.cand.length,
    };
    if (job.panel === 'adoption') {
      const per = job.targets.map((sid) => {
        const baseHits = entry.base!.filter((m) => citesSid(m, sid));
        const candHits = entry.cand!.filter((m) => citesSid(m, sid));
        panelSummary.adoption.targets += 1;
        if (baseHits.length) panelSummary.adoption.baseHit += 1;
        if (candHits.length) panelSummary.adoption.candHit += 1;
        return {
          sid,
          base: baseHits.map(
            (m) =>
              `${asStr(m.place_observed)}${m.item ? ` / ${asStr(m.item)}` : ''}`,
          ),
          cand: candHits.map(
            (m) =>
              `${asStr(m.place_observed)}${m.item ? ` / ${asStr(m.item)}` : ''}`,
          ),
        };
      });
      row.targets = per;
    } else if (job.panel === 'shared') {
      panelSummary.shared.docs += 1;
      const groups = job.targets.flatMap((sid) => SHARED_TARGETS[sid] ?? []);
      const placeBlob = (ms: Mention[]) =>
        ms.map((m) => fold(String(asStr(m.place_observed)))).join(' | ');
      const baseBlob = placeBlob(entry.base);
      const candBlob = placeBlob(entry.cand);
      const per = groups.map((names) => {
        const b = names.some((n) => baseBlob.includes(n));
        const c = names.some((n) => candBlob.includes(n));
        panelSummary.shared.names += 1;
        if (b) panelSummary.shared.baseHit += 1;
        if (c) panelSummary.shared.candHit += 1;
        return { names: names[0], base: b, cand: c };
      });
      if (per.every((p) => p.base)) panelSummary.shared.docsAllBase += 1;
      if (per.every((p) => p.cand)) panelSummary.shared.docsAllCand += 1;
      row.groups = per;
      row.basePlaces = entry.base.map((m) => m.place_observed);
      row.candPlaces = entry.cand.map((m) => m.place_observed);
    } else {
      const b = mentionShapes(entry.base);
      const c = mentionShapes(entry.cand);
      panelSummary.control.docs += 1;
      panelSummary.control.baseMentions += entry.base.length;
      panelSummary.control.candMentions += entry.cand.length;
      panelSummary.control.baseReal += b.real;
      panelSummary.control.candReal += c.real;
      panelSummary.control.baseJunk += b.junk;
      panelSummary.control.candJunk += c.junk;
      row.baseShapes = b;
      row.candShapes = c;
      row.baseRows = entry.base.map(
        (m) =>
          `${asStr(m.place_observed)} / ${asStr(m.item)} @${asStr(m.source_id)}`,
      );
      row.candRows = entry.cand.map(
        (m) =>
          `${asStr(m.place_observed)} / ${asStr(m.item)} @${asStr(m.source_id)}`,
      );
      if (c.junk > b.junk || c.real < b.real)
        panelSummary.control.flagged.push(job.docId);
    }
    (out.jobs as unknown[]).push(row);
  }
  out.summary = panelSummary;

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(panelSummary, null, 2));
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
