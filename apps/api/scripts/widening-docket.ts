/**
 * @script-class: operational
 * @run-by: the widening docket workflow (dry-run by default; --apply gated)
 *
 * THE WIDENING DOCKET (owner ruling 2026-08-30): hears attribute/ingredient
 * satisfies cases through WideningSatisfiesService — the searcher-tolerance
 * test for attributes, culinary substitutability for ingredients — and
 * reports PER-DIRECTION verdicts for owner review.
 *
 *   yarn workspace api ts-node scripts/widening-docket.ts            # dry-run: judge + report + verdict table JSON, DB untouched
 *   yarn workspace api ts-node scripts/widening-docket.ts --apply <verdicts.json>
 *                                    # settle the REVIEWED table (ledger + entity_satisfies) — NO re-judging
 *   yarn workspace api ts-node scripts/widening-docket.ts --gold     # rule certification: gold cases x3, no docket
 *   flags: --no-nominate (owner pairs only, no embedding nominations)
 *          --repeat=N (gold repeats, default 3)
 *
 * APPLY CONSUMES THE REVIEWED TABLE (acceptance red team 2026-08-30):
 * temperature-0 verdicts drift run-to-run on marginal pairs (~5/174
 * measured), so the table the owner reviews MUST be the table that binds.
 * The dry-run writes its verdicts to a JSON file; --apply takes that file
 * (required — it refuses to run without one), re-judges NOTHING, and stamps
 * the file's sha256 into every ledger row's subject for provenance. A rule
 * bump between review and apply invalidates the file (version check).
 *
 * THE DOCKET = the owner's kept pairs from the sameness court (a KEEP is a
 * widening candidate BY DESIGN — the merge court ruled "not the same claim",
 * and this court now asks "would the broad searcher tolerate it anyway?")
 * ∪ embedding-nominated neighbors per anchor (the ontology's meaning-first
 * finder pattern) ∪ any merge-court hold verdicts over widening kinds.
 * Bounded, deduped, idempotent (the ledger skips decided cases on --apply).
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EntityTextSearchService } from '../src/modules/entity-text-search/entity-text-search.service';
import {
  WideningSatisfiesService,
  type WideningDirectedCase,
  type WideningKind,
} from '../src/modules/content-processing/entity-resolver/widening-satisfies.service';
import {
  ATTRIBUTE_SATISFIES_PROMPT_VERSION,
  INGREDIENT_SATISFIES_PROMPT_VERSION,
} from '../src/modules/content-processing/entity-resolver/widening-satisfies-rule';
import {
  wideningApplyRefusal,
  wideningTableSha256,
  type WideningVerdictTable,
} from '../src/modules/content-processing/entity-resolver/widening-verdict-table';
import { facetInadmissibleIds } from '../src/modules/content-processing/entity-resolver/satisfies-facet-guard';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/** The owner's kept pairs (plans/sameness-court-report.md, owner docket
 *  2026-08-30). Names resolve against the ACTIVE vocabulary; a side that no
 *  longer exists (pizza truck) or was folded (piano bar) skips gracefully. */
const OWNER_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['bar', 'pub'],
  ['piano bar', 'live music'],
  ['pizza truck', 'food truck'],
  ['deli', 'sandwich shop'],
  ['kebab shop', 'shawarma'],
  ['modern', 'trendy'],
  ['citrus', 'lemony'],
  ['fudgy', 'gooey'],
  ['grass fed', 'pasture raised'],
  ['cold', 'iced'],
  ['soft', 'tender'],
  ['bakery', 'pastry shop'],
  // The brief's ingredient type case.
  ['bacon', 'pancetta'],
];

const WIDENING_TYPES = ['place_attribute', 'item_attribute', 'ingredient'];
const NOMINATIONS_PER_ANCHOR = 5;

interface ResolvedEntity {
  entity_id: string;
  name: string;
  type: string;
}

const kindClass = (type: string): 'attribute' | 'ingredient' | null =>
  type === 'place_attribute' || type === 'item_attribute'
    ? 'attribute'
    : type === 'ingredient'
      ? 'ingredient'
      : null;

/** Gold pins for the two rules — confident boundaries only, both directions
 *  represented (A1/A2 are the two directions of one pair). */
