# Account deletion — the shape, as built (F9970 truth rewrite, 2026-08-07)

This file was written on 2026-08-03 as a PLAN, while the design was still
open. It stayed unchanged while the thing it described was built, rederived
twice, and then rederived again — so by 2026-08-07 it named a dropped SQL
function as "the foundation", presented a decided question as needing sign-off,
and carried an addendum superseded the same day it was written.

It is now a description of what EXISTS. The dead options are kept, marked, at
the bottom: a plan that deletes its own history stops being able to explain why
the shipped thing looks the way it does, and every one of those options was
discarded for a reason worth not rediscovering.

Research base (unchanged, still the citation): Apple 5.1.1(v) + its support
page, GDPR Art. 17 / Art. 15 / Art. 20 / Art. 5(1)(e), CCPA 1798.105 / 1798.140,
EDPB Guidelines 02/2026 on Anonymisation, and the published deletion policies of
Reddit, Discord, Strava, Yelp, Untappd, Letterboxd.

---

## The shape

**Deletion is two phases, and the split is the whole design.**

| | |
|---|---|
| `deleteAccount()` | THE REQUEST. Reversible. Cancels web billing, revokes Clerk **sessions**, stashes the identity and blanks the visible name, marks `deletedAt` + `purgeDueAt`. Destroys nothing. |
| `purgeAccount()` | THE DEADLINE, 30 days later. Irreversible. Destroys the Clerk identity, burns the handle, propagates to processors, erases the person. |

The client signs the person out immediately after the request, so they land on
the login screen — the market shape (Discord, Instagram). The closed-account
takeover is reachable only by signing back **in** during the window.

**Restore is an explicit act** (`POST /users/me/restore`, `@AllowDeletedAccount`).
It was once a side effect of `syncFromClerkClaims`, which the auth guard calls on
every request — so a background refresh could un-delete an account nobody meant
to bring back.

**A deleted account is a non-identity, and that law is a PAIR:**
`ClerkAuthGuard` REFUSES it (403 `ACCOUNT_DELETED`, carrying the deadline);
`OptionalClerkAuthGuard` treats it as ANONYMOUS. Both halves are required — for
a while only the first existed, and a closed account stayed a personalized
viewer on six public GETs (F9964).

---

## The foundation

`PERSON_DATA_RULES` (`person-data-class.ts`) — a **declaration**, one rule per
person-shaped column, stating what happens to it. Census enforces total
classification: an unclassified person-shaped column reds the build.

`person-data-scope.ts` — **the compiler**. The declaration says WHAT; this is
the single place that turns it into SQL. Three consumers (eraser, exporter,
retention sweep) ask it rather than each deriving their own answer, which is
what they used to do and where every defect lived.

The rule type is a **discriminated union**: each disposition carries exactly
what it needs. Six illegal states are rejected by the compiler rather than by a
test — a `retain` with no horizon, a horizon with no unit, an acting rule with
no locator, two locators at once, a `retain` carrying a scope, a kept column
with no stated basis.

Dispositions: `delete_row`, `sever`, `null_column`, `retain`,
`anonymized_by_shell`, `not_person`.

Derived from the same declaration, never re-listed:
- **erasure** (`person-data-eraser.service.ts`) — order is load-bearing:
  `delete_row` → `null_column` → `sever`, because severing `signal_actors`
  destroys the mapping `signals.subject_text` is scoped through.
- **subject access / portability** (`person-data-export.service.ts`, Art. 15/20)
- **retention horizons** (`retention-horizon.service.ts`, Art. 5(1)(e)) — every
  retained column states how long, and `'indefinite'` is a word you have to type.

---

## What survives, and why it is lawful

Community content — polls, comments, endorsements, photos — survives with
authorship severed. Hard deletion would tear holes in other people's threads.

The right that makes this lawful rather than merely convenient: the **ToS content
licence expressly survives termination** (Section 5.1, irrevocable and perpetual
as to already-posted content). That clause was missing until 2026-08-07; the
survival clause listed only indemnification, disclaimers and liability limits.

Demand evidence survives with the PERSON severed, not the act deleted. Data
*about* the person — onboarding answers, the inferred taste profile — is
deleted outright.

