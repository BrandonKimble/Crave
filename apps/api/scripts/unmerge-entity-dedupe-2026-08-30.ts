/**
 * @script-class: repair (one-shot, staging-sanctioned)
 *
 * UN-MERGE of the 2026-08-30 entity_dedupe sweep's 47 wrong EXECUTED merges
 * (plans/merge-batch-audit.md, "The 48 WRONG merges"), plus the 1 wrong
 * UNEXECUTED verdict (dumpling soup → soup dumplings) which is flipped to
 * 'hold' so resume can never execute it.
 *
 * WHAT THIS REVERSES (the plan-recoverable steps 1–2 of the audit's
 * reversibility analysis, plus the surface fold):
 *   - loser un-archived (core_entities.status = 'active')
 *   - the loser→winner entity_redirects row deleted
 *   - the winner's merge-folded surfaces removed: the 'merge_fold' row minted
 *     for the loser's display name, and any surface row copied verbatim from
 *     a row the loser still carries
 *   - winner marked name_embedding_stale (its dense doc loses the names)
 *   - the claim_verdicts row flipped to outcome 'hold' (plan nulled, reason
 *     prefixed "overturned by merge-batch audit 2026-08-30") so the ledger's
 *     memory now HOLDS the pair apart — protecting it from the deterministic
 *     lanes and documenting the overturn
 *
 * WHAT STAYS FUSED (audit: NOT plan-recoverable — the Austin reload
 * regenerates it):
 *   - connections re-pointed to the winner (the loser comes back with ZERO
 *     connections; the winner keeps the loser's evidence rows/mentions)
 *   - colliding connections deleted + counters summed on the winner
 *   - mentions deleted by collision-dedupe
 *   - entity-dimension event-ledger rows re-keyed to the winner
 *   - ingredient/canonical_ingredients arrays rewritten to the winner
 *   - user anchors re-homed to the winner
 *   - the loser's public score rows (pruned at merge)
 * Per-entity residual counts are printed so the report can record them.
 *
 * Dry-run by default; --apply writes. DATABASE_URL selects the target.
 *
 *   DATABASE_URL=... yarn workspace api ts-node scripts/unmerge-entity-dedupe-2026-08-30.ts [--apply]
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

interface WrongMerge {
  loser: string;
  winner: string;
  type: 'item' | 'ingredient';
  executed: boolean;
}

/** The audit's wrong-list, verbatim (loser → winner). 39 items (1 of them
 *  unexecuted) + 9 ingredients = 48 rows; 47 executed. */
