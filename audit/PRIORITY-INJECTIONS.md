# PRIORITY INJECTIONS — findings from the pre-audit foundation review

Source: the 3-lens foundation audit of 2026-08-02 (see memory
`foundation-audit-2026-08-02`), verified still-open against the live tree on
2026-08-03. These are NOT in `FINDINGS.md` yet — the territories that own them
have not been reached, or the pass through them did not surface these.

**Orchestrator: treat these as seeded findings.** Run the full ladder on each
(descend to bedrock, rederive, red-team the design, delete what it obsoletes,
mutation-prove). Do not fix them as guards. Two of them are escalations, marked.

---

## I1 | api-core | `apps/api/src/config/configuration.ts:44,50` + `app.module.ts`
**BOOT-TIME CONFIG VALIDATION DOES NOT EXIST.** 197 env vars are read across
api+worker; `ConfigModule.forRoot` has **no `validationSchema`** (verified: 0
occurrences), and `configuration.ts` contains zero `throw`. The API boots with
every secret undefined.

Worst instance, verified live: `getDatabaseUrl()` falls back to
`postgresql://postgres:postgres@localhost:5432/crave_search`. A deployed
container with a missing/typo'd `DATABASE_URL` does not refuse — it silently
tries localhost. `JWT_SECRET`, `CLERK_SECRET_KEY`, `STRIPE_SECRET_KEY` are all
`process.env.X` with no assertion. `SIGNAL_AUDIT_HMAC_KEY` unset → vote-integrity
hmacs are silently OMITTED and the data loss is permanent by the time the report
says "provenance: unknown".

Ladder note: the bedrock question is "what does this process REQUIRE to be
itself?" — the ideal makes booting without it impossible, gated on
`isDeployedEnv()` so a laptop still starts. Do NOT schema all 197 (that is how
config schemas rot); schema the ~15 whose absence is an incident.
Counter-example of the right shape already in-repo: `ops-token.guard.ts` fails
closed and says so.

RELATED, already approved as F401: `CRONS_ENABLED` not using `env-flag.ts`. Same
disease, and `env-flag.ts` is the half-built foundation — finish it.

## I2 | messaging | `apps/api/src/modules/messaging/share-package-resolver.service.ts:118`
**A SECOND, DIVERGENT LIST-ACCESS AUTHORITY.** `viewerCanSee` is computed inline
as `owner || visibility==='public' || list.shareEnabled || collaborator`.
`shareEnabled` ALONE grants the preview (list name + item count) to any viewer
holding the listId — no slug presented. The canonical authority
(`user-list-access.policy.ts:76-89`) says the SLUG IS THE CAPABILITY and returns
404 for exactly this case. Two authorities, live disagreement.

**ESCALATE — owner decision required.** The product question: should a list
shared into a DM be previewable from the message alone (the message is the
capability), or must the share package carry the slug? The answer decides
whether the fix is "call the policy" or "thread the slug through the share
package". Do not pick one silently.

## I3 | external-integrations | `spend-analytics.service.ts:31` (`workClass: string`)
**A CROSS-MODULE STRING CONTRACT THAT PRODUCES WRONG MONEY.** `workClass` is a
bare `string`, is a DB compound key (`workClass_unit`), and is declared twice
(`GEMINI_BACKSTOP_WORK_CLASS` in spend-analytics AND governance) then read as
bare literals elsewhere (`ops-summary.service.ts:299,589`). A typo does not
error — it creates a silently-orphaned ledger row, i.e. wrong COST numbers. This
is the same class as the $118 lesson (summing the wrong column) one level up.

Ideal: an exported `WorkClass` union + `Record<WorkClass, T>`, with the
`google_places.${skuLabel}` family expressed as a template-literal type or a
constructor. NOTE the migration hazard: existing DB rows must match the union you
declare, or the ops dashboard silently drops history — verify before landing.

Same shape, same territory: `PlacesOperation` exists as a union but
`rate-limit-coordinator.service.ts` still takes `operation?: string` and config is
an untyped literal, so the vocabulary is enforced by a spec reading source text
rather than by the compiler.

## I4 | identity | `account-deletion.service.ts` + `prisma/schema.prisma`
**THREE COMPETING DEFINITIONS OF "USER DATA", BECAUSE DELETION IS SOFT.**
`users` is anonymized in place (`deletedAt` + null the columns), so **no FK
cascade ever fires on a real account deletion** — the 63 `ON DELETE CASCADE` FKs
are dead code on that path. That is WHY three hand-maintained lists exist: the
staging scrub's column-name regex, this service's explicit delete list, and
`preserved-anchors.sql`.

Live gap, verified: deletion does NOT sever `signal_actors.device_key` (0
references to signalActor in the service), nor `signals.subject_text` /
`…unsegmented_residue.residue_text` — raw typed search text and device
fingerprints, which the staging scrub itself classifies as hard PII. The model
comment calls this "the severable deletion story"; the severing is never
performed.

Ideal shape (agent-vetted): a `user_identity` table holding
email/username/display_name/avatar/auth_provider ids/onboarding_responses that is
**HARD-deleted** on account close, with device/fingerprint/free-text tables
FK'd to it. `users` keeps the surrogate id + `stripe_customer_id` + timestamps
and never dies, so content attribution and financial audit survive structurally.
"Deleted" becomes `NOT EXISTS(user_identity)` — a join, not a remembered
`deletedAt: null` at ~19 call sites.

**ESCALATE the migration plan** before landing: it moves columns users depend on
and changes what "deleted" means to every reader. The redesign is right; the
cutover is an owner call.

## I5 | cross-cutting | the recurring root cause
**NO MANDATORY DECISION POINT FOR "WHO MAY SEE THIS ROW."** 309 raw
`prisma.<model>.find*/count` calls across 106 files, zero chokepoints. Blocking
(19 sites), soft-delete (32 reads), moderationStatus (7), list access (25 raw
reads vs 8 policy calls) — every rule is remembered, and three block-filter holes
were patched individually on 2026-08-02 alone.

Recommended shape (heavy options already REJECTED with reasons — do not
re-propose): NOT Prisma `$extends` (no ambient viewer carrier; crons need a
SYSTEM escape that becomes the default), NOT row-level security (pooled
single-role; slug-capability is not a row predicate), NOT a repository layer (a
1,804-line framework was deleted 2026-08-02 for serving one findUnique).
Instead: a viewer-scoped table registry + ONE jest architecture test, seeded with
today's call sites so it is green on day one. Its value is that the NEXT read
must either use a seam or write its name and reason. Reinforce with the pattern
that already works — `photos.module.ts:41` does NOT export the raw read service,
which is the load-bearing part of the only real seam in the codebase.

Known still-open instances to sweep with it: `GET /photos/:photoId` (third door
around the photo seam), autocomplete user results ignore blocks,
`user-notification-feed.service.ts:66-79` filters the JOIN not the rows (blocked
peer still occupies a feed slot), `polls.service.ts` thread read omits
`moderationStatus`.
