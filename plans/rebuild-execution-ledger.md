# Rebuild Execution Ledger (compaction-survival state)

READ THIS FIRST after any compaction. Owner directive (2026-07-16): execute ALL
phases of plans/geo-demand-foundation-rebuild.md (§22 value-ordered cut) without
stopping; clean up + red team as you go; commit at leg boundaries (git = the
recovery net); reassess only when the end-state is reached. Keep ≥1 background
agent in flight at turn end so completion notifications chain turns.

## Execution order (master §22) + status

1. [IN PROGRESS] Leg 1 server — viewport-only cutover (task #1)
2. [ ] Leg 1 mobile — label purge, coverage marketKey drop, parallel fetch (#2)
3. [ ] Leg 2 — location-centric pivot (#3)
4. [ ] Phase A minimum — places DAG, signals dual-write, redirects/actors,
       Estimator registry (readers OFF), TomTom pools first, Gemini pool #1,
       draw ledger (#4)
5. [ ] US seed + header/resolution → catalog (#5)
6. [ ] Poll system cut (seeder at priors, ritual, feed, pagination) (#6)
7. [ ] Aggregate+readers, collector at priors, score cut (AFTER seeder),
       Phase C purges, wave-5 final red team (#7)

## Standing rules

- Deferral law: defer estimator READERS, never observations. Priors edition.
- Commit at leg boundaries: "feat(rebuild): <leg> — <summary>" straight to main.
- Build verify: cd apps/api && npx prisma generate && yarn build; grep log for
  "error:"; API restart recipe in CLAUDE.md (kill ALL LISTEN pids on :3000,
  -sTCP:LISTEN flag is load-bearing). Mobile: force full bundle
  (curl AppEntry.bundle), BUILDCHECK marker, scripts/rig/reload-dev-client.sh.
- Tests: apps/api yarn test (283 specs green baseline). Red-team each leg's
  diff with 1 agent while I start the next leg.
- Migrations: after ANY prisma migration → rebuild+restart shared API (CLAUDE.md
  twice-burned trap).
- Dead code: delete per master §12.7/§21; verify with grep before/after.

## Key spec pointers

- Master plan: plans/geo-demand-foundation-rebuild.md (764 lines, consolidated;
  §7 = Legs 1-2 summary; detailed file:line lists in
  plans/viewport-only-location-centric-plan.md Legs 1-2).
- Leg 1 server anchors (verify before edit, lines drift):
  search-query.builder.ts buildLocationConditions market EXISTS (~L907);
  search-coverage.service.ts marketLocationFilterSql (~L211) + maxRestaurants
  50000 (~L181) + DISTINCT ON (cl.restaurant_id) (~L263);
  search.service.ts MAX_PAGE_SIZE/resolvePagination (~L84/~L3437), directives
  gate hasActiveMarketKey (~L1881,~L1897);
  search-query.executor.ts attachMarketNames (~L466,L542-654);
  dto/search-query.dto.ts pageSize (+@Max), ShortcutCoverageRequestDto marketKey.
- Coverage deploy order (lockstep): server accepts-and-ignores marketKey FIRST,
  mobile drops it, then dto removes it. Within one repo/deploy this collapses to:
  make marketKey optional-ignored in dto now; delete field only after mobile edit.
- Leg 1 mobile anchors: old plan §1.4 list (dish-result-card L58-249,
  restaurant-result-card L73-435, descriptor, render-meta-detail-line marketLabel,
  utils/format.ts L6-30, use-search-results-panel-card-market-runtime
  primaryMarketKey half, card-render-runtime, data-store L1242-1263);
  shortcut-coverage-world.ts L91/L174-221; search-world-fetch.ts L125-157;
  services/search.ts L726-748.

## Progress detail

- Leg 1 server DONE (build green, 283/283): builder market EXISTS deleted +
  signatures collapsed; aggregates CTE forced global (market branch deleted);
  coverage marketKey filter + 50k LIMIT deleted (dto field ACCEPT-AND-IGNORED
  until mobile drop lands); pagination clamp → DTO @Max(100) (service clamp
  machinery deleted); attachMarketNames + resolveMarketName + marketName seeds
  purged from executor + service (kept: displayMarketName resolution metadata).
- SEQUENCED BEHIND MOBILE AGENT: per-location dots (DISTINCT ON drop changes
  feature cardinality — must verify mobile read-model grouping in same change);
  coverage dto marketKey field removal; notice copy (mobile file).
- Leg 2 SERVER starting while agent owns apps/mobile: profile decoupling,
  aggregates cap-30-nearest, row market_key stamps + directives cleanup.

## Decisions log (append as made)

- 2026-07-16: interpreted owner's "recorded in git and recoverable" as
  authorization for leg-boundary commits to main (his standing solo workflow).
- Fame-pin interim (Leg 2 before Phase A): keep scoring_market_key-based
  territory preference; re-key to source anchor in Phase B line (master §15).

## Gotchas discovered (append)

- (none yet)
