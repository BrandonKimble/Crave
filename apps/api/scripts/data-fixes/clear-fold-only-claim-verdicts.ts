/**
 * @script-class: operational
 * @runner: by hand (see USAGE) — a ONE-TIME corpus repair, idempotent and
 *   re-runnable, retired once every environment's registry has been cleared.
 *
 * CLEAR THE FALSE-CONFLICT VERDICTS — the memory left behind by hearings that
 * should never have happened.
 *
 * Until 2026-08-09 the collision guard and the word-claim judge adjudicated on
 * `canonicalFold` — the accent-DESTROYING recall key. In every language whose
 * accents are phonemic that made the claim unit wrong: bò (beef), bơ (butter)
 * and bó (bunch) are one folded word `bo`, so two Vietnamese words claiming
 * their OWN spelling were staged as rivals for one word. Both outcomes of such
 * a hearing are wrong — the newcomer is remembered as WRONG (status
 * 'deprecated'), or the incumbent is stripped of a word it correctly owned
 * (role degraded 'both'→'display'). The guard is form-scoped now
 * (`surfaceClaimKey`), so those verdicts are not merely stale: they were never
 * about a real conflict.
 *
 * WHAT IT RESTORES — strictly, and only what the new law would never have
 * refused:
 *   - a row that lost (status 'deprecated', or role 'display' where a label
 *     offer was degraded),
 *   - whose form DID collide on the FOLD with another entity at the time
 *     (otherwise it did not lose to the fold and this pass has no business
 *     touching it),
 *   - and collides with NOBODY on the FORM (accents included) today.
 * An identical-form loser stays lost: caldo, helado and picante were real
 * hearings about one real word, and this pass must not re-open them.
 *
 * WHAT IT REFUSES TO GUESS. When two or more losers on DIFFERENT CONCEPTS
 * share one form, restoring both would MINT the very conflict the guard
 * exists to prevent — from a state where neither held the word. Those are
 * left for the judge (the next sweep re-offers them and the hearing is a real
 * one: `cháo` really is claimed by both congee and porridge) and reported as
 * `deferredSharedForm`.
 *
 * ONE CONCEPT MODELLED TWICE IS NOT TWO CLAIMANTS. This corpus carries most
 * foods as a food row AND an ingredient row under the SAME name (beef, crab,
 * salad), and the surviving surfaces already sit on both (`thịt bò` is active
 * on both beef rows). Losers that share a form AND an `identity_key` are that
 * pattern, not a conflict, so they are restored together.
 *
 * IDEMPOTENT: a restored row is no longer deprecated/display, so the second
 * run's candidate set no longer contains it and no further row changes.
 *
 * USAGE
 *   yarn workspace api ts-node scripts/data-fixes/clear-fold-only-claim-verdicts.ts
 *   ... --apply     (without it: report only, nothing is written)
 */
import { PrismaClient } from '@prisma/client';
import {
  canonicalFold,
  diacriticFold,
} from '../../src/modules/content-processing/entity-resolver/entity-identity';

const claimKey = (form: string): string => diacriticFold(form);

interface LoserRow {
  surface_id: string;
  entity_id: string;
  form: string;
  form_folded: string;
  locale: string;
  role: string;
  status: string;
  source: string;
  /** The OWNING CONCEPT's identity — two rows with the same key are the same
   *  concept modelled twice (food + ingredient), not two claimants. */
  identity_key: string | null;
}

interface HolderRow {
  form: string;
  form_folded: string;
  entity_id: string;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    // THE LOSERS. Every row that carries a lost recall claim: 'deprecated'
    // (the judge's remembered-wrong) and role='display' (the guard's degrade,
    // and the merge migration's encoding of the same verdict). A pure label
    // that was never offered for recall does not exist — every display row in
    // this table got there by losing or by the merge carrying a loss forward.
    const losers = await prisma.$queryRaw<LoserRow[]>`
      SELECT s.surface_id::text, s.entity_id::text, s.form, s.form_folded,
             s.locale, s.role, s.status, s.source, e.identity_key
        FROM entity_surface s
        JOIN core_entities e ON e.entity_id = s.entity_id
       WHERE s.status = 'deprecated' OR s.role = 'display'`;

    const folds = Array.from(new Set(losers.map((r) => r.form_folded)));
    // Everyone who HOLDS one of those folded words today, by the same
    // predicates the guard probes with: an active entity name, or an active
    // non-display surface. (A display row holds nothing — that is the whole
    // point of the degrade.)
    const holders = await prisma.$queryRaw<HolderRow[]>`
      SELECT e.name AS form, e.identity_key AS form_folded, e.entity_id::text
        FROM core_entities e
       WHERE e.identity_key = ANY(${folds}::text[])
         AND e.status <> 'archived'::entity_status
      UNION ALL
      SELECT s.form, s.form_folded, s.entity_id::text
        FROM entity_surface s
        JOIN core_entities e ON e.entity_id = s.entity_id
       WHERE s.form_folded = ANY(${folds}::text[])
         AND s.status = 'active' AND s.role <> 'display'
         AND e.status = 'active'`;

