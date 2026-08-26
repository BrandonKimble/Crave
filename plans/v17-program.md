# The v17 program — evidence-derived scope and build order (2026-08-25)

Owner mandate: "do it all" — the full v17 iteration, no patches, everything
through the bench. Evidence base (all committed): v16-trace-audit,
v16-grounding-investigation, name-rule-costbenefit, cuisine-system-review,
v16-defect-sizing, forgotten-commitments-redteam, v17-coherence-redteam
(all `*-20260825.md`).

## The change set (post-red-team shape — supersedes the naive sheet)

1. **Names: observed-span contract.** The prompt stops choosing canonical
   names entirely. Schema replaces `place` with `place_observed` (the name
   as written, mechanical lowercase only) + `place_source_id` (SRC enum,
   like `source_id`) — the model states WHERE it read the name, and a name
   absent from that source is a refusable contract violation scoped
   correctly (F1: doc-scoping alone can't catch Luckys→Lefty's because
   chunking packs whole threads into one request). Canonicalization
   (suffix-drop, possessive-strip) moves to code where it is deterministic
   and testable; B.3's unification/consistency clauses are DELETED (zero
   measured benefit, 203 swap pairs + 220 invented names of harm);
   `normalizePlaceNames` regex recovery dies as dead code. Refused rows are
   BANKED, not dropped, and surface as a diff section (F8) — a too-strict
   contract can never close a review green silently.
2. **Short praise: structural fix, not new rules.** The "+1"/no-minimum-
   eloquence rules already exist (A.1); the drops are hedge-rule bleed.
   Restructure A.1/A.2 so a hedge strips exactly its own clause; pin the
   seven failing docs (uroko, "slaps", Jollibee, "iconic", …) as gold cases.
3. **Cuisine: extraction stops emitting dish-side cuisine.** Verified safe
   NOW (F4: zero live connections carry a cuisine id — the column is
   already drained; only 251 v16 mentions lack the place-side twin). The
   dish side is refilled by the knowledge enumerator (first build of
   plans/knowledge-attributes.md, cuisine as facet #1), which must bridge
   the entity-grain/(restaurant,dish)-grain gap via projection. There is NO
   cuisine drain to retire (F3 — it's general tombstone machinery; leave it).
   Search: cuisine becomes ONE concept OR'd across both columns (F5 — a
   naive dual-projection ANDs and gets stricter), and placement must stop
   letting a junk dish named "mexican" outrank the cuisine reading.
4. **general_praise-on-dish: schema split, not refusal.** Refusing would
   delete 2,383 real dish claims (F6). Ideal shape: the response splits
   place-praise and dish-claims into separate arrays so the invalid
   combination is unrepresentable.
5. **Closure/hedge/wrapper compliance: gold pins** (rules exist; model
   breaks them). Geography: no rule exists in either prompt — add the
   community-scope rule with the Fredericksburg/Corpus cases pinned.
6. **Grader first (F10):** prompt-ab.ts folds diacritics and tolerates
   token subsets — it cannot grade the observed-span contract, and 12/105
   gold cases would falsely fail. The grader is rebuilt and re-baselined
   BEFORE any candidate is certified.

## Build order (each stage lands green before the next)

S0. Staging deploy of current main (staging still runs pre-leak-fix code).
S1. Grader rebuild + gold-case re-baseline (F10) + new gold pins
    (Luckys thread, the 7 thin-praise docs, closure/wrapper/geo cases).
S2. Schema + pipeline: observed-span fields, code-side canonicalization,
    banked refusals + diff section, praise/dish array split.
S3. The prompt rewrite (rhino: rederivation at each decision point,
    certification ×3 against the rebuilt grader).
S4. Enumerator build (knowledge-attributes, cuisine facet #1) + the
    grain-bridge projection + search OR-projection + placement fix +
    MARKET MEMBERSHIP AT GROUNDING (ruled 2026-08-26): a grounded place
    outside the community's metro is excluded deterministically from that
    community's corpus — the prompt geo rule was tried, failed 3x cert
    (model treats a day-trip ask's town as in-scope), and was deleted;
    geography belongs to the layer that has coordinates. Sweeps the ~41
    existing out-of-market restaurants.
S5. Bench run: inventory → proofs → owner approval (hash) → replay (~$12)
    → diff (with the refusal section) → review → owner activation call.

## Owner decision queue (from the forgotten-commitments sweep — not v17)

Slug/share pages (every shared link 302s today, launch-blocking);
PaywallScreen web-checkout button (rail built, button absent);
RevenueCat archived-entitlement reconcile before any enforcement flip;
product-doc shipped/planned labels; nightly promises-census adoption;
poll-supply plan sequencing; observability/consumption-modes adopt-or-close.
