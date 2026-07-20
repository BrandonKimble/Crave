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
- [x] dde7fe79 signals red-team fixes A-F (searchRequestId meta, cached-reveal
      ungated + reveal-id meta, poll_vote endorsed subject, geo-rejection
      guard RED-proven, food-favorite geo via connection).
- [x] b9dbeb4e catalog red-team fixes (4a scale-aware answering RED-proven,
      1c atomic push + LEAST/GREATEST widen, 2a antimeridian wrap-aware
      place-geo + split WHEREs, 2b cos-weighted area, §16 reclassifications).
- [x] dd3c7e72 US seed script + EXECUTED: 19,447 municipalities + 49 states +
      country live in places (18 same-name identity merges, logged; Austin/
      Waco verified; sqrt(ALAND) bboxes; DC/HI/PR/territories organic-only).
- [x] 082323e0 Gemini pool #1: gemini.tokens ledger mirror (Redis limiter
      keeps admission; mirrorDraw records declared-vs-actual). PHASE A DONE.
- OWNER-RATIFY added to master §18 item 7: COVERING_FRACTION=2/3 derivation +
  lone-commensurate-non-covering-is-header (red-team 5a).
- Red-team verdicts NOT fixed (recorded): signals monthly partitions deferred
  (plain table for now); §3 anonymous deviceKey plumbing dormant (no call
  sites); FIFO-not-LRU actor cache accepted.

## TASK #5 STATUS — COMPLETE

- [x] US seed executed; re-run after collision purge: 19,430 municipality
      rows, zero phantom spans, 35 collision munis skipped (organic entry).
- [x] 7aaa66d9 header cut: displayMarketName from catalog (§2 subjects law),
      noteViewport at runQuery — growth machine LIVE. Contract tripwire spec.
- [x] 43b8a26c red-team fixes: asked-ground memory (over-scale chains no
      longer re-spend 3 draws per settle — view-region observation, 30d TTL,
      spec-proven) + distinct-place guard (disjoint bboxes never union) +
      seed collision skip + purge/reseed. §18 item 8 = identity-law
      discriminator amendment for wave-5.
- KNOWN GAPS (recorded, deliberate): PoolRegistry windows are IN-MEMORY —
  monthly ledgers reset on API restart (durable store = later phase);
  mobile on-demand notice falls back to candidateLocalityName (old election
  output) when catalog says null — dies with the mobile-side cut;
  continental-zoom search hydrates all ~19.5k place rows twice (fine today).

## TASK #6 STATUS (live)

- [x] 1ac21b70 poll SUPPLY cut COMMITTED (agent, 42 specs, 419 green):
      supply/ module = demand-mass kernel+SQL (RED-proven vs live DB),
      estimators via registry (viability 15 self-erasing; conversion/
      concentration unit priors OWNER-RATIFY), controller (warm start,
      JUMP, median test ±1 dither, no caps), weekly ritual hourly cron
      (Sunday 09:00 local; tz = stored else nautical-from-centroid AT READ,
      deliberately unpersisted; atomic tick+topics+polls+spend in one tx;
      idempotency placeId+weekOf), K6 ballot mint at graduation (one per
      distinct voter, m=1, poll_surface source, no engineId), scheduler/
      ready-pool/draft states DELETED. New polls placeId + marketKey SHIM
      (resolveMarketKeyShim — dies in item 5). Migration
      20260719120000_poll_supply_place_rekey applied via drift path; API
      restarted on new client. Agent ambiguity flags recorded in its
      code comments (OWNER-RATIFY markers).
- [>] AGENT in flight: red-team 1ac21b70 (ritual time math/DST, controller
  degenerate cases, demand SQL vs kernel divergence, K6 idempotency,
  kill completeness, §16 audit).
- [>] AGENT in flight: item 5 SERVER feed cut — feed = places-in-view (+
  commensurate-subject descendants; legacy market rows via bbox
  interim), keyset cursor pagination (take-25 dies), §2 header verdict
  in feed metadata, batch place labels, cold-start promise state,
  home-place notification targeting seam (big-place never push), shim
  dies. Mobile leg lands AFTER (contract report first).
- [x] 30e534a2 killed validate-demand-scoring-fixtures.ts (red-team 5a:
      imported deleted scheduler; committed tree typechecks again).
