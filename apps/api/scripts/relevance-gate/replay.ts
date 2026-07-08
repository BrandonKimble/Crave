/**
 * Relevance-gate calibration replay (plans/archive-prefilter-pipeline.md step 2).
 * Runs relevance-gate-prompt.md over the hand-labeled corpus (130 real posts
 * from 6 archives: food/travel/city sub types) and reports keep-precision /
 * keep-recall + every false drop for auditing. Re-run after ANY prompt edit;
 * the bar: recall 1.0 (false drops lose signal forever), precision is
 * fail-open slack. 2026-07 baseline: P=0.869 R=1.000.
 *
 *   yarn ts-node scripts/relevance-gate/replay.ts
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';

const DIR = __dirname;
const PROMPT = fs.readFileSync(
  path.join(
    __dirname,
    '../../src/modules/external-integrations/llm/prompts/relevance-gate-prompt.md',
  ),
  'utf8',
);

interface Sample {
  sub: string;
  id: string;
  title: string;
  body: string;
}

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
  console.log(`replaying ${samples.length} labeled posts`);

  const ai = new GoogleGenAI({ apiKey: process.env.LLM_API_KEY ?? '' });
  const verdicts = new Map<string, { keep: boolean; reason: string }>();
  const BATCH = 25;
  for (let i = 0; i < samples.length; i += BATCH) {
    const batch = samples.slice(i, i + BATCH);
    const payload = batch.map((s, j) => ({
      index: j,
      title: s.title,
      body: s.body.slice(0, 500),
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
        maxOutputTokens: 8192,
      },
    });
    const text = res.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const parsed = JSON.parse(text) as {
      verdicts?: { index: number; keep: boolean; reason: string }[];
    };
    for (const v of parsed.verdicts ?? []) {
      const sample = batch[v.index];
      if (sample) verdicts.set(sample.id, { keep: v.keep, reason: v.reason });
    }
  }

  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  const falseDrops: string[] = [],
    falseKeeps: string[] = [];
  for (const s of samples) {
    const truth = labels[s.id] === 1;
    const pred = verdicts.get(s.id)?.keep ?? true; // missing verdict = fail-open keep
    if (truth && pred) tp++;
    else if (!truth && pred) {
      fp++;
      falseKeeps.push(`${s.sub}|${s.title.slice(0, 60)}`);
    } else if (truth && !pred) {
      fn++;
      falseDrops.push(
        `${s.sub}|${s.title.slice(0, 60)}|${verdicts.get(s.id)?.reason}`,
      );
    } else tn++;
  }
  const precision = tp / (tp + fp),
    recall = tp / (tp + fn);
  console.log(
    `keep-precision=${precision.toFixed(3)} keep-recall=${recall.toFixed(3)} (tp=${tp} fp=${fp} fn=${fn} tn=${tn})`,
  );
  console.log('FALSE DROPS (recall losses — the expensive kind):');
  falseDrops.forEach((d) => console.log('  ' + d));
  console.log('FALSE KEEPS (cost pennies):');
  falseKeeps.forEach((d) => console.log('  ' + d));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
