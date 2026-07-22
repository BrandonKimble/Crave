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
