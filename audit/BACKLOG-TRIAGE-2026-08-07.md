# Backlog triage — 2026-08-07 (the honest state of the open ledger)

The exhaustive-rederivation loop had accumulated a large **undrained** backlog: the
attempt-3..6 "converging" reads measured only whether NEW findings appeared in fresh
territory, not whether the EXISTING catalogued backlog was shrinking. A dedup of
`audit/FINDINGS.md` by each finding's LATEST status found **268 truly-open findings**
(+44 already-owner). Four parallel triage lanes read every one against today's tree and
bucketed them. This file is the canonical index; each finding's precise fix lives in its
`| NEXT ACTION:` in FINDINGS.md.

## Buckets (268 triaged)

- **MOOT ~26** — fix already landed / stale / no defect. 17 tree-verified ones CLOSED
  2026-08-07 (F126, F214, F481, F482, F757, F767, F865, F1010, F1052, F1080, F1327,
  F1342, F1661, F1902, F3505, F4102, F4601). NOT closed (conflict — ledger says
  CONFIRMED-STILL-LIVE, triage said MOOT; need a real check before closing): **F1561,
  F1669**. Already-FIXED (dedup artifact, no action): F7200, F7201, F6406. Census
  PARTIALs left open: F2053, F2125, F1459.
- **OWNER ~52** — not a mechanical fix; awaiting the owner. See list below.
- **LIVE-MINE ~190** — genuine mechanical defects, clustered by territory below. A few
  are concurrent-session-blocked (tracksheet + notification-dispatcher + the dirty api
  config files): F1556, F1831, F2042, F2207, F856, F869, F2803, F6552, F7903.

## OWNER queue (escalations awaiting the user — do NOT fix mechanically)

Pre-existing owner items: F7500 (GDPR erasure fail-mode), F8900 (layer-wide gate-scan
lib), F9000 (iOS/Android camera-executor asymmetry), F9100/F9101 (CI lint policy +
apps/site unlinted), plus the standing money/product queue (F2601 dietary, F2700/F2701
spend-meter, F4908 teaser clamp, F6206 price-reel, F5426-adjacent).

New from triage (product / money / data-lifetime / taste / coverage-scheduling):

- **Money/spend:** F1810 (Gemini bills client-error calls? — BigQuery Q), F4912 (poll
  spend cap defeated by swallowed create — refusal arm needs ratification), F4932
  (Places timeout/redirect seeded priors), F4934 (spend-meter swallow → F2700 ruling),
  F4955 (chunk-comment constants).
- **Product/values:** F1392, F1452, F1464, F1491, F1515, F1655, F2128, F3702
  (username step retire-vs-park), F3711 (Sentry privacy manifest), F6211(c) resolutionTier,
  F6606 (spec-double `as never` convention), F6615/F6616 (README/S3 fiction delete-vs-generate),
  F6618 (privacy policy IDFA/Cloudinary — legal), F6620 (audit doc rewrite), F1019
  (Google price on cards), F1043 (reveal statechart land-vs-abandon), F1387 (which =3 knob),
  F1301 (singleton-behind-context admit-vs-real), F1111 (Mapbox rc pin), F1349, F5302
  (void-idiom lint rule — cross-lane), F6801 (DATABASE_URL guard dev-target).
- **Coverage-scheduling (not code defects):** F732, F755, F823, F927, F928, F967,
  F1039, F1054, F1073, F1118, F1120, F1152, F1247, F1791/F2804 (tsc:specs enable),
  F1800, F1891, F2101, F2310/F2900 (462-file layer refactor scope), F4506, F4959, F6803,
  F2306 (rotation — Dimensions vs useWindowDimensions is arguably mechanical), F3902 (map-locked).

## LIVE-MINE clusters (≈190 — batch into P3 fix-lanes by territory)