const WRONG_MERGES: WrongMerge[] = [
  {
    loser: 'dumpling soup',
    winner: 'soup dumplings',
    type: 'item',
    executed: false,
  },
  {
    loser: 'duck carnitas taco',
    winner: 'duck carnitas',
    type: 'item',
    executed: true,
  },
  {
    loser: 'fajita taco',
    winner: 'beef fajita taco',
    type: 'item',
    executed: true,
  },
  {
    loser: 'dum biryani',
    winner: 'chicken dum biryani',
    type: 'item',
    executed: true,
  },
  { loser: 'rendang', winner: 'beef rendang', type: 'item', executed: true },
  {
    loser: 'chili cheeseburger',
    winner: 'chili burger',
    type: 'item',
    executed: true,
  },
  {
    loser: 'wagyu ribeye',
    winner: 'dry aged ribeye',
    type: 'item',
    executed: true,
  },
  { loser: 'chicken adobo', winner: 'adobo', type: 'item', executed: true },
  { loser: 'ribs', winner: 'pork rib', type: 'item', executed: true },
  {
    loser: 'lamb and cheese sausage',
    winner: 'lamb sausage',
    type: 'item',
    executed: true,
  },
  {
    loser: 'chicken wrap',
    winner: 'caesar wrap',
    type: 'item',
    executed: true,
  },
  {
    loser: 'savory pastry',
    winner: 'savory pie',
    type: 'item',
    executed: true,
  },
  {
    loser: 'crispy rice noodles',
    winner: 'crispy noodle',
    type: 'item',
    executed: true,
  },
  {
    loser: 'pistachio baklava',
    winner: 'baklava',
    type: 'item',
    executed: true,
  },
  {
    loser: 'ceviche de pescado',
    winner: 'ceviche',
    type: 'item',
    executed: true,
  },
  {
    loser: 'mole enchilada',
    winner: 'chicken mole enchiladas',
    type: 'item',
    executed: true,
  },
  {
    loser: 'jalapeno popper sausage',
    winner: 'jalapeno sausage',
    type: 'item',
    executed: true,
  },
  { loser: 'beef fajitas', winner: 'fajitas', type: 'item', executed: true },
  {
    loser: 'asian noodle salad',
    winner: 'asian salad',
    type: 'item',
    executed: true,
  },
  {
    loser: 'chocolate macaron',
    winner: 'macaron',
    type: 'item',
    executed: true,
  },
  {
    loser: 'pimento cheese sandwiches',
    winner: 'pimento cheese',
    type: 'item',
    executed: true,
  },
  {
    loser: 'mushroom veggie burger',
    winner: 'veggie burger',
    type: 'item',
    executed: true,
  },
  {
    loser: 'fried pork belly',
    winner: 'pork belly',
    type: 'item',
    executed: true,
  },
  {
    loser: 'sliced brisket sandwich',
    winner: 'chopped brisket sandwich',
    type: 'item',
    executed: true,
  },
  {
    loser: 'brisket banh mi french dip',
    winner: 'banh mi french dip',
    type: 'item',
    executed: true,
  },
  { loser: 'loaded pupusas', winner: 'pupusas', type: 'item', executed: true },
  {
    loser: 'spicy chicken biscuit',
    winner: 'chicken biscuit',
    type: 'item',
    executed: true,
  },
  {
    loser: 'prime rib french dip',
    winner: 'french dip',
    type: 'item',
    executed: true,
  },
  { loser: 'carnitas', winner: 'carnitas tacos', type: 'item', executed: true },
  {
    loser: 'honey mustard potato salad',
    winner: 'potato salad',
    type: 'item',
    executed: true,
  },
  {
    loser: 'brisket gouda hot pockets',
    winner: 'gouda hot pockets',
    type: 'item',
    executed: true,
  },
  {
    loser: 'sea salt chocolate tart',
    winner: 'chocolate tart',
    type: 'item',
    executed: true,
  },
  { loser: 'veggie omelet', winner: 'omelet', type: 'item', executed: true },
  {
    loser: 'watermelon agua fresca',
    winner: 'agua fresca',
    type: 'item',
    executed: true,
  },
  { loser: 'pork belly bun', winner: 'pork bun', type: 'item', executed: true },
  {
    loser: 'cheeseburger happy meal',
    winner: 'happy meal',
    type: 'item',
    executed: true,
  },
  {
    loser: 'sub',
    winner: 'italian deli sandwiches',
    type: 'item',
    executed: true,
  },
  { loser: 'pho broth', winner: 'broth', type: 'item', executed: true },
  { loser: 'garden salad', winner: 'salad', type: 'item', executed: true },
  {
    loser: 'peppers',
    winner: 'bell pepper',
    type: 'ingredient',
    executed: true,
  },
  {
    loser: 'key lime juice',
    winner: 'key lime',
    type: 'ingredient',
    executed: true,
  },
  {
    loser: 'dill pickle',
    winner: 'pickles',
    type: 'ingredient',
    executed: true,
  },
  {
    loser: 'queso blanco',
    winner: 'queso fresco',
    type: 'ingredient',
    executed: true,
  },
  {
    loser: 'hard shell tortilla',
    winner: 'hard taco',
    type: 'ingredient',
    executed: true,
  },
  {
    loser: 'chili',
    winner: 'chili pepper',
    type: 'ingredient',
    executed: true,
  },
  { loser: 'dark rum', winner: 'rum', type: 'ingredient', executed: true },
  {
    loser: 'grapefruit',
    winner: 'grapefruit juice',
    type: 'ingredient',
    executed: true,
  },
  { loser: 'bbq pork', winner: 'pork', type: 'ingredient', executed: true },
];

const OVERTURN_PREFIX = 'overturned by merge-batch audit 2026-08-30 — ';

interface VerdictRow {
  claim_key: string;
  rule_version: number;
  fold_version: number;
  outcome: string;
  reason: string;
  executed_at: Date | null;
  subject: {
    aId: string;
    aName: string;
    bId: string;
    bName: string;
    via: string;
    plan: {
      winnerId: string;
      winnerName: string;
      loserId: string;
      loserName: string;
      entityType?: string;
    } | null;
  };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  const out = (msg = '') => process.stdout.write(`${msg}\n`);
  out(`== un-merge 2026-08-30 batch (${apply ? 'APPLY' : 'DRY-RUN'}) ==`);

