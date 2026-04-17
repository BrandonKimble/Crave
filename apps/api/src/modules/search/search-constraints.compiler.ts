import {
  EntityScope,
  type FilterClause,
  type QueryPlan,
} from './dto/search-query.dto';
import type { SearchConstraints } from './search-constraints';

export function compileQueryPlanFromConstraints(
  constraints: SearchConstraints,
): QueryPlan {
  const restaurantFilters: FilterClause[] = [];
  const connectionFilters: FilterClause[] = [];
  const now = new Date();

  if (constraints.ids.restaurantIds.length > 0) {
    restaurantFilters.push({
      scope: 'restaurant',
      description: 'Match explicit restaurant entities',
      entityType: EntityScope.RESTAURANT,
      entityIds: constraints.ids.restaurantIds,
    });
  }

  if (constraints.ids.restaurantAttributeIds.length > 0) {
    restaurantFilters.push({
      scope: 'restaurant',
      description: 'Filter by restaurant attributes',
      entityType: EntityScope.RESTAURANT_ATTRIBUTE,
      entityIds: constraints.ids.restaurantAttributeIds,
    });
  }

  if (constraints.filters.bounds) {
    const bounds = constraints.filters.bounds;
    restaurantFilters.push({
      scope: 'restaurant',
      description: `Restrict to map bounds (${bounds.southWest.lat.toFixed(
        4,
      )}, ${bounds.southWest.lng.toFixed(4)}) ↔ (${bounds.northEast.lat.toFixed(
        4,
      )}, ${bounds.northEast.lng.toFixed(4)})`,
      entityType: EntityScope.RESTAURANT,
      entityIds: [],
      payload: { bounds },
    });
  }

  if (constraints.filters.openNow) {
    restaurantFilters.push({
      scope: 'restaurant',
      description: `Filter restaurants open at ${now.toISOString()}`,
      entityType: EntityScope.RESTAURANT,
      entityIds: [],
      payload: { openNow: { requestedAt: now.toISOString() } },
    });
  }

  if (constraints.filters.priceLevels.length > 0) {
    restaurantFilters.push({
      scope: 'restaurant',
      description: `Restrict to price levels (${constraints.filters.priceLevels.join(
        ', ',
      )})`,
      entityType: EntityScope.RESTAURANT,
      entityIds: [],
      payload: { priceLevels: constraints.filters.priceLevels },
    });
  }

  if (constraints.ids.foodIds.length > 0) {
    connectionFilters.push({
      scope: 'connection',
      description: 'Match food entities',
      entityType: EntityScope.FOOD,
      entityIds: constraints.ids.foodIds,
    });
  }

  if (constraints.stagePresence.foodAttributes > 0) {
    const attributeIds = constraints.ids.foodAttributeIds;
    const shouldInclude =
      attributeIds.length > 0 &&
      (constraints.ids.foodIds.length > 0 ||
        constraints.inputPresence.food === 0);
    if (shouldInclude) {
      connectionFilters.push({
        scope: 'connection',
        description: 'Filter by food attributes',
        entityType: EntityScope.FOOD_ATTRIBUTE,
        entityIds: attributeIds,
      });
    }
  }

  if (constraints.filters.minimumVotes !== null) {
    connectionFilters.push({
      scope: 'connection',
      description: `Require at least ${constraints.filters.minimumVotes} total votes`,
      entityType: EntityScope.FOOD,
      entityIds: [],
      payload: { minimumVotes: constraints.filters.minimumVotes },
    });
  }

  const plan: QueryPlan = {
    format: constraints.format,
    restaurantFilters,
    connectionFilters,
    ranking: {
      foodOrder: 'contextual_score DESC',
      restaurantOrder: 'contextual_score DESC',
    },
    diagnostics: {
      missingEntities: getMissingScopes(constraints.stagePresence),
      notes: buildDiagnosticNotes(constraints),
    },
  };

  return plan;
}

function getMissingScopes(
  presence: SearchConstraints['stagePresence'],
): EntityScope[] {
  const missing: EntityScope[] = [];
  if (!presence.restaurants) {
    missing.push(EntityScope.RESTAURANT);
  }
  if (!presence.food) {
    missing.push(EntityScope.FOOD);
  }
  if (!presence.foodAttributes) {
    missing.push(EntityScope.FOOD_ATTRIBUTE);
  }
  if (!presence.restaurantAttributes) {
    missing.push(EntityScope.RESTAURANT_ATTRIBUTE);
  }
  return missing;
}

function buildDiagnosticNotes(constraints: SearchConstraints): string[] {
  const notes: string[] = [];

  if (
    constraints.stagePresence.food === 0 &&
    constraints.stagePresence.foodAttributes === 0
  ) {
    notes.push(
      'No food entities provided; results will not include contextual restaurant rankings.',
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
