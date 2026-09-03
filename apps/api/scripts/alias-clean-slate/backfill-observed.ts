/**
 * @script-class: operational
 * Runner: the clean-slate choreography (scripts/alias-clean-slate/README.md,
 * step 2) and every future generation activation's `--replace` step.
 *
 * OBSERVED-SPELLING BACKFILL (plans/alias-clean-slate.md, regeneration
 * step 1 + the generation-following law). Re-derives `observed`-grade
 * surfaces from the ACTIVE extraction generation's stored raw_output. $0 —
 * no LLM, no vendor; testimony is replayed, never re-bought.
 *
 * THE PAIRING IS IDENTITY-BY-CONSTRUCTION, DELIBERATELY. A raw string
 * pairs with an entity only when the string's canonical fold equals that
 * entity's identity_key (or its space-squeezed twin — the same two
 * deterministic tiers resolution itself trusts without a judge), and only
 * among the entities THIS input's own events actually resolved to. A
 * string whose association needed a judge is a JUDGED claim by
 * definition: it re-earns its authority through a hearing at the current
 * rules, never by resurrecting an old pairing here. That asymmetry is the
 * whole grade table.
 *
 *   DATABASE_URL=<target> npx ts-node -T scripts/alias-clean-slate/backfill-observed.ts \
 *     [--execute] [--replace] [--community=<sub>]
 *
 * Dry-run by default. --replace additionally DEPRECATES observed-grade
 * extraction surfaces on touched entities that the active generation no
 * longer supports (observed spellings follow the extraction generation) —
 * run it as a standard activation step.
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { canonicalFold } from '../../src/modules/content-processing/entity-resolver/entity-identity';
import { canonicalizeObservedPlaceName } from '../../src/modules/content-processing/reddit-collector/place-name-contract';
import { activeExtractionInputsJoinSql } from '../../src/modules/content-processing/reddit-collector/extraction-scope.service';
import { addSurfaces } from '../../src/modules/content-processing/entity-resolver/entity-surface.service';

interface RawMention {
  // Field spellings across prompt generations: place_observed/place_surface
  // (current), restaurant (pre-rename); item_surface/item (current), food
  // (pre-rename).
  place_observed?: string | null;
  place_surface?: string | null;
  place?: string | null;
  restaurant?: string | null;
  item_surface?: string | null;
  item?: string | null;
  food?: string | null;
}

const prisma = new PrismaClient();

function folds(value: string): string[] {
  const fold = canonicalFold(value);
  if (!fold) return [];
  return [fold, fold.replace(/ /g, '')];
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const replace = process.argv.includes('--replace');
  const communityArg = process.argv.find((a) => a.startsWith('--community='));
  const community = communityArg ? communityArg.split('=')[1] : null;

  // The ACTIVE generation's inputs, via the document pointer — the same
  // scope every reader uses.
  const inputs = await prisma.$queryRaw<
    Array<{ input_id: string; raw_output: unknown }>
  >(Prisma.sql`
    SELECT DISTINCT i.input_id, i.raw_output
      ${Prisma.raw(activeExtractionInputsJoinSql())}
     WHERE i.raw_output IS NOT NULL
       ${community ? Prisma.sql`AND d.community = ${community}` : Prisma.empty}
  `);
  console.log(
    `${inputs.length} active-generation inputs${community ? ` (community=${community})` : ''}.`,
  );

  // (entityId -> verbatim forms) derived purely from testimony.
  const derived = new Map<string, Set<string>>();
  const bank = (entityId: string, form: string): void => {
    let set = derived.get(entityId);
    if (!set) {
      set = new Set();
      derived.set(entityId, set);
    }
    set.add(form);
  };
  let pairedPlace = 0;
  let pairedItem = 0;
  let unpairedStrings = 0;

  const CHUNK = 200;
  for (let i = 0; i < inputs.length; i += CHUNK) {
    const slice = inputs.slice(i, i + CHUNK);
    const inputIds = slice.map((s) => s.input_id);
    // Every entity this batch of inputs' events resolved to, with the
    // identity key the deterministic tiers trust.
    const rows = await prisma.$queryRaw<
      Array<{
        input_id: string;
        entity_id: string;
        identity_key: string | null;
        kind: string;
      }>
    >(Prisma.sql`
      SELECT e.input_id, e.restaurant_id AS entity_id, ent.identity_key,
             'place' AS kind
        FROM core_restaurant_events e
        JOIN core_entities ent ON ent.entity_id = e.restaurant_id
       WHERE e.input_id = ANY(${inputIds}::uuid[])
         AND ent.status <> 'archived'::entity_status
      UNION
      SELECT e.input_id, e.entity_id, ent.identity_key,
             CASE WHEN e.entity_type = 'place'::entity_type THEN 'place' ELSE 'item' END
        FROM core_restaurant_entity_events e
        JOIN core_entities ent ON ent.entity_id = e.entity_id
       WHERE e.input_id = ANY(${inputIds}::uuid[])
         AND ent.status <> 'archived'::entity_status
         AND e.entity_type IN ('place'::entity_type, 'item'::entity_type, 'ingredient'::entity_type)`);
    // input_id -> fold -> entity ids (per side).
    const byInput = new Map<string, Map<string, Set<string>>>();
    for (const r of rows) {
      if (!r.identity_key) continue;
      let m = byInput.get(r.input_id);
      if (!m) {
        m = new Map();
        byInput.set(r.input_id, m);
      }
      for (const key of [r.identity_key, r.identity_key.replace(/ /g, '')]) {
        const scoped = `${r.kind}|${key}`;
        let set = m.get(scoped);
        if (!set) {
          set = new Set();
          m.set(scoped, set);
        }
        set.add(r.entity_id);
      }
    }

    for (const input of slice) {
      const raw = input.raw_output as { mentions?: RawMention[] } | null;
      const foldMap = byInput.get(input.input_id);
      if (!raw?.mentions?.length || !foldMap) continue;
      for (const m of raw.mentions) {
        const placeStrings = [
          m.place_observed,
          m.place_surface,
          m.place,
          m.restaurant,
        ].filter((s): s is string => typeof s === 'string' && !!s.trim());
        for (const s of new Set(placeStrings.map((v) => v.trim()))) {
          const canonical = canonicalizeObservedPlaceName(s) || s;
          const matched = new Set<string>();
          for (const candidate of new Set([canonical, s])) {
            for (const fold of folds(candidate)) {
              for (const id of foldMap.get(`place|${fold}`) ?? []) {
                matched.add(id);
              }
            }
          }
          // Exactly-one is the identity bar: an ambiguous fold within one
          // input is a twin the sweeps must judge, not a pairing.
          if (matched.size === 1) {
            pairedPlace += 1;
            bank([...matched][0], s);
          } else if (matched.size === 0) unpairedStrings += 1;
        }
        const itemStrings = [m.item_surface, m.item, m.food].filter(
          (s): s is string => typeof s === 'string' && !!s.trim(),
        );
        for (const s of new Set(itemStrings.map((v) => v.trim()))) {
          const matched = new Set<string>();
          for (const fold of folds(s)) {
            for (const id of foldMap.get(`item|${fold}`) ?? []) {
              matched.add(id);
            }
          }
          if (matched.size === 1) {
            pairedItem += 1;
            bank([...matched][0], s);
          } else if (matched.size === 0) unpairedStrings += 1;
        }
      }
    }
    if ((i / CHUNK) % 10 === 0 && i > 0)
      console.log(`  scanned ${i}/${inputs.length} inputs…`);
  }

  const totalForms = [...derived.values()].reduce((n, s) => n + s.size, 0);
  console.log(
    `Derived ${totalForms} observed forms across ${derived.size} entities ` +
      `(${pairedPlace} place pairings, ${pairedItem} item pairings; ` +
      `${unpairedStrings} strings with no deterministic pairing — judge-earned ` +
      `associations that re-earn through hearings, plus refused mentions).`,
  );

  if (!execute) {
    console.log('DRY RUN — re-run with --execute to bank.');
    return;
  }

  const entityIds = [...derived.keys()];
  let banked = 0;
  for (let i = 0; i < entityIds.length; i += 100) {
    const slice = entityIds.slice(i, i + 100);
    await prisma.$transaction(async (tx) => {
      for (const entityId of slice) {
        const forms = [...derived.get(entityId)!];
        await addSurfaces(
          tx,
          entityId,
          forms.map((form) => ({
            form,
            source: 'extraction' as const,
            claimGrade: 'observed' as const,
          })),
        );
        banked += forms.length;
      }
    });
    if ((i / 100) % 10 === 0 && i > 0)
      console.log(`  banked through ${i}/${entityIds.length} entities…`);
  }
  console.log(`Banked ${banked} observed forms.`);

  if (replace) {
    // THE GENERATION-FOLLOWING LAW: observed spellings supported only by
    // superseded generations are deprecated on the entities this run
    // touched. Deprecated, not deleted — a later generation that
    // re-observes the form re-banks it through the normal writer.
    let demoted = 0;
    for (let i = 0; i < entityIds.length; i += 500) {
      const slice = entityIds.slice(i, i + 500);
      const rows = await prisma.$queryRaw<
        Array<{ surface_id: string; entity_id: string; form: string }>
      >(Prisma.sql`
        SELECT surface_id, entity_id, form FROM entity_surface
         WHERE entity_id = ANY(${slice}::uuid[])
           AND status = 'active'
           AND claim_grade = 'observed'
           AND source = 'extraction'`);
      const stale = rows.filter((r) => !derived.get(r.entity_id)?.has(r.form));
      if (stale.length) {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE entity_surface
             SET status = 'deprecated', updated_at = now()
           WHERE surface_id = ANY(${stale.map((s) => s.surface_id)}::uuid[])`);
        demoted += stale.length;
      }
    }
    console.log(
      `--replace: deprecated ${demoted} observed forms no longer supported by the active generation.`,
    );
  }
}

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
