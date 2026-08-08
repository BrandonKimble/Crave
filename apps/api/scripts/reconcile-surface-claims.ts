/**
 * @script-class: repair
 *
 * SURFACE-CLAIM RECONCILIATION — collapse the two surface stores into ONE
 * claims registry (concept-graph §9.9, owner-ruled 2026-08-07).
 *
 * Labels were being searched as grounding surfaces (lane 4) with NO claim
 * law — five wrong labels (`taco` on "good taco") ground confidently past a
 * guard that only watches aliases. The ideal: surfaces GROUND, labels
 * DISPLAY, one store per law. This script performs the one-time move:
 *
 *   1. Every active label surface absent from the alias store is offered to
 *      `addAliases` (the guard applies — uncontested surfaces bank).
 *   2. Blocked surfaces go to the WORD-CLAIM ADJUDICATOR: testimony wins
 *      without a hearing; inferred-vs-inferred conflicts get a judge verdict
 *      (both / evict incumbent / refuse newcomer-remembered).
 *   3. Lane 4 is then removable — labels stop grounding (separate commit).
 *
 * Run:  npx ts-node -T scripts/reconcile-surface-claims.ts [--dry-run] [--limit N]
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { bootstrap, out } from './search-harness/_shared';
import { WordClaimAdjudicatorService } from '../src/modules/content-processing/entity-resolver/word-claim-adjudicator.service';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const limitIndex = argv.indexOf('--limit');
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : 100000;

  const app = await bootstrap();
  try {
    const adjudicator = app.get(WordClaimAdjudicatorService);
    const summary = await adjudicator.reconcileLabelSurfaces({ dryRun, limit });
    out(JSON.stringify(summary));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
