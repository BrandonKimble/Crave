import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import {
  AttributeOntologyService,
  AttributeEntityType,
  CanonicalizationScope,
} from '../src/modules/attribute-ontology/attribute-ontology.service';

interface CliOptions {
  type: AttributeEntityType;
  scope: CanonicalizationScope;
  chunkSize: number;
  showSamples: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    type: 'restaurant_attribute',
    scope: 'all',
    chunkSize: 120,
    showSamples: 40,
  };

  for (const arg of argv) {
    if (arg === '--food') {
      options.type = 'food_attribute';
    } else if (arg === '--restaurant') {
      options.type = 'restaurant_attribute';
    } else if (arg === '--pending') {
      options.scope = 'pending';
    } else if (arg === '--all') {
      options.scope = 'all';
    } else if (arg.startsWith('--chunk=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        options.chunkSize = Math.trunc(value);
      }
    } else if (arg.startsWith('--samples=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value >= 0) {
        options.showSamples = Math.trunc(value);
      }
    }
  }

  return options;
}

/**
 * Dry-run the attribute canonicalizer and print the resulting plan. This NEVER
 * mutates the database — it builds and prints the promote/merge/reject plan so a
 * human can sanity-check it against real data before the apply path lands.
 *
 *   yarn workspace api ts-node scripts/canonicalize-attributes.ts --restaurant --all
 *   yarn workspace api ts-node scripts/canonicalize-attributes.ts --food --pending
 */
async function bootstrap(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const service = app.get(AttributeOntologyService);

    // Plan output goes to stdout directly so it is visible regardless of the
    // Nest logger level (which is pinned to error/warn to keep init noise down).
    const out = (msg = '') => process.stdout.write(`${msg}\n`);

    out(
      `Building canonicalization plan (type=${cli.type}, scope=${cli.scope}, chunk=${cli.chunkSize}) — DRY RUN, no mutations`,
    );

    const plan = await service.buildPlan(cli.type, cli.scope, cli.chunkSize);

    const sample = <T>(items: T[]) => items.slice(0, cli.showSamples);

    out('==== PLAN SUMMARY ====');
    out(`  candidates   ${plan.candidateCount}`);
    out(`  promotions   ${plan.promotions.length}`);
    out(`  merges       ${plan.merges.length}`);
    out(`  rejections   ${plan.rejections.length}`);
    out(`  unresolved   ${plan.unresolved.length}`);

    if (plan.promotions.length > 0) {
      out('---- promotions (pending -> active canonical) ----');
      for (const p of sample(plan.promotions)) {
        const aliases = p.aliases.length
          ? ` (+${p.aliases.length} aliases)`
          : '';
        out(`  "${p.name}"${aliases}`);
      }
    }

    if (plan.merges.length > 0) {
      out('---- merges (merged -> canonical) ----');
      for (const m of sample(plan.merges)) {
        out(`  "${m.mergedName}"  ->  "${m.canonicalName}"`);
      }
    }

    if (plan.rejections.length > 0) {
      out('---- rejections ----');
      for (const r of sample(plan.rejections)) {
        out(`  "${r.name}"  (${r.reason})`);
      }
    }

    if (plan.unresolved.length > 0) {
      out('---- unresolved (LLM echoed an unknown term) ----');
      for (const u of sample(plan.unresolved)) {
        out(`  "${u.name}"  [${u.context}]`);
      }
    }
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  Logger.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
    undefined,
    'CanonicalizeAttributesCLI',
  );
  process.exit(1);
});
