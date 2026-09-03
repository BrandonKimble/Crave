# The alias clean slate — execution kit

Binding spec: [plans/alias-clean-slate.md](../../../../plans/alias-clean-slate.md).
Owner-approved program; each EXECUTION still gets a manifest approval.
Staging first, always. The zeroth principle: `entity_surface` is a
PROJECTION of testimony + judgments + speculation — this kit is the proof.

## Order of operations

1. **wipe.sql** (dry-run first, read the counts, then `-v execute=1`) —
   deletes all surfaces + redirects, un-archives merge losers for
   re-hearing. Never touches documents, events, grounded restaurants,
   anchors, or the claim_verdicts ledger.
2. **backfill-observed.ts** (dry-run, then `--execute`) — re-derives
   `observed` surfaces from the active generation's stored raw_output. $0.
   The pairing bar is identity-by-construction (fold equals the event
   entity's identity key, exactly one match per input) — judge-earned
   associations re-earn through hearings, never resurrect here. Known
   scope of `--replace`: it demotes stale observed rows only on entities
   the current derivation touched; an entity that lost ALL observed
   support keeps its rows until the next full wipe or a widened pass.
3. **Convergence sweeps** — the nightly place sweep + food dedupe re-hear
   every twin under current rules (owned-domain test, accent veto), fully
   ledgered. Run `sweepSameNameDuplicates` passes until merged=0 (the
   activate-shadow twin loop does exactly this), or let the nightly crons
   drain it.
4. **Vocabulary sweeps** per locale re-pay `recall` surfaces (standard
   one-re-pay-per-bump price). Cross-word `judged` aliases start EMPTY and
   accrue only through hearings.
5. **Verification** (below) + the search-harness gates.

On every later generation activation, `backfill-observed.ts --execute
--replace` is a standard step: observed spellings follow the extraction
generation (the generation-following law).

## Verification queries

```sql
-- 1. Grade census: recall must dominate; every judged row carries origins.
SELECT claim_grade, count(*) FROM entity_surface
 WHERE status = 'active' GROUP BY 1;
SELECT count(*) AS judged_without_origin FROM entity_surface
 WHERE claim_grade = 'judged' AND origin_claim_key IS NULL;  -- must be 0

-- 2. The ratchet class is gone: no active alias equals another live
--    same-type entity's name with identity authority (was 640).
SELECT count(*) FROM entity_surface s
  JOIN core_entities own ON own.entity_id = s.entity_id
  JOIN core_entities other
    ON other.type = own.type AND other.status = 'active'
   AND other.identity_key = s.form_folded
   AND other.entity_id <> s.entity_id
 WHERE s.status = 'active' AND s.claim_grade <> 'recall';

-- 3. Every merge since the slate has a hearing (was 93% unledgered).
SELECT count(*) AS unledgered_merges
  FROM entity_redirects r
 WHERE NOT EXISTS (SELECT 1 FROM claim_verdicts v
                    WHERE v.lane = 'place_merge'
                      AND v.claim_key LIKE 'place|' || r.from_entity_id || '|%')
   AND EXISTS (SELECT 1 FROM core_entities e
                WHERE e.entity_id = r.from_entity_id AND e.type = 'place');

-- 4. Platform mega-merges cannot recur: no owned domain carried by
--    impure brand clusters (spot-check the survivors).
SELECT canonical_domain, count(*) AS places, array_agg(name ORDER BY name)
  FROM core_entities
 WHERE type = 'place' AND status = 'active' AND canonical_domain IS NOT NULL
 GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC LIMIT 20;

-- 5. New events carry a resolution trace (metadata is never {} again).
SELECT count(*) AS untraced FROM core_restaurant_entity_events
 WHERE created_at > now() - interval '1 day'
   AND (metadata IS NULL OR metadata->'resolution' IS NULL);
```

Probes to re-run after regeneration: bubbles (must not route to boba tea),
Mandala (must not reach Mandola's), mole vs mole plate, breakfast
croissant — all four are pinned in
`scripts/fixtures/entity-match-gold-cases.json` and certified by
`scripts/entity-match-gold.ts`.

Rule of conduct: if regeneration exposes a judgment gap, fix the RULE and
re-hear (version bump) — never hand-edit rows.
