import 'dotenv/config';
// PROCESS_ROLE 'all' so the DI graph resolves (CollectionSchedulerService
// needs the worker-side scheduler providers); the flags below keep every
// background lane inert for the duration of the run.
process.env.PROCESS_ROLE ||= 'all';
// Force interactive extraction, no background collection machinery.
delete process.env.COLLECTION_LLM_MODE;
process.env.LLM_BATCH_POLL_ENABLED = 'false';
process.env.COLLECTION_JOBS_ENABLED = 'false';
process.env.COLLECTION_SCHEDULER_ENABLED = 'false';

import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import { LLMChunkingService } from '../src/modules/external-integrations/llm/llm-chunking.service';
import type {
  LLMMention,
  LLMModelInput,
  LLMProcessingInput,
  LLMSourceMap,
} from '../src/modules/external-integrations/llm/llm.types';

/**
 * packing-ab.ts — PACKED vs UNPACKED contamination A/B for the cross-post
 * packing that landed in llm-chunking.service.ts (packChunks) + the per-post
 * scoping edits in prompts/collection-prompt.md. Ship-gate: packing must not
 * leak restaurants/foods across post boundaries.
 *
 * Samples N already-collected r/austinfood posts (post + full comment tree
 * reconstructed from collection_source_documents via parent_source_id), then
 * runs the REAL llmService.processContent path three ways:
 *   A  — one post per request (legacy shape), SRC refs + per-request source_map
 *   B  — all posts through llmChunkingService.createContextualChunks with
 *        LLM_CHUNK_TARGET_TOKENS (default 30000), i.e. the new packer
 *   A2 — arm A re-run on the first BASELINE posts, to measure run-to-run
 *        LLM variance as the churn baseline
 *
 * Mentions are keyed (canonical source_id, restaurant lc, food lc) and
 * compared:
 *   1. CONTAMINATION (gate = ZERO): a B mention whose restaurant/food neither
 *      appears anywhere in A's output for that post NOR in the post's own
 *      text — i.e. it can only have come from a co-packed post.
 *   2. CHURN: symmetric key diff A vs B per post, vs the A-vs-A2 baseline.
 *   3. CANONICAL CONSISTENCY: per post, restaurant canonical names that
 *      changed between A and B while the surface is present in the post text.
 *
 *   yarn ts-node scripts/packing-ab.ts                 # run all arms + report
 *   PHASE=report yarn ts-node scripts/packing-ab.ts    # re-report saved JSON
 *   SAMPLE=50 BASELINE=10 PACK_TOKENS=30000 overrides
 *
 * Results land in scratchpad/packing-ab-{a,b,a2}.json (not committed).
 */

const OUT_DIR = path.join(__dirname, '../scratchpad');
const SAMPLE = Number(process.env.SAMPLE ?? 50);
const BASELINE = Number(process.env.BASELINE ?? 10);
const PACK_TOKENS = process.env.PACK_TOKENS ?? '30000';

interface DocRow {
  source_id: string;
  parent_source_id: string | null;
  title: string | null;
  body: string | null;
  community: string | null;
  url: string | null;
  source_created_at: Date | null;
  score_snapshot: number | null;
}

interface MentionRecord {
  postId: string; // canonical post source_id this mention's source belongs to
  sourceId: string; // canonical source id (post or comment)
  chunkTag: string; // request identifier (post id for A, pack id for B)
  mention: LLMMention;
}

interface ArmResult {
  arm: string;
  requests: number;
  totalTokens: number;
  invalidRefs: string[];
  records: MentionRecord[];
}

type LLMPostShape = LLMModelInput['posts'][number];

function fixUrl(u: string | null | undefined, id: string): string {
  return u && /^https?:\/\//.test(u) ? u : `https://reddit.com/${id}`;
}

function buildPost(post: DocRow, comments: DocRow[]): LLMPostShape {
  return {
    id: post.source_id,
    title: post.title ?? '',
    content: post.body ?? '',
    subreddit: post.community ?? 'austinfood',
    author: 'redacted',
    url: fixUrl(post.url, post.source_id),
    score: post.score_snapshot ?? 0,
    created_at: (post.source_created_at ?? new Date(0)).toISOString(),
    comments: comments.map((c) => ({
      id: c.source_id,
      content: c.body ?? '',
      author: 'redacted',
      score: c.score_snapshot ?? 0,
      created_at: (c.source_created_at ?? new Date(0)).toISOString(),
      parent_id: c.parent_source_id,
      url: fixUrl(c.url, c.source_id),
    })),
  };
}

