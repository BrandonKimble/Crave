# Wave 1-3 conformance audit (§5b mandate) — 2026-07-13

Read-only red-team of the DELIVERED tree against everything the owner said across
waves 1-3. Sources: wave-1 charter (toggle-strip-and-edit-charter.md), wave-2 charter
(wave2-lists-transitions-charter.md), wave-3 charter (wave3-corrections-charter.md),
both finger-test checklists; evidence: toggle-strip-rebuild-ledger.md (legs 2-14),
root-snap-law.md (legs 1-8), media-images-ledger.md, trigger-regression-audit.md,
listdetail-ideal.md, plus cited code spot-checks. No sim this leg — items needing
eyes are marked. NOTHING in the tree is committed.

Statuses: **VD** VERIFIED-DONE (sim/owner/jest-RED evidence) · **DU** DONE-UNVERIFIED
(gates green, no sim/at-scale proof) · **ND** NOT DONE · **OP** OWNER-PARKED ·
**EG** EXTERNALLY-GATED (perf/map session).

**Counts: VD 58 · DU 8 · ND 6 · OP 9 · EG 4** (rows below; superseded rows not counted).

---

## Master table — Wave 1 (toggle-strip-and-edit charter)

| #     | Owner requirement                                                                          | Status | Evidence                                                                                     |
| ----- | ------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------- |
| W1-1  | Frost cutouts per control, derived from child layouts                                      | VD     | Leg 2 auto-FrostCutout; owner wave-1 pass ("strips passed")                                  |
| W1-2  | Edge-to-edge bleed, no white pillars                                                       | VD     | Legs 2-3; owner pass                                                                         |
| W1-3  | Visually infinite overscroll                                                               | VD     | Leg 2 band geometry by construction; owner pass                                              |
| W1-4  | Real scroll physics + warm restore (+ reset on re-present, ratified)                       | VD     | Legs 2-3; owner ratified scrollX; reset scope = feel-check #10                               |
| W1-5  | Continuity across results content swaps (no remount/flash)                                 | VD     | Leg 2 zero-regression conversion, scrollX survives tab flip                                  |
| W1-6  | Strip mounted from first paint (polls snap-in dead)                                        | VD     | Leg 3 snap gate deleted; owner pass                                                          |
| W1-7  | One engine + two mounts (owner-ratified end state)                                         | VD     | Legs 2-3                                                                                     |
| W1-8  | Polls + favorites → header mount, divider BELOW strip                                      | VD     | Leg 3 sim; owner pass                                                                        |
| W1-9  | Placement flip = one-line change                                                           | DU     | Structural claim; never exercised by actually flipping a surface                             |
| W1-10 | ListDetail deferred, then the proving ground                                               | VD     | Activated wave 2; legs 8-11 (7 primitive defects found + closed = the test worked)           |
| W1-11 | World choreography kept on results                                                         | VD     | Leg 2/4                                                                                      |
| W1-12 | Content-only: simple mechanism, exit on press-up, NO skeleton, no map machinery            | VD     | Leg 4 useContentToggle; gap measured 337-655ms polls / 1ms bookmarks                         |
| W1-13 | Quick-fade on content-ready edge                                                           | OP     | Wave-2 §9 "parked with data"                                                                 |
| W1-14 | Pre-fetch first-page permutations                                                          | OP     | Part 8 "later, after the gap is observed" — gap observed, still open                         |
| W1-15 | Toggle declaration trivial ({segments, consequence})                                       | VD     | Leg 2 consequence seam; leg-13 home re-declare proved it ("a declaration away")              |
| W1-16 | Edit in place, no edit page; BookmarksEditList deleted                                     | VD     | Leg 5 (then wave-2 pivot, then wave-3 restore — final state conforms)                        |
| W1-17 | Edit chip = strip citizen, pushes siblings, never squeezes                                 | VD     | Legs 5/7/13/14 (width-grow PASS on fresh bundle)                                             |
| W1-18 | Action row unmounted-until-edit by construction; per-row holes; slide from live scroll pos | VD     | Legs 3/5; leg-7 mirror reverse morph                                                         |
| W1-19 | Morph feel = the 240ms baseline                                                            | VD     | Kept as house tempo (CUTOUT_FADE_IN_MS 240 etc.)                                             |
| W1-20 | Part 8: NO visibility filter; visibility = DISCOVERY never ACCESS; API conformance         | VD     | Leg 6 (transition matrix + specs; API restarted so live); the 2 shipped contradictions fixed |
| W1-21 | Part 8: TWO per-side All lists, never mixed; no scope chip                                 | VD     | Leg 5 verified everywhere                                                                    |
| W1-22 | 4-way switchers (Profile, Restaurant) + inline text sorts                                  | OP     | Explicitly parked as owner design decisions                                                  |
| W1-23 | Two-posture snap law (UI legs)                                                             | VD     | root-snap-law legs 2-4; owner: "snap law passed and feels good"                              |

