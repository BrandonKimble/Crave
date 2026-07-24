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

- ENGINE-COVERAGE RE-KEY (markets extermination leg 2, 2026-07-22, uncommitted):
  the per-search MARKET ELECTION is dead. resolveViewportCoverage + its whole
  support path (collectable resolvers, viewport bootstrap, display-market
  election, ~850 lines) deleted from market-registry; search/interpretation
  coverage = new EngineCoverageService (engines member_place_ids + DAG
  descendants → place_geometries ground ∩ viewport, ONE recursive-CTE PostGIS
  query, raw share + engines present, NO thresholds §16). Search metadata:
  marketKey/marketResolutionStatus/candidate*/attribution*/collectable\* fields
  DELETED (shared type re-keyed to engineCoverageShare + engineCoverage;
  displayMarketName survives as the frozen §2 header field). On-demand queue
  keys off engineId (Prisma field re-key; DB column still named market_key —
  rename migration deferred, needs API-restart window); uncovered asks mint no
  queue row but still write the on_demand_ask signal (ledger territory read =
  the uncovered-ask lane). Autocomplete market scope killed (global cache
  scope; poll lane re-keyed to place-ground ∩ viewport). Mobile notice
  re-keyed to share>0. API 732 green / mobile 396 green, tsc 2 pre-existing.

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
- [x] See-locations mode EXECUTED 2026-07-20 (uncommitted): transport =
      /search/run + `seeLocations` dto discriminator (ONE search pipeline —
      runQuery routes to runSeeLocationsQuery → lean
      SearchQueryExecutor.executeSeeLocations, 2 indexed reads, wrap-aware
      bbox; locations array = IN-VIEW only, ordered nearest-to-center,
      locationCount stays global; zero-in-view = empty world). Signal =
      real kind='search' w/ meta.mode='see_locations'+restaurantId (+
      selection echo). Mobile: entity identity grew `seeLocations`
      (identity-relevant, equality+worldKey ':seelocations'), fetch attaches
      the flag, chip tap = pending-selection + profile preview +
      runRestaurantEntitySearch({seeLocations}) — the recently-viewed
      committed-entity lane; pins = existing selected-restaurant
      all-locations spread reading row.locations (map surface UNTOUCHED).
      Chip renders on multi-location restaurant suggestions ONLY (decision
      = statusPreview.locationCount>1). locationCount plumbing DEAD:
      autocomplete attachLocationCounts + dto/mobile match field +
      render-meta-detail-line count param/"N locations" label (suggestion
      surfaces never show a count per §7). Earned address labels:
      history.service batch-joins locationAddress; recently-viewed rows
      (SearchSuggestions + RecentHistoryView) show it as meta prefix.
      Perf-harness renderedPollHeaderPlaceName rename done. Specs:
      search-see-locations.spec (7) + contract spec (+2) + history spec
      updated. API 642 green/build/tsc/lint clean; mobile 377 green, tsc =
      2 pre-existing errors only. OWNER SIM-EYE: chip styling/placement,
      collapse-open feel, address-prefix line. LEG 2 COMPLETE.
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
- [x] 8049afef SCORE CUT (agent, 29 specs, 561 green): §8 A_source per
      observed day (365d/21d lanes), g=max(A,floor)/ref pinned per
      scoreVersion epoch (crave_score_calibration_epochs; re-pin = bump),
      calibrated counts in log1p, influence 1.0; ballot parity spec-proven;
      provenance sourceId on score rows; fame-pin re-keyed to source
      anchor/engine territory (Leg-2 interim DEAD); ONE version
      crave-score-v4 w/ birth-certificate snapshot; scoringMarketKey
      nulled (column drops Phase C); market CTEs out of scorer. Rebuild
      ran: Austin top-10 8/10 stable (7-Eleven out). OWNER-RATIFY: pin
      quantiles median/p10; v4 epoch reddit-only n=2 (re-pin when poll
      rooms exist); coverage-gap interim; g=1 unattributable rooms.
      Data repair: 7-Eleven dangling restaurant_attributes stripped.
      API restarted (fame-pin live).
- [x] PHASE C PURGE executed (agent, uncommitted; 567 green = 561 base + 6
      new; tsc/build/eslint/prettier clean; migration
      20260720030000_phase_c_purge drift-applied via db execute + resolve +
      generate; drops DB-verified):
      · signals SINGLE-WRITE: history view writers dead (2-min valve = ledger
      read lastEntityViewAt; view meta gains source/originSearchRequestId —
      deliberately NOT meta.searchRequestId, the ledger-wide dedupe key);
      search old upsert + searchLogEnabled dead; cache reveal clones the
      ORIGINAL search SIGNAL (subject/geo/counts from ledger, idempotent on
      cacheRevealRequestId via the dedupe expression index).
      · old rollup DEAD: search-demand-aggregation (15-min cron was STILL
      firing) + search-demand.service + rebuild/backfill scripts deleted;
      AnalyticsModule = DemandScoringTraceService + curves only;
      warm-query-embedding-cache re-pointed to signals.
      · TABLES DROPPED: search_events, search_event_entities,
      user_search_demand_daily, user_restaurant_views, user_food_views,
      user_entity_view_events, collection_on_demand_ask_events; enums
      SearchEventKind/DemandSourceKind/DemandSignalKind;
      core_public_entity_scores.scoring_market_key (+index).
      · merge rekeys into dead tables deleted (both merge services) —
      redirects-at-read is the law.
      · on_demand_ask → LEDGER: new kind written at the ask site (geo =
      searcher viewport; meta.askSearchRequestId); unmet family reads
      territoryUnmetAsks (territory geo overlap + per-request dedupe);
      ask-event prune deleted from cleanup service.
      · poll creation RE-KEYED: placeId = smallestContaining(creation
      bounds); 2/user/PLACE/week; checkDuplicate place-scoped (dto grew
      bounds; legacy marketKey arm kept for pre-cut clients);
      resolveOrEnsureForPollCreation DELETED; seeding context =
      PollPlaceContext; presence derives from the VERIFIED Google place
      (lookup-only, optional).
      · markets survivor ledger in markets.module.ts (per-survivor kill leg
      named); polls legacy feed arm comment re-pointed to the
      legacy-poll-expiry leg.
      · specs: search-signals-write.spec (single-write), on-demand-ask-signal
      .spec, polls-creation-place-rekey.spec.
      ⚠️ :3000 NOT restarted (per instruction) — the RUNNING binary still has
      the OLD writers against DROPPED tables (history record endpoints 500;
      search event log warn-only). CLAUDE.md rebuild+restart recipe REQUIRED
      before any app testing/commit.
- [x] Phase C committed b548e895; API restarted healthy on purged binary.
- [x] WAVE-5 FINAL RED TEAM ran (whole-system seam pass). VERDICT:
      structurally §-faithful — kill sweep complete repo-wide, boot clean,
      tiling/intersection algebras provably agree in contained cases (MAX
      set-semantics), time+restart seams hold. FOUR confirmed defects at
      the act-identity seam → fix agent IN FLIGHT: F1 CRITICAL aggregate
      dedupe key kind-blind (search+autocomplete_selection share
      searchRequestId → one kind of every selected search dropped; fix =
      partition by (kind, key) + full rebuild); F2 HIGH poll-supply reader
      has NO act dedupe (search+selection+ask = 3 rows → one act weighs
      2.0 in poll credit vs 1.585 aggregate vs 1-2 intended; fix =
      act-grain COALESCE dedupe incl. askSearchRequestId); F3 MEDIUM
      viewport_dwell declared but ZERO writers (browse-only cold-start
      dead; deferral law forbids deferring observations; fix = POST
      /signals/viewport-dwell endpoint, mobile wiring w/ home-place leg);
      F4 fresh read arms not wrap-aware (converge on one canonical lng
      predicate). Plus: §16 classification comments sweep (score service
      constants et al — values unchanged); §17 gaps — verify score
      fixture script coverage vs §8 named conditions, add mint-invariance
      golden + poll-creation quota-drought fallback spec (§2: creation
      never blocks).
