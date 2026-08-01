/**
 * THE governed prompt switch: candidate → active (previous active → retired).
 *
 *   npx ts-node scripts/prompt-activate.ts <version>
 *
 * Run ONLY after the shadow replay's diff review is closed (the coordinator
 * refuses otherwise). Other processes pick the new active version up on
 * their next boot — redeploy the prod worker+api after activating.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PromptRegistryService } from '../src/modules/external-integrations/llm/prompt-registry.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function main(): Promise<void> {
  const version = Number.parseInt(process.argv[2] ?? '', 10);
  if (!Number.isFinite(version)) {
    console.error('Usage: prompt-activate.ts <version>');
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const registry = app.get(PromptRegistryService);
    const before = await registry.getActive();
    const result = await registry.activate(version);
    console.log(
      `Activated v${result.version} (was v${before.version}). Redeploy/restart every worker+api so all processes extract under it.`,
    );
  } finally {
    await app.close();
  }
}

void main();
