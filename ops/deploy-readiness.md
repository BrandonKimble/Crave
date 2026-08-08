# Deploy readiness — staging → prod (coordinator: 📌02 red team)

Owner directive 2026-08-07: every session at the ideal end state before the push —
no open items, no fallback/back-compat/dead code, right abstractions. This file is
the single visible surface for that coordination. The coordinator updates it as
session reports arrive; the deploy fires only when every row is READY.

## Session board

| Session                                          | Asked    | Status                                                      | Open items                                                                                 | Holds files? |
| ------------------------------------------------ | -------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------ |
| 📌02 red team (this/coordinator)                 | —        | READY                                                       | api-lint promotion (owner call, non-blocking)                                              | no           |
| 📌01 tom tom (fork)                              | reported | READY — 0 holds; 2 red-team asks dispatched                 | none blocking; pool cap becomes REAL at deploy (watch item)                                | no           |
| extraction (fork) — DB audit                     | reported | READY — ungrounded root cause SOLVED+EXECUTED (23.5%→11.9%) | none; 3 red-team asks dispatched; prod DATA sweep is post-deploy                           | no           |
| 📌03 account-deletion (mislabeled 'Gemini cost') | reported | READY — 0 holds                                             | site 3-artefact simultaneity (rail confirmation pending)                                   | no           |
| 📌06 Wave-4 (tracksheet)                         | reported | READY — tree clean as of 817af7fa2                          | R8 parked post-burn-in (owner gate); F9400-9403 absorbed post-deploy                       | no           |
| 📌07 Search                                      | reported | WORKING — 6 open items tasked back (ideal-shape closure)    | STOP-ITEM: timestamptz migration (sequencing adopted, below); 6 items in flight            | no           |
| Payments                                         | chased   | F9806 FIXED (b4205f24b); full report pending                | Stripe client-rail status; TEST-vs-LIVE keys; portal/webhook env                           | ?            |
| 📌05 extraction (fork 2)                         | chased   | AWAITING REPORT                                             | entity-alias.service.ts:369 TS2353 (likely theirs — blocks 8 suites); judge-v2 disposition | likely yes   |

## THE STOP-ITEM — timestamptz migration (Search's find, sequencing ADOPTED)

`20260802060000_timestamptz_everywhere` was resolved-as-applied but NEVER RAN: 155
columns still naive; the guard (utcInstant) was deleted on the strength of the phantom
conversion; schema.prisma declares Timestamptz over naive columns TODAY. Search
committed the idempotent replacement `20260805120000_timestamptz_everywhere_actually`
(batched per-table ALTERs — fixes the cross-column CHECK failure; carries the
parallel-worker guard) but it is UNPROVEN and deadlocks vs live writers (ACCESS
EXCLUSIVE over ~60 tables; rolled back cleanly 4/4 local attempts).

SEQUENCING (adopted): the migration stays in the push. STAGING proves it (quiet DB,
boot-migrate is the proof). For PROD it must NOT run as a boot race: scale the worker
to 0 (kills crons AND the setInterval strays), run `railway run -s api -- npx prisma
migrate deploy` in the quiet window, verify naive-column count → 0
(`SELECT data_type, count(*) FROM information_schema.columns WHERE table_schema='public'
AND data_type LIKE 'timestamp%' GROUP BY 1;`), then deploy (boot no-ops it), then
scale the worker back.

## Master PRE-deploy checklist (coordinator-known; sessions append via reports)

1. Working tree clean: every session's files committed; `git status` shows nothing
   unexplained. (Blocked on session reports above.)
2. Full green sweep on the final tree: api jest + mobile jest (SUITE count, not
   test count — a compile-failing suite hides from `grep Tests:`) + `yarn test:db`
   (the GDPR guarantees are DB-backed; unit-only blinds the gate) + both tsc +
   `yarn invariants` (21) + all shell gates (now fail-closed) + `yarn gate:lib-test`.
