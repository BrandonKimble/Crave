# Deploy readiness — staging → prod (coordinator: 📌02 red team)

Owner directive 2026-08-07: every session at the ideal end state before the push —
no open items, no fallback/back-compat/dead code, right abstractions. This file is
the single visible surface for that coordination. The coordinator updates it as
session reports arrive; the deploy fires only when every row is READY.

## Session board

| Session                          | Asked      | Status                                           | Open items                                                  | Holds files?                                                |
| -------------------------------- | ---------- | ------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------- |
| 📌02 red team (this/coordinator) | —          | READY — queue empty, all findings terminal       | api-lint promotion (owner call, non-blocking)               | no                                                          |
| 📌01 tom tom (fork)              | 2026-08-07 | AWAITING REPORT                                  | ?                                                           | ?                                                           |
| extraction (fork) — DB audit     | 2026-08-07 | AWAITING REPORT                                  | ghost-campaign residual? judge-v2 owed; janitor unblock ETA | reddit-batch spec, parse-ground spec, maybe main.ts cluster |
| Payments                         | 2026-08-07 | REPORT PENDING — F9806 already FIXED (b4205f24b) | Stripe client rail status; TEST-vs-LIVE keys                | ?                                                           |
| 📌03 Gemini cost                 | 2026-08-07 | AWAITING REPORT                                  | must reconcile with D149 (backstop derivation deleted)      | ?                                                           |
| 📌06 Wave-4 audit (tracksheet)   | 2026-08-07 | AWAITING REPORT                                  | absorb F9400–F9403 (4 LOW)                                  | tracksheet/\*, scene-input-registry                         |
| 📌07 Search                      | 2026-08-07 | AWAITING REPORT (idle since 08-06)               | D79 DTO split disposition                                   | ?                                                           |
| F9470 chip session               | —          | DONE — work adopted+committed (d804d539c)        | none                                                        | no                                                          |
| clearSceneShell chip session     | —          | DONE (committed by its session)                  | none                                                        | no                                                          |
| 📌05 extraction (fork 2)         | 2026-08-07 | AWAITING REPORT (owner: include)                 | overlap-ownership split vs extraction (fork)                | ?                                                           |

## Master PRE-deploy checklist (coordinator-known; sessions append via reports)

1. Working tree clean: every session's files committed; `git status` shows nothing
   unexplained. (Blocked on session reports above.)
2. Full green sweep on the final tree: api jest + mobile jest + both tsc +
   `yarn invariants` (21) + all shell gates (now fail-closed) + `yarn gate:lib-test`.
3. Env verified in Railway (api + worker): GOOGLE*VISION_API_KEY ✅ (set 2026-08-07);
   RESEND_API_KEY + OPS_ALERT_EMAIL ✅ (verified); deleted dials absent ✅
   (GEMINI_MONTHLY_SPEND_FLOOR_USD / GEMINI_BACKSTOP_MAX_USD removed);
   REEXTRACT*\* must be UNSET (confirm — a set value fires a boot one-shot);
   LOCATION_LIFECYCLE_CRON_ENABLED stays unset/off (owner-parked).
4. Migrations in this push (self-apply at container boot, order = timestamp):
   20260807020000_photo_destroy_pending, 20260807030000_deleted_identity_stash.
   Both are lightweight (enum add / nullable column + CHECK) — no parallel-worker
   guard needed per AUTHORING.md. Staging proves them first.
5. Deploy law: `./scripts/rig/deploy.sh --env staging` → /health commit check →
   `./scripts/rig/deploy.sh` (prod refuses unless staging runs the exact commit).
   watchPatterns SKIPPED-trap: deploy.sh checks unconditionally.

## Deploy-sequence bindings (must happen IN this order)

1. Push main → staging deploy → staging /health commit == HEAD.
2. Staging smoke: create-poll (exercises the new Gemini degrade), photo upload
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

1. /health on api + worker: commit == HEAD, appEnv correct.
2. Photo upload end-to-end in prod (Vision verdict arrives, photo goes live);
   confirm a `google_vision` line appears in api_usage_ledger.
3. Ops alerts: confirm the expected-spend comparator ran at its 04:10 cron and
   the vendor-quota watcher at :00 — rows in ops_alerts (or clean silence + logs).
4. Sentry: no new error class in the first hour (the 8:05 triage job also covers this).
5. Owner sim pass (separate sitting): Manage-subscription three doors, price on
   cards, delete→restore flow.
6. Session-specific items — appended from reports.

## Red-team ledger for this deploy

Already adversarially verified (2026-08-07, all passes recorded in audit/DESIGNS.md
D142–D145 + the evening cycle): search core, entitlement wall, usage ledger,
governance rebuild (post-fix), person-data erase/export/census, Vision seam, photos
destroy machinery, billingRail + dispatch, nav/overlay session core, tracksheet
(read-only), gate-runner library (17-way self-test). Pending: whatever sessions
request in their reports.
