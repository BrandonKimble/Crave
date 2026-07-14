# Wave 2 — Lists, edit relocation, child transitions, ListDetail, images (owner intent, distilled 2026-07-13)

Owner finger-tested wave 1 (see [toggle-strip-and-edit-charter.md](toggle-strip-and-edit-charter.md),
[strip-wave-finger-test-checklist.md](strip-wave-finger-test-checklist.md)) — strips passed,
snap law passed and feels good, edit mode mostly good but with defects AND a structural
pivot. This charter is the complete record. THE LAW from the wave-1 charter applies to
every item: from-scratch mental model, complete cutover, no patches, deletions, RED-provable
contracts, logic-first verification.

## §1 — Engine/edit defects found by finger-test (fix at the layer where they live)

1. **Edit chip SNAPS in** when sort hits Custom — must animate in (width/slide) and PUSH
   siblings right. Engine-level: strip-citizen entry animation (any conditional chip).
2. **Cancel/Save reverse morph is broken**: the whole strip snaps out (frost visible
   through the band), then the toggle row slides in from the right WITHOUT its white
   mask. The ENTRY morph is perfect — the exit must be its exact reverse (action row
   slides out left, toggle row slides back in from the right, white plate riding it,
   Edit chip stays since sort is still Custom). Engine-level.
