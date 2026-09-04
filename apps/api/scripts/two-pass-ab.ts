/**
 * @script-class: probe
 * @finding: the two-pass (decompose-first) extraction A/B — chunk-context
 *   leak floor measurement, owner-ordered 2026-09-03. Results banked in
 *   plans/two-pass-extraction.md.
 *
 * SINGLE-PASS vs TWO-PASS on REAL production chunks. Variant A runs the
 * candidate prompt exactly as production does (llm.processContent over the
 * stored input_payload). Variant B first runs the DECOMPOSE pass
 * (decompose-pass-prompt.md — subjects/clauses/acts/landings as structured
 * output) over the same payload, then runs the SAME candidate prompt with
 * the decomposition appended to the payload and a short instruction to
 * consult it. Output schema identical, so leak-marker grading is mechanical.
 *
 * The chunks are the stored inputs whose documents produced the audited v22
 * chunk-context leaks — shapes that pass 3/3 in isolation and still leak
 * inside 30-document chunks. If two-pass is worth building, THESE are the
 * cases it must move.
 *
 *   STAGING_DB_URL=<url> npx ts-node -T scripts/two-pass-ab.ts \
 *     [--repeat=2] [--inputs=<id,id,...>] [--random=<n>]
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { dateStamp, runTaggedScript } from './lib/script-run-key';
import { PrismaClient, Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';
import { activeExtractionInputsJoinSql } from '../src/modules/content-processing/reddit-collector/extraction-scope.service';

const PROMPT_DIR = join(
  __dirname,
  '../src/modules/external-integrations/llm/prompts',
);

/** The audited leak chunks (staging, active generation) and the marker each
 *  one must NOT produce. Markers check the model's raw mentions. */
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const LEAK_CHUNKS: Array<{
  label: string;
  inputId: string;
  forbidden: (m: Record<string, unknown>) => string | null;
}> = [
  {
    label: 'castle-hill-ruin',
    inputId: 'f58e255c-4eb8-4975-8bbc-d3b4ffaae9e6',
    forbidden: (m) =>
      /castle hill/i.test(str(m.place_observed) || str(m.place))
        ? 'castle hill banked despite stated ruin'
        : null,
  },
  {
    label: 'frog-leaps-heb',
    inputId: 'e0a3d65a-12b8-4add-ad99-7acfa5828b6f',
    forbidden: (m) =>
      /frog/i.test(JSON.stringify(m)) ? 'wine brand banked at heb' : null,
  },
  {
    label: 'mil-ask-attrs',
    inputId: '44e5b193-9cd7-43a2-a1d5-e8a39f7f2e0a',
    forbidden: (m) =>
      /famil|kid|child/i.test(
        JSON.stringify(m.place_attributes ?? m.restaurant_attributes ?? []),
      )
        ? 'family/kid attribute inferred from the ask'
        : null,
  },
  {
    label: 'nomad-rent-room',
    inputId: 'b523429c-ca02-44cf-9464-ab7d422dae1e',
    forbidden: (m) =>
      /nomad bar|josephine house/i.test(str(m.place_observed) || str(m.place))
        ? 'venue banked under rent-a-room ask'
        : null,
  },
  {
    label: 'oskar-blues-truck',
    inputId: '5b0ffc2a-a26e-4db9-9d2d-7abfb11f343e',
    forbidden: (m) => {
      const p = str(m.place_observed) || str(m.place);
      return /oskar blues/i.test(p) && !/truck/i.test(p)
        ? 'host venue credited for its unnamed truck'
        : null;
    },
  },
  {
    label: 'south-lamar-location',
    inputId: '29277c53-68d7-4ad6-b315-e13fa24dd2f4',
    forbidden: (m) =>
      /^(the )?south lamar location$/i.test(
        str(m.place_observed) || str(m.place).trim(),
      )
        ? 'branch reference emitted as a place name'
        : null,
  },
];

