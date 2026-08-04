import { readFileSync } from 'fs';
import { join } from 'path';
import { PERSON_DATA_RULES } from './person-data-class';

/**
 * THE CENSUS — inference demoted to adversary.
 *
 * A regex must never DECIDE what happens to personal data (it answers
 * confidently for columns it has never seen, and a name cannot distinguish
 * `reporter_user_id` from `reported_user_id`). But a deliberately OVER-BROAD
 * regex is exactly the right tool for asking the question: "is there a
 * person-shaped column nobody has classified?"
 *
 * The net here is wider than the declaration on purpose. Its independence is
 * the point — the prior scrub verifier reused its subject's own predicate and
 * therefore printed "verified" while raw search text leaked. This reads
 * schema.prisma; the declaration is hand-written. Different sources, so they
 * cannot share a blind spot.
 *
 * RED RECIPE (run it, don't trust it): add
 *   `newThing String @map("new_thing_user_id")`
 * to any model. This spec names it and fails. Delete a rule from
 * PERSON_DATA_RULES and the same thing happens.
 */

const SCHEMA_PATH = join(__dirname, '../../../../prisma/schema.prisma');

/** Over-broad on purpose: person-shaped, contact-shaped, free-text-shaped. */
const PERSON_SHAPED =
  /(^|_)(user|actor|owner|sender|reporter|follower|blocker|blocked|creator)_id$|(push_token|device_key|pair_key|residue_text|subject_text|ip_hash|subnet_hash)/;

/** Corpus/business tables whose contact columns are not a person's. */
const BUSINESS_TABLES = new Set([
  'core_restaurant_locations',
  'core_entities',
  'collection_source_documents',
]);

interface SchemaColumn {
  table: string;
  column: string;
}

/** Parse `@@map`ped table names and `@map`ped column names out of the schema. */
function readSchemaColumns(): SchemaColumn[] {
  const src = readFileSync(SCHEMA_PATH, 'utf8');
  const out: SchemaColumn[] = [];
  const modelBlocks = src.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g);
  for (const block of modelBlocks) {
    const body = block[2];
    const mapped = body.match(/@@map\("(\w+)"\)/);
    const table = mapped ? mapped[1] : block[1];
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) {
        continue;
      }
      const field = trimmed.match(/^(\w+)\s+\S+/);
      if (!field) continue;
      const colMap = trimmed.match(/@map\("(\w+)"\)/);
      const column =
        colMap?.[1] ??
        field[1].replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
      out.push({ table, column });
    }
  }
  return out;
}

describe('person-data census — every person-shaped column is classified', () => {
  const declared = new Set(
    PERSON_DATA_RULES.map((r) => `${r.table}.${r.column}`),
  );

  it('finds person-shaped columns in the schema at all (RED-proof: the net works)', () => {
    const columns = readSchemaColumns();
    const shaped = columns.filter((c) => PERSON_SHAPED.test(c.column));
    // If this ever hits zero the parser broke and every assertion below would
    // pass vacuously — the always-green failure mode this repo keeps finding.
    expect(shaped.length).toBeGreaterThan(20);
  });

  it('NO person-shaped column lacks a declared disposition', () => {
    const columns = readSchemaColumns();
    const unclassified = columns
      .filter((c) => PERSON_SHAPED.test(c.column))
      .filter((c) => !BUSINESS_TABLES.has(c.table))
      .filter((c) => !declared.has(`${c.table}.${c.column}`))
      .map((c) => `${c.table}.${c.column}`);

    // Jest prints the array, which names exactly what to classify.
    expect(unclassified).toEqual([]);
  });

  it('every retained or not_person rule states WHY (keeping data needs a reason)', () => {
    const keepers = PERSON_DATA_RULES.filter(
      (r) => r.disposition === 'retain' || r.disposition === 'not_person',
    );
    expect(keepers.length).toBeGreaterThan(0);
    for (const rule of keepers) {
      // The message is in the key so a failure names the offending rule.
      expect(`${rule.table}.${rule.column}:${rule.basis ?? 'MISSING-BASIS'}`)
        .not.toContain('MISSING-BASIS');
    }
  });

  it('no rule names a table or column that no longer exists (drift both ways)', () => {
    const columns = readSchemaColumns();
    const real = new Set(columns.map((c) => `${c.table}.${c.column}`));
    const stale = PERSON_DATA_RULES.map((r) => `${r.table}.${r.column}`).filter(
      (key) => !real.has(key),
    );
    expect(stale).toEqual([]);
  });
});