3. **Drag auto-scroll missing**: dragging a tile to the sheet's top/bottom edge must
   auto-scroll while scroll room remains (the math's edge-band pump exists — attribute
   why it isn't driving the grid).
4. **Drag clamp missing**: the dragged tile's top edge must stop at the header's bottom
   edge — finger may continue, tile doesn't follow past the clamp, rejoins on the way
   back. (Going UNDER header/strip chrome is correct and stays.)
5. **Fast-grab glitch**: grab handle + move immediately → tile snaps back / detaches
   from finger; grab-then-pause works. Owner suspects a hold-timer interacting with the
   already-active drag. Mini-review, root cause, ideal-shape fix — no timer band-aids.
6. **Kill the Save-button spinner** — and ALL legacy spinners app-wide (see §5).
   Standard: skeletons everywhere; the custom SQUIRCLE animation is the only sanctioned
   button-loading affordance (e.g. squircle to the right of Save).

## §2 — STRUCTURAL PIVOT: edit leaves the home page; home page restructure

- **DELETE home-page edit mode entirely** (the leg-5 surface — chip-triggered action
  row, home tile drag). Editing happens ONLY inside a list (ListDetail), like Spotify.
  The engine machinery (action-row slot, slot-map drag, handles) is KEPT — it relocates
  to ListDetail (§6). Fix §1 defects at engine/core level so ListDetail inherits them fixed.
- **Edit mode is a CHILD PAGE** wherever it lives: nav bar transitions out (more drag
  real estate; no tab-switching mid-edit), the header X acts as Cancel.
- **Bin + Want-to-go become REGULAR lists** (both sides): default-created per user,
  renamable, movable, deletable — special-casing deleted. (Per-side All stays virtual/pinned.)
- **Rename Favorites → Lists everywhere**: nav text, headers, and code vocabulary.
- **Ellipsis modal restyle**: left-aligned title; rows = lucide icon + text, left-aligned,
  no color blocks, no separators, elegant spacing. Items: Share · Delete ·
  **"Add to profile"/"Remove from profile"** (one toggling row — the visibility canon's
  public/private, reworded since lists aren't searchable for now) · **"Use your photos"**
  (tile gallery switches to the user's own photos; attractive placeholders fill missing
  slots from top-left — §7) · **"Pin on profile"/"Unpin from profile"** (auto-pins the
  list on the profile page).
- **Home toggles**: rename Custom → **"Custom rank"**; chips display their VALUE not the
  axis name ("Recent", never "Sort"). Verify against plans/page-registry.md whether
  Recent/Custom-rank (+ Restaurants/Dishes) really is the complete intended inventory.
- **All tile experiment**: thinner, sits where the New-list button used to be, subtext
  deleted, possibly icon deleted — just "All restaurants"/"All dishes" + chevron.
- **OPEN QUESTION (owner to answer, flagged by Jarvis)**: with home edit deleted, what
  edits the CUSTOM RANK of the lists themselves? Jarvis proposal: long-press-drag
  directly on tiles when sort = Custom rank (no mode, auto-persist). Do not build until
  the owner rules.
- **Cutout list tiles: SCRAPPED** by the owner (cutouts + overlapping drag = not worth
  it). Tiles get image galleries instead (§7).

## §3 — Polls strip redesign

- Chips display VALUES: "All" and "New" (etc.), never "Type"/"Sort".
- **Master sort**: Time folds INTO Sort — New (no time), Trending (no time), Top (time
  period selectable: add **Today** and **This month** to the existing set). The
  standalone Time chip dies. "Default" must not be an option — attribute what
  "default" currently sorts by and what the registry/plans intended (report back).
- Default sort: owner leans New; Jarvis rec = **New** (young app: freshness beats
  stale all-time Top; Trending later when volume exists). Verify docs, then set.
- **Live → "Live · N"** (metadata dot + live-poll count, dynamic, in the segment itself).
- Results → **"Closed"** (Jarvis rec, owner to veto: state-word symmetry with "Live";
  "Results" reads ambiguously since every poll has results).
- Test data blocks feel-testing: see §7.

## §4 — Nav/header: the plus/X rotation + re-tap

- **All parent pages: X → PLUS (primary red).** Plus = page-specific create shortcut
  (Lists page → create list; Polls → create poll; Profile → catch-all create:
  poll/image/discussion/list). Parent pages become non-dismissable (industry norm;
  Google home surfaces have no X).
- **Child push**: plus rotates CLOCKWISE into a BLACK X, animating DURING the
  transition (starts on press-up, never after arrival). **Child dismiss**: X rotates
  COUNTERCLOCKWISE back to red plus. Child→child: stays X. Quick, satisfying,
  cubic-feeling curve. The persistent header makes this smooth by construction — no
  snapping. Git prior art: the old polls-header close button twisted plus↔X by snap
  point — excavate for reference, rebuild on today's persistent-header primitives.
- **Nav re-tap** (owner + Jarvis agree): tapping the active home/search nav item while
  home sits at bottom snap pulls the sheet to FULLY EXTENDED; further re-taps do
  NOTHING (never toggles back down — no slot-machine; drag is the only way down).
  Gesture-only seat writes still hold: this is a named product intent, sanctioned writer.

## §5 — Child-page transitions: systemic jank; make it a primitive

Finger-test observations: home→ListDetail = content vanishes → strip vanishes late →
see-through gap where the strip was → content snaps up; reverse equally bad (strip pops
late, header title late, content shifts, nav late). Messages: content vanishes → bare
frost → header changes late → ANCIENT loading spinner on a blank sheet → content.
Settings: same, antiquated spinner in the privacy section. Meanwhile nav-page switches
are nice — but even there the header + strip change a beat AFTER the content.

Mandate:

- **Audit every child page against the page-foundation standard** (ADDING_A_SCENE.md §5,
  8 pieces) and the intended model: react on press-up immediately (header + nav-out +
  rotation from §4), show a SKELETON if content isn't ready, reveal everything
  SYNCHRONIZED — never piecemeal. Placeholder skeletons are fine now (per-screen
  stylization later); wiring correctness is what matters.
- **Make the child transition a PRIMITIVE all children inherit** — the audit's job is
  to find why each page deviates and whether the primitive exists half-built (the
  nav-page switch machinery is the reference).
- **Nav-page switches too**: attribute the header/strip one-beat lag vs content on
  tab switches and fix — content, header, strip move as one committed frame (or
  skeleton until all ready).
- **Spinner hunt**: find every legacy spinner (messages, settings/privacy, save
  button, anywhere) and kill it: skeletons for content, squircle for buttons.

## §6 — ListDetail: the deferred session, now ACTIVATED (design-first)

The proving ground. Everything below rides the proven primitives; check
plans/page-registry.md (§8.14) + wave-1 charter Part 8 corrections (per-side All,
canon). Design leg first; owner reviews before build.

- **Header**: the LIST NAME is the header text (separate title row deleted; content
  moves up). Avatar stack's top edge flush with the header's bottom edge (profile-page
  pattern). Username to the right of the stack; "N dishes"/"N restaurants" (typed per
  side) right of the username, metadata-dot separated.
- **Header ellipsis**: fades in LEFT of the close button as a CUTOUT (white→clear
  reveal), synced with the §4 plus→X rotation, starting on press-up. Treat as a
  candidate primitive (future pages will want slot-fade-in chrome) — do it well.
- **Toggle strip, finally**: the primitive's in-list mount, placed UNDER the
  avatar/meta block (scrolls under the header — part of the list, NOT header chrome).
  FULL registry inventory (open now, etc. — result-sheet-like), plus Edit ·
  My-ranking/Best/Recently-added · Market per the wave-1 edit doc; check registry for
  listDetail-specific additions.
- **Cards**: extract the result-sheet cards into a PRIMITIVE reusable across surfaces
  (results, listDetail, other-people's-lists) with per-surface variation. Straight
  copy of results look is fine v1.
- **Entity-ID search trigger — the huge miss**: opening a list is supposed to RUN THE
  SEARCH FLOW (like a shortcut press) and it doesn't. On press-up: header changes
  immediately, skeleton, map pulls the list's pins, sheet drops to middle if it was at
  top, camera fits ALL list pins in the region above the middle-snap sheet (the
  designed fit, not an arbitrary top-third), pins/labels/dots/cards reveal together,
  toggles slice map+cards as world-consequence. FIND the source-agnostic search-flow
  plans (search-flow rebuild charter, favorites-as-search work), attribute why it isn't
  wired, report how far off the end state we are — then wire it.
- **Edit mode lives here — as a PRIMITIVE, not a relocation (owner clarification
  2026-07-13)**: edit mode is ONE surface-agnostic primitive — mode session (child-page
  semantics, X = cancel), action-row morph, ellipsis→handle swap, slot-map drag core,
  undo/redo history — that a surface DECLARES with its slot geometry. ListDetail
  declares 1-column variable-height rows (moving list items up/down); the 2-column
  tile geometry from the deleted home surface stays alive in the core (columns param,
  proven reduction). Design it as if we always knew it applied to home, ListDetail,
  and any future list-like surface — a surface re-adopting edit mode must be a
  declaration, never a build. (This also means home custom-rank reordering, if the
  owner ever wants it back, is a one-declaration re-adoption — see §2 open question.)
- **Card image galleries** (§7): horizontal image strip (toggle-strip-like physics)
  under the metadata lines in each card; FIRST item = a "plus sliver" (1/6-1/8 of an
  image block's width, just wide enough for the plus with tasteful padding, image
  height). Also goes into the RESULTS list cards (restaurant + dish).

## §7 — Images + test data (new domain)

- **Pull 5-10 Google photos per existing restaurant** (e.g. Café Pana, Tomani — use
  the real DB set) to populate galleries for practice/testing.
- **Image ranking equation — design the PERMANENT ideal now** (owner: it must not
  change when real users arrive). Prior art: product/images.md (auto-gate quality,
  engagement direction). Owner direction: rank by RECENT engagement (taps, view time)
  with decay — an image must stay currently-engaging; no all-time-views moat where an
  old image is uncatchable. Quality/auto-gate (Cloudinary-style) as a minor factor at
  most — it can't judge composition/appeal; engagement is the honest signal. Design +
  infra so every restaurant's images rank continuously.
- **List-tile 2x2 galleries** (home page): 4 images per tile — top-ranked image from
  each of the list's top-4 restaurants (crave rank, or the user's custom rank when
  set), filled TL→TR→BL→BR. "Use your photos" setting (§2) swaps to the user's own
  photos with attractive placeholders for gaps, filled from top-left — the
  incompleteness is deliberate motivation.
- **Test data under the owner's user** (kimble.brandonm): live + closed polls with
  FILLED discussions (real collected data is fine), owner participating; comments;
  lists populated including Bin/Want-to-go/All both sides; photos wired to
  restaurants; follower/following fixtures (the profile followers tap currently opens
  nothing — verify the built list surface and seed data for it).

## §8 — Decisions made this round (owner + Jarvis, binding)

- Plus/X hijack: GO, with the rotation (owner reasoned through it; Google home
  surfaces have no X; muscle-memory cost accepted).
- Nav re-tap: extend-only, third tap inert.
- "Add to profile" wording (conditioned on lists NOT being searchable for now).
- Cutout tiles: scrapped.
- Icons: standardize on lucide-react-native (installed, already used); sweep stray
  @expo/vector-icons usage on touched surfaces.

## Status ledger

- 2026-07-13 — STRIP LEG 11 COMPLETE (wave-2 close-out; sim-verified end-to-end):
  ResultCard primitive extracted (results BYTE-COPY pixel-proven, diff bbox None;
  listDetail/read-only = slot bundles; ListDetail rows ARE the results card now),
  Market data path closed (activeMarketKey directive + NEW GET /markets/active
  vocabulary — rows carry no market provenance, executor echoes the directive),
  isDirty = order≠baseline (core module + spec + on-sim proof both directions).
  SIM CAUGHT + FIXED: action-row single-slot collapse (engine children contract),
  Price chip filtered NOTHING (plan-clause payload, not request), score-info sheet
  offscreen (panel-local OverlayModalSheet → root ScoreInfoHost). Full legs-9/10
  checklist PASS (ledger §Leg 11 has item-by-item + NOT-RUN list); plus sliver
  measured 24×72pt for the owner. REMAINING for wave 2 = step-1 world-push leg
  (gated on perf/map commit) + owner feel-checks only.

- 2026-07-13 — MEDIA LEG 1 COMPLETE (red-team light pass ok): equation designed
  **AWAITING OWNER RATIFICATION** (decayed-rate score, H=14d, Bayesian-smoothed —
  no all-time moat by construction; ledger §1 has infra design; NOT built until
  ratified). 128 Google photos / 16 real Austin restaurants live via the real
  pipeline; owner test data seeded (3 live + 2 closed polls w/ 18 threaded
  comments, lists both sides, 5 follower fixtures); `tileImages` 2x2 shape live on
  GET /favorites/lists; dev API on :3000 rebuilt+restarted (leg-6 visibility fixes
  now live too). Followers-tap attributed: own-profile stat blocks are plain Views
  (no onPress) — one-liner fix QUEUED for the UI agent (FollowListPanel + route
  already exist and work from other profiles). "Use your photos" column deferred
  to the §2 ellipsis build.
- 2026-07-13 — STRIP LEG 7 COMPLETE (FULL red-team pass ok): all five §1 defects
  root-fixed at engine/core (slot width animation, retained-actionRow mirror morph,
  auto-scroll resolution + bark, minTranslationY screen-space clamp, touch-down
  activation + ownership arbitration — fast-grab had TWO stacked causes); home edit
  deleted end-to-end; Been/Want-to-go regular lists both sides (guards deleted,
  proper additive migration `use_own_photos`, API restarted per recipe);
  Favorites→Lists user-facing (code rename deferred to a quiet tree); menu-variant
  AppModal w/ the five lucide rows; All tile thinned; §3 polls = "Default" was a
  vocabulary lie (client omitted sort, API applied new) → New default (zero
  behavior change), Time folded under Top (Today/This week/This month/All time),
  Live·N dynamic, Results→Closed. OWNER ITEMS: rename seat gap (assigned leg 9),
  "Use Crave photos" toggle-back wording unspecced, Closed veto-able.
- 2026-07-13 — STRIP LEG 10 COMPLETE (combined 9+10 red-team pass, one isDirty
  nit → leg 11): edit-mode-session primitive extracted + variable-height slot
  math (verbatim uniform reduction spec'd), fitAll camera built world-generic
  (snapTo-middle descriptor correction), Price data path closed. STEP 1 STOPPED
  AT THE GATE correctly: no lens-design conflict, but the landing zone = the
  perf/map session's live uncommitted files — recommendation: own leg after that
  session commits; lane = parameterize requestSearchPresentationIntent; dismiss
  v1 = idle-write on last-world-entry pop. LEG 11 LAUNCHED (final buildable leg):
  ResultCard extraction w/ byte-copy proof + galleries, Market data path,
  isDirty fix, full legs-9/10 sim verification (sim free).
- 2026-07-13 — UI LEG 7 COMPLETE (red-team pass; UI DOMAIN DONE for wave 2):
  full leg-6 sim checklist PASS on rig-verified bundles, zero [snap-law]/
  [JOINEDREVEAL] barks; polls plus = market-gated create (registered on the
  Title mount — a committed component, honoring the effects-never-fire trap);
  Lists plus = openCreateForm; dead Action slots deleted (+ discovery: saveList
  close is a session verb → registerHeaderCloseAction, dangling-state bug
  avoided); followers/following stat taps wired at the actions-runtime layer w/
  seeded fixtures. FLAGS: "New list" row now redundant with the plus (owner
  call); followList header says "Followers" even in following mode (pre-existing,
  queued small task). Sim freed for Strip leg 10.
- 2026-07-13 — STRIP LEG 9 PARTIAL at sanctioned boundary (gates green): header/
  meta ✅, strip declaration ✅ (Open-now newly plumbed; Market honest-disabled),
  ellipsis Extras + §2 menu ✅, rename seat ✅ (header-ellipsis menu, AppModal
  prompt), edit mode-session ✅ (X=Cancel w/ discard confirm). PROVING GROUND
  yielded 7 primitive defects (ledgered): no variable-height slot math, no
  extracted edit primitive, 'world' consequence hardwired to results scene,
  Price has no API data path, plus-sliver geometry can't hold the plus (owner
  feel-check), world-present↔results coupling, residency unwired (intersects
  plans/map-world-lens-transport.md design of record). LEG 10 LAUNCHED:
  6-core edit primitive → fitAll → ResultCard → Price path → step-1 trigger
  GATED on lens-transport compatibility (stop-and-report on conflict).
- 2026-07-13 — LEG 9 (ListDetail build) + UI LEG 7 (integrations + sim checklist)
  LAUNCHED; UI leg 7 owns the sim first, leg 9 sims after.
- 2026-07-13 — UI LEG 6 COMPLETE (build; red-team medium pass ok; SIM PENDING —
  leg 7 owns the sim): PF chrome clock (nav-out store DELETED, headerNavAction =
  frame field), HeaderNavAction rotation live (14 per-scene Action factories +
  headerActionPolicy chain deleted, ~19 files), SceneBodyReadyGate + declared
  skeletons (11 panels de-spinnered, Button.tsx → SquircleSpinner, eslint
  ActivityIndicator ban proven RED), joined {paintAck, chromeAck} reveal w/
  watchdog bark, extendActiveRootFromNavReTap named intent. HANDOFFS to the strip
  wave: polls plus needs registerHeaderCreateAction('polls', market-gated create),
  bookmarks plus needs openCreateForm registration, 3 fenced panels' dead Action
  slots to delete, profile plus = owner-open stub. Leg-6 sim checklist queued for
  after Strip leg 7 frees the simulator.
- 2026-07-13 — UI LEG 5 COMPLETE (audit/design, red-teamed): four-clock
  attribution + SceneBodyReadyGate/HeaderNavAction design → LEG 6 BUILD launched.
- 2026-07-13 — STRIP LEG 8 COMPLETE (ListDetail design, red-teamed): search
  trigger = built→unplugged→erased archaeology confirmed; build staged behind
  leg 7 + UI leg 6.

## §9 — Open with the owner (do NOT build)

- **List searchability** (Spotify-style): held for owner+Jarvis discussion — NOT
  passed to agents. (Jarvis position: not at launch — Austin-only corpus converges on
  duplicates; discovery via profiles/creator ladder first; dish lists are where
  searchable value eventually lives; substrate (public/profile/slugs) already exists
  so adding search later is cheap.)
- Custom-rank reordering gap (§2) — proposal pending.
- Results→Closed and New-as-default — recs given, owner may veto.
- 410 wire vocabulary rename (`state:'private'` → revoked) — cosmetic, parked.
- Polls quick-fade on content-ready edge — parked with data.
- Profile page development — explicitly LATER.

## §10 — Deferred / other sessions

- **[MAPFRAME] set_render_frame_rejected "Source delta missing feature"** on re-search
  after map move (owner screenshot 2026-07-13): belongs to the ACTIVE map/perf
  session's territory (lens transport + transition-perf round 4, in flight on its own
  rig). Not dispatched — if it persists after that session lands, spin a Map agent.
- Wave-1 commit: pending — the perf session is mid-flight in overlapping files;
  Jarvis will time the checkpoint to avoid co-mingling.
- ⚠️ ALL agents: the transition-perf session is editing poll-identity/memo/commit
  paths in navigation/panels on the SHARED TREE. Before editing any file, diff it; if
  it contains changes not in our ledgers, PRESERVE them (never revert), note the
  overlap in the ledger.

## §11 — Dispatch map

- **Strip leg 7 (build)**: §1 engine/core fixes + §2 home restructure + §3 polls strip.
  Owns the sim.
- **UI leg 5 (read-only design/audit)**: §5 child-transition primitive audit + §4
  rotation design + nav-page sync attribution. Build in leg 6 after owner review.
- **Strip leg 8 (read-only design)**: §6 ListDetail design + search-trigger
  attribution (find the plans, why unwired). Build after owner review.
- **Media leg 1 (new agent)**: §7 — equation design for ratification + photo pull +
  test data build.
