/**
 * Relevance-gate PACK-DENSITY replay: same labeled corpus as replay.ts but
 * packed with the EXACT production packing algorithm from
 * relevance-gate.service.ts (PACK_TOKEN_BUDGET=20000, PACK_MAX_POSTS=25,
 * greedy in order). Compares P/R vs the low/mixed-density baseline.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';

const DIR = '/Users/brandonkimble/Crave/apps/api/scripts/relevance-gate';
const PROMPT = fs.readFileSync(
  '/Users/brandonkimble/Crave/apps/api/src/modules/external-integrations/llm/prompts/relevance-gate-prompt.md',
  'utf8',
);

interface Sample {
  sub: string;
  id: string;
  title: string;
  body: string;
}

const PACK_TOKEN_BUDGET = 20000;
const PACK_MAX_POSTS = 25;

async function main() {
  const labels = JSON.parse(
    fs.readFileSync(path.join(DIR, 'calibration-labels.json'), 'utf8'),
  ) as Record<string, number>;
  const samples = fs
    .readFileSync(path.join(DIR, 'calibration-sample.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Sample)
    .filter((s) => s.id in labels);

  // production packing (verbatim algorithm from relevance-gate.service.ts)
  const batches: Sample[][] = [];
  let current: Sample[] = [];
  let currentTokens = 0;
  for (const post of samples) {
    const postTokens = Math.ceil(
      (post.title.length + (post.body ?? '').length) / 4,
    );
    if (
      current.length &&
      (current.length >= PACK_MAX_POSTS ||
        currentTokens + postTokens > PACK_TOKEN_BUDGET)
    ) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(post);
    currentTokens += postTokens;
  }
  if (current.length) batches.push(current);
  console.log(
    `replaying ${samples.length} posts in ${batches.length} production-shape packs:`,
    batches
      .map(
        (b) =>
          `${b.length}p/${Math.ceil(b.reduce((s, p) => s + p.title.length + (p.body ?? '').length, 0) / 4)}t`,
      )
      .join(' '),
  );

  const ai = new GoogleGenAI({ apiKey: process.env.LLM_API_KEY ?? '' });
  const verdicts = new Map<string, { keep: boolean; reason?: string }>();
  let inTok = 0,
    outTok = 0;
  for (const batch of batches) {
    const payload = batch.map((s, j) => ({
      index: j,
      title: s.title,
      body: s.body,
    }));
    const res = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: [
        {
          parts: [
            { text: `${PROMPT}\n\n## Posts\n\n${JSON.stringify(payload)}` },
          ],
        },
      ],
      config: {
        temperature: 0,
        responseMimeType: 'application/json',
        maxOutputTokens: 65536,
      },
    });
    inTok += res.usageMetadata?.promptTokenCount ?? 0;
    outTok += res.usageMetadata?.candidatesTokenCount ?? 0;
    const text = res.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const rawParsed = JSON.parse(text) as unknown;
    const vs = (
      Array.isArray(rawParsed)
        ? rawParsed
        : (rawParsed as Record<string, unknown>)?.verdicts
    ) as { index: number; keep: boolean; reason?: string }[] | undefined;
    for (const v of vs ?? []) {
      const sample = batch[v.index];
      if (sample) verdicts.set(sample.id, { keep: v.keep, reason: v.reason });
    }
  }

  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0,
    missing = 0;
  const falseDrops: string[] = [],
    falseKeeps: string[] = [];
  const labelsAll = labels;
  for (const s of samples) {
    const truth = labelsAll[s.id] === 1;
    const v = verdicts.get(s.id);
    if (!v) missing++;
    const pred = v?.keep ?? true;
    if (truth && pred) tp++;
    else if (!truth && pred) {
      fp++;
      falseKeeps.push(`${s.sub}|${s.title.slice(0, 60)}`);
    } else if (truth && !pred) {
      fn++;
      falseDrops.push(`${s.sub}|${s.title.slice(0, 60)}|${v?.reason}`);
    } else tn++;
  }
  console.log(
    `keep-precision=${(tp / (tp + fp)).toFixed(3)} keep-recall=${(tp / (tp + fn)).toFixed(3)} (tp=${tp} fp=${fp} fn=${fn} tn=${tn} missing=${missing})`,
  );
  console.log(`tokens in=${inTok} out=${outTok}`);
  console.log('FALSE DROPS:');
  falseDrops.forEach((d) => console.log('  ' + d));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