- **api reddit-collector — fake defaults / swallows / fiction docs:** F4900 (successRate
  always 'healthy'), F4901 (dead REDDIT\_\* env), F4902 (docs describe deleted auth), F4903
  (return [] vs sibling throw), F4904 (100-vs-1000 caps, empty comments), F4905
  (formatTimestamp→new Date()), F4906 (synthetic ids/clamp), F4933 (3 zero-ref types).
- **api places/enrichment — seeded priors / SQL injection / fake identity:** F4909, F4914,
  F4918, F4931, F4940 (raw uuid in SQL + warn-continue), F4941 (polar clamp), F4942, F4943,
  F4945, F4946, F4947 (wrong identity key), F4948, F4949, F4951, F4952, F4953, F4954, F4956,
  F4957, F4909.
- **api specs — mocks that answer any arg / vacuous asserts:** F4915, F4916, F4917, F4919,
  F4923, F4924, F2126, F2127, F3715, F6607, F6608, F6610, F6611, F6612, F6613, F6614.
- **api search/user-surfaces — DTO drift / N+1 / dead paths:** F842, F843, F3803, F3807,
  F601, F603, F605, F475, F4927, F4928, F4929, F4930, F4937 (FK annotate), F4001
  (profile_rebuild_floor), F2077, F2603, F2221, F2075 (boot validation).
- **mobile app-route/scene-runtime — dead params / `?? 'none'` on non-null / twin contracts
  / always-true comparators:** F5401, F5402, F5403, F5406, F5408, F5409, F5412, F5413, F5414,
  F5419, F5420, F5421, F5422, F5423, F5424, F5426, F5427, F5800, F5801, F6300, F6402, F6403,
  F6408, F6409, F6410, F6411, F6602, F6603, F6605, F6621, F6623, F1302, F1305, F1361, F1369,
  F1370, F1391, F1457, F1480, F1483, F1485, F1487, F1497, F1498, F1509, F2404, F2950, F2951,
  F2952, F2953, F3901, F3903, F3904, F1005, F1008, F1009, F1032, F1071, F1301(owner), F954,
  F959, F1012, F1053, F921, F926.
- **mobile perf/telemetry — constant "can't-show-red" fields (map-change-gated):** F1026,
  F2901, F1305, F1036(f), F1452(owner).
- **mobile result cards / tokens — verbatim dup / hardcoded metrics:** F891, F862, F3717,
  F3718, F3719, F1612, F1617, F1379.
- **mobile native (Swift/Java bridges):** F1702, F1707, F3707, F3709, F3710, F3712, F3721,
  F3703, F3704, F3714.
- **CI/gates coupling:** F2502 (ownership-gate enforcedSliceIds vs CI S7), F2600
  (coverage-staleness sha-column unvalidated), F5101 (awk NF==8 drops stray-`|` rows),
  F6551, F3708 (PROBES hand-list), F3714 (harness recipe green), F6621 (lane-pathspec
  SKIPPED-print), F1702.
- **config/lint hygiene:** F2052 (98 dead eslint-disable), F2406 (10 dead bindings),
  F6901 (17 dead imports), F6617 (dead glob), F2801, F2802, F2805, F2806, F2800.
- **CONCURRENT-BLOCKED (another session owns the file — do not touch):** F856, F869,
  F1556, F2803 (tracksheet); F1831, F2042, F2207, F6552, F7903 (notification-dispatcher +
  dirty api config files).

## How to drain

Batch a territory cluster into a P3 fix-lane: the lane reads each finding's NEXT ACTION +
the current code, applies the mechanical fix, mutation-proves (the reverted defect reds a
spec/tsc/gate), deletes the scaffolding it obsoletes, keeps green, and updates the FINDINGS
row to FIXED. Orchestrator ratifies (VERIFY DON'T TRUST — spot-check the mutation actually
reds and the fix isn't a new guard) and commits per territory. Owner items go to the user;
concurrent-blocked items wait for the owning session to land.