- [ ] SUPPLY RED-TEAM FIX LIST (run fix agent AFTER feed cut lands — feed
      agent owns polls files). All CONFIRMED on 1ac21b70:
      CRITICAL · 2a warm-start mints credit unconditionally (one searcher
      seeds a town; continental viewport seeds thousands) — gate warm-start
      credit on creditRate ≥ 1 (floor the FRONTIER, not the warrant).
      · 3e poll_vote signal geo still marketKey-keyed → NULL shim skips the
      signal for 98.8% of places (closed loop severed; zero-cohorts poison
      GLOBAL estimator streams) — when poll.placeId set, geo = place bbox.
      · 1a cohort close uses wall-clock launchedAt ≤ now−7d (knife-edge
      each Sunday; guaranteed miss on DST spring-forward) — close by weekOf
      label (cohort.weekOf < current weekOf).
      HIGH · 2b median test replays the same stale cohort weekly (frontier
      +1/wk on zero new evidence) — only pass cohorts with observedAt >
      state.creditUpdatedAt. · 2d cooldown never GATES (rank multiplier
      only; subject pool ≤ cohortTarget → same subjects every week) AND
      bootstrapByPlace is loaded but never consulted → identical bootstrap
      poll re-published weekly with last week's still open — wire both
      gates. · 1c queuePollReleaseNotification outside tx (crash loses the
      push forever) + O(cohort) inserts vs 5s tx timeout (172-poll Austin
      warm start aborts all Sunday) + tick/supply rows written even at
      publish 0 with no candidacy expiry. · 3a hourly placesWithAnySignal =
      unbounded places×signals nested loop (no geo index, no time bound) —
      bound occurred_at + gate to Sunday-window hours. · 3b
      harvestCohortOutcomes replays ALL history serially — lower-bound
      launchedAt (28d half-life makes older ≈ 0).
      MEDIUM · 3c signals bboxFromBounds min/max-normalizes an
      antimeridian-crossing viewport into a near-world bbox (attributes to
      every place on earth) — wrap representation + reader OR-split.
      · 4b ballot-mint early-return skips projection rebuild after
      crash-between-commit-and-rebuild — run rebuild on early-return too.
      · 6a estimator half-life mislabeled K1-derived (own K2 inventory
      line). · 6b classify 60s jitter + EPSILON clamps. · 1b nautical-tz
      comment claims ~1h max error (Austin = 2h in summer).
- [x] e84ce0b6 SERVER feed cut (agent, 23 specs, 442 green): feed =
      placesInView ∪ commensurate-subject descendants (recursive CTE) minus
      subdivision+ (structural DAG-depth bigness); keyset cursor
      (created_at, poll_id) w/ decay-invariant trending epoch; take-25
      DEAD; §2 header verdict + promise state + batch place labels in
      response (legacy envelope still renderable); notifications big-place
      never-push + home-place seam (quarantined market fallback, LOUD TODO:
      registration→placeAt→homePlaceId lands later); resolveMarketKeyShim
      DEAD; GET /polls deleted. User poll creation still market-shaped
      (own re-key leg later).
- [x] 4c418c81 MOBILE feed cut (agent, −418 lines, 375 green): bounds+
      cursor infinite scroll (transport scroll-activity primary trigger),
      'Polls in this area' header, promise card, per-poll place labels,
      place SelectorChip (client-side slice; searchable/sectioned sheet
      deferred until the sheet primitive grows it), marketKey cache +
      resolveMarket round-trip + pinned-market + bootstrap snapshot
      plumbing DELETED. OWNER-EYE on sim: pan-refresh cadence, two "All"
      chips ambiguity, promise-card styling. Loose ends recorded:
      notification deep-link params inert until home-place leg;
      perf harness renderedPollHeaderMarketKey→PlaceName field rename.
- [x] c7bdcd75 supply red-team fixes — ALL 11 folded (30 new specs, 472
      green, tsc clean): warm-start floors frontier not credit (§17
      one-searcher law spec-proven), place-bbox poll signals (loop
      restored), weekOf-label cohort close (DST-proven), no evidence
      replay, both cooldown gates (ramp ≥ ramp(window) derivation),
      atomic batched publish + notification rows in-tx, bounded scans
      (147d/280d derived horizons + global Sunday-window gate),
      antimeridian wrap end-to-end, ballot-mint rebuild on retry.
      TASK #6 COMPLETE. API restarted.

