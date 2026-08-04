// Application constants

export * from './onboarding-vocabulary';
export * from './onboarding-questions';

// F1656 (2026-08-04): `ENTITY_TYPES` and `API_ENDPOINTS` lived here with zero consumers
// in either app. ENTITY_TYPES was also a THIRD spelling of a vocabulary already declared
// twice (the `EntityType` enum in ../types, and Prisma's own type column) — truth in three
// places, one of them unreachable. `API_ENDPOINTS` was a two-route stub marked
// "(to be defined)". Both deleted; use `EntityType` from ../types.

export const ONBOARDING_VERSION = 6;
