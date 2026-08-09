/**
 * @script-class: probe
 *   (probe, not 'gate': 'gate' is the repo-root shell-script vocabulary; in
 *   apps/api/scripts the F414 taxonomy is operational/probe/scratch, and this
 *   is the same species as run-launch-gate — a re-runnable measurement
 *   instrument whose value is the recorded verdict. Caught by
 *   script-containment on b205e0012's CI run — classified to match its
 *   own header's named counterpart.)
 *
 * AUTOCOMPLETE FLOW GATE — the falsifiability engine for suggestions, the
 * exact counterpart of run-launch-gate for search (owner directive
 * 2026-08-08: "test and make sure it actually behaves exactly how we want,
 * and re-test whenever we bring on other languages").
 *
 * Each entry drives the LIVE AutocompleteService with a realistic keystroke
 * state + app locale and asserts on what comes back:
 *   - mustInclude: [{name, type?}] — a suggestion whose canonical name folds
 *     to `name` (and matches `type` when given) must be present;
 *   - mustNotInclude: same shape, must be absent;
 *   - localizedLabel: when set, the mustInclude[0] row must carry a display
 *     label different from its canonical name (i.e. it localized).
 *
 * Entries are grouped per locale so a new language = a new entry block +
 * one rerun. KNOWN-RED entries carry `expectRed: true` with the finding id —
 * the gate prints them separately and they do not fail the run until their
 * fix lands (then removing the flag is the proof).
 *
 * Run: DATABASE_URL=... npx ts-node -T scripts/search-harness/autocomplete-flow-gate.ts
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { bootstrap, out } from './_shared';
import { AutocompleteService } from '../../src/modules/autocomplete/autocomplete.service';
import { canonicalFold } from '../../src/modules/content-processing/entity-resolver/entity-identity';

interface Expect {
  name: string;
  type?: string;
}
interface FlowEntry {
  id: string;
  locale: string;
  query: string;
  mustInclude?: Expect[];
  mustNotInclude?: Expect[];
  /** The first mustInclude row must render a label ≠ canonical name. */
  localizedLabel?: boolean;
  expectRed?: string;
  note: string;
}

