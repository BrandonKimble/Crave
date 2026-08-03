# DESIGNS — proposals, rubric reviews, verdicts

Every Phase-1 design proposal lands here with the orchestrator's rubric
answers and verdict (APPROVE / SEND BACK / ESCALATE). A rejected design
must not be re-proposed in a later round without new evidence.

Format per entry:

## D<N> — <title> (territory, date)

PROPOSAL: …
RUBRIC: unrepresentable? bedrock? blast-vs-invariant? deletes-more? prior-rejection? values-boundary? user-visible/money/data-lifetime? migration?
VERDICT: … REASONING: …

## D1 — RC entitlement translation: closed union, unknown fails loudly (api-identity-money, F101)

PROPOSAL: `reverseEntitlementMap.get(raw) ?? raw` lets an unmapped RevenueCat id BECOME our entitlement code; grants minted under vendor vocabulary are invisible to accessVerdict → a paying customer 403s. Shape: translation returns mapped|unknown; unknown ⇒ record event FAILED + rethrow (RC redelivers); entitlement codes become one closed union; delete the guessed default map.
RUBRIC: makes wrong-vocabulary grants unrepresentable (not merely unlikely); bedrock right (ledger denominated in OUR vocabulary — same bedrock access-verdict already established); blast = RC purchase path; deletes the guessed default (no-fake-estimates law violation); no prior rejection; VALUES/UX: changes failure behavior on the MONEY path and the correct map contents are a product config only the owner knows.
VERDICT: **ESCALATE** (recommend: adopt the shape; owner supplies the true RC↔code map before ship). Orchestrator spot-checked :279/:572 — defect real.

## D2 — @AuthenticationEffect three-value boot marker (api-identity-money, F102)

PROPOSAL: replace boolean bearsRequestUser with 'required'|'optional'|'none'; a route whose ONLY auth is optional must also declare @AllowUnentitled or boot fails naming the route. Agent proved by executed spec that today's audit reports optional-only routes as covered.
RUBRIC: makes the forget-case unrepresentable at BOOT (current correctness is discipline); bedrock = the throwing boot audit itself (already the ratified shape — this completes its honesty); blast = boot-time only, zero runtime behavior change; deletes the lying boolean; no prior rejection; no values/money/user-visible change; migration = mechanical decorator sweep, boot fails loudly if missed.
VERDICT: **APPROVE**.

## D3 — entitlement grant rows get an explicit kind (api-identity-money, F103)

PROPOSAL: CHECK is NAND while the comment claims XOR; both-null = lifetime, so a day-grant that loses grantedDays silently becomes immortal. Shape: explicit kind column ('lifetime'|'days'|'window'), CHECK per kind.
RUBRIC: unrepresentable — yes (the emptiest row can no longer be the most powerful); bedrock right; blast = MONEY-DATA MIGRATION on the ledger.
VERDICT: **ESCALATE** (data-lifetime + money semantics; recommend adopting with a verified backfill mapping).

## D4 — webhook idempotency key from vendor event id, never Date.now() (api-identity-money, F104)

PROPOSAL: synthetic `Date.now()` id makes every redelivery look new. Shape: idempotency key = vendor event id; if a path truly lacks one, content-hash of the canonical payload. RUBRIC: unrepresentable (dup application impossible, not unlikely); bedrock = the event store's identity, right level; blast = webhook ingest only; deletes the synthetic-id branch; no values change (idempotency is correctness, not policy); migration = none (new events only).
VERDICT: **APPROVE**.

## D5 — audience misconfig refuses loudly (api-identity-money, F106)

PROPOSAL: unconfigured-audience check silently skips validation while the SAME FILE states refusal-on-absence law for its dev token. Shape: unknown audience ⇒ throw at verification time (and boot-time check where statically known); simplify the 77-line parser.
RUBRIC: unrepresentable at the seam; bedrock right (config absence is an unknown, not a pass — the file's own law); blast = auth verification errors get louder, correct-config behavior unchanged; deletes parser sprawl + silent branch.
VERDICT: **APPROVE**.

## D6 — one home for gating mode + default entitlement code (api-identity-money, F107/F108)

PROPOSAL: mode and 'premium' default each declared in multiple places that can drift. Shape: single exported constant/config source; all sites import.
RUBRIC: drift unrepresentable; purely deduplicating (deletes copies); the VALUE stays exactly as-is (owner constant untouched — no values-boundary crossing).
VERDICT: **APPROVE** (values unchanged; only the duplication dies).

## D7 — teaser: mechanical dedup APPROVED; seeded priors ESCALATED (F109/F110)

Duplicated 9.9 clamp + cross-app option-id vocabulary get one shared home: **APPROVE**. Teaser seeded priors violate no-fake-estimates on their face, but the teaser is a user-visible product surface whose numbers the owner may have chosen deliberately: **ESCALATE** (recommend delete-or-ratify per the law).

## D8 — reward_photo grants for an undeclared source (F111)

Live ledger rows whose source the code no longer declares. Data archaeology + lifetime: **ESCALATE** (options: re-declare the source enum member as historical; or owner ruling on the rows).

## D9 — moderation verdict adopts the access-verdict sum type (F105)

Same defect access-verdict fixed (boolean forced fail-open). The PATTERN is ratified; the fail-posture flip on moderation's error path is user-visible: **ESCALATE** with strong recommendation to adopt fail-closed-with-named-indeterminate for write-path moderation, availability-wins for read surfaces — mirroring the ratified per-caller policy.

## D10 — delete dead addDays/findGrantByRef (F112) + legal date from one constant (F113)

F112: repo-wide reference hunt done by agent; **APPROVE** deletion. F113: displayed legal date derives from the single version constant already present — text untouched: **APPROVE** (content unchanged ⇒ no owner boundary).
