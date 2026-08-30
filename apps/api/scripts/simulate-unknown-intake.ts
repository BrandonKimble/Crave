/**
 * @script-class: operational
 *
 * BEFORE/AFTER routing simulation for the ONE UNKNOWN-SEARCH INTAKE merge
 * (owner-ordered 2026-08-30). Reads a fixture of REAL recorded unknown
 * inputs (staging ask ledger + local residue staging zone, SELECT-only) and
 * runs both shapes' routing logic DRY against the local corpus:
 *
 *   OLD (pre-merge): ≤2 tokens → untyped ask signal as-is; 3+ tokens →
 *   splitter LLM → EVERY piece becomes demand (no vocabulary check, ever).
 *
 *   NEW (the intake): segment if multi-word → per piece fold-known filter →
 *   Same-Thing Judge dry-run (banks NOTHING) → only unmatched pieces demand.
 *
 * Output: one routing row per input and the headline counts — how many
 * pieces the old shape sent to paid collection that the new shape resolves
 * as vocabulary already held (known) or learnable on the spot (would-learn).
 *
 * WRITES NOTHING: matcher runs dryRun, no signals, no on-demand rows, no
 * staging rows. Spends: one interpretResidue per distinct multi-word text
 * (both shapes share it — called once) + one judge call per novel piece
 * with candidates. Dev key, a few dollars max.
 *
 * Run: npx ts-node -T scripts/simulate-unknown-intake.ts
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import { DemandVocabularyService } from '../src/modules/search/demand-vocabulary.service';
import {
  QUERY_ENTITY_GROUP_KEYS,
  QueryEntityGroupKey,
} from '../src/modules/search/dto/search-query.dto';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

interface FixtureInput {
  text: string;
  locale: string | null;
  origin: string;
}

async function main(): Promise<void> {
  const fixturePath = path.join(
    __dirname,
    'fixtures',
    'unknown-intake-sim-inputs.json',
  );
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
    inputs: FixtureInput[];
  };

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  stopCronsForScript(app);
  const out = (line: string) => process.stdout.write(`${line}\n`);
  try {
    const llm = app.get(LLMService);
    const vocab = app.get(DemandVocabularyService);
    const matcher = await vocab.createMatcher({ dryRun: true });

    let oldDemandPieces = 0;
    let newDemandPieces = 0;
    let knownDropped = 0;
    let wouldLearn = 0;
    let refused = 0;
    const rows: string[][] = [];

    for (const input of fixture.inputs) {
      const tokens = input.text.trim().split(/\s+/).filter(Boolean);
      let pieces: string[];
      let oldPieces: string[];
      if (tokens.length <= 1) {
        pieces = [input.text.trim()];
        oldPieces = pieces; // old: direct untyped ask (1 demand record)
      } else {
        const analysis = await llm.interpretResidue(input.text.trim());
        const split = (
          QUERY_ENTITY_GROUP_KEYS as readonly QueryEntityGroupKey[]
        )
          .flatMap((group) => analysis[group] ?? [])
          .map((t) => t.trim())
          .filter(Boolean);
        pieces = Array.from(new Set(split));
        // OLD: ≤2 tokens bypassed the splitter (direct ask); 3+ split and
        // every piece became demand.
        oldPieces = tokens.length <= 2 ? [input.text.trim()] : pieces;
      }
      oldDemandPieces += oldPieces.length;

      for (const piece of pieces) {
        if (await matcher.isKnown(piece, input.locale)) {
          knownDropped += 1;
          rows.push([input.origin, input.text, piece, 'KNOWN → no-op']);
          continue;
        }
        const result = await matcher.match(piece, input.locale);
        if (result.outcome === 'learned') {
          wouldLearn += 1;
          rows.push([
            input.origin,
            input.text,
            piece,
            `WOULD-LEARN → alias of "${result.entityName}"`,
          ]);
          continue;
        }
        if (result.outcome === 'refused') {
          refused += 1;
        }
        newDemandPieces += 1;
        rows.push([input.origin, input.text, piece, 'demand (collect)']);
      }
      if (!pieces.length) {
        rows.push([input.origin, input.text, '—', 'discarded (junk)']);
      }
    }

    out('origin\tinput\tpiece\tnew-shape routing');
    for (const row of rows) out(row.join('\t'));
    out('');
    out(
      JSON.stringify({
        inputs: fixture.inputs.length,
        oldShape_demandRecords: oldDemandPieces,
        newShape_demandRecords: newDemandPieces,
        newShape_knownNoOps: knownDropped,
        newShape_wouldLearnAliases: wouldLearn,
        newShape_collisionRefused: refused,
      }),
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