3. Env verified in Railway (api + worker): GOOGLE*VISION_API_KEY ✅ (set 2026-08-07);
   RESEND_API_KEY + OPS_ALERT_EMAIL ✅ (verified); deleted dials absent ✅
   (GEMINI_MONTHLY_SPEND_FLOOR_USD / GEMINI_BACKSTOP_MAX_USD removed);
   REEXTRACT*\* must be UNSET (confirm — a set value fires a boot one-shot);
   LOCATION_LIFECYCLE_CRON_ENABLED stays unset/off (owner flips at launch — now
   gates grounded-place lifecycle ONLY, per the janitor slim-down; the parked $70
   drain-pace question is OBSOLETE); SIGNAL_AUDIT_HMAC_KEY ✅ verified set (api+worker);
   RUN_FULL_PROJECTION_REBUILD ✅ unset; COLLECTION_SCHEDULER_ENABLED=false ✅;
   DATABASE_CONNECTION_POOL_MAX=10 ✅ present — NOTE: becomes REAL at this deploy
   (was cpus×2+1=73/service; this is the fix for prod's 100/100 lock).
4. Migrations in this push (self-apply at boot, order = timestamp):
   20260805000000_drop_subsumed_indexes, 20260805010000_drop_poll_topic_status,
   20260805120000_timestamptz_everywhere_actually (SEE STOP-ITEM — manual quiet-window
   run on prod), 20260807020000_photo_destroy_pending,
   20260807030000_deleted_identity_stash, + Search's incoming FK-index/dup-index
   migrations.
   Both are lightweight (enum add / nullable column + CHECK) — no parallel-worker
   guard needed per AUTHORING.md. Staging proves them first.
5. Deploy law: `./scripts/rig/deploy.sh --env staging` → /health commit check →
   `./scripts/rig/deploy.sh` (prod refuses unless staging runs the exact commit).
   watchPatterns SKIPPED-trap: deploy.sh checks unconditionally.

## Deploy-sequence bindings (must happen IN this order)

RAIL ORDER LAW (from the account-deletion session's three-rail analysis): NEVER ship
apps/site ahead of api. Order: api+worker → site → mobile. Site must be NAMED on the
deploy (`./scripts/rig/deploy.sh api worker site` — bare deploy.sh defaults to api worker
only), its /healthz carries no commit so post-deploy curl the live privacy page and grep
the 30-day sentence. Mobile copy ships via EAS (store-gated); the stale-copy window is
UNDERSTATEMENT-safe (old copy says "cannot be undone" while restore exists) — close it
with an OTA JS update rather than waiting on store review.

PROD BASELINE NOTE: prod already runs 3584ccb11 (fork 2's owner-directed pushes tonight,
staging-verified, --force past a CI red owned by since-fixed gates). The push delta is
HEAD minus that. JWT_SECRET is now REQUIRED on api+worker per env (validator refuses
boot — already set staging+prod; a missing one crash-loops). If staging P3009s: known
shape — stray unfinished \_prisma_migrations baseline row; mark finished.

1. Push main → staging deploy → staging /health commit == HEAD.
2. Staging smoke: naive-column count → 0 (timestamptz proof), create-poll (Gemini
   degrade), delete-account→restore round-trip (crosses Clerk), photo upload
   (Vision moderation path — staging has GOOGLE_VISION_API_KEY), access payload
   carries billingRail.
3. Prod deploy → /health commit == HEAD.
4. **THEN AND ONLY THEN**: run `yarn ts-node scripts/cloudinary-setup.ts` against the
   live Cloudinary env (flips presets to moderation:'' — flipping before prod runs
   the new code would strand uploads on the old aws_rek wait). One Cloudinary env
   serves all — this is the point of no return for the moderation cutover.
5. Optional cleanup after preset flip: de-register the Rekognition add-on in the
   Cloudinary console (nothing breaks if left).

## Master POST-deploy checklist

0a. Post-boot scheduler proof (account-deletion): confirm the purge + retention jobs
are REGISTERED on the worker scheduler (not merely that the worker is up) — a purge
that never runs is silent. Fork 2: run-launch-gate --lang es (~98.7 expected) +
parity-check es p95. Payments: RC dashboard test-webhook → 200 + TEST event-log row
(no grant); Stripe portal session mint → URL carries https://craveapp.ai; watch
external_subscription_id non-user-scoped count staying at 0 (currently 1 known TEST
fixture row, disposition pending). 0. SEQUENCED DATA OPS (extraction): prod ghost recovery — scripts/reground-ghosts.ts
--limit=100 (measure) → remainder + --tombstone-closed (Places spend; comparator
screaming EXPECTED per D149); ONE RUN_FULL_PROJECTION_REBUILD=1 worker one-shot;
measure chooser first-set acceptance on prod ledger. Tom tom: wipe prod
probed_regions (~4 rows, cache); pg_stat_activity ≤~30 now AND after the 03:00 UTC
burst. Account-deletion: staging/prod throwaway delete→restore; run
`yarn test:db --testPathPattern person-data-coverage` against real corpus; watch
for ACCOUNT_DELETED 403 on any route other than restore. Search: confirm
unsegmented-residue drain runs (82 rows pending, oldest 08-04); re-run naive-column
count on prod+staging.

1. /health on api + worker: commit == HEAD, appEnv correct.
2. Photo upload end-to-end in prod (Vision verdict arrives, photo goes live);
   confirm a `google_vision` line appears in api_usage_ledger.
3. Ops alerts: confirm the expected-spend comparator ran at its 04:10 cron and
   the vendor-quota watcher at :00 — rows in ops_alerts (or clean silence + logs).
4. Sentry: no new error class in the first hour (the 8:05 triage job also covers this).
5. Owner sim pass (separate sitting): Manage-subscription three doors, price on
   cards, delete→restore flow.
6. Session-specific items — appended from reports.

## Coordination round 3 (2026-08-08): adversarial results routed

The two coordination red-team lanes returned 10 findings; every one routed to its
owning session WITH the ideal-shape fix (no guards, per the owner's standing
directive) and recorded F9955-F9968 in audit/FINDINGS.md. Highlights: the RC
TRANSFER path had two HIGH money defects (a transfer to an unsynced account
permanently revokes the payer; the subscription row never re-keys); a deleted
account reached 7 routes not 1; the poison-precedence was pinned by nothing (now
16 tests). A plans-vs-reality audit lane (owner-proxy) is out; tom tom owes the
cost/account-deletion corroboration dump for the two stale sessions.

## Durable lesson of the round (03's self-diagnosis, verbatim-worthy)

"I verified the case in front of me and wrote the general sentence." Three
instances in one territory (the vacuous watchdog, the four-named-calls promise
spec, the 'every authenticated route refuses' claim). The countermeasure is the
property-not-list rederivation now landing.

## Red-team ledger for this deploy

Already adversarially verified (2026-08-07, all passes recorded in audit/DESIGNS.md
D142–D145 + the evening cycle): search core, entitlement wall, usage ledger,
governance rebuild (post-fix), person-data erase/export/census, Vision seam, photos
destroy machinery, billingRail + dispatch, nav/overlay session core, tracksheet
(read-only), gate-runner library (17-way self-test). Pending: whatever sessions
request in their reports.
