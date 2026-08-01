/**
 * Register a new CANDIDATE collection-prompt version from a file.
 *
 *   npx ts-node scripts/prompt-push.ts <path-to-prompt.md> [--notes "..."]
 *
 * Prints the new version number. The candidate does NOTHING until a shadow
 * replay pins it (REEXTRACT_PROMPT_VERSION + REEXTRACT_ACTIVATE=false) and
 * the owner later activates it (scripts/prompt-activate.ts) after the diff
 * review. Live collection keeps extracting with the ACTIVE version.
 */
import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'fs';
import { AppModule } from '../src/app.module';
import { PromptRegistryService } from '../src/modules/external-integrations/llm/prompt-registry.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function main(): Promise<void> {
  const [, , file, ...rest] = process.argv;
  if (!file) {
    console.error('Usage: prompt-push.ts <path-to-prompt.md> [--notes "..."]');
    process.exit(1);
  }
  const notesIdx = rest.indexOf('--notes');
  const notes = notesIdx >= 0 ? rest[notesIdx + 1] : undefined;
  const content = readFileSync(file, 'utf-8');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const registry = app.get(PromptRegistryService);
    const active = await registry.getActive();
    const candidate = await registry.pushCandidate(content, notes);
    console.log(
      `Registered candidate v${candidate.version} (hash ${candidate.contentHash.slice(0, 12)}…, ${content.length} chars)`,
    );
    console.log(`Active remains v${active.version}. Next steps:`);
    console.log(
      `  shadow replay: REEXTRACT_PROMPT_VERSION=${candidate.version} REEXTRACT_ACTIVATE=false + campaign`,
    );
    console.log(
      `  activate:      npx ts-node scripts/prompt-activate.ts ${candidate.version}`,
    );
  } finally {
    await app.close();
  }
}

void main();
