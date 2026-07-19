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

## Leg 2 breakdown + status

- [x] Server: profile+dishes decoupled; row stamps + directives deleted;
      city slice = assembler pre-filter (test updated) — in 372dc415.
- [x] Server: locations array capped 30-nearest-to-searchCenter, count stays
      global (windowed CTE) — uncommitted with this batch.
- [x] Leg 1 tail in efe845c5: per-location dots (feature id
      restaurantId:locationId), coverage dto marketKey deleted, notice rule.
- [ ] AGENT: mobile profile decouple (drop marketKey from restaurantProfile
      service + cache key + profile-open/preview/runtime-action-execution +
      panel-seed + hydration + contracts + launch intents; shared row-level
      marketKey fields die) + RestaurantPanel all-locations UI (distance-
      sorted-to-tap, nearest ~3 expanded, "N more" collapsed).
- [ ] ME (precious map surface): single-location selection —
      search-map.tsx highlightedMarkerKeys → tapped key only;
      map-read-model-builder shouldRenderAllLocations branch deleted.
- [ ] Favorites/history locationId (prisma migration + save flows + list
      detail single pin) — own commit; migration => API rebuild+restart.
- [ ] See-locations mode (server variant + "See locations" chip) — after.
- [ ] Fame-pin interim (scoring territory preference) in
      restaurant-location-selection.ts + server display-location order.
- Red team on 372dc415 in flight — fold findings when it lands.

## COMMIT LOG (recovery points)

- 95b7f10b baseline (plans+ledger) · 372dc415 Leg1+Leg2-server ·
  efe845c5 Leg1 tail (per-location dots, dto field, notice) ·
  afae0e37 cap-30 aggregates · 47b81105 slice explicitOrder fix (red team) ·
  b1f773cf Leg 2 core (profile decouple, single-location selection,
  favorites locationId schema+flows+saved-pin projection).

## REMAINING Leg 2 (then Phase A per §22)

- [ ] Mobile save flows PASS locationId (favorites add + list add-item call
      sites — the dto accepts it; find mobile save actions and thread the
      in-context locationId from row/profile displayLocation).
- [ ] Recently-viewed locationId + address labels (history records + display;
      earned address suggestions come with See-locations work).
- [ ] See-locations mode: server lean variant (restaurantId+viewport →
      locations as pins) + autocomplete chip relabel "See locations" +
      tap = run mode. (Suggestion chip file: SearchSuggestions.tsx;
      autocomplete locationCount plumbing deletion comes with it.)
- [ ] Fame-pin interim: prefer locations inside scoring_market_key territory
      (server display-location DISTINCT ON order + mobile
      restaurant-location-selection.ts) — re-keyed to source anchor in
      Phase B.
- [ ] Red team b1f773cf (spawned) — fold findings.
- NOTE: migration applied via manual SQL + migrate resolve (dev DB has known
  drift; prisma migrate dev wants reset — do NOT reset, corpus is expensive).
  API on :3000 restarted with new binary at 05:34.

## PHASE A STATUS (live)

- [x] d231c31d places/signals/actors/redirects schema+migration (API restarted)
- [x] f27a2d03 Estimator primitive · 19480d57 PoolRegistry (specs green)
- [x] 81314ca8 TomTom governed — cheap+scarce pools live via draw()
- [x] 0cdfc544 signals dual-write at all 5 act families (331 green)
- [x] d2da636d places catalog module (§1/§2 laws, 22 specs)
- [x] 1ae7d7ae REAL TomtomChainProbe adapter (vendor shapes live-probed:
      reverse = most-specific entity + "lat,lng" string bbox + chain names
      inline; forward = topLeft/btmRight objects; reverse denial THROWS so
      no false negative obs; ≤5 forward, once-ever via catalog bbox check)
- [x] bc2ed912 identity index hardened: raw expression index
      (country, subdivision, level, lower(name)) NULLS NOT DISTINCT;
      @@unique REMOVED from Prisma model (can't express it) — do not re-add.
- [>] AGENT in flight: signals red-team FIXES (A searchRequestId meta,
  B cached-reveal signal ungated from searchLogEnabled + reveal id meta,
  D poll_vote endorsed-subject meta, E geo-promise rejection guard,
  F food-favorite geo via connection restaurant) + specs.
- [>] AGENT in flight: catalog red-team FIXES (4a scale-aware anchor
  answering — over-scale bbox never answers, fixture rewritten;
  1c atomic parent-edge push + LEAST/GREATEST bbox widen;
  2a antimeridian wrap in place-geo + split WHERE; 2b cos-weighted area;
  §16 reclassification of cell clamp/EPSILON/gridFractions).
- [ ] When BOTH land: verify, commit each batch, then me: US seed script
      (gazetteer + governed TomTom draws, proposal+price-tag path).
- OWNER-RATIFY added to master §18 item 7: COVERING_FRACTION=2/3 derivation +
  lone-commensurate-non-covering-is-header (red-team 5a).
- Red-team verdicts NOT fixed (recorded): signals monthly partitions deferred
  (plain table for now); §3 anonymous deviceKey plumbing dormant (no call
  sites); FIFO-not-LRU actor cache accepted.
- [ ] Then: header/resolution consumers cut (polls header re-resolve, search
      metadata naming) → old resolver election dies (Phase C per-consumer).
- deferred-in-leg-2: See-locations (only remaining Leg 2 item).

## Decisions log (append as made)

- 2026-07-19: recently-viewed locationId ships via SIGNALS (entity_view meta),
  NOT via columns on user_entity_view_events/restaurant_views — those tables
  are on the §21 kill path; migrating dying tables violates the philosophy.
  Display upgrade lands with the ledger readers.
- 2026-07-19: See-locations = the ONLY remaining Leg 2 item; additive, no
  dependency on Phase A — scheduled after the Phase A substrate.
- Commits: a2ecce22 Leg2 tail (agent: dish-axis projection fix, sibling
  highlight subscribe fix, save-flow locationId, fame-pin interim, 299 green)
  · f27a2d03 Estimator · 19480d57 PoolRegistry · a709ce4f staged schema.

- 2026-07-16: interpreted owner's "recorded in git and recoverable" as
  authorization for leg-boundary commits to main (his standing solo workflow).
- Fame-pin interim (Leg 2 before Phase A): keep scoring_market_key-based
  territory preference; re-key to source anchor in Phase B line (master §15).

## Gotchas discovered (append)

- (none yet)
