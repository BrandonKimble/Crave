/**
 * @script-class: probe
 *
 * ACCENT-ADMISSION SWEEP — what did the per-token port actually CHANGE, over
 * the whole corpus, one claim at a time?
 *
 * WHY. The port (2026-08-12) moved the resolver from a WHOLE-STRING accent
 * test to the query gazetteer's PER-TOKEN rule plus its banked-plain-forms
 * discriminator. The resolution gate proves the two fixtures that motivated
 * it; this proves the BLAST RADIUS — every mention in the corpus whose
 * grounding could possibly move, resolved through the live tiers, with the
 * verdict written to a JSON result file so two runs (pre-port and post-port
 * code, same database) can be diffed claim by claim.
 *
 * THE PROBE SET, and why it is the right one. Only a mention whose accents
 * DISAGREE with something it could claim can move: an all-ASCII mention with
 * an all-ASCII candidate takes the same path under either rule. So the sweep
 * probes, in the surface's own language:
 *   1. every active LANGUAGE-TAGGED surface form, verbatim — the accent-
 *      bearing spellings the corpus actually holds, and
 *   2. for every such form carrying accents in more than one token, the
 *      PARTIALLY DE-ACCENTED variants — one token stripped at a time. That is
 *      the class the port exists for ('phở bò' typed 'phở bo'), and it is
 *      exactly the input a US keyboard produces.
 * Both are pushed through the LIVE resolver at exact+alias only
 * (allowEntityCreation:false, no fuzzy, no LLM) — read-only and spend-free.
 *
 * THE RECORDED RESULT (2026-08-12, local corpus, 58,538 probes; pre-port
 * 33dca592e~1 vs post-port 33dca592e, same database):
 *   gained 0 · lost 2,051 · re-pointed 9.
 * Read it honestly — the port's headline case ('phở bo') was ALREADY reachable
 * through the und romanization row 'pho bo', which is why nothing was gained
 * corpus-wide; what moved is the DISCRIMINATOR arm, and every one of the 2,051
 * is the same shape: a de-accented token that the VOCABULARY generator banked
 * under a LANGUAGE tag ('thit', 'vit', 'buoi' as `vi`, source='vocabulary';
 * 10,918 such rows exist). The rule reads a language-tagged plain form as a
 * word somebody SPELLED, so 'salad vit' stops claiming 'salad vịt'.
 *
 * That is parity, not a new defect: the query gazetteer has read those same
 * rows the same way since 2026-08-09, so search and ingestion now agree, and a
 * refused mention goes to the LLM judge (this sweep runs judge-off), not to
 * nothing. The residual defect is at the WRITE ingress — a romanization banked
 * under `vi` is a claim about a spelling nobody makes — and it is one fix in
 * one place, not two rules.
 *
 * RUN (once on the pre-port commit, once on this one):
 *   npx ts-node -T scripts/search-harness/accent-admission-sweep.ts [outfile]
 */
process.env.PROCESS_ROLE ||= 'api';
process.env.ENTITY_RESOLUTION_CACHE_VERSION = `sweep-${Date.now()}`;

import { writeFileSync } from 'fs';
import { EntityType } from '@prisma/client';
import { bootstrap, out } from './_shared';
import { EntityResolutionService } from '../../src/modules/content-processing/entity-resolver/entity-resolution.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  canonicalFold,
  diacriticFold,
} from '../../src/modules/content-processing/entity-resolver/entity-identity';

interface Probe {
  mention: string;
  locale: string;
  type: EntityType;
}

/** One token de-accented at a time — the partial-accenting class. */
function partialVariants(form: string): string[] {
  const typed = form.split(' ');
  const plain = canonicalFold(form).split(' ');
  if (typed.length !== plain.length || typed.length < 2) return [];
  const variants: string[] = [];
  for (let i = 0; i < typed.length; i++) {
    if (diacriticFold(typed[i]) === canonicalFold(typed[i])) continue;
    const copy = [...typed];
    copy[i] = plain[i];
    variants.push(copy.join(' '));
  }
  return variants;
}

async function main(): Promise<void> {
  const app = await bootstrap();
  const prisma = app.get(PrismaService);
  const resolver = app.get(EntityResolutionService);

  const rows = await prisma.$queryRaw<
    Array<{ form: string; locale: string; type: EntityType }>
  >`
    SELECT DISTINCT s.form, LOWER(s.locale) AS locale, e.type
      FROM entity_surface s
      JOIN core_entities e ON e.entity_id = s.entity_id
     WHERE s.status = 'active'
       AND e.status = 'active'::entity_status
       AND LOWER(s.locale) <> 'und'`;

  const seen = new Set<string>();
  const probes: Probe[] = [];
  for (const row of rows) {
    for (const mention of [row.form, ...partialVariants(row.form)]) {
      const key = `${row.type}|${row.locale}|${mention.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      probes.push({ mention, locale: row.locale, type: row.type });
    }
  }

  const results: Record<string, string> = {};
  const BATCH = 200;
  for (let i = 0; i < probes.length; i += BATCH) {
    const slice = probes.slice(i, i + BATCH);
    // One batch per (type, locale) — the resolver scopes both per call.
    const groups = new Map<string, Probe[]>();
    for (const probe of slice) {
      const key = `${probe.type}|${probe.locale}`;
      const held = groups.get(key);
      if (held) held.push(probe);
      else groups.set(key, [probe]);
    }
    for (const [key, group] of groups) {
      const [type, locale] = key.split('|');
      const { resolutionResults } = await resolver.resolveBatch(
        group.map((probe, index) => ({
          tempId: `p${index}`,
          normalizedName: probe.mention,
          originalText: probe.mention,
          entityType: type as EntityType,
          documentLocale: locale,
        })),
        {
          batchSize: 500,
          enableFuzzyMatching: false,
          allowEntityCreation: false,
          useLlmMatcher: false,
        },
      );
      const byTemp = new Map(resolutionResults.map((r) => [r.tempId, r]));
      group.forEach((probe, index) => {
        const result = byTemp.get(`p${index}`);
        results[`${key}|${probe.mention.toLowerCase()}`] = result?.entityId
          ? `${result.resolutionTier}:${result.entityId}`
          : 'unmatched';
      });
    }
  }

  const file = process.argv[2] ?? 'scripts/search-harness/accent-sweep.json';
  writeFileSync(file, JSON.stringify(results, null, 0));
  out(
    `ACCENT SWEEP: probes=${probes.length} claimed=${
      Object.values(results).filter((v) => v !== 'unmatched').length
    } -> ${file}`,
  );
  await app.close();
}

void main();
