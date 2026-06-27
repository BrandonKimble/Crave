# Memory Index

- [Map LOD v4 state](map-lod-v4-state.md) — CURRENT map LOD state (READ FIRST for map work): v4 model, what's fixed (flash, out-region), what's parked (pin jitter = Mapbox renderer), next = reveal/dismiss lane separation; frame-analysis tooling
- [Map LOD / pin architecture](map-lod-pin-architecture.md) — how pin/dot LOD, 4 label candidates, z-order stacking, and per-pin slot source groups work (JS + native iOS)
- [Map LOD demotion root cause](map-lod-demotion-root-cause.md) — why pins jitter/demote when panning/twisting without zoom
- [Map LOD target plan](map-lod-target-plan.md) — agreed target architecture + staged cutover + LATEST STATE / progress / per-issue status / autonomous loop (READ FIRST for map work)
- [Map Stage B spec](map-stage-b-spec.md) — execution-ready spec for native screen-space per-tick selection (the next big piece; start here for Stage B)

## Local Postgres access (confirmed 2026-06-01)

- Live dev DB is **Postgres.app (PG18)** on localhost:5432, NOT Docker (Docker Desktop is not installed on this machine; `docker`/`docker-compose` CLIs exist but no daemon).
- Connect: `psql "postgresql://postgres:postgres@localhost:5432/crave_search"`. Same as `DATABASE_URL` in apps/api/.env.
- Postgres.app gates connections per-app; if rejected with "rejected trust authentication / did not allow Claude", the user must grant Claude access in Postgres.app (one-time). Once granted, prisma/psql/test-pipeline work from Claude's shell.
- Apply schema in dev: `cd apps/api && npx prisma db push --accept-data-loss` (migrations have drift; db push is the pragmatic dev path). test-pipeline resets via TRUNCATE (not migrate), so schema must be pushed first.

## Startup-location model (MainLaunchCoordinator.tsx) — overhauled 2026-06-01
Priority (chooseBestSnapshot): override(6) > current GPS(5) > last_known_os(4) > cached_app(3) > city_fallback(2) > none(1). DEVICE REALITY beats the persisted city default (was the bug: city_fallback ranked 4 > last_known 3, so app opened on Austin regardless of where you were). Removed isSnapshotCompatibleWithSelectedCity / distanceMetersBetween / STALE_LOCATION_CITY_COMPATIBILITY — device fixes are no longer rejected for being far from selectedCity.
Paint-then-upgrade (Google model): if last_known/cached exists, paint INSTANTLY (currentWaitMs=0, no GPS block on splash); only block up to STARTUP_LOCATION_MAX_WAIT_MS=1500 for a cold fix when there's NO device fix. Live watchPositionAsync refines after. Splash gating already waits on mainMapReadiness (map loaded→camera applied→rendered) + 10s backstop.
TEST OVERRIDE (reliable, deterministic): env EXPO_PUBLIC_STARTUP_LAT/LNG (+ optional _ZOOM) → STARTUP_LOCATION_OVERRIDE short-circuits ALL GPS/last-known resolution, source='override'. perf-scenario-ios.sh exports these from PERF_SCENARIO_SIM_LOCATION_LAT/LNG (default now Manhattan 40.7550,-73.9800 to match the swapped-to-NYC local DB; _ZOOM default 12.4). So flows land on the same viewport every run regardless of simctl GPS timing — fixes the "map stuck on Austin / set_map_camera not moving" test pain.
FALLBACK NOTE: city_fallback still uses persisted cityStore (default 'Austin'). The more-ideal final fallback is IP-derived region; left as a note (network dep at startup), not built — keeping it simple per user.

## IP-metro fallback DONE & VERIFIED 2026-06-02 (task #16) — hardcoded city REMOVED
Google-style ladder in MainLaunchCoordinator chooseBestSnapshot: override(7) > current(6) > last_known_os(5) > cached_app(4) > ip_fallback(3) > city_fallback/national(2) > none(1). The hardcoded 'Austin'/cityStore/selectedCity/resolveCityViewport/normalizePersistedCity ALL removed from MainLaunchCoordinator. buildCameraFromSnapshot no longer takes selectedCity.
- Bottom rung when NO device location (permission denied): resolveIpLocation() → GET /markets/resolve-ip. If resolved → ip_fallback snapshot (coarse city coord + ipMarketKey, reads as 'unavailable' user-location so no false blue dot). If not → buildNationalFallbackSnapshot (USA center + USA_FALLBACK_ZOOM), NEVER a city.
- Polls/profile bootstrap market key now derives from startupLocationSnapshot.ipMarketKey (not selectedCity).
- SERVER: apps/api/src/modules/markets/ip-location.service.ts (IpLocationService) — calls ipapi.co (free, no key) /{ip}/json/ → lat/lng → MarketResolverService.resolve(userLocation) → marketKey. Private/loopback IPs → null. markets.controller.ts GET resolve-ip uses @Ip(). main.ts FastifyAdapter({trustProxy:true}) so request.ip = real client IP behind Railway proxy. Registered in markets.module providers.
- VERIFIED: curl -H "X-Forwarded-For: 108.41.0.1" .../markets/resolve-ip → {resolved:true, coordinate Brooklyn, marketKey:"region-us-ny-new-york", source:ip}. Loopback → {resolved:false}. Both API+client tsc clean.
- ipapi.co free tier ~30k/mo; only hit on permission-denied cold starts (rare). If it ever fails → national default. No app-size impact (server-side).

### #21 Feature-count degradation harness (2026-06-05)

