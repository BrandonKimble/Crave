import { Logger } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrap, out } from './_shared';

/**
 * corpus-integrity.ts — the scheduled data-integrity check (Part B7 / Part C
 * "Corpus-integrity check"). PURE read-only SQL against the live DB; no recall,
 * no linker, no fixture. These are the audit's own queries, so the counts are the
 * gate that Step-3 (data-integrity fixes) must drive to zero.
 *
 * Prints the counts the audit reported (target after Step 3 in parens):
 *   - exact same-name duplicate pairs within a type   (audit: 7 → 0)
 *   - word-order duplicate foods (trigram sim ~1.0)   (audit: 4 → 0)
 *   - ambiguous aliases (one alias → multiple entities, same type)  (audit: 18 → 0)
 *   - entities with a mistyped type (dish name typed 'restaurant')  (audit: 2 → 0)
 *   - apostrophe-variant alias coverage               (audit: ~44% → 100%)
 *
 *   yarn workspace api ts-node scripts/search-harness/corpus-integrity.ts
 *
 * Exit code is 0 always (a report, not a test); wire the counts into CI as the
 * gate. Add `--json` for a machine-readable line.
 */

const AS_JSON = process.argv.includes('--json');

interface Row1 {
  n: string;
  type: string;
  c: number;
  ids: string;
}

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const prisma = app.get(PrismaService);
    const q = <T>(sql: string) => prisma.$queryRawUnsafe<T>(sql);
    const num = (v: unknown) => Number(v ?? 0);

    // 1. exact same-name duplicate pairs within a type -------------------
    const dupGroups = await q<Row1[]>(`
      SELECT lower(trim(name)) AS n, type::text AS type, COUNT(*)::int AS c,
             string_agg(name, ' | ') AS ids
      FROM core_entities
      WHERE status = 'active'
      GROUP BY lower(trim(name)), type
      HAVING COUNT(*) > 1
      ORDER BY c DESC`);
    const dupPairs = dupGroups.reduce((s, g) => s + (g.c * (g.c - 1)) / 2, 0);

    // 2. word-order / near-identical duplicate foods (trigram sim ~1.0) --
    const wordOrder = await q<{ a: string; b: string; sim: number }[]>(`
      SELECT a.name AS a, b.name AS b, similarity(a.name, b.name) AS sim
      FROM core_entities a
      JOIN core_entities b
        ON a.type = b.type
       AND a.type = 'food'
       AND a.entity_id < b.entity_id
       AND lower(trim(a.name)) <> lower(trim(b.name))
       AND similarity(a.name, b.name) >= 0.999
      WHERE a.status = 'active' AND b.status = 'active'
      ORDER BY sim DESC`);

    // 3. ambiguous aliases: one alias → multiple entities of the SAME type
    const ambiguous = await q<
      { alias: string; type: string; c: number; names: string }[]
    >(`
      SELECT lower(trim(al)) AS alias, type::text AS type,
             COUNT(DISTINCT entity_id)::int AS c,
             string_agg(DISTINCT name, ' | ') AS names
      FROM core_entities, unnest(aliases) AS al
      WHERE status = 'active'
      GROUP BY lower(trim(al)), type
      HAVING COUNT(DISTINCT entity_id) > 1
      ORDER BY c DESC`);

    // 4. entities with a mistyped type: a dish name typed 'restaurant' -----
    //    (same name string exists as a 'food' entity → the 'restaurant' row is
    //    the mistyped one). This is the audit's "2 entities mistyped restaurant".
    const mistyped = await q<{ name: string; entity_id: string }[]>(`
      SELECT DISTINCT a.name, a.entity_id::text AS entity_id
      FROM core_entities a
      JOIN core_entities b
        ON lower(trim(a.name)) = lower(trim(b.name))
       AND a.entity_id <> b.entity_id
      WHERE a.type = 'restaurant' AND b.type = 'food'
        AND a.status = 'active' AND b.status = 'active'
      ORDER BY a.name`);

    // 4b. cross-type name collisions overall (context, not a defect) -------
    const crossType = await q<{ c: number }[]>(`
      SELECT COUNT(*)::int AS c
      FROM core_entities a
      JOIN core_entities b
        ON lower(trim(a.name)) = lower(trim(b.name))
       AND a.type < b.type AND a.entity_id <> b.entity_id
      WHERE a.status = 'active' AND b.status = 'active'`);

    // 5. apostrophe-variant alias coverage --------------------------------
    const apos = await q<
      { names_with_apostrophe: number; have_stripped_alias: number }[]
    >(`
      WITH apos AS (
        SELECT entity_id, name, aliases,
               lower(replace(replace(trim(name), '’', ''), '''', '')) AS stripped
        FROM core_entities
        WHERE status = 'active' AND (name LIKE '%''%' OR name LIKE '%’%')
      )
      SELECT
        COUNT(*)::int AS names_with_apostrophe,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM unnest(aliases) al
          WHERE lower(replace(replace(trim(al), '’', ''), '''', '')) = stripped
            AND lower(trim(al)) <> lower(trim(name))
        ))::int AS have_stripped_alias
      FROM apos`);

    // 6. name-copy aliases (76% per audit) — context -----------------------
    const aliasCopy = await q<{ total: number; copies: number }[]>(`
      WITH a AS (
        SELECT lower(trim(al)) AS al, lower(trim(name)) AS nm
        FROM core_entities, unnest(aliases) AS al
        WHERE status = 'active'
      )
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE al = nm)::int AS copies
      FROM a`);

    const aposRow = apos[0] ?? {
      names_with_apostrophe: 0,
      have_stripped_alias: 0,
    };
    const aposCoverage =
      aposRow.names_with_apostrophe > 0
        ? (100 * aposRow.have_stripped_alias) / aposRow.names_with_apostrophe
        : 100;
    const aliasCopyRow = aliasCopy[0] ?? { total: 0, copies: 0 };

    const summary = {
      duplicatePairs: dupPairs,
      duplicateGroups: dupGroups.length,
      wordOrderDupFoods: wordOrder.length,
      ambiguousAliases: ambiguous.length,
      mistypedEntities: mistyped.length,
      crossTypeCollisions: num(crossType[0]?.c),
      apostropheNames: aposRow.names_with_apostrophe,
      apostropheCoveredPct: Number(aposCoverage.toFixed(1)),
      aliasNameCopyPct:
        aliasCopyRow.total > 0
          ? Number(
              ((100 * aliasCopyRow.copies) / aliasCopyRow.total).toFixed(1),
            )
          : 0,
    };

    if (AS_JSON) {
      out(JSON.stringify(summary));
      return;
    }

    out('=== CORPUS-INTEGRITY CHECK (read-only) ===');
    out('(audit baseline in parens; Step 3 must drive defects → 0)');
    out('');
    out(
      `1. Exact same-name duplicate PAIRS within a type : ${summary.duplicatePairs}  (audit 7 → 0)`,
    );
    for (const g of dupGroups)
      out(`     · [${g.type}] "${g.n}" ×${g.c}   (${g.ids})`);

    out('');
    out(
      `2. Word-order / near-identical duplicate FOODS   : ${summary.wordOrderDupFoods}  (audit 4 → 0)`,
    );
    for (const w of wordOrder)
      out(`     · "${w.a}"  ≈  "${w.b}"   sim=${Number(w.sim).toFixed(3)}`);

    out('');
    out(
      `3. Ambiguous aliases (1 alias → N entities/type) : ${summary.ambiguousAliases}  (audit 18 → 0)`,
    );
    for (const a of ambiguous.slice(0, 20))
      out(`     · [${a.type}] "${a.alias}" → ${a.c} entities (${a.names})`);
    if (ambiguous.length > 20)
      out(`     · … and ${ambiguous.length - 20} more`);

    out('');
    out(
      `4. Entities with a mistyped type (dish→restaurant): ${summary.mistypedEntities}  (audit 2 → 0)`,
    );
    for (const m of mistyped) out(`     · "${m.name}"  (${m.entity_id})`);

    out('');
    out(
      `   (context) cross-type name collisions overall  : ${summary.crossTypeCollisions}`,
    );

    out('');
    out(
      `5. Apostrophe-variant alias coverage             : ${summary.apostropheCoveredPct}%  ` +
        `(${aposRow.have_stripped_alias}/${aposRow.names_with_apostrophe})  (audit ~44% → 100%)`,
    );

    out('');
    out(
      `   (context) aliases that are name-copies         : ${summary.aliasNameCopyPct}%  (audit ~76%)`,
    );

    out('');
    const defects =
      summary.duplicatePairs +
      summary.wordOrderDupFoods +
      summary.ambiguousAliases +
      summary.mistypedEntities;
    out(
      defects === 0
        ? '✅ INTEGRITY CLEAN — all defect counts at 0.'
        : `⚠️  ${defects} defect(s) outstanding (should be 0 after Step 3).`,
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