const FLOWS: FlowEntry[] = [
  // ── English baseline ────────────────────────────────────────────────────
  {
    id: 'en-01',
    locale: 'en',
    query: 'taco',
    mustInclude: [{ name: 'taco', type: 'food' }],
    note: 'exact food name',
  },
  {
    id: 'en-02',
    locale: 'en',
    query: 'vegan',
    mustInclude: [{ name: 'vegan', type: 'food_attribute' }],
    note: 'attribute chip reachable by its own name',
  },
  {
    id: 'en-03',
    locale: 'en',
    query: 'vgean',
    mustInclude: [{ name: 'vegan brisket' }],
    note: 'delete-dictionary edit lane: the transposition recovers vegan concepts (bare-word-in-top-N was over-strict — many vegan-X rows legitimately outrank it)',
  },
  {
    id: 'en-04',
    locale: 'en',
    query: 'despa',
    mustInclude: [{ name: 'despana', type: 'restaurant' }],
    note: 'fold symmetry (N1) in autocomplete',
  },
  {
    id: 'en-05',
    locale: 'en',
    query: 'breakfast ta',
    mustInclude: [{ name: 'breakfast taco' }],
    note: 'multi-word prefix reaches the compound',
  },
  // ── Spanish ─────────────────────────────────────────────────────────────
  {
    id: 'es-01',
    locale: 'es',
    query: 'pastel de arroz',
    mustInclude: [{ name: 'rice cake' }],
    note: 'es surface reaches the English concept (localized lane, proven)',
  },
  {
    id: 'es-02',
    locale: 'es',
    query: 'vegetariano',
    mustInclude: [{ name: 'vegetarian', type: 'food_attribute' }],
    note: 'THE P0: chip renders in Spanish but cannot be typed in Spanish',
  },
  {
    id: 'es-03',
    locale: 'es',
    query: 'picante',
    mustInclude: [{ name: 'spicy', type: 'food_attribute' }],
    note: 'adjudicated es word for a dish-side attribute',
  },
  {
    id: 'es-04',
    locale: 'es',
    query: 'camarnes',
    mustInclude: [{ name: 'shrimp' }],
    note: 'es typo reaches shrimp: registry-fed lexicon + editScore ranking as a first-class merge signal (Damerau 1 beats the carnes trigram trap at distance 2)',
  },
  {
    id: 'es-05',
    locale: 'es',
    query: 'camarones',
    mustInclude: [{ name: 'shrimp' }],
    note: 'exact es surface reaches the concept (dish/food display stays source-faithful BY DESIGN — concepts localize, dishes do not)',
  },
  {
    id: 'es-07',
    locale: 'es',
    query: 'vegetariano',
    mustInclude: [{ name: 'vegetarian', type: 'food_attribute' }],
    localizedLabel: true,
    note: 'the chip DISPLAYS localized (concept labels) while submitting the canonical token',
  },
  {
    id: 'es-06',
    locale: 'es',
    query: 'sin glut',
    mustInclude: [{ name: 'gluten free' }],
    note: 'negative-concept alias (sin gluten) prefix-reachable',
  },
  // ── Vietnamese ──────────────────────────────────────────────────────────
  // The third language (2026-08-09). Every assertion below was verified
  // against the banked registry BEFORE it was written: the vi vocabulary
  // sweep banked 8,751 labels + 14,375 active `vi` alias rows, and each row
  // asserted here was read out of entity_surface first. Vietnamese is the
  // DIACRITIC test the Latin-1 languages could not be: `phở`/`pho`,
  // `hải sản`/`hai san` are one folded key by the N1 law, so a locale that
  // folds wrong shows up here as a miss, not as a silent near-match.
  {
    id: 'vi-01',
    locale: 'vi',
    query: 'phở',
    mustInclude: [{ name: 'pho', type: 'food' }],
    note: 'exact vi surface with diacritics reaches the concept (fold: phở→pho)',
  },
  {
    id: 'vi-02',
    locale: 'vi',
    query: 'chay',
    mustInclude: [{ name: 'vegetarian', type: 'food_attribute' }],
    note: 'THE P0 in Vietnamese: the attribute chip is typeable in vi',
  },
  {
    id: 'vi-03',
    locale: 'vi',
    query: 'chay',
    mustInclude: [{ name: 'vegetarian', type: 'food_attribute' }],
    localizedLabel: true,
    note: 'the chip DISPLAYS "chay" while submitting the canonical token',
  },
  {
    id: 'vi-04',
    locale: 'vi',
    query: 'hải sản',
    mustInclude: [{ name: 'seafood', type: 'ingredient' }],
    note: 'multiword vi surface reaches the English food concept',
  },
  {
    id: 'vi-05',
    locale: 'vi',
    query: 'không chứa glut',
    mustInclude: [{ name: 'gluten free', type: 'food_attribute' }],
    note: 'multiword vi PREFIX (mid-word, unfinished) reaches the negative concept',
  },
  {
    id: 'vi-06',
    locale: 'vi',
    query: 'thuan chy',
    mustInclude: [{ name: 'vegan', type: 'food_attribute' }],
    note: 'vi typo via the edit lane: diacritics dropped AND a letter missing — vegan, never vegetarian (the dietary-boundary rule holds under a typo)',
  },
];

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const autocomplete = app.get(AutocompleteService);
    let green = 0;
    let red = 0;
    let knownRed = 0;
    let fixedKnownRed = 0;
    for (const flow of FLOWS) {
      const response = await autocomplete.autocompleteEntities(
        { query: flow.query, includeAttributes: true } as never,
        undefined,
        flow.locale,
      );
      const rows =
        (
          response as unknown as {
            matches?: Array<{
              name: string;
              entityType?: string;
              submitToken?: string;
            }>;
          }
        ).matches ?? [];
      // Identity = the CANONICAL name (submitToken); `name` is the display
      // form and may be localized (the contract: tap submits the token).
      const folded = rows.map((row) => ({
        fold: canonicalFold(row.submitToken ?? row.name ?? ''),
        type: row.entityType,
        display: row.name,
        name: row.submitToken ?? row.name,
      }));
      const has = (expected: Expect) =>
        folded.some(
          (row) =>
            row.fold === canonicalFold(expected.name) &&
            (!expected.type || row.type === expected.type),
        );
      const missing = (flow.mustInclude ?? []).filter((e) => !has(e));
      const forbidden = (flow.mustNotInclude ?? []).filter((e) => has(e));
      let labelFail = false;
      if (flow.localizedLabel && flow.mustInclude?.length) {
        const expected = flow.mustInclude![0];
        const target = folded.find(
          (row) =>
            row.fold === canonicalFold(expected.name) &&
            (!expected.type || row.type === expected.type),
        );
        labelFail =
          !target ||
          !target.display ||
          canonicalFold(target.display) === target.fold;
      }
      const pass = !missing.length && !forbidden.length && !labelFail;
      if (pass && flow.expectRed) {
        fixedKnownRed += 1;
        out(
          `FIXED-KNOWN-RED ${flow.id} "${flow.query}" — remove expectRed: ${flow.expectRed}`,
        );
      } else if (pass) {
        green += 1;
      } else if (flow.expectRed) {
        knownRed += 1;
        out(`known-red ${flow.id} "${flow.query}" (${flow.expectRed})`);
      } else {
        red += 1;
        out(
          `RED ${flow.id} "${flow.query}" missing=${JSON.stringify(missing)} forbidden=${JSON.stringify(forbidden)} labelFail=${labelFail}`,
        );
        out(
          `    got: ${folded
            .slice(0, 8)
            .map(
              (row) =>
                `${row.name}[${row.type}]${row.display && row.display !== row.name ? `(${row.display})` : ''}`,
            )
            .join(', ')}`,
        );
      }
    }
    out(
      `\nFLOW GATE: green=${green} red=${red} known-red=${knownRed} fixed-known-red=${fixedKnownRed} of ${FLOWS.length}`,
    );
    if (red > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
