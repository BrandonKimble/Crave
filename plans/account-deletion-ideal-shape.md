# Account deletion — the ideal shape (owner-ratified 2026-08-03)

Research brief: Apple 5.1.1(v) + its support page, GDPR Art. 17, CCPA 1798.105
/1798.140, EDPB draft Guidelines 02/2026 on Anonymisation, and the published
deletion policies of Reddit, Discord, Strava, Yelp, Untappd, Letterboxd.
Sources are cited in the session record; this file is the DECISION.

## What the law actually requires (less than assumed)

- **Apple** requires real in-app deletion (not deactivation), easy to find, no
  "email us". It **explicitly allows a disclosed grace period**, and defers
  retention questions to privacy law. It mandates exactly one third-party act:
  revoking Sign in with Apple tokens.
- **GDPR/CCPA** permit retaining: legally-required financial records, the
  RECIPIENT's copy of a message, and public content the user authored (freedom
  of expression / free speech carve-outs) — **provided identity is severed**.
- **Pseudonymous ≠ anonymous.** A persistent actor id is personal data. The
  EDPB standard requires defeating singling out, linkability, AND inference.

## Owner rulings (2026-08-03)

| Class | Ruling |
|---|---|
| Photos | **KEEP, anonymized.** ⚠️ Requires a ToS content licence — LAUNCH BLOCKER. |
| Polls, poll comments, endorsements | KEEP, anonymized (+ optional "delete mine too" checkbox in the flow) |
| Private saved lists | HARD DELETE |
| DMs | delete the sender's copy; the recipient keeps theirs, de-attributed |
| Username | **BURN permanently** (impersonation risk beats namespace reuse) |
| Billing records | RETAIN 7 years, minimized to what tax/AML needs |
| Push tokens / device fingerprints | DELETE immediately (done 2026-08-02) |
| Blocks | retain de-identified as a safety record |
| Signals (raw text + viewport) | DELETE raw; keep only a truly anonymized aggregate |
| Ban evasion | keep a SALTED ONE-WAY HASH of email/device; never the reversible original |
| Mechanics | **logically instant, physically deferred: 30-day grace, then hard purge + processor propagation + confirmation email** |

## THE FOUNDATION — built 2026-08-03

`crave_person_data_map()` (SQL function, migration
`*_person_data_map*`) is **the one definition of "a person's data"**, because
its consumers are both SQL and TypeScript and a definition that cannot be
shared gets copied. It classifies every table carrying a person column:

- `person` (39) — the row IS the person's data → delete per-user; truncate wholesale
- `authored` (6) — content the community built on → keep the row, sever the author
- `root` (3) — `users` itself, handled explicitly by each caller

This replaces THREE disagreeing definitions: the deletion service's
hand-written `deleteMany` list, the staging scrub's regex, and
`preserved-anchors.sql`'s hand-enumerated union. The disagreement was not
hypothetical — deletion never severed `signal_actors.device_key` or
`signals.subject_text`, which the scrub itself classifies as hard PII.

**Law: extend the PATTERN or the CASE, never a caller-side list.**

## THE OPEN DESIGN DECISION (needs owner sign-off before build)

All four author columns are `NOT NULL`:
`photos.user_id`, `poll_comments.user_id`, `poll_endorsements.user_id`,
`messages.sender_user_id`. Anonymize-in-place therefore needs one of:

**Option A — make them nullable, readers render "Deleted user" on null.**
Honest (no fake rows), but it creates a NEW law every reader must remember:
"handle a null author." That is precisely the disease this codebase keeps
curing — `deletedAt: null` is already remembered at 19 call sites and was
forgotten in notification-device reads.

**Option B — a Ghost User sentinel row (RECOMMENDED).** One reserved,
non-addressable user row; authored content repoints to it on deletion.
Readers keep working unchanged — no new remembering, no null-handling law.
Precedent: GitLab's Ghost User. Cost: the sentinel must be structurally
non-addressable (cannot be followed, messaged, blocked, or surfaced in
search/autocomplete), which is a small, testable set of guards rather than a
rule spread across every read.

Recommendation: **B**, because it adds one bounded invariant instead of one
unbounded obligation.

## REMAINING BUILD (ordered by risk)

1. **Signals anonymization** — highest legal exposure, and INDEPENDENT of the
   deletion work. Raw typed search text + a neighborhood-sized viewport +
   timestamp keyed to a persistent actor id is re-identifying. Build the
   anonymized aggregate as a SEPARATE table (drop actor id, coarsen location
   to a cell with a k-anonymity floor, bucket time to the day, keep only
   queries seen from k+ distinct actors) and repoint ranking at it, so ranking
   never reads rows that must later be deleted. Do this even if deletion slips.
2. **Ghost User + rewire `account-deletion.service.ts` onto the map** —
   delete `person` rows, repoint `authored` rows, hard-delete identity.
3. **Grace period mechanics** — logical erasure at confirm (sessions revoked,
   profile hidden, content de-attributed, push tokens deleted), 30-day restore
   key, hard purge on expiry.
4. **Processor propagation** — Clerk (+ SIWA token revocation), Cloudinary,
   Expo, Sentry, RevenueCat. Apple mandates the SIWA revocation specifically.
5. **`preserved-anchors.sql` reads the map** instead of its own union.
6. **ToS content licence for photos** — LAUNCH BLOCKER; the retention ruling
   above depends on it.

## What is NOT changing

`users` stays as the anonymized shell so content attribution and financial
audit survive — this is the industry pattern (Reddit, Discord, Strava) and is
legally sound. The defect was never the pattern; it was that the personal data
in OTHER tables did not actually die, and that three lists disagreed about
which tables those were.