const GOLD_CASES: ReadonlyArray<{
  id: string;
  kind: WideningKind;
  from: string;
  to: string;
  fromCarriers: string[];
  toCarriers: string[];
  expected: 'satisfies' | 'reject';
  why: string;
}> = [
  {
    id: 'live-music-to-piano-bar',
    kind: 'attribute',
    from: 'live music',
    to: 'piano bar',
    fromCarriers: ['Continental Club', 'Elephant Room'],
    toCarriers: ['Pete’s Dueling Piano Bar'],
    expected: 'satisfies',
    why: 'extra specificity delivers: live piano IS live music',
  },
  {
    id: 'piano-bar-to-live-music',
    kind: 'attribute',
    from: 'piano bar',
    to: 'live music',
    fromCarriers: ['Pete’s Dueling Piano Bar'],
    toCarriers: ['Continental Club', 'Elephant Room'],
    expected: 'reject',
    why: 'the distinctive promise (a piano) may be missing',
  },
  {
    id: 'pub-to-nightclub',
    kind: 'attribute',
    from: 'pub',
    to: 'nightclub',
    fromCarriers: ['The Dog & Duck'],
    toCarriers: ['Kingdom'],
    expected: 'reject',
    why: 'a different night out entirely — the filter would feel broken',
  },
  {
    id: 'bacon-to-pancetta',
    kind: 'ingredient',
    from: 'bacon',
    to: 'pancetta',
    fromCarriers: ['bacon cheeseburger', 'bacon wrapped dates'],
    toCarriers: ['pancetta carbonara'],
    expected: 'satisfies',
    why: 'cured pork belly either way — same craving, same role',
  },
  // TIE-BREAK LAW pins (owner ruling 2026-08-30): the cross-session
  // coin-flip pairs, ruled by the KIND of difference — same-domain
  // adjacency satisfies BOTH ways; identity/cross-domain rejects BOTH ways.
  {
    id: 'fudgy-to-gooey',
    kind: 'attribute',
    from: 'fudgy',
    to: 'gooey',
    fromCarriers: ['fudgy brownie', 'flourless chocolate cake'],
    toCarriers: ['gooey butter cake', 'molten lava cake'],
    expected: 'satisfies',
    why: 'adjacent shades of one dessert-texture quality — the tie-break law widens both ways',
  },
  {
    id: 'gooey-to-fudgy',
    kind: 'attribute',
    from: 'gooey',
    to: 'fudgy',
    fromCarriers: ['gooey butter cake', 'molten lava cake'],
    toCarriers: ['fudgy brownie', 'flourless chocolate cake'],
    expected: 'satisfies',
    why: 'the same same-domain adjacency read from the other side',
  },
  {
    id: 'soft-to-tender',
    kind: 'attribute',
    from: 'soft',
    to: 'tender',
    fromCarriers: ['soft serve', 'soft pretzel'],
    toCarriers: ['tender brisket', 'braised short ribs'],
    expected: 'reject',
    why: 'tender promises how meat turned out — an identity-class difference, rejected both ways',
  },
  {
    id: 'tender-to-soft',
    kind: 'attribute',
    from: 'tender',
    to: 'soft',
    fromCarriers: ['tender brisket', 'braised short ribs'],
    toCarriers: ['soft serve', 'soft pretzel'],
    expected: 'reject',
    why: 'a tender-meat seeker shown soft-serve is the wrong KIND of dish',
  },
  {
    id: 'shawarma-to-gyros',
    kind: 'attribute',
    from: 'shawarma',
    to: 'gyros',
    fromCarriers: ['Halal Bros', 'Shawarma Point'],
    toCarriers: ['Milto’s', 'Santorini Cafe'],
    expected: 'reject',
    why: 'different named foods of different traditions — an identity difference, not a shade',
  },
  {
    id: 'applewood-bacon-to-bacon',
    kind: 'ingredient',
    from: 'applewood bacon',
    to: 'bacon',
    fromCarriers: ['applewood bacon burger'],
    toCarriers: ['bacon cheeseburger', 'bacon wrapped dates'],
    expected: 'satisfies',
    why: 'one smoke-wood shade apart — the ingredient itself unchanged',
  },
  {
    id: 'guanciale-to-pancetta',
    kind: 'ingredient',
    from: 'guanciale',
    to: 'pancetta',
    fromCarriers: ['bucatini amatriciana'],
    toCarriers: ['pancetta carbonara'],
    expected: 'reject',
    why: 'a different animal part (jowl vs belly) — a different ingredient, not a shade',
  },
  {
    id: 'bacon-to-tofu',
    kind: 'ingredient',
    from: 'bacon',
    to: 'tofu',
    fromCarriers: ['bacon cheeseburger'],
    toCarriers: ['mapo tofu'],
    expected: 'reject',
    why: 'different craving and role — a substitution nobody asked for',
  },
  {
    id: 'bacon-to-mushroom',
    kind: 'ingredient',
    from: 'bacon',
    to: 'mushroom',
    fromCarriers: ['bacon cheeseburger'],
    toCarriers: ['mushroom risotto'],
    expected: 'reject',
    why: 'umami adjacency is not the bacon craving',
  },
];