    const byFold = new Map<string, HolderRow[]>();
    for (const holder of holders) {
      const list = byFold.get(holder.form_folded);
      if (list) list.push(holder);
      else byFold.set(holder.form_folded, [holder]);
    }

    const counts = {
      losersScanned: losers.length,
      noFoldConflict: 0,
      identicalFormConflict: 0,
      foldOnly: 0,
      deferredSharedForm: 0,
      restoreDeprecatedToRecall: 0,
      restoreDisplayToBoth: 0,
    };
    const candidates: LoserRow[] = [];
    for (const row of losers) {
      const others = (byFold.get(row.form_folded) ?? []).filter(
        (h) => h.entity_id !== row.entity_id,
      );
      if (others.length === 0) {
        // Nothing ever contested it on the fold either — this row's history is
        // not the false-conflict class, so it is none of this pass's business.
        counts.noFoldConflict += 1;
        continue;
      }
      const key = claimKey(row.form);
      if (others.some((h) => claimKey(h.form) === key)) {
        counts.identicalFormConflict += 1;
        continue;
      }
      counts.foldOnly += 1;
      candidates.push(row);
    }

    // Two losers, one word, two entities: restoring both would create the
    // conflict. Neither is restored.
    const perKey = new Map<string, Set<string>>();
    for (const row of candidates) {
      const key = claimKey(row.form);
      const set = perKey.get(key) ?? new Set<string>();
      set.add(row.identity_key ?? row.entity_id);
      perKey.set(key, set);
    }
    const restorable = candidates.filter(
      (row) => (perKey.get(claimKey(row.form))?.size ?? 0) === 1,
    );
    counts.deferredSharedForm = candidates.length - restorable.length;

    const toRecall = restorable.filter((r) => r.status === 'deprecated');
    const toBoth = restorable.filter(
      (r) => r.status !== 'deprecated' && r.role === 'display',
    );
    counts.restoreDeprecatedToRecall = toRecall.length;
    counts.restoreDisplayToBoth = toBoth.length;

    // A deprecated row's own fold is recomputed as a sanity check: this pass
    // reads `form_folded` as the index key, and a row whose stored fold
    // disagrees with the app fold would have been probed against the wrong
    // bucket. Report it rather than silently repairing it — the fold law says
    // addSurfaces owns that column.
    const foldDrift = losers.filter(
      (r) => canonicalFold(r.form) !== r.form_folded,
    ).length;

    console.log(JSON.stringify({ ...counts, foldDrift, apply }, null, 2));
    for (const row of restorable.slice(0, 40)) {
      console.log(
        `  restore ${row.status}/${row.role} "${row.form}" [${row.locale}] entity=${row.entity_id} ` +
          `fold-rivals=${(byFold.get(row.form_folded) ?? [])
            .filter((h) => h.entity_id !== row.entity_id)
            .map((h) => h.form)
            .join('|')}`,
      );
    }
    if (!apply) {
      console.log('\n(report only — pass --apply to write)');
      return;
    }

    // The restore is the EXACT inverse of the two ways a claim was recorded
    // lost: a deprecated row goes back to 'active', a degraded label row goes
    // back to 'both'. Nothing else on the row is touched.
    if (toRecall.length) {
      await prisma.$executeRaw`
        UPDATE entity_surface SET status = 'active', updated_at = now()
         WHERE surface_id = ANY(${toRecall.map((r) => r.surface_id)}::uuid[])`;
    }
    if (toBoth.length) {
      await prisma.$executeRaw`
        UPDATE entity_surface SET role = 'both', updated_at = now()
         WHERE surface_id = ANY(${toBoth.map((r) => r.surface_id)}::uuid[])`;
    }
    // The restored forms are recall surfaces again, so the entities' dense
    // docs no longer describe them.
    const touched = Array.from(
      new Set([...toRecall, ...toBoth].map((r) => r.entity_id)),
    );
    if (touched.length) {
      await prisma.$executeRaw`
        UPDATE core_entities SET name_embedding_stale = true
         WHERE entity_id = ANY(${touched}::uuid[])`;
    }
    console.log(
      `applied: ${toRecall.length} deprecated->active, ${toBoth.length} display->both, ${touched.length} entities re-embedded`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