## Master table — Wave 2

| #     | Owner requirement                                                                                    | Status                                    | Evidence                                                                                                                                                    |
| ----- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W2-1  | §1.1 Edit chip animates in (width/slide)                                                             | VD                                        | Leg 7 engine slot width animation; leg-14 re-verify after §2.1                                                                                              |
| W2-2  | §1.2 Reverse morph = exact mirror                                                                    | VD                                        | Leg 7 retained-actionRow mirror morph                                                                                                                       |
| W2-3  | §1.3 Drag edge auto-scroll                                                                           | VD                                        | Leg 15 sim at scale (15 tiles): bottom-edge hold scrolled the grid mid-drag (video frames)                                                                  |
| W2-4  | §1.4 Drag clamp at header bottom                                                                     | VD                                        | Leg 15 sim at scale: lifted tile pins below the action row while the grid auto-scrolls up (video frames)                                                    |
| W2-5  | §1.5 Fast-grab glitch                                                                                | VD                                        | Leg 7: TWO stacked causes fixed (touch-down activation + ownership arbitration)                                                                             |
| W2-6  | §1.6 Spinner purge app-wide; squircle = only button affordance                                       | VD                                        | UI leg 6 sweep + eslint ban proven RED (11→0); Onboarding/Paywall/CameraCapture flagged out-of-scope (not sheet pages)                                      |
| W2-7  | §2 Delete home edit                                                                                  | SUPERSEDED                                | Wave-3 §1.1 reversed it (Jarvis misread); restore = W3-1                                                                                                    |
| W2-8  | §2 Edit = CHILD PAGE wherever it lives (nav-out, X = Cancel)                                         | VD                                        | root-snap-law Leg 9 (edit-session liveness on the PF chrome clock) + Leg 15 fresh sim: tab bar out, plus→X, dirty X = discard-confirm, restore on exit      |
| W2-9  | §2 Been/Want-to-go regular lists both sides                                                          | VD                                        | Leg 7 (guards deleted, migration); no wave-3 defect filed                                                                                                   |
| W2-10 | §2 Favorites→Lists rename — nav/headers                                                              | VD                                        | Leg 7                                                                                                                                                       |
| W2-11 | §2 Favorites→Lists rename — CODE vocabulary                                                          | **ND**                                    | Explicit charter words; deferred by agents "to a quiet tree" — not owner-parked                                                                             |
| W2-12 | §2 Ellipsis restyle (lucide rows, 5 items)                                                           | VD                                        | Leg 7 + leg-11 sim (menu rows PASS); "Edit" row added by W3 §4                                                                                              |
| W2-13 | §2 "Use your photos" — GALLERY EFFECT                                                                | VD                                        | Media ledger Leg 2 built the service law; Leg 15 sim: My shots ATX flips sparse-own (mid-grid placeholder) ↔ full global, both directions                  |
| W2-14 | §2 Chips display VALUE not axis                                                                      | VD                                        | Legs 7/11/14                                                                                                                                                |
| W2-15 | §2 All tile thinned (no subtext/icon, chevron)                                                       | VD                                        | Leg 7                                                                                                                                                       |
| W2-16 | §2 Custom-rank open question                                                                         | RESOLVED                                  | Answered by wave-3 §1.1 (home edit under My ranking)                                                                                                        |
| W2-17 | §2 Cutout tiles scrapped → galleries instead                                                         | VD                                        | Honored; §1.2 galleries built                                                                                                                               |
| W2-18 | §3 Polls master sort (Time folds into Top, +Today/+This month, Time chip dies, "Default" attributed) | VD                                        | Leg 7 ("Default" was a vocabulary lie — client omitted sort; New = zero behavior change)                                                                    |
| W2-19 | §3 New as default sort                                                                               | VD, veto-able                             | Leg 7; owner may veto (feel-check #5)                                                                                                                       |
| W2-20 | §3 Live · N dynamic; Results → Closed                                                                | VD, "Closed" veto-able                    | Leg 7 + leg-7(snap) sim "Live · 3 / Closed"                                                                                                                 |
| W2-21 | §4 Parents: red plus, page-specific create; non-dismissable                                          | VD                                        | UI legs 6-7 (polls market-gated create, lists openCreateForm); profile plus = OP stub (with profile page)                                                   |
| W2-22 | §4 Plus↔X rotation cw/ccw during transition, from press-up; child→child stays X                     | VD                                        | UI leg 6 + leg-8 §2.3 glyph revert; sim-verified                                                                                                            |
| W2-23 | §4 Nav re-tap extend-only, third tap inert                                                           | VD                                        | Leg 6 jest-RED + leg 7 sim, zero [snap-law] barks                                                                                                           |
| W2-24 | §5 Child-transition primitive: one-beat press-up react, declared skeletons, joined reveal            | VD                                        | Legs 5-7 (chrome clock, SceneBodyReadyGate, joined reveal watchdog jest-RED); sim PASS                                                                      |
| W2-25 | §5 Tab switches: content+header+strip one beat                                                       | VD                                        | Leg 6 warm-flip fix; leg 7 sim                                                                                                                              |
| W2-26 | §6 ListDetail header/meta (list name IS header, flush avatar stack, typed count)                     | VD                                        | Legs 9/11 sim                                                                                                                                               |
| W2-27 | §6 Header ellipsis cutout fade synced with rotation                                                  | VD                                        | Leg 9 Extras seam; exact sync = owner eyeball (feel-check #7)                                                                                               |
| W2-28 | §6 Strip full inventory (Sort/Open now/Price/Market) in-list under meta                              | VD                                        | Legs 9-11 (Open-now plumbed; Price + Market data paths CLOSED after sim caught both lying)                                                                  |
| W2-29 | §6 ResultCard primitive extraction                                                                   | VD                                        | Leg 11 byte-copy pixel-proven (parity later intentionally broken by W3 §3)                                                                                  |
| W2-30 | §6 List-open runs the search flow (world push, fitAll camera, middle snap, joint reveal)             | **ND / EG**                               | Machinery built (leg 10: commitFitAllCamera, 'middle' motion row, edit primitive); wiring gated on perf/map commit; sheet-drops-to-middle descriptor landed |
| W2-31 | §6 Edit mode = ONE surface-agnostic primitive, adoption = a declaration                              | VD                                        | Leg 10 useEditModeSession; leg-13 home re-adoption proved the claim                                                                                         |
| W2-32 | §6/§7 Card galleries + plus sliver (1/6-1/8 width)                                                   | VD, geometry veto-able                    | Legs 10-11; sliver = 24×72pt floor (decreed fraction can't hold the plus) — feel-check #1                                                                   |
| W2-33 | §7 5-10 Google photos per real restaurant                                                            | VD                                        | Media leg: 128 photos / 16 Austin restaurants through the real pipeline                                                                                     |
| W2-34 | §7 Image ranking equation — permanent ideal                                                          | DESIGNED, **awaiting owner ratification** | Media ledger §1 (decayed-rate + Bayesian, RED examples computed); NOT built until ratified; interim = shipped v1 ordering                                   |
| W2-35 | §7 Tile 2x2 API (top-4 restaurants, TL→BR, dedupe)                                                   | VD                                        | Media ledger (probe: all 10 owner lists return ranked signed thumbs; RED spec case)                                                                         |
| W2-36 | §7 Owner test data (polls live+closed w/ discussions, lists, followers)                              | VD                                        | Media ledger fixtures; leg-7(snap) sim used them                                                                                                            |
| W2-37 | §7 Followers tap opens the list surface                                                              | VD                                        | Attributed (plain Views) + wired UI leg 7, sim PASS                                                                                                         |
| W2-38 | §8 lucide standardization on touched surfaces                                                        | VD                                        | Leg 7 + UI legs                                                                                                                                             |
| W2-39 | §9 List searchability                                                                                | OP                                        | Held for owner+Jarvis; not passed to agents                                                                                                                 |
| W2-40 | §9 410 wire vocabulary rename                                                                        | OP                                        | Cosmetic, parked                                                                                                                                            |
| W2-41 | §9 Profile page development                                                                          | OP                                        | Explicitly LATER                                                                                                                                            |
| W2-42 | §10 [MAPFRAME] set_render_frame_rejected                                                             | EG                                        | Perf/map session territory; re-check after they land                                                                                                        |
| W2-43 | §10 The commit (waves 1-3)                                                                           | OPEN                                      | Everything still uncommitted; Jarvis times it vs the perf session                                                                                           |

## Master table — Wave 3

| #     | Owner requirement                                                                            | Status                                        | Evidence                                                                                                                                                                                     |
| ----- | -------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W3-1  | §1.1 Home edit RESTORED under "My ranking" (vocabulary everywhere)                           | VD                                            | Legs 13-14 sim PASS (chip gating, 2-col drag, All pinned, undo/redo, Save persists)                                                                                                          |
| W3-2  | §1.2 Tile 2x2 gallery UI (placeholders, TL→BR)                                               | VD                                            | Legs 13-14 sim PASS                                                                                                                                                                          |
| W3-3  | §1.3 Dish-card galleries attributed + populated                                              | VD                                            | Leg 15: media-leg-2 connection links + rig-account scale seed; dish lists render real per-connection photo strips on the rig (only 6 NYC fixture connections placeholder — no import assets) |
| W3-4  | §1b Auto-extend to full on edit enter; stays extended on Cancel AND Save                     | VD                                            | Leg 14 sim PASS both surfaces; named-intent seat write (sanctioned)                                                                                                                          |
| W3-5  | §1b Child-page NAV-OUT on BOTH surfaces                                                      | VD                                            | root-snap-law Leg 9 build + Leg 15 fresh sim on home (tab bar leaves, X=Cancel w/ dirty confirm, sheet stays extended)                                                                       |
| W3-6  | §2.1 Edit chip snap root-caused + cutout restyle                                             | VD                                            | Leg 13 (chip wasn't a citizen) + leg 14 width-grow PASS; clean cutout both surfaces                                                                                                          |
| W3-7  | §2.2 Screen-switch choppiness                                                                | EG                                            | Leg 8: MEASURED (tab ~60-66ms JS frame; child push 126+210ms hydration) + attributed to render cost = the transition-perf session's live charter; numbers handed over                        |
| W3-8  | §2.3 Old X glyph, rotated into plus (one glyph)                                              | VD                                            | Leg 8 sim (LucideX, 45·(1+p)°, larger)                                                                                                                                                       |
| W3-9  | §2.4 Image rows edge-to-edge both sides; card photos bigger/less wide                        | VD                                            | Legs 13-14 (PhotoStrip contentInset; 96pt / 1.1 aspect measured; grid bleeds transport inset)                                                                                                |
| W3-10 | §2.5 Dismiss content-swap timing law                                                         | EG (design LOCKED)                            | Leg 8: joinSnapArrival design (RED-provable, zero timers); landing zone = perf session's live files; build first step of their world-push/dismiss leg                                        |
| W3-11 | §2.6 ListDetail return restores origin snap                                                  | VD                                            | Leg 8 sim (expanded→middle→X→expanded restored)                                                                                                                                              |
| W3-12 | §2.7 Strip-gap on child push root-caused, no band-aid                                        | VD                                            | Leg 8: measured-chrome height cache; 30fps frames = one-frame lockstep, zero frost band                                                                                                      |
| W3-13 | §2.8 Edit squeeze root fix + restore                                                         | VD                                            | Leg 13 (single gutter; handle = absolute overlay) + leg 14 sim                                                                                                                               |
| W3-14 | §2.8 Hairline under action row                                                               | VD                                            | Leg 14 root cause (mask coverage asymmetry) + pixel scan clean                                                                                                                               |
| W3-15 | §2.8 Action-row visual spec (Cancel black, Save red, undo/redo cutout pill, label→pill fade) | VD                                            | Leg 13 shared EditModeActionRow + leg 14 cutout-fade engine mechanism, sim frames                                                                                                            |
| W3-16 | §3 Card redesign (pill row Save/Share/Call/Dishes, rank bubble inline, gallery)              | VD                                            | Legs 13-14 sim PASS (Call only w/ phone, Dishes restaurant-only, "Save" vocabulary)                                                                                                          |
| W3-17 | §4 One listEdit panel, create-vs-edit; home popup dies; Rename→Edit                          | VD, **built ahead of the owner-confirm gate** | Leg 14 all four mouths round-tripped; charter said "Owner confirms before build" — shape follows the Jarvis rec verbatim; owner veto stands                                                  |
| W3-18 | §5 Trigger-regression audit (every trigger: designed/wired/unplugged-when/distance)          | VD                                            | trigger-regression-audit.md — verdict: ONE dead lane (list world, five mouths), all others alive; two span surfaces NEVER built                                                              |
| W3-19 | §5 Restore EVERY trigger (world-push leg, better than ever)                                  | EG                                            | Consolidated 4-item restoration plan written; gated on perf/map commit                                                                                                                       |
| W3-20 | §5b Conformance audit leg                                                                    | THIS DOC                                      | —                                                                                                                                                                                            |
| W3-21 | §5b Sim = Austin on the rig; never touch the Pro Max                                         | VD                                            | Legs 8/13/14 re-pin Austin; fences recorded each leg                                                                                                                                         |
| W3-22 | §6 Leg 12 CollaboratorModal root host                                                        | VD                                            | Leg 15 sim on a 12-dish list: sheet viewport-anchored (root host), Add-collaborator copies invite link, roster renders, outside-tap dismisses; anchoring suspicion retired                   |
| W3-23 | §6 Image equation ratification                                                               | OP (owner gate)                               | Pending                                                                                                                                                                                      |

---

## Adjudication: home-edit nav-out / child-page semantics

**Verdict: NOT DONE on home — a real conformance gap, not a judgment call.** The owner's
exact words: wave-3 §1b — "Entering edit mode (**home lists AND ListDetail**): the sheet
AUTO-EXTENDS to full + **child-page nav-out**"; wave-2 §2 — "Edit mode is a CHILD PAGE
**wherever it lives**: nav bar transitions out (more drag real estate; **no tab-switching
mid-edit**), the header X acts as Cancel." Delivered state (code-verified):

- Nav-out derives ONLY from route role (`resolveIsChildSceneRevealed`,
  app-route-presentation-frame-contract.ts:127) — bookmarks is topLevel, so the tab bar
  stays during home edit and **tab-switching mid-edit is possible**, which the owner
  explicitly wanted prevented.
- `headerNavAction` likewise derives from role (:110) → home edit keeps the **red plus,
  which is LIVE mid-edit** (registered `openCreateForm` — the create-list sheet can open
  over an active edit session). The edit primitive DOES register a header CLOSE override
  (edit-mode-session.ts:128), but on a topLevel scene the host never renders/fires the
  close lane — the registration is dead on home. Cancel exists only in the strip action row.
- Leg 14 flagged this softly ("flag if the owner wanted tab suppression"); the charter
  text already answers it. Leg 13's §1b claim ("child-page nav-out … verify the promote")
  verified the posture half and silently dropped the nav-out half on home.

Ideal-shape fix (for the fix leg, not this one): edit-session liveness becomes an input
to the PF derivations (nav-out true + headerNavAction 'close' while any edit session is
live on the presented scene) — the primitive already owns the session; the frame should
read it, not the surface hack chrome. ListDetail conforms fully today.

## NOT-DONE register (full)

1. **Home edit child-page semantics** (nav-out + X=Cancel + plus disarmed) — above.
2. **"Use your photos" gallery effect** — the ellipsis row toggles and persists
   `use_own_photos` (both panels; API column live), but
   `favorite-list-tile-gallery.service.ts` never reads `useOwnPhotos`/owner userId —
   the 2x2 gallery NEVER switches to the user's photos. The media ledger deferred the
   consumption ("the service then just adds userId") to the §2 ellipsis leg; leg 7 built
   the column + row and nobody closed the loop. Silently-dropped functional half —
   exactly the §5b failure mode. Small fix (query filter + placeholder gaps).
3. **Favorites→Lists CODE vocabulary rename** — explicit wave-2 §2 words; agent-deferred
   ("quiet tree"), never owner-parked. Belongs with/right after the commit.
4. **List-open world push** (W2-30) + §2.5 dismiss-law build + §2.2 fix — all EG on the
   perf/map session; designs/machinery ready. Not forgotten, but not done.
5. **Span build-outs** (profile comment spans, restaurant mention spans — mentions API
   already DELIVERS entitySpans that the render drops) — never built (not regressions);
   scheduled as restoration-plan item 3. Owner's "search flow from profile" intent lives
   here.
6. **Fossil scrollHeader lanes pass** — leg-3 explicit deferral (touches scroll-handoff
   surface); still outstanding, agent-deferred not owner-parked.

Minor queued (not owner-visible law): followList header title static "Followers" in
following mode (one-line, queued); `photos.source` attribution column (rides the
ratification migration); notifications rows other than follower_added dead-end (product
gap, no charter line — surfacing here so it's on record).

## DONE-UNVERIFIED register (needs eyes / scale)

1. Grid edge auto-scroll + header clamp + fast-grab FEEL at scale — rig has 4 tiles/side;
   leg-7 evidence stands but the restored HOME grid was never driven past one screen.
2. Dish-card galleries with real photos — owner account only (rig fixtures photo-less).
3. CollaboratorModal root host (leg 12) — complete in tree, zero sim passes; anchoring
   suspicion from leg 11 unretired.
4. Leg-11 NOT-RUN list — slug/cold-open title-skeleton lane; two stacked listDetail
   entries; Price/Open-now FAILURE baseline-restore (no fault injection).
5. One-line placement flip (W1-9) — structural, never exercised.
6. §2.5 joinSnapArrival design — locked but unbuilt/unproven (by design, gated).
7. Sort-mode CHOICE resets to Recent on cold relaunch (positions persist server-side;
   never a claim, but the owner may expect My ranking to stick) — flag.
8. Corrupted-nav-state one-off (lists-origin world → search-bar edit → back-cancel,
   leg 11) — logged for the step-1 leg (dismiss/residency is its design surface).

## Consolidated owner feel-check / veto / gate list

1. Plus-sliver geometry: 24×72pt floor vs the decreed 1/6-1/8 sliver.
2. Market sheet breadth: every active market (long) — cull to collectable-or-major?
3. Price single-level vocabulary ($–$$$$ pick-one).
4. "Closed" segment word (veto-able).
5. Polls default sort = New (veto-able).
6. "New list" row now redundant with the header plus — keep or delete.
7. Ellipsis-fade sync with the plus→X rotation (eyeball).
8. ListDetail open drops the sheet to middle (formal confirm of the descriptor change).
9. "Use Crave photos" toggle-back wording (unspecced by the owner).
10. Strip scroll-reset scope: tab-away counts as re-present — keep or tighten.
11. Store-collapse feel candidates: pollCreation/pollDetail open at default (no echo of
    prior drag); dismissed docked polls always resurrect collapsed.
12. Image-equation ratification (Media ledger §1) — gates the eng_score build.
13. §4 listEdit shape — built ahead of the confirm gate; ratify or amend.
14. Home-edit nav-out gap (this audit's ND #1) — confirm the adjudication, dispatch fix.
15. Sort-choice reset on relaunch (DU #7) — expected or fix.
16. THE COMMIT — waves 1-3, timed around the perf/map session.

## Charter capture gaps (owner said it; no charter line carried it)

1. **"Use your photos" EFFECT** — both charters carried the setting; neither carried an
   acceptance line for the gallery actually swapping. Found only by code-read (ND #2).
2. **Home-edit nav-out** — wave-3 §1b carried the words, but the leg-13 execution read
   narrowed it to posture; no checklist line existed to catch it (ND #1).
3. Wave-2 §7 named "Café Pana"/"Tomani" — don't exist in the DB; media leg substituted
   the real top-Austin set and SAID so. Conforms in spirit; recorded so the substitution
   is a known fact, not a silent swap.
4. Owner's recollection of profile comment-span search working: git-proven never built
   (spans work on PollDetail, reachable FROM profile) — trigger audit item 11. The
   restoration plan makes his remembered behavior real.
5. Everything else cross-checked line-by-line landed in a charter/checklist row — no
   other dropped sentences found.

## Parked-item confirmation (§9/§10 — still parked, not forgotten)

List searchability (owner+Jarvis discussion) · profile page (LATER; plus = barking stub)
· polls quick-fade (parked WITH data) · 410 rename (cosmetic) · pre-fetch permutations ·
4-way switchers + inline text sorts · [MAPFRAME] reject (perf session, re-check after
they land) · custom-rank question = RESOLVED by wave-3 §1.1. All confirmed present in
ledgers; none silently dropped.