A deleted author renders as **"Deleted user"** through one server-side function
(`publicAuthorIdentity`) and one client type, and person-targeting affordances
refuse. Since D148 the identity columns are blanked at deletion time, so a
forgetful reader renders a blank rather than a name.

---

## The promise and the mechanism must agree

Three artefacts describe deletion to users: the app's delete copy, `privacy.html`,
`terms.html`. They are asserted against the code in the same build
(`account-deletion-promise.spec.ts`), because the defect this whole area was
bought with was a policy promising a 30-day recoverable window while the code
destroyed everything inside the request.

**Deploy ordering is a consequence of that, and it is asymmetric:** api/worker
FIRST, then `apps/site`, then mobile. Site ahead of api republishes exactly that
defect. `apps/site` is a Railway service via `railway.site.json` but is NOT in
`deploy.sh`'s default `(api worker)` — it must be named.

---

## Proofs

The guarantees are DB-backed, not unit-mocked; `yarn test:db` is the gate that
sees them.

- **seed-and-erase** — every acting rule proven to act, against a real database,
  rolled back. Ground truth for the fixture comes from a source INDEPENDENT of
  the rule under test, because the first version built the fixture from the rule
  and so could only ever confirm it.
- **reversibility** — delete THEN restore is the identity function on the
  person's row: every physical column diffed. Replaced four assertions that the
  source did not contain four named calls, which a destructive fifth step of a
  new kind sailed past.
- **erasure order**, **third-party survival** (D146), **the k-floor**, **the
  coverage ledger** (does real data exercise each rule — a production signal,
  distinct from correctness).

**The lesson this territory produced**, recorded because it caused three of its
own defects: *a guard that names its cases is a guard that will miss the next
one.* The dead `check-author-identity` watchdog grepped for a string and matched
only the files it exempted; the "every authenticated route refuses" claim was
verified against one guard and asserted of all; the reversibility proof listed
four calls. Same move each time — verify the case in front of you, then write
the general sentence. Range over the set, or you are only testing your memory.

---

## Superseded — kept so the reasons are not rediscovered

**`crave_person_data_map()` (SQL function).** Named "THE FOUNDATION" in the
original plan. Dropped: it classified by column-name REGEX, and a regex answers
confidently for a column it has never seen. It also mis-classified `signals`,
`messages` and `user_blocks` as delete-the-row, which would have destroyed the
demand ledger, recipients' copies of their own DMs, and safety blocks. It had
zero consumers when it was deleted. Inference survives only as the ADVERSARY:
the census sweeps an over-broad net and fails the build for anything
unclassified.

**The Ghost User sentinel.** The original plan's recommended Option B — one
reserved user row that orphaned content reattaches to, with GitLab as precedent.
Not built, and not needed: the departing person's own `users` row survives
ANONYMIZED and already is the ghost (`anonymized_by_shell`). A sentinel would
have to be kept unfollowable, unmessageable and unsearchable forever; an
anonymized shell is those things by construction. This is the Reddit/Discord
shape. `assertShellIsAnonymous` proves the invariant it rests on.

**The four NOT NULL author columns** (`photos.user_id`, `poll_comments.user_id`,
`poll_endorsements.user_id`, `messages.sender_user_id`) — the original plan's
open question, since anonymize-in-place appeared to need either a sentinel or a
schema change. Resolved by the shell: the column keeps pointing at the person's
own anonymized row, so nothing is nulled and nothing is migrated.

**The signals ADDENDUM** (parallel anonymous demand tables). Superseded the same
day it was written. A table with the actor grouped away cannot compute demand
mass, which is DEFINED per actor (`Σ log2(1 + acts)`) — it can only store a
number baked at promotion time, freezing the recency kernel, kind weights, echo
exclusion, place lineage and window. It disagreed with `demand-mass.reader` on
every one of those axes with nothing failing. The concern was always ONE COLUMN,
so the k-anonymity floor is now the `signal_emittable_terms` VIEW, joined by the
reads that emit text across people. As a database object it caught a leak in
code written by someone who had never heard of the rule.
