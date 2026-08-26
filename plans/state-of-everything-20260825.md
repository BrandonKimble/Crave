# State of everything — 2026-08-25

One page to re-catch-up. Built by reading every plan touched in the last 45 days in full, mapping the last 60 commits to them, and skimming the older corpus (which was already reconciled with banners on 2026-08-19, commit 9b4fcc96e).

**Where you are in one sentence:** the v16 prompt run happened (Austin-only, $11.89, quarantine leak found and fixed), two deep audits of its output landed tonight, the iteration bench (S1–S3) is built, and the next real moves are all yours: read the two v16 verdict docs, decide activate-vs-v17, and work the checkpoint list below.

---

## 1. Active plans — status table

| Plan | Status | What's open |
|---|---|---|
| **v16-and-beyond-roadmap.md** (the master) | ACTIVE — Phase 0 done, Phase 1 (shadow) RAN | Checkpoints ②–⑥ all still yours: diff review verdict, post-v16 DB re-audit, language-wave estimate, ladder session, track-visual sitting |
| **v16-program.md** (run plan) | ACTIVE — shadow executed, review phase NOW | Phase 2 named checklists partially verified; Phases 3–5 (fresh-eyes audit → activation epoch → post-activation docket) not started. Activation needs your GO |
| **v16-trace-audit-20260825.md** (NEW, untracked) | DONE — the verdict doc | v16 is a big win but: short praise still dropped (~400–600 places order-of-magnitude), fact-ask picks leak, praise-flag-on-dish rows 8%, cuisine-in-categories 394 rows, "american" noise. These are the v17 prompt agenda |
| **v16-grounding-investigation-20260825.md** (NEW, untracked) | DONE — mechanism proven | The Luckys→Lefty's wrong-restaurant bug is the MODEL mis-canonicalizing names (~1.3–6.8% of docs). Fix = v17 prompt + emit observed-name provenance. Also: Cheko's→Tex Mex Joe's is a separate pre-existing bad MERGE that needs un-merging |
| **iteration-bench.md** | BUILT — S1+S2+S3 landed (dc808e082, 4fe932db5, 4da52c224) | Optional next: probers for 3 more lanes, bench-owned arm/disarm verbs. Not owed |
| **red-team-2026-08-19.md** | CAMPAIGN CLOSED — 5 fix waves + R14 class-closer landed | Standing docket remains (see open items); mobile findings-only docket needs a ruled pass |
| **iteration-phase-open-items.md** (the big ledger) | LIVE — the search/extraction open-item home | A1 admission ladder (rides checkpoint ⑤), negation cue list final word, C3 synergy capstone, pre-launch ship checklist §D, C2 curation recipes |
| **taxonomy-rederivation.md** | MOSTLY EXECUTED — R14/R15 landed, incidents closed | Phase-2 audit tasks unchecked (word-role facet audit, ASK_FRAME retirement confirm); venue-axis semantic flip waits for roadmap Phase 3 |
| **prompt-fleet-audit.md** | LARGELY DRAINED — P7 closed, versioning landed | Dedupe docket (chili triplicate, 179 pairs) gated behind activation; retraction lane (326-collision) unexecuted |
| **rhino-prompt-audit.md** | DONE — full coverage round 7, P1b pinned | Standing debts: parent-category gold pins (pre-C.3), drift band watch, pre-shadow re-cert at rename boundary |
| **shadow-sandbox.md** | LANDED — but the v16 run proved the batch path leaked | Leak fixed + pinned (357273e58); staging cleanup of 339/943 leaked rows rides rejection-sweep or activation |
| **open-items-ledger.md** (UI/track queue) | LIVE — the only home for the mobile/transition queue | Section A: owner device sitting (blocks the most). B7/B8 prewarm + image pipeline reads running. C15 banner check, C16 doubleness audit |
| **poll-supply-rederivation.md** | ENTIRELY UNEXECUTED | 5 live bugs, 16,226 poisoned rows. Waiting on YOUR sequencing decision |
| **knowledge-attributes.md** | DESIGNED, ratified into roadmap Phase 4/5 | Pilots ride the language wave; continue-or-kill per pilot is yours |
| **reextract-choreography.md** | DOCTRINE — partially superseded by the bench for iteration runs | reextract.sh now labeled the escape hatch; bench.sh is the front door |
| **observability-overhaul.md** | UNBUILT AND UNTRACKED (banner 08-19) | Adopt or close explicitly — only Sentry is real |
| **gemini-consumption-modes.md** | UNBUILT AND UNTRACKED (banner 08-19) | ~$7/load flex-tier prize sits in no ledger — adopt or close |
| **production-hardening.md** | LARGELY SUPERSEDED | Pre-launch checklist lives at iteration-phase §D instead; prod frozen until ideal-shape declared |
| **strip-choreography / skeleton-path audits** | FIXES LANDED | Your 08-07 "still bad" verdicts PREDATE the fixes — re-test rides checkpoint ⑥ |
| Everything older (map, transitions, polls builds, search cutovers, ~55 files) | SUPERSEDED / HISTORICAL — banners applied 08-19 | Nothing open except: restaurant-profile-revamp is DORMANT-INTENTIONAL (your pin, resume point intact) |