- [x] WAVE-5 FIX AGENT COMPLETE (2026-07-19, uncommitted): F1 aggregate +
      fresh-lane dedupe kind-aware, FULL rebuild run + live-proven (both
      kinds land); F2 act-grain COALESCE dedupe (incl. askSearchRequestId)
      in both mass paths, live-proven (3-row act = 1.000000, genuine 2nd
      act = 1.584962); F3 POST /signals/viewport-dwell built (auth-gated,
      DTO-bounded, fire-and-forget; MOBILE WIRING lands with the
      home-place-registration leg — until then the endpoint is live but
      uncalled); F4 one canonical wrap-aware lng predicate
      (signals/lng-intersect.ts) consumed by demand-mass reader + both
      fresh arms; §16 comments placed (values untouched); §17: fixture
      script grown to 21 checks (kill condition, fake-elite + RED
      backstop, upvote-linearity, dial re-probe on calibrated masses,
      author-concentration, two-cadence, rising-flap) + mint/now-
      invariance golden + poll-creation quota-drought fallback (creation
      never blocks — mints "this area near (lat, lng)" via sketchChain,
      countryCode ZZ / providerLevelCode areaFallback). Retroactive-credit
      golden SKIPPED: its machinery (§2 promotion backfill) is genuinely
      deferred; travels with that leg. BONUS: two latent live defects in
      the poll-supply/fresh readers found by the live proof and fixed —
      see Gotchas. 582 tests green (567 baseline +15); build+tsc+lint clean.
- [x] POLL-SUPPLY SWAP LEG COMPLETE (2026-07-19, uncommitted; docket item 7
      MANDATE): the intersection reader RETIRED — DemandMassReader is now
      aggregate-backed (containment lineage self+ancestors+descendants at
      weight 1, MAX set-semantics per (actor, day, kind, subject) across a
      root's tiles) + a fresh-today ledger arm (true F2 act-grain COALESCE
      dedupe, canonical wrap-aware lng, act-grain first-occurrence anti-join
      on the indexed 2-way parent key). ECHO-KIND RULE derived + documented
      (ECHO_SIGNAL_KINDS in signals.service): autocomplete_selection +
      on_demand_ask are by-construction echoes of a parent 'search' act
      (writers verified: both always attach the parent request id; the search
      row carries BOTH subject halves on ONE row — no subject fan in the
      ledger, only kind fan) → they weigh 0 in mass reads; every other kind
      (incl. cached reveals, item 8) weighs 1. placeDemandMassAt DELETED —
      harvestCohortOutcomes reads attentionMass from the birth-certificate
      stamp (controller.weeklyDemandMass; stampless legacy cohorts = ZERO in
      live data, proven — they'd observe mass 0, skipping conversion/yield,
      and age out at 280d). placesWithAnySignal = aggregate tiles ∪
      ancestors ∪ descendants (GLOBAL tile never seeds; ≤15-min cron-lag
      note documented). PARITY PROVEN live (Austin TX + Wolfe City TX):
      minus-ancestors variant vs old reader = EXACT on Wolfe (1.000=1.000),
      −0.25% on Austin (day quantization + MAX set semantics); full new
      algebra = Austin 9.756→12.126, Wolfe 1.0→11.40 — the whole uplift is
      the RATIFIED coarse-signal ancestor reach (127-act NYC two-state
      viewport stored at the US tile + 30 central-TX acts at TX); echo
      restatement delta = 0 (no echo kinds in the live ledger yet). NO
      unexplained deltas, NO migration. Specs: echo-kind rule + writer
      invariants, tile-MAX count-once, two-arm seam, day-quantization bound,
      harvest-reads-stamps(+stampless-0), reader-retirement (no
      make_interval ledger scans). 590 tests green (582 +8);
      build+tsc+eslint clean.
- [x] TIER-2 POLYGON PROMOTION QUEUE (2026-07-20, uncommitted; migration
      20260720130000*place_geometry_promotions drift-applied via db execute +
      resolve + generate; ⚠️ :3000 NOT restarted — running binary predates
      the table + the drain cron): place_geometry_promotions (placeId PK =
      idempotent enqueue; open trigger vocab; attempts no-cap; lastAttemptAt
      month-window backoff = the K4 pool window, no invented constant;
      providerBoundaryId caches the cheap-resolved geometry id).
      PlacesPromotionService (places module): guarded enqueue (fallback-mint + already-promoted no-ops), hourly governed drain (oldest-first; scarce
      denial = typed not-now, row untouched, pass stops; consumed-draw miss =
      attempts++; success = ST* persist into place_geometries mirroring the
      legacy bootstrap SQL + promoted_at stamped on queue row AND places).
      Vendor flow lives in TomtomChainProbeAdapter (port grew
      resolveGeometryId cheap/county-qualified + fetchPolygon scarce
      additionalData, workClass 'promotion'). Triggers wired: (a)
      createPoll → 'poll_created' fire-and-forget; (b) §10 onboarding verb
      (market-provisioning.ts) → 'source_attached' (poll_surface NOT wired —
      covered by (a)/(c) by construction, documented); (c) ritual publish →
      'credit_prefetch' when credit + creditRate ≥ 1 (behind the no-residue
      early return — one searcher never promotes); (d) NO mass seed enqueue —
      OWNER-RATIFY reading in service header (19.5k seed = 8 months of pool,
      zero attention evidence; seeded places earn via other triggers); (e)
      search + polls-feed header verdicts → noteHeaderAnswer (2nd answer in
      30d TTL = 'header_answers'; in-memory, reconciler interim stance).
      Point-answer-beats-bbox recorded as documented NO-OP (header read is
      bbox-only today; no disagreement seam exists — citation in service
      header). Live dry-run: Austin enqueue idempotency + drain due-read
      proven on real DB, stopped at the draw boundary (would spend: 1 cheap
      forward 'Austin, Travis, TX' + 1 scarce additionalData), row cleaned
      up so no unapproved spend on restart. 674 green (655 +19);
      build/tsc/eslint/prettier clean.
- [x] HEADER SUBJECT-STORE LEG 1 (2026-07-21, agent, uncommitted; :3000 NOT
      restarted; owner-ratified design: header = pure function of (viewport,
      catalog); client will hold a sliding catalog slice and run THE SAME
      subjects law locally; server = slice read + settled-viewport seam.
      Leg 2 = mobile, untouched):
      · SHARED-LAW EXTRACTION: subjects.ts + place-geo.ts moved VERBATIM to
      packages/shared/src/geo/ (place-geo, subjects, slice + index; exported
      from the package root; no Nest/Prisma — new lean PlaceLike
      {placeId,name,bbox,providerLevelCode,parentPlaceIds,area?}). New pure
      functions: coverageOfView (THE per-row coverage law — server
      placesInView now calls it, client slice will) +
      subjectCandidatesInView (rows→SubjectCandidate[], the whole client
      read). All 11 api call sites re-import from @crave-search/shared;
      law specs run against the shared import; api jest moduleNameMapper
      pins @crave-search/shared → package SOURCE (stale dist can't green a
      broken law).
      · SLICE ENDPOINT: GET /places/in-view?minLat&minLng&maxLat&maxLng
      (ClerkAuthGuard + paywall, wrap-aware west>east, minLat>maxLat 400)
      → { marginBox, places: PlaceLike[] }. Margin = view expanded
      ×PLACES_SLICE_MARGIN_FACTOR (3; §16 DERIVED — the sliding-cache
      re-fetch hysteresis: pan-within-margin needs no network); marginBox
      echoed = client cache-validity region. NO containing-chain field:
      containment implies intersection, so over-scale containing nodes are
      already slice members (spec-pinned); bbox-less ancestors can never
      pass bboxContains so they can't name a fallback header anyway. Reads
      never probe — slices are reads, settles are observations.
      · SETTLE SEAM: POST /signals/viewport-dwell now also fire-and-forgets
      placesReconciler.noteViewport(bbox) (SignalsModule imports
      PlacesModule); search submit keeps its own call — both mouths are
      settles. noteViewport stays sync-return/never-throws (spec: real
      reconciler over rejecting catalog → 202 + ledger write unaffected,
      warn logged).
      689 green (674 +15); api build/tsc/eslint/prettier clean; shared
      builds+lints; mobile tsc still EXACTLY the 2 pre-existing errors
      (search-map nativeHostKey L543, camera-intent L79).