## TASK #7 STATUS (live)

- [x] d0764df3 aggregate + readers COMMITTED (agent, 21 specs, 493 green):
      signal_demand_daily (day×actor×place×subject×kind + GLOBAL tile;
      15-min today+yesterday rebuild under advisory lock; checksum-equal
      rebuilds; Fiji≠Austin RED live), readers cut (recently-viewed +
      locationId, recent searches, suggestions, autocomplete lanes;
      marketKey params deleted), search signal subject = entity+term,
      legacy backfill executed (idempotent). Old writers alive until
      Phase C; view/search event tables product-reader-less. Poll supply
      COEXISTS on direct SQL (arbitrary-time reads; swap later). Deltas
      for ratification: uniform kind-weight 1.0 K2; market scoping removed
      from those lanes; suggestion text lowercased; intersection (not
      containment-tiling) attribution + global tile. API restarted.
- [x] red-team d0764df3 CONFIRMED findings → fix agent IN FLIGHT:
      1a tz corruption LIVE (naive-UTC MAX into timestamptz = +5h shift;
      1,628/4,206 rows out-of-day; fix SET LOCAL TIME ZONE UTC + full
      rebuild) · 1b closed days unrecoverable (today+yesterday window has no
      watermark; late occurredAt lost — watermark-driven range) · 1c retry
      dedupe per-day + geo-grained (cross-midnight/nudged-viewport retries
      double-count — window-wide, geo-free grain) · 2a /search/recent STILL
      reads search_events (claim was false — cut it) · 2b merge blindness
      (recentlyViewedFoods joins dead meta.connectionId; merges delete loser
      connections — redirect-resolved join) · 3a fan-out unbounded (§3 says
      containment-TILING O(few)/signal; current intersection mints ~19,435
      rows per continental signal — implement §3 storage law, read-time
      expansion) · 3b rebuild is unindexed O(signals×places), dies ~55k/day ·
      3c non-sargable redirect COALESCE per keystroke (expand-ids app-side) ·
      2d cached reveals now count in global suggestions (OWNER-RATIFY note).
      Clean verdicts: torn reads none (MVCC single-tx); anonymous reads fine;
      subject-widening no double-count; DI intact; backfill idempotent
      (sequential).
- [x] 082e8e3b collector at priors + aggregate red-team fixes (MERGED legs,
      532 green, tsc clean): source-centric collector (engines + lanes +
      pacer by normalized lateness + reddit.requests pool + heartbeats;
      persist-first admission; singleton rescorer; floors 0.2/0.08
      OWNER-RATIFY; hot-spike/volume-tracking/schedulers KILLED; liar-purge
      throw fix) + ALL 9 aggregate findings (UTC rebuild tx — 1,634 corrupt
      rows→0 proven; watermark rebuild via signals.recorded_at; window-wide
      geo-free dedupe; /search/recent cut; merges now WRITE entity_redirects
      — zero-row table before! + redirect-resolved connection fallback;
      §3 containment-TILING verbatim — CONUS 19,480 rows/127s → 49/57ms,
      GiST envelope index, state-bbox catalog repair; sargable redirect
      expansion). 3 migrations drift-applied; API restarted (old corrupting
      cron dead). Remaining recorded gaps: §10 advance-at-extraction +
      expectedBatches reconciler unbuilt; unmet family still reads
      collection_on_demand_ask_events (Phase C); dispatch-level not
      per-request draws (§12.5 client rewrite later).
- [x] 62c23681 enrichment refresh → rescorer markDirty (last direct
      rebuild call site cut).
- [>] AGENT in flight: §22 item 8 SCORE CUT (per-source A/g calibration,
  provenance + fame-pin re-key to source anchorPlaceId, ONE
  scoreVersion, rebuild through coordinator, before/after stats).
- [ ] Then: Phase C purges (old event tables/writers, markets machinery
      per-consumer, user poll creation re-key, home-place registration).
- [ ] Then: wave-5 final red team + REASSESSMENT (owner's 'reassess only
      when done').
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