---

## 2. Consolidated OPEN ITEMS (deduped, by who moves next)

### Yours (owner decisions / eyes)
1. **v16 verdict** — read the two 08-25 docs; decide: activate v16 as-is, or v17 first (short-praise fix + observed-name provenance + fact-ask tightening). (v16-program Phase 2/4; trace-audit; grounding-investigation)
2. **Checkpoint ② diff review sign-off** — the review sheet items partially verified by the audits; closure must be recorded before activation. (v16-program)
3. **Retail brand scope-tightening confirm** — ~19% of v16 "lost entities" are brand→store tightenings needing your OK. (red-team-2026-08-19 §v16)
4. **Poll-supply rederivation sequencing** — unexecuted, 5 live bugs, 16,226 poisoned rows. (poll-supply-rederivation)
5. **A1 admission ladder session** (checkpoint ⑤) + negation cue-list final word (rec: keep). (iteration-phase §A)
6. **Track-visual punchlist sitting** (checkpoint ⑥): strip/skeleton re-test post-fix, doubleness audit, device-sitting list A1–A5. (open-items-ledger §A)
7. **Language-wave estimate approval** (checkpoint ④) — one number, all locales. (roadmap Phase 4)
8. **Mobile P0 rulings**: double-mounted polls/home feed runtimes (2× fetches/sockets), 120Hz frame-budget class, account-switch cache leak, scroll-restore dead. Findings-only; needs a ruled fix pass. (red-team-2026-08-19 mobile sections)
9. **Adopt-or-close**: observability-overhaul, gemini-consumption-modes (both unbuilt, untracked). D4/D5 policy questions (script spend gates). (red-team docket)
10. **OA10 view-mode migration + PollCard visual calls** — priced, awaiting your GO. (open-items-ledger §B10–11)

### Agent work, queued behind your decisions
11. Post-activation docket in order: activation GC → M3 generic-word sweep → dedupe un-gate + docket (incl. un-merging Cheko's) → retraction lane → language wave → knowledge-attribute pilots. (v16-program Phase 5)
12. Staging cleanup of the v16 quarantine leak (rides rejection or activation). (red-team §v16)
13. Location-row repair sweep (19 FK-disagree + 327 multi-primary rows found in fix wave 3). (red-team fix waves)
14. Venue-axis semantic flip + full button row (roadmap Phase 3, post-activation).
15. C3 synergy capstone + calibration law; C2 curation recipes; pre-launch ship checklist §D (trigger: you declare ideal shape). (iteration-phase §C3/§D)
16. Taxonomy phase-2 audit tasks (unchecked boxes). (taxonomy-rederivation)
17. Prewarm payload + image pipeline builds (reads were running). (open-items-ledger §B7–8)
18. Bench nice-to-haves: 3 more lane probers, bench-owned arm/disarm. (iteration-bench)
19. Derived-index partial-collapse prior; dedupe budget gate G2 before flag flip; standing docket small items (G1/G3/D6/D10). (red-team docket)

---

## 3. Trackers / runbooks found

| File | What it is | State |
|---|---|---|
| plans/v16-and-beyond-roadmap.md | THE coordination file — phases + your 6 checkpoints | Live, current |
| plans/v16-program.md | The v16 run plan with named verification checklists | Live, current |
| plans/iteration-phase-open-items.md | The search/extraction open-item ledger ("nothing forgotten") | Live, big, current |
| plans/open-items-ledger.md | The ONLY home for the UI/transition/track queue | Live — note it and the file above never cite each other |
| plans/red-team-2026-08-19.md | Red-team campaign ledger + standing docket + v16 run record | Live |
| plans/iteration-bench.md | Bench design + build stages | Live |
| plans/v16-trace-audit-20260825.md, v16-grounding-investigation-20260825.md | Tonight's two verdict docs | **UNTRACKED — not committed yet** |
| product/launch-runbook.md | Ordered path to Austin launch, gated phases | Parked until ideal-shape declared |
| product/pre-launch.md | Truly-data-gated checks only | Parked; partially superseded by launch-runbook |
| scripts/rig/bench.sh | The iteration bench front door | New, live |
| scripts/rig/reextract.sh | Now the labeled escape hatch (bench is the front door) | Live |
| scripts/rig/ (deploy, cost-reconcile, staging push/refresh, sim-target, reload) | The operational rig | Live |
| INVARIANTS-RED.md (repo root) | Nightly-invariants red flag file | ABSENT = nightly is green |
| Root: PRD.md, BRD.md, CRAVE.md, copy.md, stories.md | Stale originals (April-era) | Superseded by product/ + business/ |
| plans/creation-key-accent-veto.prepared.md | Held-fix record | Applied 08-12, record only |

No empty/unfilled tracker stubs found — the smallest recent files are all real. The one hygiene item: **commit the two untracked v16 docs** so they can't be lost.
