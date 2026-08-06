/**
 * @script-class: probe
 * @finding: see plans/data-audit-2026-08.md "PHASE 5 — GROUNDING".
 *
 * DOES OUR CANONICAL NAME BREAK THE GOOGLE LOOKUP?
 *
 * 1,626 active restaurants (23.5%) have no Google place. Their stored failure
 * reason is a hardcoded string that never meant what it said, so it had to be
 * re-derived: the search query we send is `entity.name`, i.e. our CANONICAL
 * form — apostrophes stripped ("Trudys"), "&" rewritten to "and"
 * ("Salt And Time"), leading articles removed. The business is called
 * "Trudy's" and "Salt & Time".
 *
 * This probe asks Google both ways for the same restaurant and prints what
 * comes back, so the claim is measured instead of argued. Autocomplete only —
 * the cheapest Places surface — and it writes nothing.
 *
 *   yarn workspace api ts-node scripts/grounding-name-probe.ts
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { GooglePlacesService } from '../src/modules/external-integrations/google-places/google-places.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/** (canonical form we actually search, plausible real-world surface, city). */
const PAIRS: Array<[string, string, string]> = [
  ['Salt And Time', 'Salt & Time', 'Austin'],
  ['Trudys', "Trudy's", 'Austin'],
  ['Rositas', "Rosita's Al Pastor", 'Austin'],
  ['Aparicios', "Aparicio's", 'Austin'],
  ['Jewboy Sub Shop', 'JewBoy Sub Shop', 'Austin'],
  ['Local Pastures', 'Local Pastures', 'Austin'],
  ['Asahi Imports', 'Asahi Imports', 'Austin'],
  ['Uptown Sports', 'Uptown Sports Club', 'Austin'],
];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  stopCronsForScript(app);
  const places = app.get(GooglePlacesService);

  const ask = async (query: string, city: string): Promise<string> => {
    try {
      const response = await places.autocompletePlace(`${query} ${city}`, {});
      const suggestions =
        (response as { suggestions?: unknown[] })?.suggestions ?? [];
      const first = suggestions
        .slice(0, 3)
        .map((s) => {
          const p = (s as { placePrediction?: Record<string, unknown> })
            .placePrediction;
          const text = (p?.text as { text?: string })?.text;
          return text ?? '?';
        })
        .join('  |  ');
      return first || '(no suggestions)';
    } catch (error) {
      return `ERROR ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  console.log(
    '\nGROUNDING NAME PROBE — same restaurant, canonical vs surface form\n',
  );
  for (const [canonical, surface, city] of PAIRS) {
    const a = await ask(canonical, city);
    const b =
      canonical === surface ? '(same string)' : await ask(surface, city);
    console.log(`--- ${city}: "${canonical}"  vs  "${surface}"`);
    console.log(`  canonical -> ${a}`);
    console.log(`  surface   -> ${b}\n`);
  }

  await app.close();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
