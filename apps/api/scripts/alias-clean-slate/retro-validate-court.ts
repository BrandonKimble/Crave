/**
 * @script-class: probe
 * @finding: retro-validation of the same-business COURT (2026-09-03) — the 62
 *   historical merge pairs the deterministic gate would have held are put
 *   through the real hearing prompt/transport, and the verdicts are printed
 *   for scoring against the audit's ground truth. Read-only; writes no
 *   ledger rows. Pairs come from STAGING_DB_URL; the LLM call runs through
 *   the app's own gateway.
 *
 *   STAGING_DB_URL=<url> npx ts-node -T scripts/alias-clean-slate/retro-validate-court.ts
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { LLMService } from '../../src/modules/external-integrations/llm/llm.service';
import { stopCronsForScript } from '../../src/shared/utils/stop-crons';
import { placeNamesAgree } from '../../src/modules/restaurant-enrichment/business-identity-rules';
import { SAME_BUSINESS_JUDGE_PROMPT } from '../../src/modules/restaurant-enrichment/same-business-rule';

async function main(): Promise<void> {
  const stagingUrl = process.env.STAGING_DB_URL;
  if (!stagingUrl) throw new Error('STAGING_DB_URL required');
  const staging = new PrismaClient({
    datasources: { db: { url: stagingUrl } },
  });
  const pairs = await staging.$queryRaw<
    Array<{
      loser: string;
      winner: string;
      winner_id: string;
      domain: string | null;
    }>
  >`
    SELECT l.name AS loser, w.name AS winner, w.entity_id AS winner_id,
           w.canonical_domain AS domain
      FROM entity_redirects r
      JOIN core_entities l ON l.entity_id = r.from_entity_id
      JOIN core_entities w ON w.entity_id = r.to_entity_id
     WHERE l.type = 'place' AND w.type = 'place'
     ORDER BY w.name, l.name`;
  const held = pairs.filter((p) => !placeNamesAgree(p.loser, p.winner));
  const locs = await staging.$queryRaw<
    Array<{
      restaurant_id: string;
      address: string | null;
      city: string | null;
    }>
  >`
    SELECT restaurant_id, address, city FROM core_restaurant_locations
     WHERE restaurant_id = ANY(${held.map((p) => p.winner_id)}::uuid[])`;
  await staging.$disconnect();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const llm = app.get(LLMService);
    const cards = held
      .map((p, i) => {
        const winnerLocs = locs
          .filter((l) => l.restaurant_id === p.winner_id)
          .map((l) => [l.address, l.city].filter(Boolean).join(', '))
          .filter((s) => s.length)
          .slice(0, 4);
        return (
          `${i + 1}. Shared domain: ${p.domain ?? '(unknown)'}\n` +
          `   RECORD A: "${p.loser}" — grounded locations: none on record\n` +
          `   RECORD B: "${p.winner}" — grounded locations: ${winnerLocs.length ? winnerLocs.join(' | ') : 'none'}`
        );
      })
      .join('\n');
    const text = await llm.generateForCaller({
      caller: 'enrichment.same_business_judge',
      systemInstruction: SAME_BUSINESS_JUDGE_PROMPT,
      prompt: cards,
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  n: { type: 'number' },
                  verdict: {
                    type: 'string',
                    enum: ['same_business', 'distinct'],
                  },
                  reason: { type: 'string' },
                },
                required: ['n', 'verdict', 'reason'],
              },
            },
          },
          required: ['items'],
        },
      },
    });
    const parsed = JSON.parse(
      text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1),
    ) as {
      items?: Array<{ n?: number; verdict?: string; reason?: string }>;
    };
    for (const item of parsed.items ?? []) {
      const p = held[(item.n ?? 0) - 1];
      if (!p) continue;
      console.log(
        `${item.verdict === 'same_business' ? 'MERGE   ' : 'DISTINCT'} "${p.loser}" vs "${p.winner}" — ${item.reason}`,
      );
    }
  } finally {
    await app.close();
  }
}

void main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