async function runGold(
  court: WideningSatisfiesService,
  repeat: number,
): Promise<boolean> {
  let allPass = true;
  for (const goldCase of GOLD_CASES) {
    const verdicts: string[] = [];
    for (let i = 0; i < repeat; i += 1) {
      const map = await court.judge(goldCase.kind, [
        {
          fromName: goldCase.from,
          toName: goldCase.to,
          fromCarriers: goldCase.fromCarriers,
          toCarriers: goldCase.toCarriers,
        },
      ]);
      verdicts.push(map.get(1)?.verdict ?? 'unreturned');
    }
    const pass = verdicts.every((v) => v === goldCase.expected);
    const flaky = !pass && verdicts.some((v) => v === goldCase.expected);
    allPass = allPass && pass;
    console.log(
      `${pass ? 'PASS ' : flaky ? 'FLAKY' : 'FAIL '} ${goldCase.id} ` +
        `expected=${goldCase.expected} got=[${verdicts.join(',')}] — ${goldCase.why}`,
    );
  }
  return allPass;
}

async function bootstrap(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  // The reviewed table: the first non-flag argument (after --apply).
  const verdictFile = args.find((a) => !a.startsWith('--'));
  const gold = args.includes('--gold');
  const nominate = !args.includes('--no-nominate');
  const repeat =
    Number(args.find((a) => a.startsWith('--repeat='))?.split('=')[1]) || 3;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const court = app.get(WideningSatisfiesService);
    if (gold) {
      const allPass = await runGold(court, repeat);
      console.log(allPass ? '\nGOLD: ALL PASS' : '\nGOLD: FAILURES ABOVE');
      process.exitCode = allPass ? 0 : 1;
      return;
    }

    if (apply) {
      // APPLY = SETTLE THE REVIEWED TABLE, NEVER RE-JUDGE. Refuse without
      // the file: an apply that judged its own docket would write verdicts
      // nobody reviewed (temperature-0 drift on the marginal pairs).
      const bytes = verdictFile ? readFileSync(verdictFile) : null;
      const table = bytes
        ? (JSON.parse(bytes.toString('utf8')) as WideningVerdictTable)
        : null;
      const refusal = wideningApplyRefusal(verdictFile, table, {
        attribute: ATTRIBUTE_SATISFIES_PROMPT_VERSION,
        ingredient: INGREDIENT_SATISFIES_PROMPT_VERSION,
      });
      if (refusal || !bytes || !table) {
        console.error(refusal ?? 'REFUSED');
        process.exitCode = 1;
        return;
      }
      const tableSha256 = wideningTableSha256(bytes);
      const result = await court.settleReviewedVerdicts(
        table.rows,
        tableSha256,
      );
      console.log(
        `APPLY: settled=${result.settled} alreadyDecided=${result.skippedDecided} ` +
          `sideGone=${result.skippedGone} faceted=${result.skippedFaceted} ` +
          `(table sha256 ${tableSha256})`,
      );
      return;
    }

    const prisma = app.get(PrismaService);
    const textSearch = app.get(EntityTextSearchService);

    // 1. Resolve the owner pairs against the active vocabulary.
    const names = Array.from(new Set(OWNER_PAIRS.flat()));
    const rows = await prisma.$queryRawUnsafe<ResolvedEntity[]>(
      `SELECT entity_id::text, name, type::text
         FROM core_entities
        WHERE status = 'active'
          AND type::text = ANY($1)
          AND identity_key = ANY($2)`,
      WIDENING_TYPES,
      names,
    );
    const byName = new Map<string, ResolvedEntity[]>();
    for (const row of rows) {
      const key = row.name.toLowerCase();
      byName.set(key, [...(byName.get(key) ?? []), row]);
    }
    const cases: WideningDirectedCase[] = [];
    const caseKeys = new Set<string>();
    const addDirected = (fromId: string, toId: string): void => {
      const key = `${fromId}>${toId}`;
      if (fromId === toId || caseKeys.has(key)) return;
      caseKeys.add(key);
      cases.push({ fromId, toId });
    };
    const anchors: ResolvedEntity[] = [];
    for (const [aName, bName] of OWNER_PAIRS) {
      const aRows = byName.get(aName) ?? [];
      const bRows = byName.get(bName) ?? [];
      // Hear EVERY kind class where BOTH sides exist (widening red team F6):
      // "citrus"/"lemony" live as attribute AND ingredient, and each court
      // asks a different question — first-match-wins silently dropped the
      // second hearing. Each shared class becomes its own directed pair.
      const pairClasses = (['attribute', 'ingredient'] as const).filter(
        (cls) =>
          aRows.some((r) => kindClass(r.type) === cls) &&
          bRows.some((r) => kindClass(r.type) === cls),
      );
      if (!pairClasses.length) {
        console.log(
          `SKIP  ${aName} / ${bName} — no shared live kind (` +
            `${aRows.map((r) => r.type).join('+') || 'missing'} vs ` +
            `${bRows.map((r) => r.type).join('+') || 'missing'})`,
        );
        continue;
      }
      for (const pairClass of pairClasses) {
        const a = aRows.find((r) => kindClass(r.type) === pairClass)!;
        const b = bRows.find((r) => kindClass(r.type) === pairClass)!;
        addDirected(a.entity_id, b.entity_id);
        addDirected(b.entity_id, a.entity_id);
        anchors.push(a, b);
      }
    }

    // 2. Embedding nominations per anchor (the ontology's meaning-first
    // finder): dense neighbors of the SAME type, both directions.
    if (nominate) {
      for (const anchor of anchors) {
        try {
          const neighbors = await textSearch.retrieveCandidates(
            anchor.name,
            [anchor.type as never],
            NOMINATIONS_PER_ANCHOR,
            { denseMode: 'always' },
          );
          for (const n of neighbors) {
            if (n.entityId === anchor.entity_id) continue;
            addDirected(anchor.entity_id, n.entityId);
            addDirected(n.entityId, anchor.entity_id);
          }
        } catch (error) {
          console.log(
            `NOMINATE-SKIP ${anchor.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    // 3. Merge-court holds over widening kinds (a ruled KEEP is a widening
    // candidate by design). The dedupe lane's claim key is the sorted id
    // pair; both directions become cases. Today this is mostly items (the
    // item court's territory — hearDocket skips them); it exists so
    // attribute/ingredient keeps flow in automatically once that lane rules.
    const holds = await prisma.$queryRawUnsafe<Array<{ a: string; b: string }>>(
      `SELECT split_part(v.claim_key, '|', 1) AS a,
              split_part(v.claim_key, '|', 2) AS b
         FROM claim_verdicts v
         JOIN core_entities ea ON ea.entity_id::text = split_part(v.claim_key, '|', 1)
         JOIN core_entities eb ON eb.entity_id::text = split_part(v.claim_key, '|', 2)
        WHERE v.lane = 'entity_dedupe' AND v.outcome = 'hold'
          AND ea.type::text = ANY($1) AND eb.type::text = ANY($1)`,
      WIDENING_TYPES,
    );
    for (const hold of holds) {
      addDirected(hold.a, hold.b);
      addDirected(hold.b, hold.a);
    }

    // THE FACET GUARD (F5) at nomination: a cuisine-faceted or dietary-
    // constrained side is inadmissible in the courts, so the owner never
    // reviews a pair no apply could settle. Same one derivation the courts
    // enforce at admission; refusals are printed, never silent.
    const inadmissible = await facetInadmissibleIds(
      prisma,
      cases.flatMap((c) => [c.fromId, c.toId]),
    );
    const admissibleCases = cases.filter((c) => {
      const refusal = inadmissible.get(c.fromId) ?? inadmissible.get(c.toId);
      if (refusal) {
        console.log(`FACET-SKIP ${c.fromId} -> ${c.toId} — ${refusal}`);
        return false;
      }
      return true;
    });

    console.log(
      `Docket: ${admissibleCases.length} directed cases (DRY-RUN — DB untouched; ` +
        `the verdict table JSON below is --apply's input)`,
    );
    const summary = await court.hearDocket(admissibleCases, { dryRun: true });

    console.log('\nkind       | asked -> shown | verdict | reason');
    console.log('-----------|----------------|---------|-------');
    for (const row of summary.rows) {
      console.log(
        `${row.kind.padEnd(10)} | "${row.fromName}" -> "${row.toName}" | ${row.verdict} | ${row.reason}`,
      );
    }
    console.log(
      `\nheard=${summary.heard} satisfies=${summary.satisfies} ` +
        `reject=${summary.reject} unreturned=${summary.unreturned} ` +
        `skipped=${summary.skipped}`,
    );

    // The reviewable table — exactly what --apply will settle, no more.
    const table: WideningVerdictTable = {
      generatedAt: new Date().toISOString(),
      ruleVersions: {
        attribute: ATTRIBUTE_SATISFIES_PROMPT_VERSION,
        ingredient: INGREDIENT_SATISFIES_PROMPT_VERSION,
      },
      rows: summary.rows,
    };
    const outPath = join(
      process.cwd(),
      `widening-docket-verdicts-${Date.now()}.json`,
    );
    writeFileSync(outPath, `${JSON.stringify(table, null, 2)}\n`);
    console.log(
      `\nVerdict table written: ${outPath}\n` +
        `Review it (edit rows if the owner overrules), then:\n` +
        `  yarn workspace api ts-node scripts/widening-docket.ts --apply ${outPath}`,
    );
  } finally {
    await app.close();
  }
}

void bootstrap();
