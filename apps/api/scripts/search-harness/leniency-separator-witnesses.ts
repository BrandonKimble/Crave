/**
 * @script-class: probe
 * @finding: the red-team-A witness board for the 2026-08-13 leniency /
 * separator / exact-arm rulings. Read-only. Every case below was EXECUTED
 * before and after the change; the recorded verdicts live in the commit
 * messages that reference this file.
 *
 * S-witnesses (lenientLocales deletion):
 *   S1 'banh mi de arroz'@es-MX — the Spanish preposition 'de' must not
 *      ground GOAT through the vi fold artifact 'dê'.
 *   S2 'pastel de arroz'@vi-VN  — same artifact, reader chain reversed.
 *   S3 'cafe'@zh-CN             — the Han pin must not cost the Latin half
 *      its leniency; coffee must still ground.
 *   S4 'pastel de arroz'@es-MX  — the originally-fixed case must STAY fixed.
 *   S5 'pastel de arroz'@null   — no stated prior; the fold artifact must not
 *      manufacture its own language evidence.
 *
 * F-witnesses (one separator classifier):
 *   the same four characters, five gaps: none, ZWSP, space, hyphen, ideographic
 *   comma. Soft gaps (nothing / ZWSP / space) must all reach the compound;
 *   visible punctuation (hyphen, comma) must stay a hard boundary.
 *
 * A-witness (autocomplete exact arm):
 *   '牛肉面' from an es-MX phone must return the same entity search grounds.
 */
import { bootstrap, out } from './_shared';
import { EntityType } from '@prisma/client';
import { EntityTextSearchService } from '../../src/modules/entity-text-search/entity-text-search.service';
import { analyzeQuery } from '../../src/modules/entity-text-search/query-analyzer';

const TYPES: EntityType[] = [
  'food',
  'ingredient',
  'food_attribute',
  'restaurant_attribute',
  'restaurant',
] as EntityType[];

const ZWSP = '​';

const SPAN_CASES: Array<{ id: string; q: string; locale: string | null }> = [
  { id: 'S1', q: 'banh mi de arroz', locale: 'es-MX' },
  { id: 'S2', q: 'pastel de arroz', locale: 'vi-VN' },
  { id: 'S3', q: 'cafe', locale: 'zh-CN' },
  { id: 'S4', q: 'pastel de arroz', locale: 'es-MX' },
  { id: 'S5', q: 'pastel de arroz', locale: null },
  { id: 'S6', q: 'pho bo', locale: 'vi-VN' },
  { id: 'S7', q: 'phở bo', locale: 'en-US' },
  { id: 'S8', q: 'cơm chay', locale: 'vi-VN' },
  { id: 'S9', q: 'bánh mì', locale: 'en-US' },
  { id: 'F1', q: '珍珠奶茶', locale: 'zh-CN' },
  { id: 'F2', q: `珍珠${ZWSP}奶茶`, locale: 'zh-CN' },
  { id: 'F3', q: '珍珠 奶茶', locale: 'zh-CN' },
  { id: 'F4', q: '珍珠-奶茶', locale: 'zh-CN' },
  { id: 'F5', q: '珍珠、奶茶', locale: 'zh-CN' },
  { id: 'F6', q: "harry's", locale: 'en-US' },
  { id: 'F7', q: 'tex-mex', locale: 'en-US' },
  { id: 'F8', q: 'banh mi & pho', locale: 'en-US' },
  { id: 'F9', q: '麻辣3号', locale: 'zh-CN' },
  { id: 'F10', q: '豚骨ラーメン', locale: 'zh-CN' },
];

const AUTOCOMPLETE_CASES: Array<{ id: string; term: string; locale: string }> =
  [
    { id: 'A1', term: '牛肉面', locale: 'es-MX' },
    { id: 'A2', term: '牛肉面', locale: 'zh-CN' },
    { id: 'A3', term: 'bánh mì', locale: 'es-MX' },
    { id: 'A4', term: 'taco', locale: 'es-MX' },
  ];

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const scan = app.get(EntityTextSearchService);

    out('=== SPAN WITNESSES ===');
    for (const c of SPAN_CASES) {
      const analysis = analyzeQuery(c.q, c.locale);
      const groups = await scan.scanForKnownEntityGroups(c.q, TYPES, {
        requestLocale: c.locale,
      } as never);
      const spans = groups
        .map(
          (g) =>
            `${g.text}→${g.entities.map((e) => `${e.name}(${e.type})`).join('|')}`,
        )
        .join('  ');
      out(
        `${c.id} ${JSON.stringify(c.q)}@${c.locale ?? 'null'}  ` +
          `tokens=${JSON.stringify(analysis.tokens.map((t) => t.separator + t.folded))}  ` +
          `lang=${analysis.detectedLocale?.tag ?? 'null'}`,
      );
      out(`    spans: ${spans || '(none)'}`);
    }

    out('');
    out('=== AUTOCOMPLETE LOCALIZED-SURFACE WITNESSES ===');
    for (const c of AUTOCOMPLETE_CASES) {
      const matches = await scan.searchLocalizedSurfaces(
        c.term,
        TYPES,
        10,
        c.locale,
      );
      out(
        `${c.id} ${JSON.stringify(c.term)}@${c.locale}: ` +
          (matches.length
            ? matches
                .slice(0, 5)
                .map(
                  (m) =>
                    `${m.name}(${m.type},${m.evidence},${m.similarity.toFixed(2)})`,
                )
                .join('  ')
            : '(none)'),
      );
    }
  } finally {
    await app.close();
  }
}

void main();
