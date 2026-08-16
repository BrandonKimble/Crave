/**
 * @script-class: operational
 *
 * CONCEPT-DRIFTED ENGLISH LABELS — report, then deprecate.
 *
 * WHAT WENT WRONG. The vocabulary generator is asked, per concept, for the
 * name a real speaker READS. For a slice of English concepts it answered with
 * a NEIGHBOURING concept's name instead: the ingredient `cinnamon roll`
 * renders "cinnamon", `key lime pie` renders "key lime", `bbq` renders
 * "bbq sauce", `spring roll` renders "spring roll wrapper". Every one of
 * those is a real word for a real thing — just not for THIS thing. The user
 * sees a dish labelled with something else.
 *
 * THE PREDICATE, and why it is this one. A drifted label is a label that
 *   (A) the entity has NO other evidence for — its fold equals neither the
 *       entity's own name nor any other active surface it holds; AND
 *   (B) is the NAME of a different live concept.
 * (A) alone is not drift: 812 English labels include "Italian food" for
 * `italian` and "onion rings" for `onion ring`, which are novel strings and
 * perfectly good labels — 40 rows satisfy (A). (B) is what turns a novel
 * string into a claim about a DIFFERENT concept, and it is checkable from
 * the corpus rather than from anyone's judgement.
 *
 * RESTAURANT NAMES ARE NOT CONCEPT NAMES, so (B) ignores them: the `halal`
 * concept labelled "halal food" collides only with a RESTAURANT called
 * "Halal Food", which is a proper noun that happens to be spelled like a
 * phrase. Counting it would be counting a coincidence.
 *
 * WHAT IT DOES NOT CATCH, stated so the number is not read as complete:
 * `margarita` -> "margarita mix" and `stew` -> "stew meat" are the same
 * generator mistake, but no entity is NAMED "margarita mix" or "stew meat",
 * so (B) cannot see them. Widening (B) to substring containment was measured
 * and rejected — it sweeps in 26 legitimate labels ("Greek food",
 * "sushi restaurant", "pork ribs") to catch 2 more. A predicate that is
 * wrong 13 times to be right twice is not a predicate.
 *
 * THE REPAIR IS DEPRECATION, NOT REPLACEMENT. The row is marked
 * `status='deprecated'` and `is_default=false`, so display falls back to
 * `core_entities.name` — the English name, which is what these concepts had
 * before the sweep reached them. Nothing is hand-written: the next sweep
 * re-asks the question, and if the generator has been fixed by then it
 * answers better. A deprecated row is also REMEMBERED AS WRONG (R5-6b), so
 * the same drifted form is never silently re-proposed.
 *
 * Usage: ts-node scripts/repair-drifted-en-labels.ts [--apply]
 */
import { PrismaClient } from '@prisma/client';
import { canonicalFold } from '../src/modules/content-processing/entity-resolver/entity-identity';

const prisma = new PrismaClient();

interface Drifted {
  surfaceId: string;
  entityId: string;
  entityName: string;
  entityType: string;
  label: string;
  namesInstead: string;
}

async function findDrifted(): Promise<{
  total: number;
  novel: number;
  drifted: Drifted[];
}> {
  const labels = await prisma.$queryRaw<
    Array<{
      surface_id: string;
      entity_id: string;
      form: string;
      name: string;
      type: string;
    }>
  >`SELECT s.surface_id, s.entity_id, s.form, e.name, e.type::text AS type
      FROM entity_surface s
      JOIN core_entities e ON e.entity_id = s.entity_id
     WHERE s.locale = 'en' AND s.is_default AND s.status = 'active'`;

  // Every OTHER active surface the entity holds, folded — the evidence that
  // makes a label a form the concept is genuinely known by.
  const otherForms = await prisma.$queryRaw<
    Array<{ entity_id: string; form: string }>
  >`SELECT entity_id, form FROM entity_surface
     WHERE status = 'active' AND NOT (locale = 'en' AND is_default)`;
  const ownFolds = new Map<string, Set<string>>();
  for (const row of otherForms) {
    const set = ownFolds.get(row.entity_id) ?? new Set<string>();
    set.add(canonicalFold(row.form));
    ownFolds.set(row.entity_id, set);
  }

  const concepts = await prisma.$queryRaw<
    Array<{ entity_id: string; name: string; type: string }>
  >`SELECT entity_id, name, type::text AS type
      FROM core_entities
     WHERE status <> 'archived' AND type <> 'place'::entity_type`;
  const byNameFold = new Map<string, Array<{ id: string; label: string }>>();
  for (const concept of concepts) {
    const key = canonicalFold(concept.name);
    if (!key) continue;
    const bucket = byNameFold.get(key) ?? [];
    bucket.push({
      id: concept.entity_id,
      label: `${concept.name}[${concept.type}]`,
    });
    byNameFold.set(key, bucket);
  }

  let novel = 0;
  const drifted: Drifted[] = [];
  for (const label of labels) {
    const fold = canonicalFold(label.form);
    if (!fold) continue;
    if (fold === canonicalFold(label.name)) continue;
    if (ownFolds.get(label.entity_id)?.has(fold)) continue;
    novel += 1;
    const owners = (byNameFold.get(fold) ?? []).filter(
      (owner) => owner.id !== label.entity_id,
    );
    if (!owners.length) continue;
    drifted.push({
      surfaceId: label.surface_id,
      entityId: label.entity_id,
      entityName: label.name,
      entityType: label.type,
      label: label.form,
      namesInstead: owners.map((owner) => owner.label).join(', '),
    });
  }
  return { total: labels.length, novel, drifted };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const { total, novel, drifted } = await findDrifted();
  console.log(`en default labels: ${total}`);
  console.log(`  novel (no other evidence on the entity): ${novel}`);
  console.log(`  …and naming a DIFFERENT concept — DRIFTED: ${drifted.length}`);
  console.table(
    drifted.map((row) => ({
      concept: `${row.entityName}[${row.entityType}]`,
      renders_as: row.label,
      which_is: row.namesInstead,
    })),
  );

  if (!apply) {
    console.log('\nreport only — re-run with --apply to deprecate these rows');
    return;
  }
  const ids = drifted.map((row) => row.surfaceId);
  if (!ids.length) {
    console.log('\nnothing to repair');
    return;
  }
  const changed = await prisma.$executeRawUnsafe(
    `UPDATE entity_surface
        SET status = 'deprecated', is_default = false
      WHERE surface_id = ANY($1::uuid[])`,
    ids,
  );
  console.log(
    `\ndeprecated ${changed} label row(s); display falls back to the entity name`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
