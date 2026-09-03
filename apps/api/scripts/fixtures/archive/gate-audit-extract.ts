/**
 * @script-class: probe (pre-load gate accuracy audit, 2026-08-30)
 * Runs the registered final collection prompt (candidate bytes) over the
 * fresh stratified sample's thread chunks. No DB writes; LLM only.
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../src/app.module';
import { LLMService } from '../../../src/modules/external-integrations/llm/llm.service';
import { stopCronsForScript } from '../../../src/shared/utils/stop-crons';

const SC =
  '/private/tmp/claude-501/-Users-brandonkimble-Crave-Crave/9c76ce4e-ff73-44a9-949c-84dcb10614d4/scratchpad';

async function main(): Promise<void> {
  const prompt = readFileSync(
    join(
      __dirname,
      '../../../src/modules/external-integrations/llm/prompts/collection-prompt.candidate.md',
    ),
    'utf-8',
  );
  const input = JSON.parse(readFileSync(`${SC}/audit-input.json`, 'utf-8')) as {
    chunks: Array<{ posts: unknown[] }>;
  };
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  stopCronsForScript(app);
  const llm = app.get(LLMService);
  const out: Array<{ chunk: number; mentions: unknown[]; error?: string }> = [];
  let cursor = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= input.chunks.length) return;
        try {
          const parsed = await llm.processContent(
            input.chunks[i] as never,
            prompt,
          );
          out.push({
            chunk: i,
            mentions: Array.isArray((parsed as any)?.mentions)
              ? ((parsed as any).mentions as unknown[])
              : [],
          });
        } catch (e) {
          out.push({
            chunk: i,
            mentions: [],
            error: e instanceof Error ? e.message : String(e),
          });
        }
        done += 1;
        if (done % 20 === 0) console.log(`...${done}/${input.chunks.length}`);
      }
    }),
  );
  out.sort((a, b) => a.chunk - b.chunk);
  writeFileSync(`${SC}/audit-output.json`, JSON.stringify(out, null, 1));
  console.log(
    `DONE chunks=${out.length} errors=${out.filter((o) => o.error).length} mentions=${out.reduce((s, o) => s + o.mentions.length, 0)}`,
  );
  await app.close();
}
void main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