const TWO_PASS_APPENDIX = `

## Appendix — a prior DECOMPOSITION pass

The payload carries a "decomposition" field: a prior pass already listed,
for every source, its subjects, each subject's clauses with their acts, the
landing clause, and the venue relationship (unnamed vendor at a host,
branch reference, retail shelf). Use it as your step A.0 worksheet: judge
each listed subject one at a time against the doctrine above, on ITS OWN
clauses only. Where the decomposition and the text disagree, the TEXT
wins — but do not silently drop a listed subject or invent an unlisted
one without re-checking the text.`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (name: string, dflt: string): string => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split('=')[1] : dflt;
  };
  const repeat = Number(arg('repeat', '2'));
  const stagingUrl = process.env.STAGING_DB_URL;
  if (!stagingUrl) throw new Error('STAGING_DB_URL required');

  const staging = new PrismaClient({
    datasources: { db: { url: stagingUrl } },
  });
  const explicit = arg('inputs', '');
  const chunkIds = explicit
    ? explicit.split(',')
    : LEAK_CHUNKS.map((c) => c.inputId);
  const randomN = Number(arg('random', '0'));
  const payloads = await staging.$queryRaw<
    Array<{ input_id: string; input_payload: unknown }>
  >(Prisma.sql`
    SELECT input_id, input_payload FROM collection_extraction_inputs
     WHERE input_id = ANY(${chunkIds}::uuid[])`);
  if (randomN > 0) {
    const extra = await staging.$queryRaw<
      Array<{ input_id: string; input_payload: unknown }>
    >(Prisma.sql`
      SELECT i.input_id, i.input_payload
      ${Prisma.raw(activeExtractionInputsJoinSql())}
       WHERE d.community = 'austinfood'
       GROUP BY i.input_id, i.input_payload ORDER BY random() LIMIT ${randomN}`);
    payloads.push(...extra);
  }
  await staging.$disconnect();
  console.log(`${payloads.length} chunks, repeat=${repeat}.`);

  const candidatePrompt = readFileSync(
    join(PROMPT_DIR, 'collection-prompt.candidate.md'),
    'utf8',
  );
  const decomposePrompt = readFileSync(
    join(PROMPT_DIR, 'decompose-pass-prompt.md'),
    'utf8',
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const approxTokens = (s: string): number => Math.round(s.length / 4);
  try {
    const llm = app.get(LLMService);
    const totals = {
      single: { inTok: 0, outTok: 0, leaks: [] as string[], mentions: 0 },
      two: { inTok: 0, outTok: 0, leaks: [] as string[], mentions: 0 },
      // Variant C — ISOLATION, no decomposition: the same single-pass
      // prompt, one call PER POST (post + its own comments). Tests whether
      // chunk context is the whole disease: per-post is the regime where
      // pinned shapes certify 3/3.
      perPost: { inTok: 0, outTok: 0, leaks: [] as string[], mentions: 0 },
      // Variant D — WINDOWED: the owner's lower-chunk-cap experiment. The
      // thread's TOP-LEVEL SUBTREES (a parent comment + all its replies)
      // are greedily packed into windows of <= windowK comments; a subtree
      // is never split, and every window carries the post. Measures the
      // attention-vs-cross-window-context trade (PLACE STATUS closure in a
      // sibling subtree is invisible to other windows — the honest cost).
      windowed: { inTok: 0, outTok: 0, leaks: [] as string[], mentions: 0 },
    };
    const windowK = Number(arg('windowK', '10'));
    for (const chunk of payloads) {
      const payload = chunk.input_payload as Record<string, unknown>;
      const markers = LEAK_CHUNKS.filter((c) => c.inputId === chunk.input_id);
      for (let run = 1; run <= repeat; run += 1) {
        // ── Variant A: single pass, production-faithful.
        const a = await llm.processContent(payload as never, candidatePrompt);
        const aMentions = Array.isArray(a?.mentions)
          ? (a.mentions as unknown as Array<Record<string, unknown>>)
          : [];
        totals.single.inTok += approxTokens(
          candidatePrompt + JSON.stringify(payload),
        );
        totals.single.outTok += approxTokens(JSON.stringify(aMentions));
        totals.single.mentions += aMentions.length;
        for (const c of markers)
          for (const m of aMentions) {
            const hit = c.forbidden(m);
            if (hit) totals.single.leaks.push(`[${c.label} r${run}] ${hit}`);
          }

        // ── Variant B: decompose, then extract with the worksheet.
        const decomposedText = await llm.generateForCaller({
          caller: 'content.extract',
          systemInstruction: decomposePrompt,
          prompt: JSON.stringify(payload),
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
          },
        });
        totals.two.inTok += approxTokens(
          decomposePrompt + JSON.stringify(payload),
        );
        totals.two.outTok += approxTokens(decomposedText);
        let decomposition: unknown = null;
        try {
          decomposition = JSON.parse(
            decomposedText.slice(
              decomposedText.indexOf('{'),
              decomposedText.lastIndexOf('}') + 1,
            ),
          );
        } catch {
          console.log(`  [${chunk.input_id} r${run}] pass-1 parse FAILED`);
        }
        const b = await llm.processContent(
          { ...payload, decomposition } as never,
          candidatePrompt + TWO_PASS_APPENDIX,
        );
        const bMentions = Array.isArray(b?.mentions)
          ? (b.mentions as unknown as Array<Record<string, unknown>>)
          : [];
        totals.two.inTok += approxTokens(
          candidatePrompt +
            TWO_PASS_APPENDIX +
            JSON.stringify({ ...payload, decomposition }),
        );
        totals.two.outTok += approxTokens(JSON.stringify(bMentions));
        totals.two.mentions += bMentions.length;
        for (const c of markers)
          for (const m of bMentions) {
            const hit = c.forbidden(m);
            if (hit) totals.two.leaks.push(`[${c.label} r${run}] ${hit}`);
          }
        // ── Variant D: windowed sub-chunks.
        const post0 = (payload as { posts?: Array<Record<string, unknown>> })
          .posts?.[0];
        if (post0) {
          const comments = Array.isArray(post0.comments)
            ? (post0.comments as Array<Record<string, unknown>>)
            : [];
          const byId = new Map(comments.map((c) => [String(c.id), c]));
          const topOf = (c: Record<string, unknown>): string => {
            let cur = c;
            const seen = new Set<string>();
            while (str(cur.parent_id) && byId.has(str(cur.parent_id))) {
              const id = String(cur.id);
              if (seen.has(id)) break;
              seen.add(id);
              cur = byId.get(str(cur.parent_id))!;
            }
            return String(cur.id);
          };
          const subtrees = new Map<string, Array<Record<string, unknown>>>();
          for (const c of comments) {
            const top = topOf(c);
            subtrees.set(top, [...(subtrees.get(top) ?? []), c]);
          }
          const windows: Array<Array<Record<string, unknown>>> = [];
          let cur: Array<Record<string, unknown>> = [];
          for (const tree of subtrees.values()) {
            if (cur.length && cur.length + tree.length > windowK) {
              windows.push(cur);
              cur = [];
            }
            cur.push(...tree);
          }
          if (cur.length) windows.push(cur);
          for (const win of windows) {
            const sub = {
              ...payload,
              posts: [{ ...post0, comments: win }],
            };
            const dResult = await llm.processContent(
              sub as never,
              candidatePrompt,
            );
            const dMentions = Array.isArray(dResult?.mentions)
              ? (dResult.mentions as unknown as Array<Record<string, unknown>>)
              : [];
            totals.windowed.inTok += approxTokens(
              candidatePrompt + JSON.stringify(sub),
            );
            totals.windowed.outTok += approxTokens(JSON.stringify(dMentions));
            totals.windowed.mentions += dMentions.length;
            for (const c of markers)
              for (const m of dMentions) {
                const hit = c.forbidden(m);
                if (hit)
                  totals.windowed.leaks.push(`[${c.label} r${run}] ${hit}`);
              }
          }
        }

        // ── Variant C: per-post isolation.
        const posts = Array.isArray((payload as { posts?: unknown[] }).posts)
          ? ((payload as { posts: unknown[] }).posts as Array<
              Record<string, unknown>
            >)
          : [];
        for (const post of posts) {
          const sub = { ...payload, posts: [post] };
          const cResult = await llm.processContent(
            sub as never,
            candidatePrompt,
          );
          const cMentions = Array.isArray(cResult?.mentions)
            ? (cResult.mentions as unknown as Array<Record<string, unknown>>)
            : [];
          totals.perPost.inTok += approxTokens(
            candidatePrompt + JSON.stringify(sub),
          );
          totals.perPost.outTok += approxTokens(JSON.stringify(cMentions));
          totals.perPost.mentions += cMentions.length;
          for (const c of markers)
            for (const m of cMentions) {
              const hit = c.forbidden(m);
              if (hit) totals.perPost.leaks.push(`[${c.label} r${run}] ${hit}`);
            }
        }
      }
      console.log(`chunk ${chunk.input_id} done.`);
    }
    console.log('\n--- TWO-PASS A/B ---');
    for (const [name, t] of Object.entries(totals)) {
      console.log(
        `${name}: ~${t.inTok} in-tok, ~${t.outTok} out-tok, ${t.mentions} mentions, ${t.leaks.length} leaks`,
      );
      for (const l of t.leaks) console.log(`   LEAK ${l}`);
    }
    console.log(
      `cost ratio (two-pass / single): ~${(
        (totals.two.inTok + 3 * totals.two.outTok) /
        Math.max(1, totals.single.inTok + 3 * totals.single.outTok)
      ).toFixed(2)}x (output weighted 3x)`,
    );
    // Durable copy — piped stdout has lost final flushes before.
    writeFileSync(
      '/tmp/two-pass-ab.result.json',
      JSON.stringify(totals, null, 1),
    );
  } finally {
    await app.close();
  }
}

void runTaggedScript(
  `two-pass-ab:${
    process.argv
      .slice(2)
      .join(',')
      .replace(/[^a-z0-9=,]/gi, '') || 'default'
  }:${dateStamp()}`,
  main,
).catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
