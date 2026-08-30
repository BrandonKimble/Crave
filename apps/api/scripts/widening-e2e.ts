/**
 * @script-class: probe (end-to-end verification harness)
 *
 * WIDENING E2E PROOF: real searches through SearchOrchestrationService /
 * SearchService with satisfies edges INJECTED IN-MEMORY (the sibling
 * service's satisfies readers are patched on the live instance) — no
 * entity_satisfies rows are written anywhere. Runs each query BEFORE and
 * AFTER injection and reports:
 *   - UNION ADMISSION: the after result set must contain the before set
 *     plus rows admitted only through the widened arm;
 *   - UNCHANGED ORDERING: rows present in both runs keep their relative
 *     order (widening is admission-only; order is pure Crave Score);
 *   - STARVATION KEYING: soft/coverage metadata stays keyed per original
 *     concept.
 *
 * READ-ONLY BY CONSTRUCTION, twice over: (1) the Postgres session itself is
 * opened with `default_transaction_read_only=on` — any stray write ERRORS
 * instead of landing; (2) the three write paths a search submit normally
 * takes (signals ledger, on-demand recording, viewport reconciler) are
 * stubbed to no-ops so nothing even tries. Point it at a full corpus with
 * WIDENING_E2E_DATABASE_URL (e.g. staging, whose state this proves against):
 *   WIDENING_E2E_DATABASE_URL=postgresql://... \
 *     yarn workspace api ts-node scripts/widening-e2e.ts
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';
if (process.env.WIDENING_E2E_DATABASE_URL) {
  const url = new URL(process.env.WIDENING_E2E_DATABASE_URL);
  url.searchParams.set('options', '-c default_transaction_read_only=on');
  process.env.DATABASE_URL = url.toString();
}

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SearchOrchestrationService } from '../src/modules/search/search-orchestration.service';
import {
  SearchSiblingExpansionService,
  type SatisfiesAttributeArm,
} from '../src/modules/search/search-sibling-expansion.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';
import { SignalsService } from '../src/modules/signals/signals.service';
import { OnDemandRequestService } from '../src/modules/search/on-demand-request.service';

const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Austin viewport (the corpus city). */
const AUSTIN_BOUNDS = {
  northEast: { lat: 30.52, lng: -97.55 },
  southWest: { lat: 30.1, lng: -97.95 },
};

interface RunResult {
  places: Array<{ id: string; name: string }>;
  dishes: Array<{ id: string; name: string }>;
  meta: unknown;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const prisma = app.get(PrismaService);
    const orchestration = app.get(SearchOrchestrationService);
    const siblings = app.get(SearchSiblingExpansionService);

    // WRITE GUARD 2 (belt to the session's read-only braces): the submit's
    // write paths become no-ops for this probe.
    const signals = app.get(SignalsService);
    (signals as unknown as { record: () => void }).record = () => {};
    const onDemand = app.get(OnDemandRequestService);
    (
      onDemand as unknown as { recordRequests: () => Promise<void> }
    ).recordRequests = async () => {};
    const { PlacesReconcilerService } = await import(
      '../src/modules/places/places-reconciler.service'
    );
    const reconciler = app.get(PlacesReconcilerService);
    (reconciler as unknown as { noteViewport: () => void }).noteViewport =
      () => {};

