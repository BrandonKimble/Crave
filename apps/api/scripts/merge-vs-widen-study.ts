/**
 * @script-class: probe (read-only research harness — merge-vs-widen study)
 *
 * THREE WORLDS, REAL SEARCHES. For each test pair, runs the production
 * search under:
 *   A. TODAY   — no satisfies edges
 *   B. WIDENED — the docket's judged satisfies directions (from a verdict
 *                table JSON, STUDY_VERDICTS env var)
 *   C. MERGED  — bidirectional edges for the pair (storage-merge UX
 *                simulated without merging)
 * Edges injected IN-MEMORY exactly like widening-e2e.ts (patched satisfies
 * readers); Postgres session opened read-only; submit write paths stubbed.
 *
 *   STUDY_DATABASE_URL=postgresql://... STUDY_VERDICTS=verdicts.json \
 *     yarn workspace api ts-node scripts/merge-vs-widen-study.ts
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';
if (process.env.STUDY_DATABASE_URL) {
  const url = new URL(process.env.STUDY_DATABASE_URL);
  url.searchParams.set('options', '-c default_transaction_read_only=on');
  process.env.DATABASE_URL = url.toString();
}

import { readFileSync, writeFileSync } from 'fs';
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

const AUSTIN_BOUNDS = {
  northEast: { lat: 30.52, lng: -97.55 },
  southWest: { lat: 30.1, lng: -97.95 },
};

/** [aName, bName, kind] — attribute pairs are heard as place or item
 * attributes depending on what resolves; ingredient pairs run structured. */
const ATTR_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['bar', 'pub'],
  ['cold', 'iced'],
  ['citrus', 'lemony'],
  ['sour', 'citrus'],
  ['sour', 'tangy'],
  ['fudgy', 'gooey'],
  ['deli', 'sandwich shop'],
  ['kebab shop', 'shawarma'],
  ['grass fed', 'pasture raised'],
  ['soft', 'tender'],
  ['bakery', 'pastry shop'],
];
const ING_TRIPLE = ['bacon', 'pancetta', 'guanciale'];
const MODIFIED_QUERIES: ReadonlyArray<readonly [string, string]> = [
  // [query, pair anchor word whose edges matter]
  ['cozy pub', 'pub'],
  ['fudgy brownie', 'fudgy'],
  ['iced coffee', 'iced'],
];

interface VerdictRow {
  kind: string;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  verdict: string;
  reason?: string;
}
interface RunResult {
  places: Array<{ id: string; name: string }>;
  dishes: Array<{ id: string; name: string }>;
  totalPlaces?: number;
  totalDishes?: number;
}

