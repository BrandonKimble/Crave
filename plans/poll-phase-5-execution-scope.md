# Poll Plan — Phase 5 Execution Scope (gazetteer / entity linking)

> Companion to `community-polls-discussion-driven-collection-plan.md` §6.1/§6.5. Dep: Phase 4A–4C ✅
> (comments exist), shared matcher ✅ (P1.4 — the vocabulary + recall this sits on).

\*\*Status: core ✅ DONE (f1363e20) — live no-LLM highlighting of KNOWN entities in comments. Sandbox

- close-time graduation remain.\*\*

## ✅ Done — the span-scan + comment highlighting

`EntityTextSearchService.scanForKnownEntities(text, types, {marketKey})` — tokenize → 1..N-gram
candidate phrases with char offsets → ONE indexed query for entities whose normalized name/alias
equals a candidate → longest-match dedup. Always-fresh (live table), no LLM, market-scoped
restaurants. Wired into `postComment`/`editComment` (store `PollComment.entitySpans` +
`extractionStatus=highlighted`); `listComments` returns spans for the client to render tappable
highlights + deeplinks. Validated: correct spans + offsets; "breakfast sandwich" → one span (not
split); no-entity comment → none. Scoped to restaurant+food (avoids the §6.5 common-word-attribute
false-link problem — junk attributes are dropped at source by the ontology anyway).

## Remaining

- **5B — Sandbox / provisional projection (§6.1):** UNMATCHED mention spans (a brand-new spot not in
  the graph) are fuzzy-clustered poll-locally ("Joe's"/"Joes pizza" → one provisional row) and shown
  live (NOT in-text deeplinked — can't link what isn't resolved). Junk allowed here (sandboxed +
  reportable). Needs: detect candidate-but-unmatched name spans (the gazetteer finds known ones; this
  needs the residual), cluster, store provisional rows.
- **5C — Close-time graduation (§6.3):** at poll close, the authoritative collection pass resolves
  provisional clusters, runs the plausibility gate, graduates plausible ones to real global entities,
  backfills highlights. Ties into the existing collection pipeline as a `poll_thread` source.
- **5D — Disambiguation/confidence (§6.5, later):** when a span matches multiple entities, pick by
  calibrated confidence. Rare today (chains merge to one entity; market scoping); v1 keeps first match.

## Unblocks Phase 4D (now buildable)

With `entitySpans` populated, the **endorsement leaderboard (4D)** is unblocked via the plan's DEFAULT
**gazetteer-live** signal (§6.2): a comment's spans = the subjects it endorses; a like endorses those
subjects; dedupe `(user, subject, poll)` → `COUNT(DISTINCT user)` → `poll_leaderboard_entries`.
Polarity/sentiment ("X is overrated, go Y") is the §6.2 _upgrade_ (per-comment LLM), not required for
v1 (presence = endorsement, ~95%, corrected at close). So **4D v1 needs NO sentiment** — just project
from spans + likes, then retire the vote tally (§2.4).