- [x] §2.5 POLYGON-NATIVE HEADER — LEG A (2026-07-22, uncommitted; :3000 NOT
      restarted; mobile untouched = leg B): shared law REWRITTEN to the
      ratified §2.5 — new packages/shared/src/geo/ground.ts (PlaceGround =
      outer rings number[][][], Sutherland–Hodgman clip + shoelace, wrap-aware
      view split, point-in-ground degenerate, cos-weighted metric matching
      bboxArea); subjects.ts resolveHeaderPlace = finest dominator (coverage
      ≥ 2/3, smallest placeArea) + DAG straddle reservation (≥2 children each
      ≥ 1/3 → 'this-area'); too-big/lone-commensurate/containing-fallback arms
      DEAD (isCommensurate deleted; isTooBigForView survives for §4 feed
      boundary + probe answering); resolvePlaceCoverage = the one coverage
      chokepoint (polygon truth, bbox honest fallback; ground-clips-to-zero
      drops the candidate — the Mexico-bbox lie). SPEC-PROVEN: bbox-only
      fallback ALREADY fixes the owner bug (Texas 89% finer beats
      view-containing Mexico bbox — both dominate, finest wins). SERVER:
      placesInView hydrates ST_SimplifyPreserveTopology ground at tolerance
      viewSpan/512 (§16 derived, sub-pixel), PlaceInView grew
      parentPlaceIds+ground; slice endpoint ships optional `ground` (margin-
      box-span simplification by construction); search header + polls feed + membership all through the one law; polls feed subtracts subdivision+
      over-scale ids AFTER descendant expansion (new §2.5 subjects can be
      over-scale dominators). GOVERNANCE: tomtom.scarcePolygons 2,500→10,000
      /mo (§16 K1 owner price-tag ~$25/mo at ~$2.5/1k, ratified 2026-07-22
      'off the free tier'; hardClosed + durable). POLYGON AT BIRTH:
      catalog create path fires PLACE_BIRTH_LISTENER.enqueue('birth')
      (token breaks the promotion→port→catalog import cycle); drain widens
      places bbox from the landed polygon envelope (index derives from
      truth; bbox-less coarse rows gain first index presence); drain LIMIT
      10,000 rows/tick (§16 derived = the month budget; pool is the real
      limiter). SEED: scripts/seed-coarse-polygons.ts (+yarn
      places:seed-coarse-polygons; name idioms extracted to
      scripts/lib/gazetteer-names.ts shared with seed-us-places): US/MX/CA
      countries (reuse-else-mint bbox-less) + states + 3,222 county-layer
      rows (CountrySecondarySubdivision, bare countyAxisName, county NULL,
      sqrt(ALAND) bbox, census GEOID) then batch paid_seed enqueue coarse-
      first + all municipalities — zero vendor calls in-script, drain does
      everything governed. DRY-RUN ONLY (--execute NOT run). 705 green (689
      +16); api build/tsc/eslint/prettier clean; shared build/lint clean;
      mobile tsc = the same 2 pre-existing errors. LEG B (mobile): consume
      `ground` in the slice store; nothing else needed — law signatures
      unchanged (subjectCandidatesInView/resolveHeaderPlace).
- [ ] After fix agent: commit, restart :3000 (REQUIRED: the running
      binary still serves kind-blind aggregate cron + lacks the
      viewport-dwell route), REASSESSMENT to owner (wave-5 verdict: with
      F1-F3 + score fixture gate closed, rebuild is honestly complete).
