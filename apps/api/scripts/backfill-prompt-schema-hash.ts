/**
 * @script-class: operational
 *
 * BACKFILL llm_prompts.schema_hash / content_sha (2026-09-05). Rows pushed
 * before the columns existed folded their schema into content_hash only.
 * For each row: if content_hash is the fingerprint under the CURRENT schema →
 * schema_hash = current; if it is the fingerprint under the PRE-WORKSHEET
 * schema (the snapshot beside this script) → that schema's hash; if it is a
 * content-only sha256 → legacy, schema_hash stays NULL; anything else is
 * reported and left alone. Idempotent. Dry-run by default; --execute writes.
 *
 *   DATABASE_URL=... npx ts-node scripts/backfill-prompt-schema-hash.ts [--execute]
 */
import 'dotenv/config';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  COLLECTION_RESPONSE_JSON_SCHEMA,
  RELEVANCE_GATE_RESPONSE_JSON_SCHEMA,
} from '../src/modules/external-integrations/llm/prompts/llm-response-schemas';
import { COLLECTION_RESPONSE_JSON_SCHEMA as PRE_WORKSHEET_COLLECTION_SCHEMA } from './fixtures/llm-response-schemas.pre-worksheet';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const fold = (content: string, schema: unknown) =>
  sha(`${content}\0schema:${JSON.stringify(schema)}`);

const CURRENT: Record<string, unknown> = {
  collection_system: COLLECTION_RESPONSE_JSON_SCHEMA,
  relevance_gate: RELEVANCE_GATE_RESPONSE_JSON_SCHEMA,
};
const PRIOR: Record<string, unknown[]> = {
  collection_system: [PRE_WORKSHEET_COLLECTION_SCHEMA],
};

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const prisma = new PrismaClient();
  const rows = await prisma.llmPrompt.findMany({
    orderBy: [{ kind: 'asc' }, { version: 'asc' }],
  });
  let planned = 0;
  for (const row of rows) {
    const contentSha = sha(row.content);
    let schemaHash: string | null | undefined = undefined;
    let verdict = 'unknown';
    const current = CURRENT[row.kind];
    if (current && row.contentHash === fold(row.content, current)) {
      schemaHash = sha(JSON.stringify(current));
      verdict = 'current';
    } else if (row.contentHash === contentSha) {
      schemaHash = null;
      verdict = 'legacy';
    } else {
      for (const prior of PRIOR[row.kind] ?? []) {
        if (row.contentHash === fold(row.content, prior)) {
          schemaHash = sha(JSON.stringify(prior));
          verdict = 'prior';
          break;
        }
      }
    }
    const already =
      row.contentSha === contentSha &&
      (schemaHash === undefined || row.schemaHash === schemaHash);
    console.log(
      `${row.kind} v${row.version} ${row.status.padEnd(9)} ${verdict.padEnd(8)} ${already ? '(already)' : '(will write)'}`,
    );
    if (verdict === 'unknown' || already) continue;
    planned += 1;
    if (execute) {
      await prisma.llmPrompt.update({
        where: { promptId: row.promptId },
        data: { contentSha, schemaHash },
      });
    }
  }
  console.log(
    `${execute ? 'Wrote' : 'Would write'} ${planned} row(s). ${execute ? '' : 'Re-run with --execute to apply.'}`,
  );
  await prisma.$disconnect();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