/** Assign SRC refs to a chunk (mirrors the pipeline's normalizeSourceRefsInInput). */
function normalizeRefs(input: LLMModelInput): {
  input: LLMProcessingInput;
  refToCanonical: Map<string, string>;
} {
  const sourceMap: LLMSourceMap = {};
  const canonicalToRef = new Map<string, string>();
  let next = 1;
  const assign = (canonicalId: string, sourceType: 'post' | 'comment') => {
    const existing = canonicalToRef.get(canonicalId);
    if (existing) return existing;
    const ref = `SRC${String(next++).padStart(3, '0')}`;
    canonicalToRef.set(canonicalId, ref);
    sourceMap[ref] = { canonical_id: canonicalId, source_type: sourceType };
    return ref;
  };
  const posts = input.posts.map((post) => {
    const postRef = assign(post.id, 'post');
    return {
      ...post,
      id: postRef,
      comments: (post.comments ?? []).map((c) => ({
        ...c,
        id: assign(c.id, 'comment'),
        parent_id: c.parent_id
          ? (canonicalToRef.get(c.parent_id) ?? null)
          : null,
      })),
    };
  });
  const refToCanonical = new Map(
    Object.entries(sourceMap).map(([ref, e]) => [ref, e.canonical_id]),
  );
  return { input: { posts, source_map: sourceMap }, refToCanonical };
}

async function loadPosts(prisma: PrismaService): Promise<{
  posts: LLMPostShape[];
  sourceToPost: Map<string, string>;
  postText: Map<string, string>;
}> {
  // Deterministic sample: austinfood posts with a modest comment tree
  // (packable, cheap), most-commented first, stable tiebreak.
  const postRows = await prisma.$queryRawUnsafe<DocRow[]>(
    `WITH counts AS (
       SELECT p.source_id, count(c.*) AS n
       FROM collection_source_documents p
       LEFT JOIN collection_source_documents c
         ON c.source_type='comment' AND c.parent_source_id = p.source_id
       WHERE p.source_type='post' AND p.community='austinfood'
         AND p.source_id NOT LIKE 'poll-%'
       GROUP BY p.source_id)
     SELECT d.source_id, d.parent_source_id, d.title, d.body, d.community,
            d.url, d.source_created_at, d.score_snapshot
     FROM collection_source_documents d
     JOIN counts ON counts.source_id = d.source_id
     WHERE counts.n BETWEEN 3 AND 15
     ORDER BY counts.n DESC, d.source_id ASC
     LIMIT ${SAMPLE}`,
  );

  const posts: LLMPostShape[] = [];
  const sourceToPost = new Map<string, string>();
  const postText = new Map<string, string>();
  for (const post of postRows) {
    // Full comment tree via parent_source_id chain.
    const comments = await prisma.$queryRawUnsafe<DocRow[]>(
      `WITH RECURSIVE tree AS (
         SELECT d.* FROM collection_source_documents d
         WHERE d.source_type='comment' AND d.parent_source_id = $1
         UNION ALL
         SELECT d.* FROM collection_source_documents d
         JOIN tree t ON d.parent_source_id = t.source_id
         WHERE d.source_type='comment')
       SELECT source_id, parent_source_id, title, body, community, url,
              source_created_at, score_snapshot
       FROM tree ORDER BY source_id ASC LIMIT 60`,
      post.source_id,
    );
    posts.push(buildPost(post, comments));
    sourceToPost.set(post.source_id, post.source_id);
    for (const c of comments) sourceToPost.set(c.source_id, post.source_id);
    postText.set(
      post.source_id,
      [post.title, post.body, ...comments.map((c) => c.body)]
        .filter(Boolean)
        .join('\n')
        .toLowerCase(),
    );
  }
  return { posts, sourceToPost, postText };
}

