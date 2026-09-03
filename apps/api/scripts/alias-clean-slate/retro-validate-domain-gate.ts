/**
 * @script-class: probe
 * @finding: retro-validation of the REAL merge routing (2026-09-03, rewritten
 *   after red-team P0#2 — the first version tested placeNamesAgree, a
 *   predicate the sweep never runs, and thereby missed that the
 *   dominant-community arm still auto-merged different-named domain pairs).
 *   This version replays resolveMergeRoute — the exact pure function the
 *   sweep now calls — over every executed place merge, under the ADVERSARIAL
 *   community assumption (same dominant metro, the state most platform pairs
 *   were in). Read-only.
 *
 *   DATABASE_URL=<target> npx ts-node -T scripts/alias-clean-slate/retro-validate-domain-gate.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  sameBusinessVerdict,
  resolveMergeRoute,
  placeNamesAgree,
  identityDomain,
  brandClusterPurity,
} from '../../src/modules/restaurant-enrichment/business-identity-rules';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const pairs = await prisma.$queryRaw<
    Array<{ loser: string; winner: string; domain: string | null }>
  >`
    SELECT l.name AS loser, w.name AS winner, w.canonical_domain AS domain
      FROM entity_redirects r
      JOIN core_entities l ON l.entity_id = r.from_entity_id
      JOIN core_entities w ON w.entity_id = r.to_entity_id
     WHERE l.type = 'place' AND w.type = 'place'
     ORDER BY w.name, l.name`;
  // Corpus-wide purity per domain, over the HISTORICAL carrier set: every
  // loser+winner name that ever carried the domain in a merge, plus current
  // active carriers.
  const carriers = new Map<string, Set<string>>();
  for (const p of pairs) {
    const d = identityDomain(p.domain);
    if (!d) continue;
    let set = carriers.get(d);
    if (!set) {
      set = new Set();
      carriers.set(d, set);
    }
    set.add(p.loser);
    set.add(p.winner);
  }
  const active = await prisma.$queryRaw<
    Array<{ name: string; domain: string }>
  >`
    SELECT name, lower(canonical_domain) AS domain FROM core_entities
     WHERE type = 'place' AND status = 'active' AND canonical_domain IS NOT NULL`;
  for (const row of active) {
    const d = identityDomain(row.domain);
    if (d && carriers.has(d)) carriers.get(d)!.add(row.name);
  }

  const buckets = {
    merge: [] as string[],
    court: [] as string[],
    hold: [] as string[],
  };
  for (const p of pairs) {
    const shared = identityDomain(p.domain);
    // Adversarial reconstruction: no shared placeId (different restaurants,
    // or branches — unknowable historically, so assume the weaker state),
    // both sides carrying the winner's domain (that is how the domain lane
    // paired them), SAME dominant community.
    const evidence = (name: string) => ({
      placeIds: [] as string[],
      domain: p.domain,
      communities: ['metro'],
      dominantCommunity: 'metro',
      name,
    });
    const judgment = sameBusinessVerdict(evidence(p.loser), evidence(p.winner));
    const owned =
      judgment.merge && judgment.basis === 'shared_domain' && shared
        ? brandClusterPurity([
            ...(carriers.get(shared) ?? []),
            p.loser,
            p.winner,
          ]).pure
        : undefined;
    const route = resolveMergeRoute({
      judgment,
      namesAgree: placeNamesAgree(p.loser, p.winner),
      sharedIdentityDomain: shared,
      domainIsOwned: owned,
    });
    buckets[route].push(
      `"${p.loser}" -> "${p.winner}" (${p.domain ?? 'no domain'}${judgment.merge ? `, basis ${judgment.basis}` : ''})`,
    );
  }
  console.log(
    `${pairs.length} historical place merges replayed through resolveMergeRoute (adversarial same-metro assumption):`,
  );
  console.log(
    `  auto-merge: ${buckets.merge.length}   court: ${buckets.court.length}   hold: ${buckets.hold.length}`,
  );
  for (const m of buckets.merge) console.log(`  MERGE ${m}`);
  for (const h of buckets.hold) console.log(`  HOLD  ${h}`);
}

void main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.stack : String(e));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