async function bootstrap(): Promise<void> {
  const verdictPath = process.env.STUDY_VERDICTS;
  const verdictRows: VerdictRow[] = verdictPath
    ? (JSON.parse(readFileSync(verdictPath, 'utf8')) as { rows: VerdictRow[] })
        .rows
    : [];

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const prisma = app.get(PrismaService);
    const orchestration = app.get(SearchOrchestrationService);
    const siblings = app.get(SearchSiblingExpansionService);

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

    // Resolve every name to its active entity (attribute kinds + ingredient).
    const allNames = Array.from(new Set([...ATTR_PAIRS.flat(), ...ING_TRIPLE]));
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; name: string; type: string }>
    >(
      `SELECT entity_id::text AS id, identity_key AS name, type::text AS type
         FROM core_entities
        WHERE status = 'active' AND identity_key = ANY($1)
          AND type::text IN ('place_attribute','item_attribute','ingredient')`,
      allNames,
    );
    const attrOf = new Map<string, { id: string; type: string }>();
    const ingOf = new Map<string, string>();
    for (const r of rows) {
      if (r.type === 'ingredient') ingOf.set(r.name, r.id);
      else if (!attrOf.has(r.name)) attrOf.set(r.name, r);
      else {
        // prefer the type matching its pair partner later; keep both
        attrOf.set(`${r.name}|${r.type}`, r);
      }
    }
    const pickAttr = (
      name: string,
      preferType?: string,
    ): { id: string; type: string } | undefined =>
      (preferType && (attrOf.get(`${name}|${preferType}`) as never)) ||
      attrOf.get(name);

    const columnFor = (
      type: string,
    ): 'restaurant_attributes' | 'food_attributes' =>
      type === 'place_attribute' ? 'restaurant_attributes' : 'food_attributes';

    // Injection state, swapped per world.
    let attrInject = new Map<string, SatisfiesAttributeArm[]>();
    let ingInject = new Map<string, string[]>();
    const realAttrRead = siblings.getSatisfiesAttributeArms.bind(siblings);
    const realIngRead = siblings.getSatisfiesIngredientIds.bind(siblings);
    siblings.getSatisfiesAttributeArms = async (anchorIds: string[]) => {
      const out = await realAttrRead(anchorIds);
      for (const id of anchorIds) {
        const extra = attrInject.get(id);
        if (extra?.length) {
          const existing = out.get(id) ?? [];
          const seen = new Set(existing.map((a) => a.id));
          out.set(id, [...existing, ...extra.filter((a) => !seen.has(a.id))]);
        }
      }
      return out;
    };
    siblings.getSatisfiesIngredientIds = async (anchorIds: string[]) => {
      const out = await realIngRead(anchorIds);
      for (const id of anchorIds) {
        for (const extra of ingInject.get(id) ?? []) {
          if (!out.includes(extra)) out.push(extra);
        }
      }
      return out;
    };

    // Satisfies directions from the docket verdict table (by name pair).
    const satisfiesDir = new Set(
      verdictRows
        .filter((r) => r.verdict === 'satisfies')
        .map((r) => `${r.fromName.toLowerCase()}>${r.toName.toLowerCase()}`),
    );

    const buildAttrWorld = (
      pairs: ReadonlyArray<readonly [string, string]>,
      mode: 'A' | 'B' | 'C',
    ): Map<string, SatisfiesAttributeArm[]> => {
      const m = new Map<string, SatisfiesAttributeArm[]>();
      if (mode === 'A') return m;
      const add = (fromName: string, toName: string, preferType?: string) => {
        const from = pickAttr(fromName, preferType);
        const to = pickAttr(toName, from?.type);
        if (!from || !to) return;
        const arms = m.get(from.id) ?? [];
        arms.push({ id: to.id, column: columnFor(to.type) });
        m.set(from.id, arms);
      };
      for (const [a, b] of pairs) {
        if (mode === 'C') {
          add(a, b);
          add(b, a);
        } else {
          if (satisfiesDir.has(`${a.toLowerCase()}>${b.toLowerCase()}`))
            add(a, b);
          if (satisfiesDir.has(`${b.toLowerCase()}>${a.toLowerCase()}`))
            add(b, a);
        }
      }
      return m;
    };
    const buildIngWorld = (mode: 'A' | 'B' | 'C'): Map<string, string[]> => {
      const m = new Map<string, string[]>();
      if (mode === 'A') return m;
      const add = (a: string, b: string) => {
        const fromId = ingOf.get(a);
        const toId = ingOf.get(b);
        if (!fromId || !toId) return;
        m.set(fromId, [...(m.get(fromId) ?? []), toId]);
      };
      const ingPairs: Array<[string, string]> = [
        ['bacon', 'pancetta'],
        ['pancetta', 'bacon'],
        ['bacon', 'guanciale'],
        ['guanciale', 'bacon'],
        ['pancetta', 'guanciale'],
        ['guanciale', 'pancetta'],
      ];
      for (const [a, b] of ingPairs) {
        if (mode === 'C') add(a, b);
        else if (satisfiesDir.has(`${a}>${b}`)) add(a, b);
      }
      return m;
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
          name: `${d.itemName} @ ${(d as unknown as { placeName?: string }).placeName ?? '?'}`,
        })),
        totalPlaces: response.metadata?.totalPlaceResults,
        totalDishes: response.metadata?.totalItemResults,
      };
    };

    const searchService = (
      orchestration as unknown as {
        searchService: { runQuery: (req: unknown) => Promise<unknown> };
      }
    ).searchService;
    const runIngredient = async (name: string): Promise<RunResult> => {
      const id = ingOf.get(name);
      const response = (await searchService.runQuery({
        entities: {
          restaurants: [],
          items: [],
          foodAttributes: [],
          restaurantAttributes: [],
          ingredients: [{ normalizedName: name, entityIds: id ? [id] : [] }],
        },
        bounds: AUSTIN_BOUNDS,
        pagination: { page: 1, pageSize: 25 },
        sourceQuery: `${name} (structured ingredient probe)`,
      })) as {
        places: Array<{ placeId: string; placeName: string }>;
        dishes: Array<{
          connectionId: string;
          itemName: string;
          placeName?: string;
        }>;
        metadata?: { totalPlaceResults?: number; totalItemResults?: number };
      };
      return {
        places: (response.places ?? []).map((r) => ({
          id: r.placeId,
          name: r.placeName,
        })),
        dishes: (response.dishes ?? []).map((d) => ({
          id: d.connectionId,
          name: `${d.itemName} @ ${d.placeName ?? '?'}`,
        })),
        totalPlaces: response.metadata?.totalPlaceResults,
        totalDishes: response.metadata?.totalItemResults,
      };
    };

    const results: Record<string, Record<string, RunResult>> = {};
    const worlds: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];

    const attrQueries: Array<{
      query: string;
      pair: readonly [string, string];
    }> = [];
    for (const pair of ATTR_PAIRS) {
      attrQueries.push({ query: pair[0], pair });
      attrQueries.push({ query: pair[1], pair });
    }
    for (const [q, anchor] of MODIFIED_QUERIES) {
      const pair = ATTR_PAIRS.find((p) => p.includes(anchor));
      if (pair) attrQueries.push({ query: q, pair });
    }

    for (const { query, pair } of attrQueries) {
      results[query] = results[query] ?? {};
      for (const world of worlds) {
        attrInject = buildAttrWorld([pair], world);
        ingInject = new Map();
        try {
          results[query][world] = await run(query);
        } catch (error) {
          results[query][world] = {
            places: [],
            dishes: [],
            totalPlaces: -1,
            totalDishes: -1,
          };
          console.error(
            `ERROR "${query}" world ${world}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        const r = results[query][world];
        console.log(
          `"${query}" [${world}] places=${r.totalPlaces} dishes=${r.totalDishes}`,
        );
      }
    }

    for (const name of ING_TRIPLE) {
      const key = `ingredient:${name}`;
      results[key] = {};
      for (const world of worlds) {
        attrInject = new Map();
        ingInject = buildIngWorld(world);
        results[key][world] = await runIngredient(name);
        const r = results[key][world];
        console.log(
          `${key} [${world}] places=${r.totalPlaces} dishes=${r.totalDishes}`,
        );
      }
    }

    // Dish-side mature-system control: no injection, just today's behavior.
    attrInject = new Map();
    ingInject = new Map();
    results['soup dumplings (control)'] = { A: await run('soup dumplings') };
    const ctl = results['soup dumplings (control)'].A;
    console.log(
      `"soup dumplings" control places=${ctl.totalPlaces} dishes=${ctl.totalDishes}`,
    );

    const outPath =
      process.env.STUDY_OUT ?? `/tmp/merge-vs-widen-study-${Date.now()}.json`;
    writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`\nStudy results written: ${outPath}`);
  } finally {
    await app.close();
  }
}

void bootstrap();