  // Every ledgered merge verdict from the sweep window's lane.
  const verdicts = await prisma.$queryRaw<VerdictRow[]>`
    SELECT claim_key, rule_version, fold_version, outcome, reason,
           executed_at, subject
    FROM claim_verdicts
    WHERE lane = 'entity_dedupe' AND outcome = 'merge'`;

  const fold = (s: string) => s.trim().toLowerCase();
  const byPair = new Map<string, VerdictRow>();
  for (const v of verdicts) {
    const p = v.subject?.plan;
    if (!p) continue;
    byPair.set(`${fold(p.loserName)}→${fold(p.winnerName)}`, v);
  }

  let matched = 0;
  let unmerged = 0;
  let flippedUnexecuted = 0;
  const missing: string[] = [];
  const residuals: string[] = [];

  for (const wrong of WRONG_MERGES) {
    const key = `${fold(wrong.loser)}→${fold(wrong.winner)}`;
    const v = byPair.get(key);
    if (!v) {
      missing.push(`${wrong.loser} → ${wrong.winner} (${wrong.type})`);
      continue;
    }
    matched += 1;
    const plan = v.subject.plan!;

    if (!wrong.executed) {
      // The unexecuted verdict: flip to hold so resume can never execute it.
      out(`FLIP-TO-HOLD (unexecuted): ${plan.loserName} → ${plan.winnerName}`);
      if (apply) {
        await prisma.$executeRaw`
          UPDATE claim_verdicts
          SET outcome = 'hold',
              reason = ${OVERTURN_PREFIX + v.reason},
              subject = jsonb_set(subject, '{plan}', 'null'::jsonb),
              executed_at = COALESCE(executed_at, now())
          WHERE lane = 'entity_dedupe' AND claim_key = ${v.claim_key}
            AND rule_version = ${v.rule_version}
            AND fold_version = ${v.fold_version}`;
      }
      flippedUnexecuted += 1;
      continue;
    }

    // Executed merge: verify the archived loser + redirect are as recorded.
    const loserRows = await prisma.$queryRaw<
      Array<{ status: string; name: string }>
    >`
      SELECT status::text, name FROM core_entities
      WHERE entity_id = ${plan.loserId}::uuid`;
    const redirectRows = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) n FROM entity_redirects
      WHERE from_entity_id = ${plan.loserId}::uuid
        AND to_entity_id = ${plan.winnerId}::uuid`;
    const loser = loserRows[0];
    if (!loser) {
      missing.push(`${wrong.loser}: loser entity ${plan.loserId} NOT FOUND`);
      continue;
    }
    const alreadyActive = loser.status === 'active';
    out(
      `UN-MERGE: ${plan.loserName} ← (from) ${plan.winnerName} [${wrong.type}]` +
        `${alreadyActive ? ' (loser already active — idempotent re-run)' : ''}` +
        `${Number(redirectRows[0]?.n ?? 0) === 0 ? ' (no redirect row present)' : ''}`,
    );

    if (apply) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE core_entities SET status = 'active'
          WHERE entity_id = ${plan.loserId}::uuid AND status = 'archived'`;
        await tx.$executeRaw`
          DELETE FROM entity_redirects
          WHERE from_entity_id = ${plan.loserId}::uuid
            AND to_entity_id = ${plan.winnerId}::uuid`;
        // The 'merge_fold' surface minted for the loser's display name.
        await tx.$executeRaw`
          DELETE FROM entity_surface
          WHERE entity_id = ${plan.winnerId}::uuid
            AND source = 'merge_fold'
            AND form = ${plan.loserName}`;
        // Surface rows copied verbatim from rows the loser still carries
        // (same locale/form/role/source — a winner row that pre-existed
        // identically is indistinguishable; the reload regenerates it).
        await tx.$executeRaw`
          DELETE FROM entity_surface w
          WHERE w.entity_id = ${plan.winnerId}::uuid
            AND EXISTS (
              SELECT 1 FROM entity_surface l
              WHERE l.entity_id = ${plan.loserId}::uuid
                AND l.locale = w.locale AND l.form = w.form
                AND l.role = w.role AND l.source = w.source)`;
        await tx.$executeRaw`
          UPDATE core_entities SET name_embedding_stale = true
          WHERE entity_id IN (${plan.winnerId}::uuid, ${plan.loserId}::uuid)`;
        await tx.$executeRaw`
          UPDATE claim_verdicts
          SET outcome = 'hold',
              reason = ${OVERTURN_PREFIX + v.reason},
              subject = jsonb_set(subject, '{plan}', 'null'::jsonb)
          WHERE lane = 'entity_dedupe' AND claim_key = ${v.claim_key}
            AND rule_version = ${v.rule_version}
            AND fold_version = ${v.fold_version}`;
      });
      unmerged += 1;
    }

    // What remains fused on this pair (regenerated by the Austin reload).
    const fusedRows =
      wrong.type === 'ingredient'
        ? await prisma.$queryRaw<
            Array<{ loser_refs: bigint; winner_refs: bigint }>
          >`
            SELECT
              (SELECT count(*) FROM core_restaurant_items WHERE ingredients @> ARRAY[${plan.loserId}::uuid])
            + (SELECT count(*) FROM core_entities WHERE canonical_ingredients @> ARRAY[${plan.loserId}::uuid]) AS loser_refs,
              (SELECT count(*) FROM core_restaurant_items WHERE ingredients @> ARRAY[${plan.winnerId}::uuid])
            + (SELECT count(*) FROM core_entities WHERE canonical_ingredients @> ARRAY[${plan.winnerId}::uuid]) AS winner_refs`
        : await prisma.$queryRaw<
            Array<{ loser_refs: bigint; winner_refs: bigint }>
          >`
            SELECT
              (SELECT count(*) FROM core_restaurant_items WHERE food_id = ${plan.loserId}::uuid) AS loser_refs,
              (SELECT count(*) FROM core_restaurant_items WHERE food_id = ${plan.winnerId}::uuid) AS winner_refs`;
    const f = fusedRows[0];
    residuals.push(
      `${plan.loserName}: ${Number(f?.loser_refs ?? 0)} refs remain on loser; ` +
        `${Number(f?.winner_refs ?? 0)} refs (incl. the loser's absorbed evidence, ` +
        `summed counters, rekeyed events, rehomed anchors) remain fused on winner ` +
        `"${plan.winnerName}" until the Austin reload regenerates them`,
    );
  }

  out();
  out(
    '== residual fusion (regenerated by the Austin reload; NOT reversed here) ==',
  );
  for (const line of residuals) out(`  - ${line}`);
  out();
  out(
    `matched ${matched}/${WRONG_MERGES.length} audit rows in the ledger; ` +
      `${apply ? `${unmerged} un-merged, ${flippedUnexecuted} unexecuted verdict(s) flipped to hold` : 'no writes (dry-run)'}`,
  );
  if (missing.length) {
    out('MISSING (no ledger match — investigate before/after --apply):');
    for (const line of missing) out(`  ! ${line}`);
  }

  if (apply) {
    // Post-verify: every executed loser active again, its redirect gone.
    const bad: string[] = [];
    for (const wrong of WRONG_MERGES.filter((w) => w.executed)) {
      const v = byPair.get(`${fold(wrong.loser)}→${fold(wrong.winner)}`);
      if (!v?.subject.plan) continue;
      const plan = v.subject.plan;
      const check = await prisma.$queryRaw<
        Array<{ status: string; redirects: bigint; verdict: string }>
      >`
        SELECT e.status::text,
               (SELECT count(*) FROM entity_redirects r
                 WHERE r.from_entity_id = ${plan.loserId}::uuid) AS redirects,
               (SELECT outcome FROM claim_verdicts cv
                 WHERE cv.lane = 'entity_dedupe' AND cv.claim_key = ${v.claim_key}
                   AND cv.rule_version = ${v.rule_version} LIMIT 1) AS verdict
        FROM core_entities e WHERE e.entity_id = ${plan.loserId}::uuid`;
      const c = check[0];
      if (!c || c.status !== 'active')
        bad.push(`${plan.loserName}: status=${c?.status}`);
      else if (Number(c.redirects) !== 0)
        bad.push(`${plan.loserName}: ${c.redirects} redirect(s) remain`);
      else if (c.verdict !== 'hold')
        bad.push(`${plan.loserName}: verdict=${c.verdict}`);
    }
    out(
      bad.length
        ? `POST-VERIFY FAILURES:\n  ${bad.join('\n  ')}`
        : 'POST-VERIFY: all executed losers active, redirect-free, verdicts flipped to hold.',
    );
    if (bad.length) process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