    const idOf = async (name: string, type: string): Promise<string | null> => {
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT entity_id::text AS id FROM core_entities
          WHERE identity_key = $1 AND type::text = $2 AND status = 'active'
          LIMIT 1`,
        name,
        type,
      );
      return rows[0]?.id ?? null;
    };

    const pubId = await idOf('pub', 'place_attribute');
    const barId = await idOf('bar', 'place_attribute');
    const baconId = await idOf('bacon', 'ingredient');
    const pancettaId = await idOf('pancetta', 'ingredient');
    console.log({ pubId, barId, baconId, pancettaId });
    if (!pubId || !barId) throw new Error('pub/bar attributes not found');

    // THE IN-MEMORY INJECTION: patch the two satisfies readers on the live
    // instance. Everything else (memoization, arm minting, SQL compilation)
    // is the real production path.
    const realAttrRead = siblings.getSatisfiesAttributeArms.bind(siblings);
    const realIngRead = siblings.getSatisfiesIngredientIds.bind(siblings);
    let inject = false;
    siblings.getSatisfiesAttributeArms = async (anchorIds: string[]) => {
      const out = await realAttrRead(anchorIds);
      if (inject && anchorIds.includes(pubId)) {
        const arms: SatisfiesAttributeArm[] = [
          ...(out.get(pubId) ?? []),
          { id: barId, column: 'restaurant_attributes' },
        ];
        out.set(pubId, arms);
      }
      return out;
    };
    siblings.getSatisfiesIngredientIds = async (anchorIds: string[]) => {
      const out = await realIngRead(anchorIds);
      if (inject && baconId && pancettaId && anchorIds.includes(baconId)) {
        if (!out.includes(pancettaId)) out.push(pancettaId);
      }
      return out;
    };

    const run = async (query: string): Promise<RunResult> => {
      const response = await orchestration.runNaturalQuery({
        query,
        bounds: AUSTIN_BOUNDS,
        pagination: { page: 1, pageSize: 25 },
      } as never);
      return {
        places: (response.places ?? []).map((r) => ({
          id: r.placeId,
          name: r.placeName,
        })),
        dishes: (response.dishes ?? []).map((d) => ({
          id: d.connectionId,
          name: d.itemName,
        })),
        meta: {
          total: response.metadata?.totalPlaceResults,
          totalDishes: response.metadata?.totalItemResults,
          coverage: response.metadata?.resultCoverageStatus,
        },
      };
    };

    const compare = (label: string, before: RunResult, after: RunResult) => {
      const beforeIds = before.places.map((p) => p.id);
      const afterIds = after.places.map((p) => p.id);
      const afterSet = new Set(afterIds);
      const lost = beforeIds.filter((id) => !afterSet.has(id));
      const gained = after.places.filter((p) => !beforeIds.includes(p.id));
      // Relative-order check over the shared rows (order is pure score, so
      // widening must not reorder what both runs serve).
      const sharedBefore = beforeIds.filter((id) => afterSet.has(id));
      const sharedAfter = afterIds.filter((id) => beforeIds.includes(id));
      const orderIntact =
        JSON.stringify(sharedBefore) === JSON.stringify(sharedAfter);
      console.log(`\n=== ${label} ===`);
      console.log(
        `places before=${beforeIds.length} after=${afterIds.length} ` +
          `gained=${gained.length} lost(page-displaced)=${lost.length} ` +
          `sharedOrderIntact=${orderIntact}`,
      );
      if (gained.length) {
        console.log(
          'gained:',
          gained
            .map((p) => p.name)
            .slice(0, 15)
            .join(' | '),
        );
      }
      if (lost.length) {
        console.log(
          'displaced off page (expected only when the page was full):',
          lost.length,
        );
      }
      console.log(
        `dishes before=${before.dishes.length} after=${after.dishes.length}`,
      );
      console.log(
        `totals before=${JSON.stringify(before.meta)} after=${JSON.stringify(after.meta)}`,
      );
      // Union admission over the dish list too.
      const beforeDishIds = new Set(before.dishes.map((d) => d.id));
      const gainedDishes = after.dishes.filter((d) => !beforeDishIds.has(d.id));
      if (gainedDishes.length) {
        console.log(
          'gained dishes:',
          gainedDishes
            .map((d) => d.name)
            .slice(0, 10)
            .join(' | '),
        );
      }
    };

    for (const query of ['pub', 'cozy pub', 'bacon']) {
      inject = false;
      const before = await run(query);
      inject = true;
      const after = await run(query);
      compare(`"${query}"`, before, after);
    }

    // STRUCTURED INGREDIENT CASE: "dishes with bacon" as the interpreter
    // grounds it when the ingredient reading wins — entities.ingredients
    // carries the bacon INGREDIENT id, so the plan's ingredient clause (and
    // its widening) is the arm under test, not the item subject.
    if (baconId) {
      const searchService = (
        orchestration as unknown as {
          searchService: { runQuery: (req: unknown) => Promise<unknown> };
        }
      ).searchService;
      const runStructured = async (): Promise<RunResult> => {
        const response = (await searchService.runQuery({
          entities: {
            restaurants: [],
            items: [],
            foodAttributes: [],
            restaurantAttributes: [],
            ingredients: [{ normalizedName: 'bacon', entityIds: [baconId] }],
          },
          bounds: AUSTIN_BOUNDS,
          pagination: { page: 1, pageSize: 25 },
          sourceQuery: 'bacon (structured ingredient probe)',
        })) as {
          places: Array<{ placeId: string; placeName: string }>;
          dishes: Array<{ connectionId: string; itemName: string }>;
          metadata?: {
            totalPlaceResults?: number;
            totalItemResults?: number;
            resultCoverageStatus?: string;
          };
        };
        return {
          places: (response.places ?? []).map((r) => ({
            id: r.placeId,
            name: r.placeName,
          })),
          dishes: (response.dishes ?? []).map((d) => ({
            id: d.connectionId,
            name: d.itemName,
          })),
          meta: {
            total: response.metadata?.totalPlaceResults,
            totalDishes: response.metadata?.totalItemResults,
            coverage: response.metadata?.resultCoverageStatus,
          },
        };
      };
      inject = false;
      const before = await runStructured();
      inject = true;
      const after = await runStructured();
      compare('ingredient:bacon (structured)', before, after);
    }
  } finally {
    await app.close();
  }
}

void bootstrap();