- **What**: `set_scale_probe_markers` perf command mounts N synthetic pins into ONE
  resident symbol layer (allow-overlap + ignore-placement + viewport-y = worst-case,
  every feature drawn, no collision culling). Files: `perf-scale-probe-store.ts`
  (zustand + deterministic grid generator, no Math.random), `ScaleProbeLayer` in
  search-map.tsx, command wired through registry→deep-link(`markerCount`)→coordinator→
  instrumentation-runtime. Flow `maestro/perf/flows/search-map-scale-probe.yaml`
  (inlined workout — runFlow breaks under the shell's TMPDIR rewrite). Runner
  `scripts/perf-scenario-scale-probe.sh` (sets *_LOG_ONLY_BELOW_FPS=240 so ALL frame
  windows log, else only sub-58fps windows emit and the baseline is blind). Report
  `scripts/perf-scenario-scale-probe-report.js` buckets sampler windows between
  consecutive `set_scale_probe_markers` executed-command events (channel Scenario,
  carries `count`+`emittedAtMs`; RuntimeMechanism emit is gated off so don't depend
  on it), drops first window/segment (GPU upload spike).
- **Result (iPhone 17 Pro sim, Manhattan, pan+zoom workout)**:
  N=0..10k → median ~59fps, no degradation. N=25k → median 45.7, 17 stalls, p95 36ms.
  N=50k → minFloorFps 1.7, droppedRatio 1.0, 26 stalls (severe worst-frame hitching).
  Read minFloorFps/maxDroppedRatio/stalls (monotonic) not median avgFps (coarse/noisy).
- **Conclusion**: feature-count is NOT the bottleneck up to ~10k pins in one layer —
  ~300× today's LOD cap of 30. Layer-COUNT was the killer (already proven by slot-
  elimination). So the top-30 cap has enormous headroom; can raise it freely toward
  low-thousands. True uncapped (tens of thousands) eventually hurts worst-frame pacing
  → ~10k is the safe ceiling on this sim. Re-validate absolute thresholds on a real
  device; real pins also cull via placement so real headroom is even larger.

### #21b Collision-culling capacity (2026-06-05)

- **Probe extended** with a `collide` mode (deep-link `collide=1`): allowOverlap:false +
  ignorePlacement:false, pin-only (no shadow), via `SCALE_PROBE_LAYER_STYLE_COLLIDE` in
  search-map.tsx + `collide` threaded store→deep-link→coordinator→registry→runtime.
  Max raised 60k→120k. Flow `maestro/perf/flows/search-map-scale-probe-collision.yaml`;
  runner now takes a flow arg: `perf-scenario-scale-probe.sh <flow.yaml>`.
- **Result (iPhone 17 Pro sim, worst case = all N in-view, every pin collision-tested)**:
  collision-ON holds median ~55fps at 50k (vs 9fps collision-OFF), collapses ~100k
  (31.8 median). So allowOverlap:false ("load all, draw only the non-colliding subset")
  buys ~5× capacity: all-drawn ceiling ~10k, collision-culled ~50k comfortable.
- **Cost shift**: collision OFF = draw-bound (every symbol painted). collision ON =
  collision-CPU-bound (all N tested for placement each frame even if culled from draw).
  Worst-frame floors (1.9fps/31 stalls @50k) cluster at the one-time 50k inject spike +
  hard zoom transitions, NOT steady-state panning (median 55 = most frames smooth). Real
  world-from-high-up adds TILE culling on top (off-screen tiles untested) → even higher.
- **Validates the target model**: in-viewport pins allowOverlap:true (ranked, all shown)
  + out-of-viewport pins allowOverlap:false (collision-culled, scored) in ONE source; the
  out-of-view set can be tens of thousands. See tasks: out-of-viewport culling split +
  natural-search viewport bounding (no margin).

### #8 Resident pin+dot LOD cutover — DONE (2026-06-08, branch map-overhaul-overlap-resident)

- **Goal achieved**: pin+dot resident for every rendered candidate (union emitted into BOTH
  sources); LOD role = opacity feature-state ONLY (promoted pin1/dot0, demoted pin0/dot1).
  Role flip = opacity only, NO source membership churn → no commit/await → crossfade clean
  by construction. Eliminated the dot-snaps-before-pin residual AND the dual-write class.
- **The role model had to flip from membership-driven to opacity-driven everywhere**:
  (1) JS emission (use-direct-search-map-source-controller.ts): renderedLodCandidates = union
  of promoted + dots; pin nativeLodOpacity=isPromoted?1:0, dot nativeDotOpacity=isPromoted?0:1.
  (2) Native markerRoleTableFromDerivedCollections: pinnedMarkerKeys opacity-filtered; role-row
  `role` = opacity-driven (was "pin-wins-if-present"), row carries BOTH features; dots loop
  attaches dotFeature to any existing row. (3) Native makeDesiredPinSnapshotState: pinIdsInOrder
  (drives targetOpacity "presence") filtered to opacity>0. (4) JS buildMarkerRoleRow: role by
  pin nativeLodOpacity>0. (5) collectResidentPinnedSourceStoreState: filter to opacity>0 — THIS
  was the aggressive-twist flash (fed all ~500 resident pins into next-frame stable-membership
  → oscillation). 
- **Pin layer opacity expr** already coalesces feature-state→PROPERTY→1, so demoted pins
  (JS property 0) hide even without a native render state.
- **Validated** (LOD pan/zoom/twist, iPhone 17 Pro): builds clean, 0 redbox/role-row/base-
  mismatch, correct visibility (no all-pins mess), flashReversalCount:0 + crossfadeGapCount:0
  across ALL windows. The LiveDotTransition machinery stays as the opacity-easing engine (no
  longer fights membership churn). Bug-hunt loop took ~4 native rebuilds (resident1..5).
- **NOT done**: slot-source purge (pinSlotSourceIds dead scaffolding, Stage D) + #7 dead block
  removal — cleanup, batch a rebuild. Stage C (dot collision) needs re-eval post-resident.
