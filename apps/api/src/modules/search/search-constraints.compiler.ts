import {
  EntityScope,
  type FilterClause,
  type QueryPlan,
} from './dto/search-query.dto';
import type { SearchConstraints } from './search-constraints';

export function compileQueryPlanFromConstraints(
  constraints: SearchConstraints,
): QueryPlan {
  const placeFilters: FilterClause[] = [];
  const connectionFilters: FilterClause[] = [];
  const now = new Date();

  if (constraints.ids.placeIds.length > 0) {
    placeFilters.push({
      scope: 'place',
      description: 'Match explicit restaurant entities',
      entityType: EntityScope.PLACE,
      entityIds: constraints.ids.placeIds,
    });
  }

  if (constraints.ids.placeAttributeIds.length > 0) {
    placeFilters.push({
      scope: 'place',
      description: 'Filter by restaurant attributes',
      entityType: EntityScope.PLACE_ATTRIBUTE,
      entityIds: constraints.ids.placeAttributeIds,
    });
  }

  if (constraints.filters.bounds) {
    const bounds = constraints.filters.bounds;
    placeFilters.push({
      scope: 'place',
      description: `Restrict to map bounds (${bounds.southWest.lat.toFixed(
        4,
      )}, ${bounds.southWest.lng.toFixed(4)}) ↔ (${bounds.northEast.lat.toFixed(
        4,
      )}, ${bounds.northEast.lng.toFixed(4)})`,
      entityType: EntityScope.PLACE,
      entityIds: [],
      payload: { bounds },
    });
  }

  if (
    constraints.filters.viewportPolygon &&
    constraints.filters.viewportPolygon.length >= 3
  ) {
    const viewportPolygon = constraints.filters.viewportPolygon;
    placeFilters.push({
      scope: 'place',
      description: `Restrict to screen-accurate viewport polygon (${viewportPolygon.length} pts)`,
      entityType: EntityScope.PLACE,
      entityIds: [],
      payload: { viewportPolygon },
    });
  }

  if (constraints.filters.openNow) {
    placeFilters.push({
      scope: 'place',
      description: `Filter restaurants open at ${now.toISOString()}`,
      entityType: EntityScope.PLACE,
      entityIds: [],
      payload: { openNow: { requestedAt: now.toISOString() } },
    });
  }

  if (constraints.filters.priceLevels.length > 0) {
    placeFilters.push({
      scope: 'place',
      description: `Restrict to price levels (${constraints.filters.priceLevels.join(
        ', ',
      )})`,
      entityType: EntityScope.PLACE,
      entityIds: [],
      payload: { priceLevels: constraints.filters.priceLevels },
    });
  }

  if (constraints.ids.itemIds.length > 0) {
    connectionFilters.push({
      scope: 'connection',
      description: 'Match food entities',
      entityType: EntityScope.ITEM,
      entityIds: constraints.ids.itemIds,
    });
  }

  if (constraints.ids.ingredientIds.length > 0) {
    connectionFilters.push({
      scope: 'connection',
      description: 'Filter by ingredients (evidence or canonical tier)',
      entityType: EntityScope.INGREDIENT,
      entityIds: constraints.ids.ingredientIds,
    });
  }

  if (constraints.inputPresence.itemAttributes > 0) {
    const attributeIds = constraints.ids.itemAttributeIds;
    const shouldInclude =
      attributeIds.length > 0 &&
      (constraints.ids.itemIds.length > 0 ||
        constraints.inputPresence.items === 0);
    if (shouldInclude) {
      connectionFilters.push({
        scope: 'connection',
        description: 'Filter by food attributes',
        entityType: EntityScope.ITEM_ATTRIBUTE,
        entityIds: attributeIds,
      });
    }
  }

  if (constraints.filters.minimumVotes !== null) {
    connectionFilters.push({
      scope: 'connection',
      description: `Require at least ${constraints.filters.minimumVotes} total votes`,
      entityType: EntityScope.ITEM,
      entityIds: [],
      payload: { minimumVotes: constraints.filters.minimumVotes },
    });
  }

  const plan: QueryPlan = {
    format: constraints.format,
    placeFilters,
    connectionFilters,
    ranking: constraints.filters.rising
      ? {
          itemOrder: 'rising DESC',
          placeOrder: 'rising DESC',
        }
      : {
          itemOrder: 'crave_score DESC',
          placeOrder: 'crave_score DESC',
        },
    diagnostics: {
      missingEntities: getMissingScopes(constraints.inputPresence),
      notes: buildDiagnosticNotes(constraints),
    },
  };

  return plan;
}

function getMissingScopes(
  presence: SearchConstraints['inputPresence'],
): EntityScope[] {
  const missing: EntityScope[] = [];
  if (!presence.places) {
    missing.push(EntityScope.PLACE);
  }
  if (!presence.items) {
    missing.push(EntityScope.ITEM);
  }
  if (!presence.itemAttributes) {
    missing.push(EntityScope.ITEM_ATTRIBUTE);
  }
  if (!presence.placeAttributes) {
    missing.push(EntityScope.PLACE_ATTRIBUTE);
  }
  return missing;
}

function buildDiagnosticNotes(constraints: SearchConstraints): string[] {
  const notes: string[] = [];

  if (
    constraints.inputPresence.items === 0 &&
    constraints.inputPresence.itemAttributes === 0
  ) {
    notes.push(
      'No food entities provided; restaurant results will rank by public Crave Score.',
    );
  }

  if (constraints.filters.bounds) {
    notes.push(
      'Map bounds supplied; ensure spatial indexes are ready before enabling execution.',
    );
  }

  if (constraints.filters.openNow) {
    notes.push('Open-now filter requested; requires restaurant hour metadata.');
  }

  if (constraints.filters.priceLevels.length > 0) {
    notes.push('Price filter requested; ensure price metadata is available.');
  }

  if (constraints.unresolved.groups.length > 0) {
    notes.push(
      'Unresolved terms present; ID expansion may run to improve recall.',
    );
  }

  return notes;
}