- FOLLOW-UP LEGS (recorded): ~~home-place registration~~ EXECUTED
  2026-07-19 (uncommitted; migration 20260720060000 applied, :3000 NOT
  restarted): device→placeAt→homePlaceId (registration DTO homeLocation
  {lat,lng}|null; server judges smallestContaining), targeting =
  homePlaceId ∈ descendantPlaceIds(poll place), market/centroid fallback
  - city read DELETED, mobile registrar sends current-location-≈-home
    (v1) + 24h foreground staleness re-send. NOTE: /markets/resolve-ip
    still serves the mobile launch ladder (MainLaunchCoordinator IP rung);
    /markets/resolve is down to the perf harness — NOT reader-less yet
    (see markets.module.ts survivor ledger). legacy-poll expiry (kills
    bboxFromMarketKey + legacy feed
    arm); ~~See-locations~~ DONE 2026-07-20; ~~§10 advance-at-extraction +
    expectedBatches reconciler; §12.5 reddit client rewrite (per-request
    draws)~~ EXECUTED 2026-07-20 (agent, uncommitted; 644 green,
    build+tsc+eslint clean; NO schema changes — all state in JSONB):
    · §10 cursor law = idempotent two-step (lane state.pendingWindow staged
    at fetch BEFORE batch enqueue; commitPendingWindow moves
    lastProcessedAt only on durable extraction proof — run created OR
    covered-skip — parentJobId-conditional, race-safe; legit-zero fetch
    advances immediately; crash between fetch and run = re-fetch, never a
    lost window).
    · expectedBatches reconciler = hourly pacer pass (parents
    registerExpectedFanOut on collection_runs up-front; proven = created
    extraction runs + recordSkippedBatch covered-skips; shortfall verdict
    folded onto lane state.reconciler → collectorHeartbeats RED — no
    parallel alarm; grace = PENDING_WINDOW_GRACE_HOURS 2h shared with the
    stale-pending-window heartbeat read).
    · saturation verdict: AIMD cadence + money-gated recovery task =
    trigger-deferred per §22 (named triggers in code); the MISS DETECTOR
    is an OBSERVATION (deferral law) and was BUILT — chronological fetch
    returns overlapConfirmed (≥1 strictly-older non-sticky post; stickies
    can't fake overlap; early-break saves covered pages), worker writes
    lane state.coverageGap C4 fact + heartbeat RED.
    · §12.5 reading documented in collector-pacer header = option (a):
    pacer reserve = dispatch-grain admission peek (§14.3), held through
    the tick then RELEASED (new PoolRegistry.release — no consumption/
    ledger); per-REQUEST draws inside reddit.service makeRequest =
    governance.drawWithOutcome on reddit.requests (ONE chokepoint: auth
    token mint 'reddit.auth', /me, search, listings, thread fetches all
    via makeRequest); recordActualPair stays the §14.2 drift pair.
    · RateLimitCoordinator reddit window DEAD (registration removed,
    ExternalApiService.REDDIT enum member removed, zero reddit call
    sites) — 429-reporting moved same-deploy: PoolRegistry.poisonWindow
    (upstream 429 poisons the ONE window; denial reason
    'upstreamRateLimited').
    · Denial semantics: retry-through-governor in makeRequest (3 draws,
    retryAfter honored) then typed RedditGovernanceDenialError (NOT a
    RedditApiError subclass); chronological/keyword workers re-arm the
    lane due (markLaneDue LEAST()) + return clean (no branding); batch
    workers requeue the whole batch delayed; batchEntityKeywordSearch
    aborts remaining terms un-branded; §12.3 empty-success swallows in
    getChronologicalPosts/searchByKeyword/getRawPostWithComments DELETED
    (rate limit now propagates — could previously brand a window
    covered).
    · Specs: reddit.service.spec (draw-per-request, retry-through-governor,
    429-poison-not-empty-success, overlap/sticky), chronological worker
    cursor-law spec, batch commit/abort spec, pool-registry
    release/poison/status, pacer hold-release + reconciler RED specs,
    heartbeat 3 new RED reads.
    ⚠️ pre-existing (flagged, unchanged): chronological-batch worker still
    returns success:false on REAL errors (§12.4 liar — Bull marks
    completed); recommend its own micro-leg.
    engine-coverage re-key of
    resolveViewportCoverage consumers; ListDetail Market chip → city-slice
    re-key; ~~durable PoolRegistry store; signals monthly partitions;
    legacy-poll expiry; chronological-batch liar~~ ALL FOUR EXECUTED
    2026-07-20 (durability+legacy-expiry leg, uncommitted; 655 green;
    3 migrations drift-applied: 20260720100000_pool_window_consumption,
    20260720110000_signals_monthly_partitions,
    20260720120000_drop_notification_device_city; ⚠️ :3000 NOT restarted —
    running binary still writes notification_devices.city → device
    registration 500s until the CLAUDE.md rebuild+restart recipe runs):
    · PoolRegistry durable store (§14.5/§16 split): perMonth/perDay/grant
    consumption write-through on reconcile + boot/rollover load via
    ensureWindow (GovernanceService.onModuleInit + before every draw);
    unconfirmed window ⇒ hardClosed pools deny 'storeFailure' (fail closed,
    RED-spec'd); perMinute (reddit/gemini) stays memory-only BY DESIGN;
    draw ledger stays in-memory (§18.5 leg). Restart survival live-proven
    (two registries over real PG: 60 consumed → second instance denies
    at 41, admits 40).
    · signals monthly partitions (§3): raw-SQL swap to RANGE(occurred_at)
    parent, PK (signal_id, occurred_at), partitions p_pre + 2026_06..10,
    all 7 indexes as partitioned indexes (incl. partial dedupe expression
    idx); 282/282 rows survived (121+161 by month); prisma create routes
    to the right partition (proven, 2026-08 insert); full aggregate
    rebuild checksum-stable over the partitioned table (double-run
    identical); SignalPartitionMaintenanceService daily cron keeps
    [current..+2] (§16 K6 lead).
    · legacy-poll expiry: ALL 94 legacy market-keyed polls (13 markets,
    all CLOSED) backfilled to catalog places — name+bbox identity match
    (11) else smallest SAME-STATE containing place (North Bergen,
    Weehawken → New Jersey); 0 null-place rows remain; feed marketKeys
    arm + legacyMarketKeysInView + resolveFeedView market arm +
    QueryPollsDto/ListUserPollsDto marketKey + checkDuplicate legacy arm +
    SignalsService.bboxFromMarketKey ALL DELETED; create/check-duplicate
    dto marketKey kept ACCEPTED-IGNORED (mobile still sends);
    notification_devices.city column+index DROPPED (dto field
    accepted-ignored; mobile field removal = next mobile touch); markets
    survivor ledger updated (survivors: resolve-ip launch ladder,
    /markets/resolve perf harness, /markets/active ListDetail chip,
    resolveViewportCoverage, resolveOrEnsureForLocation+bootstrap,
    resolveMarketKeyForCommunity, polls.market_key label/gazetteer
    column → §13 re-key; core_markets last).
    · chronological-batch.worker §12.4 fix: real errors now THROW (Bull
    retries/fails visibly); covered-skip + governance not-now stay
    completed; spec'd.
    owner sim-feel items
    (feed pan cadence, two-All chips, promise card styling).
- deferred-in-leg-2: NONE — See-locations executed 2026-07-20 (see Leg 2
  breakdown); Leg 2 fully closed.

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

- 2026-07-19 (wave-5 live proof): Prisma binds JS Dates as TIMESTAMPTZ and
  the dev session TZ is America/Chicago — a naive-UTC signals.occurred_at
  compared against a bound Date coerces through the SESSION zone: every
  "now"-anchored reader window silently shifted 5-6h (place mass showed a
  ZERO delta for fresh signals). The aggregate was immune (SET LOCAL TIME
  ZONE 'UTC'); plain reads were not. Law: every bound instant vs
  occurred_at goes through signals/sql-instant.ts utcInstantSql()
  (AT TIME ZONE 'UTC'); spec-pinned in both reader spec files.
- 2026-07-19: make_interval(days => <bound number>) fails live — Prisma binds JS
  integers as int8 and make_interval has no bigint overload. Cast ::int.
  Symptom class: SQL that only specs ever ran; the live proof caught it.

## RATIFICATION DOCKET — RESOLVED 2026-07-19 (owner, one-by-one)

All 8 items ruled; markers updated in code; master plan §18 items 7-9:

1. COVERING_FRACTION = 2/3 (one-knob derivation) — RATIFIED.
2. Lone commensurate non-covering place = header — RATIFIED.
3. Identity-law discriminator = COUNTY AXIS (design of record for the
   amendment leg; interim guard holds until then) — RATIFIED. → BUILT
   2026-07-19: migration 20260720050000_place_county_axis (drift-path
   applied; :3000 NOT restarted — restart choreography is the owner's),
   resolveIdentity decision table + race-safe adoption in
   places-catalog.service.ts, adapter county threading, seed county join
   (national_place_by_county2020.txt + geocoder principal-county cache in
   ~/crave-data/gazetteer). 19,496→19,526 places, 19,424 county-filled,
   Lakeside-TX pair distinct; 606 tests green. See master plan §18 item 8.
4. Warm-start priors conversion 1.0 / tail-concentration 1.0 — RATIFIED.
5. Portfolio floors 0.20 unmet / 0.08 explore — RATIFIED.
6. Score pins median/p10 per epoch — RATIFIED.
7. Containment + ancestors-at-weight-1 = THE territory read algebra;
   poll-supply swap onto the aggregate is now a MANDATED unification leg
   (intersection reader retires there) — RATIFIED.
8. Cached reveals count in suggestion demand — RATIFIED.

Still-open markers (future docket, deliberately not ruled today): viability
"strong content" launch proxy (poll-weekly-ritual.service.ts), reddit lane
cadences (reddit-collection-adapter.ts), source arrival-rate prior 10
(collector-estimators.ts), score coverage-derivation interim
(score-calibration.ts). Plus standing §18 items 1-6 (dispatch-25 recall
prior, §18.2 fail-policy table, batch quota discovery, ops readers, reddit
account strategy, week-one instrumentation).

## WAVE-6 PUNCH LIST (2026-07-22, in flight)

- NAMED FOLLOW-UP (item 5, owner action when the tripwire fires): RETURN the
  seed-month pool raises — tomtom.cheapGeocode 45_000→20_000 and
  tomtom.scarcePolygons 25_000→10_000 in governance.service.ts (K1
  re-ratify; the SEED MONTH comments there carry the numbers). The tripwire:
  PlacesPromotionService.warnIfSeedComplete logs
  "SEED COMPLETE — seed-month pool raises still active…" once per process
  on the first drain pass where the promotion backlog reads 0.
- Item 1 landed: ONE cron-stop chokepoint (src/shared/utils/stop-crons.ts;
  main.ts + every createApplicationContext script), drainQueue advisory
  lock (single drainer across processes), drive-polygon-drain.tmp.ts
  deleted (superseded by cron + lock).
- Item 2 landed: TomTom 429 → poisonWindow + typed 'denied' in
  tomtom-chain-probe.adapter.ts (429 leaves the queue row attempt-free;
  genuine vendor errors still record the attempt).

## MARKETS EXTERMINATION LEG 3 (2026-07-22): the last consumers re-keyed — core_markets writer/reader-less

The five survivors (post-leg-2 target set) all cut; leg 4 is now a pure
census + physical drop. Per survivor:

1. **ListDetail 'Market' chip → City slice**: dto.marketKey →
   dto.cityPlaceId (place id); the assembler's slice pre-filter re-keyed
   from core_markets.geometry to place_geometries ST_Covers; NEW endpoint
   POST /favorites/lists/:listId/cities = the cities PRESENT IN THE LIST
   (municipality places ground-covering the list's restaurant locations,
   most-represented first). Mobile: chip renamed City, vocabulary from the
   list itself, cityPlaceId threaded through the lens/world contract
   (`|city:` lens key), GET /markets/active + listActiveMarkets DELETED.
2. **IP launch ladder**: GET /places/launch-position replaces
   /markets/resolve-ip — IpLocationService MOVED to modules/places
   (geolocation only, marketResolver dep dead); response = coords +
   smallestContaining place's bbox envelope; mobile rung consumes
   coords/bounds (bounds→zoom fit), ipMarketKey deleted (was write-only).
3. **Polls gazetteer scope**: entityTextSearch scope re-keyed
   {marketKey}→{engineId}; restaurant filter is now GEOMETRIC (engine
   territory place grounds ST_Covers restaurant locations — the
   core_entity_market_presence read is dead); polls.service resolves the
   covering engine from the poll's placeId (member grounds cover the place
   centroid; uncovered ⇒ global). polls.market_key / poll_topics.market_key
   now reader-less AND writer-less (graduation community = poll_surface
   handle; leaderboard/comment scans key off placeId).
4. **§13 presence/provenance**: presence is derivable (location→place
   containment at read) ⇒ ALL presence writers/readers deleted (enrichment
   stamping + sync/reconcile machinery, merge presence-union,
   unified-processing creation lane — creation dedupe is now GLOBAL
   (name,type) per §13 global identity). Provenance keys off SOURCES:
   unified-processing resolves community → source row
   (findRedditSourceByHandle) → engineId biases resolution recall,
   anchorPlaceId anchors enrichment bias. resolveMarketKeyForCommunity /
   listCommunityMarketTargets / resolveOrEnsureForLocation DELETED.
5. **Google enrichment bias**: dispatch context re-keyed to the source's
   anchor PLACE (name/subdivision/country + centroid + bbox-derived radius,
   same 15–50km clamp); all prisma.market reads gone.

Markets module now = the survivor-ledger comment only (empty @Module);
market-registry/resolver/tomtom-boundary-bootstrap/bootstrap-metrics/
geo-util/controller DELETED. LEG-4 CENSUS (dead schema): core_markets,
core_entity_market_presence, polls.market_key, poll_topics.market_key,
collection_communities.market_key, geo_boundary_features,
market_bootstrap_events. No migrations this leg (drops are leg 4's).
Verify: api tsc clean + 732 tests green; mobile tsc 2 pre-existing +
396 tests green + eslint/prettier clean.

## MARKETS EXTERMINATION LEG 4 (2026-07-22): physical schema drop + naming sweep

Physical drop, migration `20260722120000_markets_extermination_leg4`
(applied + resolved): tables `core_markets`, `core_entity_market_presence`,
`market_bootstrap_events`, `geo_boundary_features`; enum `market_type`;
columns `polls.market_key`, `poll_topics.market_key`,
`collection_communities.market_key`, `demand_scoring_runs.market_key`,
`demand_scoring_candidates.market_key`; view `connection_entity_names`
(depended on the dropped shape). `collectable_market_key` renamed to
`engine_name` on `demand_scoring_runs` / `demand_scoring_candidates` /
`keyword_attempt_history` (physical rename, no more `@map`-flagged alias).
Code deleted: the empty `markets` module (`markets.module.ts` + README),
`onboard-market.ts`, `market-provisioning.ts`; `seed-market.ts` renamed to
`seed-archive.ts` (kept as reference, no longer wired to `db:seed`).

**Naming sweep** (rename identifiers pointing at the live territory/place
machinery; reword stale-but-live comments; delete dead Prisma-model mocks
for the now-nonexistent `market` delegate; leave brief past-tense
"died with the market model, §N" notes as-is):

- `entity-text-search.service.ts`: `marketFilter` → `territoryFilter` (4
  call sites).
- `autocomplete.service.ts`: `marketScopeKey` param → `scopePlaceKey`;
  reworded the poll-lane doc comment ("in the current market" → "in the
  current viewport scope").
- `restaurant-location-enrichment.service.ts` +
  `restaurant-enrichment-queue.service.ts` + `restaurant-enrichment.worker.ts`
  - `unified-processing.service.ts`: `sourceMarket` → `sourceLocale`
    end-to-end (the {city, region} bias context, incl. the
    `RestaurantEnrichmentDispatchContext` shape); `normalizeSourceMarket` →
    `normalizeSourceLocale`; the never-assigned `inMarket` trail field →
    `localeBiasMatch`; `hasCandidateMarketPreferenceContext` →
    `hasCandidateLocaleBiasContext`; `buildAutocompleteMarketRetryQuery` →
    `buildAutocompleteLocaleRetryQuery`; `marketParts` → `localeParts`. Same
    rename threaded through `llm.types.ts`
    (`LLMRestaurantPlaceChooserInput.sourceMarket` → `.sourceLocale`) and
    `restaurant-place-chooser.prompt.ts` so the call site still type-checks
    (this was the one non-mechanical spot: the LLM chooser input shares the
    name and had to move in lockstep or the build breaks).
- `displayMarketName` (search response metadata field, live on the wire) →
  `displayPlaceName`, threaded through `search.service.ts`,
  `search-header-place.spec.ts`, `packages/shared/src/types/search.ts`,
  and the mobile consumers (`on-demand-notice-copy.ts`,
  `use-search-results-panel-on-demand-notice-runtime.tsx`,
  `search-on-demand-notice.spec.ts`, `useSearchRequests.ts`'s
  `responseDisplayMarketName` → `responseDisplayPlaceName`). Required a
  `packages/shared` rebuild (`yarn build`) — the api's `tsconfig.build.json`
  resolves `@crave-search/shared` to its compiled `dist/`, not source, so
  the stale dist briefly produced 9 phantom `displayPlaceName does not
exist` errors until rebuilt.
- `ListDetailPanel.tsx`: the City-slice selector chip was still labeled
  `title: 'Market'` / `'All markets'` / `key="market"` — a genuine
  user-facing vestige, not just a comment; relabeled to City / 'All
  cities' / `key="city"`.
- Poll-creation header place name (`PollCreationPanelParams.marketName` and
  friends) renamed end-to-end: `marketName` → `placeName`,
  `PollCreationHeaderMarket` → `PollCreationHeaderPlace` (+ its
  `EMPTY_…`/`resolve…`/`are…Equal`/`use…` siblings), `pollCreationMarketName`
  → `pollCreationPlaceName`, across `PollCreationPanel.tsx`,
  `useSearchRoutePollCreationPanelSpec.ts`,
  `useSearchRoutePollCreationSceneStateRuntime.ts`,
  `app-overlay-route-params-equality.ts(+.spec.ts)`,
  `app-overlay-route-types.ts`,
  `use-app-route-poll-creation-scene-input-writer-runtime.tsx`,
  `PollsPanel.tsx`.
- Comment rewords (no identifier change): `polls.service.ts` "polls per
  market" → "polls per place"; `favorite-lists.service.ts` /
  `favorite-lists.ts` (mobile) "majority market" → "majority city";
  `signals.service.ts` "lazy lookups — market bbox" → "place bbox" (and
  the K3 cache-sizing comment's "actors ≫ markets/places" → "actors ≫
  places", matching the actual `PLACE_BBOX_CACHE_MAX` constant);
  `poll-entity-seed.service.ts` "Market presence… is derived" (stale
  present-tense) → reworded to say geometric location data, no legacy
  market presence involved; `PersistentSheetHeaderHost.tsx` "market-gated
  create" / "Pick a market" → "place-gated create" / "Pick a place"
  (describes a still-live registration path, not dead code);
  `polls.ts` (mobile) "active polls in the market" → "in the scoped
  place"; `use-search-results-panel-on-demand-notice-runtime.tsx`
  "response-metadata market names" → "place names" (post-rename).
- Deleted dead Prisma-model mocks for the extinct `market` delegate:
  `signals.service.spec.ts`'s `market: { findFirst… }` and
  `polls-creation-place-rekey.spec.ts`'s `market: { findMany… }` +
  `marketKey: null` fixture field. Left the two files' `not.toContain`/
  `not.toHaveProperty('marketKey')` extermination-proof assertions in
  place — those are the point of the test, not the vestige.
- Fixed a genuinely broken dev script surfaced by the sweep's `tsc`
  pass: `apps/api/scripts/poll-comment-probe.ts` was still passing
  `marketKey: 'region-us-ny-new-york'` into `prisma.poll.create` — a
  column dropped this leg. Removed the field (probe doesn't need a
  place scope to post comments).

**Deliberately left alone** (case-insensitive `market` hits that are NOT
naming vestiges): brief past-tense "died with the market model / §N"
historical comments across `entity-text-search.service.ts`,
`autocomplete.service.ts`, `places.module.ts`, `tomtom-chain-probe.port.ts`,
`launch-position.controller.ts`, `polls.service.ts`, `poll-graduation.
service.ts`, `signals.service.ts`, `signal-demand-read.territory.spec.ts`,
`search-header-place.spec.ts`, `search-query.builder.ts`,
`search-coverage.service.ts`, `engine-coverage.service.ts` /
`.spec.ts`, `search-query-suggestion.service.ts`, `on-demand-tuning.
constants.ts`, `search.controller.ts`, `entity-resolution.service.ts` /
`.types.ts`, the reddit-collector files, `notifications-poll-release.
spec.ts`, `notifications.service.ts`, mobile `MainLaunchCoordinator.tsx`,
`pollsHeaderVisuals.tsx`, `launch-position.ts`, `search.ts`,
`profile-mutable-state-record.ts`, `search-desired-state-contract.ts`,
`on-demand-notice-copy.ts`, `search-on-demand-notice.spec.ts`; the
`polls-feed.spec.ts` / `polls-signals-write.spec.ts` /
`poll-weekly-ritual.service.spec.ts` dead-`market`-delegate mocks (same
extermination-proof pattern as the two deleted above, but not named in
scope — left for a follow-up pass); informal "cross-market
outlier"/"another market" geography jargon in the map/camera runtime
(`search-map.tsx`, `resolve-fit-all-camera.ts(+.spec)`,
`resolve-focus-camera.ts(+.spec)`, `use-direct-search-map-source-
controller.ts`, `profile-restaurant-camera-motion-runtime.ts`,
`search-world-fetch.ts`) — describes distant geography, not the deleted
schema; `LLMPollAxis.marketHint` / `market_hint` (llm.types.ts,
llm-response-schemas.ts, poll-weekly-ritual.service.ts, llm.service.ts,
poll-subject-prompt.md) — an LLM-contract field name (a locality phrase
the model extracts from poll text), independent of the deleted `core_
markets` table; `restaurant-place-chooser.prompt.ts` / `entity-match-
prompt.md` / `relevance-gate-prompt.md` "market" as ordinary English
(source market, in-market brand cluster, grocers/markets) inside LLM
instruction text, not a schema reference; `apps/mobile/src/perf/perf-
scenario-attribution.ts`'s `MARKET_DEMAND_SCENARIO_PREFIX` — a perf
scenario label (`maestro/perf/flows/market-demand/`), not tied to the
dropped tables; `apps/api/scripts/search-harness/*` + `data-fixes/README.
md` + `seed-owner-fixtures.ts` / `seed-poll-fixtures.ts` — dev-only
harness/fixture scripts against an archived pre-leg-4 snapshot
(`frozen-fixture.v1.json`), out of scope for a live-code sweep.
**Follow-up pass (same day): the three flagged-broken scripts, resolved to
zero remnants.** Per-script verdict:

- **`check-tomtom-regional-health.ts` — DELETED.** Its only purpose was
  regional `core_markets` boundary/geometry health (TomTom source-boundary
  counts, `core_markets.geometry` validity, `collection_communities.
market_key` join) — no non-market purpose to re-key onto. Deleted with
  its wiring: `apps/api/package.json`'s `tomtom:regional-health` script,
  and root `package.json`'s `tomtom-market:health` /
  `tomtom-market:deploy-gate` / `tomtom-market:delete-gate` entries. Two
  more files turned out to be pure fallout of that same market-only
  purpose and were deleted too: `scripts/tomtom-market-deploy-gate.sh`
  (deploy gate whose only real branch pointed operators at the
  already-deleted `onboard-market.ts` for "regional market repair") and
  `scripts/tomtom-market-cutover-delete-gate.sh` (a 430-line leg-2/3-era
  regression gate asserting invariants about `apps/api/src/modules/
markets/*` — `market-registry.service.ts`, `tomtom-boundary-bootstrap.
service.ts`, `markets.controller.ts` — and `apps/mobile/src/services/
markets.ts`, all of which no longer exist; the gate could not have run
  since those legs landed).
- **`seed-google-photos.ts` — RE-KEYED.** Live, non-market purpose (dev
  photo-gallery seeding through the real Cloudinary/photos pipeline). The
  `top_austin` CTE's `JOIN core_entity_market_presence mp ON … mp.market_key
= 'region-us-tx-austin'` became a `cross join` on an `austin_place` CTE
  (`SELECT … FROM places WHERE name='Austin' AND subdivision_code='TX' AND
country_code='US'`) with a `latitude/longitude BETWEEN bbox_min_*/bbox_
max_*` containment check against `core_restaurant_locations` — the same
  bbox-containment shape `restaurant-location-enrichment.service.ts`
  already uses elsewhere, minus the ST_Covers polygon precision (this is a
  dev-fixture script; bbox is a fair substitute and doesn't depend on the
  place's Tier-2 geometry being promoted).
- **`seed-owner-scale-fixtures.ts` — RE-KEYED.** Live, non-market purpose
  (owner-account list/photo scale fixtures). Same fix as above applied to
  `loadPool()`'s restaurant pool query; the `MARKET_KEY` constant is gone
  (the query resolves Austin from `places` directly, no key indirection
  needed now that there's no market row to key off).

**Also found and fixed while re-checking `scripts/` for dropped-table
references**: `apps/api/scripts/search-harness/frozen-fixture.ts` — the
harness-fixture GENERATOR (not just a consumer of the already-archived
`frozen-fixture.v1.json`) was still running `SELECT entity_id, market_key
FROM core_entity_market_presence` to stamp each fixture entity. Re-keyed
to the same bbox-containment shape, resolving the region from
`_shared.ts`'s `DEFAULT_MARKET_KEY` label via a small
`REGION_PLACE_BY_MARKET_KEY` lookup (the two keys this harness family has
ever used, NYC/Austin); `FixtureEntity.hasMarketPresence`/`marketKeys` →
`hasRegionPresence`/`regionKeys` (only consumed within `_shared.ts` +
`frozen-fixture.ts` itself, so the rename was self-contained — no other
harness script reads those fields). `DEFAULT_MARKET_KEY` itself and its
~12 label-only consumers (`typo-replay.ts`, `margin-link-eval.ts`,
`variant-link-replay.ts`, etc. — none of them pass it into a live
service call, it's printed as a run-header string) were deliberately left
alone: they don't reference a dropped table, they're not broken, and a
full rename would be relabeling a harmless legacy label across a dozen
files for no functional gain. Reworded its doc comment to say so
(display-only bookkeeping, not a live filter — recall is engine-territory
scoped in prod now).

**Found, judged out of scope, left alone**: `scripts/search-demand-
cutover-delete-gate.sh` references `JOIN core_markets m` and
`LOWER(mp.market_key)`, but it was ALREADY broken before this leg for an
unrelated reason (it asserts against `apps/api/src/modules/analytics/
search-demand-aggregation.service.ts`, a file that no longer exists —
gone in an earlier, separate cutover). Its market references are one
symptom of a stale multi-concern gate, not a market-specific remnant;
fixing it properly means rebuilding the whole search-demand-cutover gate,
which is a different leg's cleanup. `apps/api/scripts/data-fixes/{README.
md,fix-integrity-defects.sql}` still literally mention
`core_entity_market_presence` (an INSERT/DELETE against it) — left alone
as an archival record of an already-executed one-time data fix (the
README states the post-fix counts), not a script anyone re-runs.

None of the three re-keyed/generator scripts are exercised by `yarn
build`/`yarn jest` (scripts are excluded from the build tsconfig and have
no tests, `search-harness/` doubly so), so the fix is verified by `cd
apps/api && npx tsc --noEmit -p tsconfig.json` (0 errors, confirms every
script in the tree still type-checks) rather than a runtime run against a
live DB.

**Grep-proof after the sweep**: `grep -rin "market" apps/api/src apps/api/
scripts packages/shared/src apps/mobile/src` (excluding the frozen JSON/
JSONL fixtures, font license text, and the untouched `apps/mobile/ios`
native surface) returns ~300 hits, all either (a) the historical/informal/
LLM-contract/harness categories above, or (b) extermination-proof spec
assertions (`not.toContain('market...')`, `not.toHaveProperty('market...')`).
No remaining hit is a live naming vestige pointing at the dropped schema.

Verify: `apps/api` — `npx prisma generate && yarn build` (0 errors, after
rebuilding `packages/shared` which the sweep's `displayPlaceName` type
change touched) + `yarn jest --silent` → 732/732 green. `apps/mobile` —
`yarn jest --silent` → 396/396 green; `npx tsc --noEmit` → exactly the 2
pre-existing errors (`search-map.tsx` `nativeHostKey`,
`use-search-runtime-camera-intent-runtime.ts` `animationCompletionId`), no
new ones. API rebuilt + restarted (`lsof -ti tcp:3000 -sTCP:LISTEN | xargs
kill -9` → relaunch `node --enable-source-maps dist/main`); smoke:
`GET /api/v1/places/launch-position` → 200.

### Leg 4 follow-up 2 — sim validation caught TWO drain defects (fixed + healed, 2026-07-22)

The post-extermination sim drive (Austin → San Antonio at zoom 11) showed
"Polls in Bexar" over downtown San Antonio. Attribution (never ideate
first): SA's "real" polygon covered **0** of the view — the drain had
persisted a ~1×2km wrong-entity fragment for San Antonio TX
(`provider_boundary_id` non-null, extent BOX(-98.60,29.37 → -98.59,29.38)
vs the true ~0.66° municipality). Census: **39/5,826** outline rows had a
polygon spanning <20% of the place's own bbox (wrong-entity vendor
resolutions).

While healing those, a second, bigger defect surfaced: **6,448 queue rows
were stamped `promoted_at` while their geometry row is still
sketch-grade** — `persistPolygon`'s `WHERE bounded.geometry IS NOT NULL`
can insert/update NOTHING (vendor 'ok' with no usable polygon rings), yet
`promoteOne` stamped the promotion anyway. Silent success, sketch forever,
never retried.

Fixes (places-promotion.service.ts):

1. **Wrong-entity guard** — after a successful fetch, if the polygon's
   envelope spans <20% of the place bbox on BOTH axes (and the bbox is
   non-trivial, >0.05°), reject: warn `WRONG-ENTITY polygon rejected`,
   clear the cached geometry id (future pass re-resolves), record attempt,
   stay sketch. Sketch truth beats outline fiction.
2. **Landed check** — `persistPolygon` now returns whether a row landed;
   a no-rings result is a MISS (warn + attempt), never a stamped
   promotion.

Data heal (one-time SQL, applied): the 28 rows failing the both-axes
guard reset to sketch envelopes (`ST_MakeEnvelope` from bbox,
`provider_boundary_id` NULL); ALL falsely-stamped rows (6,448) reset to
pending (`promoted_at` NULL, attempts 0) in both the queue and
`places.promoted_at` — the hourly drain re-earns them under the new
guards.

Residual (known, honest): until SA's true polygon drains, its sketch
envelope (county-sized bbox) is slightly LARGER than Bexar county's real
polygon, so the finest-dominator law lawfully answers "Bexar" there.
Self-corrects when the outline lands. Open improvement if wrong-entity
retries keep failing: validate the geometry-id choice against the place
bbox at RESOLVE time (or filter the geocode by municipality entity type).
Verified: build 0 errors, places suite green, API restarted, cold-launch
sim drive re-run (Austin commit correct; Bexar-over-SA is the documented
lawful interim).

### Leg 4 follow-up 3 — resolve-time twin disambiguation (the ROOT fix, 2026-07-22)

Live vendor probe pinned the wrong-entity root cause: TomTom keeps
DUPLICATE same-name Municipality records — "San Antonio, TX" exists twice
(0.66°-wide real city, geomId e5aa5b8c…; 0.012°-wide fragment, geomId
8598c1de…) — and QUERY PHRASING decides rank: the county-qualified
"San Antonio, Bexar, TX" ranks the fragment FIRST while the plain query
ranks the real record first. Rank is not identity.

Fix (the from-scratch ideal — validate the CHOICE, not just the outcome):
`resolveGeometryId` now takes the place's own bbox
(`GeometryIdentityNode.bbox`, passed by the drain from the index
columns). With a bbox, the geocode draws a candidate LIST (limit 5, still
one cheap call, entityType/country filter unchanged) and
`pickBboxAgreeingCandidate` selects the candidate whose vendor bbox spans
≥20% of the place bbox on both axes with center inside the 10%-padded
bbox — largest qualifying area wins (the duplicate failure mode is always
a fragment; bboxes only grow, §1). No qualifier = MISS with a warn —
sketch truth beats a confident wrong twin. No bbox on the node = legacy
first-result behavior (probe path unchanged). The persist-time
wrong-entity guard and the landed check stay as belt-and-suspenders.

Specs: adapter — rank-1 tiny twin loses to the bbox-agreeing candidate
(limit widened to 5 asserted); no agreeing candidate = miss. Promotion —
identity tuple now carries bbox (null when the row has none). Full api
suite 734/734 green, build 0 errors, API restarted.

### Leg 4 follow-up 4 — the agreement rule corrected to coverage-of-place (2026-07-23)

The first drain pass under the twin-disambiguation fix missed 621/4,504
resolutions (14%) — too high to be vendor gaps. Live replay of the rule on
the missed names showed why: the RIGHT record's vendor bbox is routinely
far WIDER than the census bbox (Brunswick GA: 6×, water/metro extent), so
the center-inside-10%-padded-bbox test rejected true records. The rule is
now INTERSECTION-over-PLACE-area: a candidate agrees when its bbox covers
≥50% of the place's own bbox (CANDIDATE_PLACE_COVERAGE_FLOOR) — a true
record contains the place bbox (~100%) even when much wider; a wrong-twin
fragment covers ~0% (San Antonio's 0.012° twin: 0.04%). Highest coverage
wins; no size/center tests. Spec added (wide-but-right candidate chosen);
the SA twin + no-agreement specs unchanged and green. Tonight's missed
pending rows reset (attempts=0) so the next hourly pass retries them
under the corrected rule. Suite green, API restarted.

### Wave-7 red team (3-lens: completeness / dead code / coherence, 2026-07-23)

Three independent review passes over the whole rebuilt surface. Verdicts:
completeness — no plan-vs-code gap (all §18 items landed or honestly
deferred; §2.5 law identical on both runtimes; §2.6 grade-blind judgment
verified airtight: zero grade-aware branches anywhere). Dead code — one
prod-dead helper. Coherence — two real seams + one structural silo, ALL
FIXED same-day:

1. **Geometry upgrade → demand re-attribution** (stale-tolerated,
   undocumented → FIXED): the aggregate only rebuilt days carrying signals
   newer than its watermark, so a sketch→outline upgrade left old days
   attributed against the dead rectangle forever. The drain now calls
   `pullDemandWatermarkBack(placeId)` after every landed polygon: one SQL
   pulls the watermark back past the oldest signal whose geo touches the
   place's new ground; the next hourly refresh re-derives those days with
   the true polygon (reuses the aggregate's own designed seam — no new
   machinery; direct SQL because SignalsModule→PlacesModule would cycle).
2. **Mobile slice cache unbounded in TIME** (spatial marginBox only →
   FIXED): `VIEWPORT_SLICE_TTL_MS = 15 min` — any camera activity after
   the TTL refetches even inside marginBox (cause 'ttl-refresh'); a parked
   untouched map has no viewer to lie to, and the hourly drain makes a
   fresher bound pointless.
3. **Probe-path bbox donation unvalidated** (the structural silo — the
   probe's limit=1 first-result fill donates the very bbox the drain later
   VALIDATES against → FIXED): `forwardGeocode` now draws the candidate
   list and takes the first candidate whose bbox CONTAINS THE ANCHOR — the
   probe's own ground truth (the chain came from reverse-geocoding that
   point; a same-name twin elsewhere cannot contain it). None containing =
   node stays bbox-less (warn), never poisons the index.

Cleanups: `coverageOfView` bbox helper deleted from shared subjects
(prod-dead since §2.6; spec block removed); stale polls.service legacy-
envelope comment fixed; dead `market` prisma mocks purged from the last 3
specs (polls-feed, polls-signals-write, poll-weekly-ritual). Verified:
shared+api rebuilt, api 734/734, mobile 396/396, tsc = the 2 known
pre-existing errors, API restarted.

### V2 cadence design — the loss-horizon floor lands; the rest deferred to data (2026-07-23)

Owner-ratified v2 framing: lanes are three instruments against ONE goal
(coverage of each source's content through time) — archive = bulk deep
past (one-time, ends 2025); chronological = the flowing present, complete
and cheap ONLY within reddit's ≤1000-post /new window; keyword = the sole
random-access into the archive-end gap, with self-decaying uncovered-
yield. The ideal scheduler funds dispatches by expected UNCOVERED docs ×
demand weight under the pool budget — cadence becomes an emergent
outcome, not a setting; keyword dominance in a source's gap era and its
graceful decay to a trickle both emerge from measured yield. Deferred
until real dispatch data exists (same reasoning as the other §18
markers).

Landed NOW (the one irreversible-error rule): the CHRONOLOGICAL
LOSS-HORIZON FLOOR — advanceLane accepts a cap; the pacer computes it per
source as 0.5 × 1000 / measured posts-per-day (trailing 14d of
collection_source_documents source_created_at; ≥2h clamp; no data = no
cap). A source hot enough to overflow the window between default-cadence
visits now auto-tightens; everyone else keeps the 1d default untouched.
Spec: high-arrival source clamps advance to 0.5d; quiet source carries a
non-binding 25d cap.

Audit rulings recorded in code comments: (a) recordLaneOutput records
TOTAL keyword results (fine for heartbeat collapse detection) — v2 needs
per-(source,lane) UNCOVERED yield persisted; marked at the method. (b)
CollectorEstimators.observeArrival has zero production callers (the
arrival estimator is registered scaffolding); the floor measures arrival
directly from the durable source_documents substrate instead. (c)
CORRECTED on verification: lane rows were seeded ONLY by the
20260719230000 migration from the dead collection_schedules table — new
sources onboarded after it got NO lanes (the pacer would never visit
them). Fixed: CollectorSourceRegistryService.ensureLanes (idempotent,
adapter-declared lanes due NOW) + the same insert inline in
onboard-subreddit.ts, so the post-archive baseline chronological sweep
fires on the first pacer tick after onboarding. 735 api green; API
restarted.

### Full-plan red team (4-lens: signals / scoring / collector / polls+search, 2026-07-23)

Owner-ordered sweep of the ENTIRE rebuilt plan surface. Verdicts: signals
ledger + demand aggregate "unusually coherent" (all 9 kinds have live
writers; act-identity dedupe identical on write+read arms; partitions +
maintenance live; every former event-table consumer on the substrate;
old event tables confirmed dead). Polls supply + on-demand + search:
fully clean (all purge-list items zero-hit verified). Scoring: epochs,
kill condition (RED-capable), rising-flap, coverage-normalization,
portfolio floors all verified. Collector: governance pools, §12.3,
loss-horizon floor all coherent.

Findings FIXED same-day (migration
20260723130000_full_plan_red_team_dead_tables, drift-path):

1. **user_favorite_events + user_events DIE** — both were write-only
   pre-ledger tables (zero readers, verified): favorites dual-wrote
   UserFavoriteEvent beside the favorite_added signal; polls dual-wrote
   4 UserEventService.recordEvent calls beside poll signals. All writers,
   the rehome-on-merge, UserEventService itself, the models, the
   favorite_event_kind enum, and both tables deleted (§22's own
   "DUAL-WRITE — delete with old logging" markers executed).
2. **safeIntervalDays honesty cut** — the column had ZERO writers (its
   producer was the dead volume-tracking queue); the pacer's read fell
   back to 7 forever while pretending measurement. Now openly
   KEYWORD_TERM_SUCCESS_COOLDOWN_DAYS = 7 (K3-as-prior; v2's measured
   uncovered yield replaces it, not a better column).
   avg_posts_per_day / last_calculated / safe_interval_days dropped from
   collection_communities; resolveSafeIntervalDays deleted.
3. **onboard-subreddit.ts un-broken** — it crashed on
   getQueueToken('volume-tracking') (queue registered nowhere); the whole
   volume-calculation step + --skip-volume flag deleted; the inline lane
   SQL replaced with the registry's ensureLanes (the script boots the
   full Nest graph — the "bare prisma" comment was wrong).
4. Stale docs fixed: signals.controller "unwired" comment (it IS wired),
   CollectionSchedulerService references in packing-ab /
   collection-model-ab-v2 / search README → CollectorPacerService
   (job-control.ts left as-is: outside the lint project, cosmetic only).

Left by design: collector estimator registry = intentionally deferred §22
scaffolding (self-documented trigger); partition-maintenance has no pager
(logged-error only — acceptable solo-dev posture, noted). api 735/735 +
mobile 396/396 green; API restarted; smoke 200.

### The no-fake-estimates law — cold-start guesses eliminated (owner-ratified 2026-07-24)

Owner interrogated the constants inventory: why seed guesses at all instead
of letting the system produce values the moment data exists? The audit test
(a guess is necessary only when the decision can't wait AND can't be
derived from existing data AND unconditional-first-action is unacceptable)
found most "priors" already eliminable — two were literally inert:

1. **Collector estimator scaffolding DELETED** (collector-estimators.ts +
   spec + module wiring): the arrival prior (10 docs/day, strength 7) and
   term hit-rate prior (0.5, strength 4) lived in registered-but-never-fed
   machinery with zero production callers. The live system already follows
   the law: first visits are unconditional, rates are measured from durable
   source_documents, untried terms enter via the ratified exploration floor
   (a fake 0.5 estimate answered a question nobody asks). This RESOLVES the
   §18 "source arrival-rate prior" OWNER-RATIFY marker by elimination.
   The shared EstimatorRegistry class stays (poll-supply estimators are
   wired and live).
2. **Chronological cadence now fully DERIVED** — the 1d declaration is
   bootstrap-only (pre-first-measurement). From the first measurement:
   interval = clamp(0.5 × 1000-post window ÷ measured posts/day, 2h,
   14d). Every bound derives: loss-horizon from the vendor window +
   one-missed-tick safety; the 14d upper clamp is the arrival
   measurement's OWN horizon (stretch visits past it and the measurement
   starves itself blind — a quiet source must be observed once per window
   to notice it waking). advanceLane semantics changed from cap-below-
   cadence to derived-replaces-cadence (hot sources tighten, quiet
   sources stretch). This narrows the §18 cadence OWNER-RATIFY marker to
   keyword's 7d cooldown only (v2 measured uncovered-yield replaces it;
   its coverage half is buildable pre-launch from known gap mass — the
   demand-weighting half alone waits for users).

Surviving numbers are now exactly three kinds: FACTS (vendor windows,
rate limits), OWNER CHOICES (pool price-tags, the ⅔ header law, feel
constants — the eye is the instrument), and BOOTSTRAP PRODUCT DECISIONS
(poll-viability proxy: engagement data comes FROM launched polls, so a
minimal bridge is irreducible). 728 api green (estimator specs deleted),
build clean, API restarted.

### Railway production cutover (2026-07-24) — the system leaves the laptop

Owner-ordered full cutover. End state: production topology api + worker +
postgis-db (NEW: timescale/timescaledb-ha:pg17 — the stock Railway
Postgres has neither postgis nor pgvector; volume at /home/postgres/
pgdata, RAILWAY_RUN_UID=0 for the mount) + Redis + site. The Feb-17
zombie deployments (5 months stale, two dead-era crons erroring daily)
are replaced.

DB: local crave_search dumped (371MB custom) and restored into
postgis-db (staged: pre-data → drop the two validate_entity_references
CHECK constraints (they fire on same-table forward references mid-COPY)
→ data → re-add NOT VALID → post-data; the HNSW name-embedding index
rebuilt serially after a shared-memory failure at default parallelism).
Parity verified: 85 tables, 348/348 indexes, all row counts (signals
drifted +18 locally post-dump — sim-driving dwells, accepted).
api/worker DATABASE_URL repointed to postgis-db.railway.internal.

Vars: REDDIT\_\* credentials + TOMTOM_API_KEY/TOMTOM_GEOMETRY_ZOOM set on
both services (missing since Feb — predate the geo work); worker:
COLLECTION_SCHEDULER_ENABLED=true, COLLECTION_LLM_MODE=batch (owner-
ratified: collection ON in prod; measured cost ~2k in + ~385 out tokens
/doc → ~$7-14/mo batch steady-state for austinfood+foodnyc, ~$35-65
one-time gap-fill; prompt churn is safe — persist-first, re-judge later).

The first-ever non-'all'-role boots found and fixed two latent bugs
(commit 1ce0ccab): CollectorSourceRegistryService was worker-gated but
leg 3 made it a CORE dep of UnifiedProcessingService; and
stopCronsUnlessWorker probed SchedulerRegistry through Nest's
ExceptionsZone (process death before catch) — now a documented no-op
since non-worker graphs never register ScheduleModule. Plus the
dist-only bootstrap crash (8907d5dc): prompt files loaded from
process.cwd()/src — now \_\_dirname-relative. Deploys via `railway up`
(CLI upload; Dockerfile at apps/api/Dockerfile — never deleted, earlier
glob confusion).

Verified live: api SUCCESS + GET /api/v1/places/launch-position → 200
resolving a real IP to Austin with catalog bounds; worker SUCCESS,
clean boot. LOCAL RETIREMENT: apps/api/.env PROCESS_ROLE=api — the
laptop is a pure dev api (zero crons); production owns ALL scheduled
work (pacer, drain, rescorer, partitions). Prod redis = Railway Redis
(fresh queues; lane cursors rode in via the DB). Old 'Postgres' service
(Feb data) left running for a soak period — DELETE after confidence;
nothing references it.