async function runChunks(
  llm: LLMService,
  arm: string,
  chunks: { tag: string; input: LLMModelInput }[],
  sourceToPost: Map<string, string>,
): Promise<ArmResult> {
  const out = (m: string) => process.stdout.write(`${m}\n`);
  const result: ArmResult = {
    arm,
    requests: 0,
    totalTokens: 0,
    invalidRefs: [],
    records: [],
  };
  for (const { tag, input } of chunks) {
    const { input: normalized, refToCanonical } = normalizeRefs(input);
    const started = Date.now();
    const output = await llm.processContent(normalized);
    result.requests += 1;
    result.totalTokens +=
      (output.usageMetadata as { totalTokenCount?: number } | null)
        ?.totalTokenCount ?? 0;
    for (const mention of output.mentions) {
      const ref = (mention.source_id ?? '')
        .trim()
        .replace(/^t[13]_(?=SRC)/i, '');
      const canonical = refToCanonical.get(ref);
      const postId = canonical ? sourceToPost.get(canonical) : undefined;
      if (!canonical || !postId) {
        result.invalidRefs.push(`${arm}/${tag}: ${mention.source_id}`);
        continue;
      }
      result.records.push({
        postId,
        sourceId: canonical,
        chunkTag: tag,
        mention,
      });
    }
    out(
      `  [${arm}] ${tag}: posts=${input.posts.length} mentions=${output.mentions.length} ${Date.now() - started}ms`,
    );
  }
  return result;
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const keyOf = (r: MentionRecord) =>
  `${r.sourceId}|${norm(r.mention.restaurant)}|${norm(r.mention.food)}`;
const postKeyOf = (r: MentionRecord) =>
  `${norm(r.mention.restaurant)}|${norm(r.mention.food)}`;

function churn(
  a: MentionRecord[],
  b: MentionRecord[],
  postIds: string[],
): { onlyA: string[]; onlyB: string[]; union: number; rate: number } {
  const scope = new Set(postIds);
  const setA = new Set(a.filter((r) => scope.has(r.postId)).map(keyOf));
  const setB = new Set(b.filter((r) => scope.has(r.postId)).map(keyOf));
  const onlyA = [...setA].filter((k) => !setB.has(k));
  const onlyB = [...setB].filter((k) => !setA.has(k));
  const union = new Set([...setA, ...setB]).size;
  return {
    onlyA,
    onlyB,
    union,
    rate: union === 0 ? 0 : (onlyA.length + onlyB.length) / union,
  };
}

function report(
  a: ArmResult,
  b: ArmResult,
  a2: ArmResult | null,
  postText: Map<string, string>,
  postIds: string[],
): void {
  const out = (m = '') => process.stdout.write(`${m}\n`);

  // Per-post name sets from A (any source in the post).
  const aNamesByPost = new Map<string, Set<string>>();
  for (const r of a.records) {
    const set = aNamesByPost.get(r.postId) ?? new Set<string>();
    if (norm(r.mention.restaurant)) set.add(norm(r.mention.restaurant));
    if (norm(r.mention.food)) set.add(norm(r.mention.food));
    aNamesByPost.set(r.postId, set);
  }
  // Which posts shared a packed request (for attribution of contaminants).
  const packMembers = new Map<string, Set<string>>();
  for (const r of b.records) {
    const set = packMembers.get(r.chunkTag) ?? new Set<string>();
    set.add(r.postId);
    packMembers.set(r.chunkTag, set);
  }

  // Matching must survive canonicalization noise: strip punctuation entirely
  // (aster's -> asters, hi-wings -> hiwings), expand "bbq", and try naive
  // singular/plural variants (pastries -> pastry).
  const canonText = (s: string) =>
    s.replace(/\bbbq\b/g, 'barbecue').replace(/\bbar-b-q(ue)?\b/g, 'barbecue');
  const squash = (s: string) => canonText(s).replace(/[^a-z0-9]/g, '');
  const variantsOf = (name: string): string[] => {
    const v = new Set<string>([name, `${name}s`, `${name}es`]);
    if (name.endsWith('ies')) v.add(`${name.slice(0, -3)}y`);
    if (name.endsWith('es')) v.add(name.slice(0, -2));
    if (name.endsWith('s')) v.add(name.slice(0, -1));
    if (name.endsWith('y')) v.add(`${name.slice(0, -1)}ies`);
    return [...v];
  };
  const nameInText = (name: string, squashedText: string) =>
    variantsOf(name).some((v) => squashedText.includes(squash(v)));

  const contaminants: string[] = [];
  const canonicalDrift: string[] = [];
  const synthesis: string[] = [];
  for (const r of b.records) {
    const aNames = aNamesByPost.get(r.postId) ?? new Set<string>();
    const squashedText = squash(postText.get(r.postId) ?? '');
    for (const [kind, name] of [
      ['restaurant', norm(r.mention.restaurant)],
      ['food', norm(r.mention.food)],
    ] as const) {
      if (!name) continue;
      if (aNames.has(name)) continue;
      if (nameInText(name, squashedText)) continue;
      // Loose own-anchor checks: any long token of the name in the post text,
      // or substring overlap with a name A extracted for this post (canonical
      // expansion/reordering of a surface that IS anchored in the post).
      const tokens = name.split(/[^a-z0-9']+/).filter((t) => t.length > 2);
      const tokenHit =
        tokens.length > 0 &&
        tokens.some((t) => squashedText.includes(squash(t)));
      const aOverlap = [...aNames].some(
        (n) =>
          n.length > 2 &&
          (squash(n).includes(squash(name)) ||
            squash(name).includes(squash(n))),
      );
      const siblings = [...(packMembers.get(r.chunkTag) ?? [])].filter(
        (p) => p !== r.postId,
      );
      const fromSibling = siblings.some((p) =>
        nameInText(name, squash(postText.get(p) ?? '')),
      );
      const line = `${kind}="${name}" attributed to ${r.sourceId} (post ${r.postId}, ${r.chunkTag})`;
      if (tokenHit || aOverlap) {
        // Anchored (at least partially) in this post — canonical drift, not
        // leakage; surface it when the drifted form matches a sibling post.
        if (fromSibling) {
          canonicalDrift.push(
            `${line} — drifted form matches a co-packed post`,
          );
        }
        continue;
      }
      if (fromSibling) {
        // GATE: the name exists in a co-packed post but not in this one —
        // only packing can have put it here.
        contaminants.push(
          `${line} — PRESENT IN A CO-PACKED POST (cross-post leak)`,
        );
      } else {
        // Name absent from every post in the pack: model synthesis /
        // normalization, a class that exists in single-post mode too.
        synthesis.push(line);
      }
    }
  }

  const abChurn = churn(a.records, b.records, postIds);
  const baseChurn = a2
    ? churn(
        a.records,
        a2.records,
        postIds.slice(0, Math.min(BASELINE, postIds.length)),
      )
    : null;

  // Canonical consistency: per post, (restaurant,food) pairs that differ.
  let canonicalChanged = 0;
  const canonicalExamples: string[] = [];
  for (const postId of postIds) {
    const ra = new Set(
      a.records.filter((r) => r.postId === postId).map(postKeyOf),
    );
    const rb = new Set(
      b.records.filter((r) => r.postId === postId).map(postKeyOf),
    );
    const onlyB = [...rb].filter((k) => !ra.has(k));
    const onlyA = [...ra].filter((k) => !rb.has(k));
    if (onlyA.length || onlyB.length) {
      canonicalChanged += 1;
      if (canonicalExamples.length < 8) {
        canonicalExamples.push(
          `${postId}: only-A=[${onlyA.join('; ')}] only-B=[${onlyB.join('; ')}]`,
        );
      }
    }
  }

  out();
  out('================ PACKING A/B REPORT ================');
  out(
    `posts=${postIds.length}  A requests=${a.requests} (tokens ${a.totalTokens})  B requests=${b.requests} (tokens ${b.totalTokens})`,
  );
  out(`A mentions=${a.records.length}  B mentions=${b.records.length}`);
  if (a.invalidRefs.length || b.invalidRefs.length) {
    out(
      `invalid source refs: A=${a.invalidRefs.length} B=${b.invalidRefs.length}`,
    );
    [...a.invalidRefs, ...b.invalidRefs]
      .slice(0, 10)
      .forEach((x) => out(`  ${x}`));
  }
  out();
  out(
    `CONTAMINATION GATE: ${contaminants.length === 0 ? 'PASS (zero)' : `FAIL (${contaminants.length})`}`,
  );
  contaminants.slice(0, 20).forEach((c) => out(`  !! ${c}`));
  if (canonicalDrift.length) {
    out(
      `canonical drift (anchored in own post, drifted form matches a co-packed post; not gated): ${canonicalDrift.length}`,
    );
    canonicalDrift.slice(0, 10).forEach((c) => out(`  ~ ${c}`));
  }
  if (synthesis.length) {
    out(
      `synthesized names (absent from every packed post's text; not packing-caused, not gated): ${synthesis.length}`,
    );
    synthesis.slice(0, 10).forEach((c) => out(`  ~ ${c}`));
  }
  out();
  out(
    `CHURN A-vs-B: ${(abChurn.rate * 100).toFixed(1)}% (onlyA=${abChurn.onlyA.length} onlyB=${abChurn.onlyB.length} union=${abChurn.union})`,
  );
  if (baseChurn) {
    out(
      `BASELINE A-vs-A2 (${Math.min(BASELINE, postIds.length)} posts): ${(baseChurn.rate * 100).toFixed(1)}% (onlyA=${baseChurn.onlyA.length} onlyA2=${baseChurn.onlyB.length} union=${baseChurn.union})`,
    );
  }
  out();
  out(
    `CANONICAL/SET CONSISTENCY: ${canonicalChanged}/${postIds.length} posts changed (restaurant,food) sets`,
  );
  canonicalExamples.forEach((x) => out(`  ${x}`));
  out('====================================================');
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = (tag: string) => path.join(OUT_DIR, `packing-ab-${tag}.json`);
  const phase = process.env.PHASE ?? 'run';

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    const llm = app.get(LLMService);
    const chunker = app.get(LLMChunkingService);

    const { posts, sourceToPost, postText } = await loadPosts(prisma);
    const postIds = posts.map((p) => p.id);
    process.stdout.write(
      `sample=${posts.length} posts, comments=${posts.reduce((s, p) => s + p.comments.length, 0)}, model=${process.env.LLM_MODEL}\n`,
    );

    const loadOr = async (
      tag: string,
      run: () => Promise<ArmResult>,
    ): Promise<ArmResult> => {
      if (
        fs.existsSync(file(tag)) &&
        (phase === 'report' || process.env.RESUME === '1')
      ) {
        return JSON.parse(fs.readFileSync(file(tag), 'utf8')) as ArmResult;
      }
      if (phase === 'report') throw new Error(`missing ${file(tag)}`);
      const res = await run();
      fs.writeFileSync(file(tag), JSON.stringify(res, null, 2));
      return res;
    };

    // ARM A: one post per request (legacy shape).
    const a = await loadOr('a', () =>
      runChunks(
        llm,
        'A',
        posts.map((p) => ({ tag: p.id, input: { posts: [p] } })),
        sourceToPost,
      ),
    );

    // ARM B: the new packer at the target token budget.
    const b = await loadOr('b', async () => {
      process.env.LLM_CHUNK_TARGET_TOKENS = PACK_TOKENS;
      const { chunks, metadata } = chunker.createContextualChunks({ posts });
      process.stdout.write(
        `packer: ${posts.length} posts -> ${chunks.length} packed requests (target=${PACK_TOKENS})\n`,
      );
      return runChunks(
        llm,
        'B',
        chunks.map((c, i) => ({
          tag: metadata[i]?.chunkId ?? `pack_${i}`,
          input: c,
        })),
        sourceToPost,
      );
    });

    // ARM A2: variance baseline (arm A re-run on the first BASELINE posts).
    const a2 =
      BASELINE > 0
        ? await loadOr('a2', () =>
            runChunks(
              llm,
              'A2',
              posts
                .slice(0, BASELINE)
                .map((p) => ({ tag: p.id, input: { posts: [p] } })),
              sourceToPost,
            ),
          )
        : null;

    report(a, b, a2, postText, postIds);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
