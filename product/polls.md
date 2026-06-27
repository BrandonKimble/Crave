# Polls

> **Rolling canonical vision — not a changelog.** Keep this file thin and *current*: it describes
> only what we want this area of the app to be **today**. When something changes, edit or delete the
> old text in place — never append "superseded"/"old"/"previously" notes, history, or pointers to
> past ideas. If you follow this file, you know exactly what we want. Execution detail + migrations
> live in `plans/`; business/gating rationale lives in `business/`.

---

Polls are Crave's community contribution layer: a per-market feed of "best X" questions where the **discussion thread is primary** and a ranked **endorsement leaderboard** is a read-model projected over it. Polls are not a structured vote proxy — they are a first-class collection source that flows through the *same* extraction → resolution → evidence pipeline as Reddit, so at close they **graduate into the objective Crave Score** with honest, explainable evidence. Polls and discussion are deliberately **free** (alongside restaurant ranking, search, map, and open-now/price): they drive contribution, virality, and feed the Score, so gating them would kill the flywheel. Crave+ gates the dish-level experience, not this.

## Core model

- **Thread is the source of truth; the leaderboard is a projection.** No vote or score is stored on the leaderboard — it's computed from comments + endorsements.
- **A poll thread is just another collection source.** At close, the whole thread is submitted to the collection pipeline as a `poll_thread` source; extracted mentions flow into the same evidence ledger the Score rebuilds from (`PollGraduationService.closeAndGraduate`).
- **Two modes: ranked vs discussion.** Ranked polls have an inferred axis + leaderboard + collection; discussion polls are pure thread (no axis, no leaderboard, no graduation). The LLM decides which at creation.
- **Axis shapes the leaderboard subject.** Restaurant-axis polls endorse restaurant entities; dish-axis polls endorse a `(restaurant, dish-category)` Connection, held live as a poll-local `restaurantId::foodId` composite key — real Connections mint only at graduation, so the live leaderboard never writes unverified data into the shared core.
- **Collect greedily, project narrowly; authoritative processing at close.** Live surfaces (highlighting, counts) are best-effort; canonical evidence is computed once at close.
- **No pre-seeding of options.** Cold start is acceptable; options emerge only from the discussion. Day-one usefulness comes from Reddit-seeded scores.

## Poll creation

- **Type-less, subject-first canvas.** The `pollCreation` child scene is an editable empty-poll shell — no template picker. The user types a free-text **Subject/question** + optional **Description**; the backend infers mode and axis.
- **Options placeholder is empty and non-editable** ("Your ranking forms from the discussion"), making clear that options are never hand-seeded.
- **Description = the creator's organic seed.** The description is treated like a comment: at creation its entity spans seed the creator's endorsements into the live leaderboard (per-user dedup); at graduation it's included in the collection context as an extractable creator-authored unit.
- **Axis-inference confirm chip.** On high-confidence inference, show the inferred structure back ("Ranking: breakfast sandwiches · NYC") with an edit escape hatch; low/no confidence silently falls to discussion mode.
- **Market picker is a modal value-picker** (not a scene), pre-selected to the map-resolved market you're on, with a full market list + search-across-markets. It returns a value and dismisses back to creation.
- **Creation-sheet choreography** mirrors poll-detail's nav-push: on first open it auto-extends to the top snap with the subject focused and keyboard up. The keyboard dismisses the instant you drag the sheet (anything but the text box) and returns only at the top snap on a manual text-box tap.
- Media attach is out of poll scope, handled later by a shared app-wide media/Cloudinary slice; the shared poll components keep a clean optional-media seam.

## Creation dedup (the volume valve)

- **Dedup, don't cap.** Most big-city pileup is duplication ("best tacos in Austin" asked 10×). Duplicates route to the existing poll rather than rejecting creation.
- **Two-stage, dedup-first submit.** Stage 1: fast `word_similarity` text dedup (sub-100ms, precision-favoring ≥0.6) over active market polls → on a match, show the duplicate modal immediately, no LLM. Stage 2: `inferPollSubject` LLM (~1–3s) only when no obvious dup. Stage 3: exact-entity dedup against active polls' resolved targets after resolution (`POST /polls/check-duplicate`).
- **Duplicate modal.** A bottom-sheet "This looks like an active poll" with **View the poll** (discard draft → open existing) / **Discard**. We never silently convert a draft into a comment.

## Feed curation

- **Live ⇄ Results primary split** (segmented sliding-pill toggle, default Live). "Results" is the weekly payoff; the two are distinct datasets, so the toggle refetches.
- **Default order is the silent nudge.** App/Crave polls pin on top (scheduler-chosen, sparkles treatment), then user polls rank by demand alignment via the scheduler's precomputed `pollPriority.score` — higher demand ranks higher, nudging the community toward high-value subjects. Pinning applies to the default sort only.
- **User-selectable sorts: New / Top / Trending.** New = `launchedAt DESC`. Top = distinct endorsers (engagement). Trending = decayed engagement velocity (heat) — engagement-based, not entity-score (the score model is undefined for dish-axis/discussion polls). Trending blends magnitude and heat: `score = log10(max(1,score)) + heat`, heat half-life ≈ 3 days, distinct-user-counted (spam-resistant, window-free).
- **Type filter: All · Polls · Discussions** (maps to ranked/discussion). Locked over dish/spot grouping ("best tacos" is ambiguous — reads as a dish but ranks spots); richer subject filters (cuisine, by-entity) come later.
- **Time filter: This Week / All Time** (mainly Results; windowless for New/Trending).
- **Card differentiation.** User polls show a description snapshot (app polls usually won't) → more human and inviting. Discussion-poll cards lead with the body preview, no bars (must never look empty); ranked-poll cards show the leaderboard bars + top-1 hook + Reddit-style footer.
- **Reusable toggle-strip primitives.** `SegmentedToggle` + `FilterChip` + `FrostedFilterStrip` are the one shared shell (frost + masked-hole cutouts + horizontal scroll); search renders *through* `FrostedFilterStrip` too, so the strips never drift. The re-sortable feed disables FlashList MVCP (otherwise it anchors the old top row on re-sort and scrolls the strip off-screen).

## Cadence & scheduling

- **Creation is never time-gated.** The weekly rhythm is about results and app polls, not user creation.
- **User polls self-schedule: 3–14 day close window, default 7** (3/7/14-day chips, backed by `poll-timing.ts`). This avoids the Thursday-poll-gets-1-day problem, spreads close-load, and keeps a steady stream of fresh Live + freshly-Closed polls.
- **Per-user soft cap: 2 active polls / week / market** (rolling 7-day window, clear message, app/seeded polls excluded). No cap on comments or discussion.
- **App/Crave polls are the weekly editorial spine.** A demand-driven scheduler (`PollSchedulerService`) picks *what to ask* from `SearchDemandService` demand, publishes **Sunday** with a 7-day window (closes the following Sunday — informs weekend dining, finalizes Sunday), and pins as "poll of the week" under the default sort. This is a bet to validate post-launch; pull the pin if unloved.
- **Demand-cooldown coupling.** A user poll targeting an entity bumps that entity's `lastPolledAt` like the scheduler does, suppressing a redundant app poll on the same subject and naturally lowering its user polls over time.
- **Per-poll close is a mini-event** — an in-app "results are in" state, with a poll-close push notification as a later add.

## Comment threads, likes & endorsement

- **Threaded comment CRUD.** Post/edit/soft-delete; `parentCommentId` threading; `publicId` shareable deeplink; moderated on post; both ranked and discussion polls have threads.
- **Per-comment likes** (Reddit-style, unrestricted): toggle like/unlike, maintaining a denormalized `score` for thread sort; a self-like is ignored for endorsement but allowed as a like. **Comment sort: Top (default) / New.**
- **Endorsement leaderboard = `COUNT(DISTINCT user)`** endorsing a subject, deduped per `(user, subject, poll)`. Endorsing = authoring or liking a comment that *positively* names the subject (polarity from sentiment); the leaderboard "+1" button writes the same set, not a parallel tally. Liking 3 comments about Joe's = 1 endorsement.
- **Tap-to-endorse on the leaderboard bars** (`PollCandidateBars`): TikTok-style full-width result bars you tap to endorse; the count is split-colored (digits flip white where the fill covers them), with a pink heat scale by rank. Only existing candidates can be endorsed — new candidates enter only via discussion.
- **Reddit-grade threading.** Vertical connector rails (one per ancestor level), tap-to-collapse a subtree (keep-mounted accordion animating measured-height × progress), indent caps at **5 levels** then flattens + @mentions the parent (IG/YouTube continuation, not a "Continue thread →" screen).
- **Persistent compose chin + reply float.** The compose box is pinned at the bottom (chat/Reddit style, off the list header), keyboard-tracked via `useAnimatedKeyboard`. Reply is an icon on each comment → raises the chin with a pinned copy of the target ("Replying to {name}" + preview + ✕) and highlights the target row.
- **Entity-highlighted comment spans.** `entitySpans` render inline tappable highlights → restaurant profile (via `openRestaurantRoute`) or entity-scoped search for food.
- **Edit/delete are cheap.** Because authoritative collection runs only at close, only the final comment state is processed: edit re-runs the gazetteer; delete is soft-deleted and excluded at close.

## Entity linking & graduation into the Score

- **On-submit gazetteer highlighter (no LLM).** A candidate-phrase probe over `core_entities` names + aliases (longest-match containment, shared P1.4 matcher) resolves known-entity spans for instant highlight + deeplink + live leaderboard. A closed-set lookup, not a replacement for the open-set LLM extraction at close.
- **Live leaderboard vs authoritative scoring.** The leaderboard is gazetteer-live (free, ~95% accurate on "best X" polls, labeled "live tally · finalizes when the poll closes"); the expensive sentiment-weighted evidence finalizes at close, with per-comment async LLM as an upgrade only if live drifts.
- **The poll is a sandbox; the gate is the global boundary.** New entities (even junk) show live in the poll's discussion and projection, but nothing reaches the real global system (search, profiles, Crave Scores) until it passes the plausibility gate at close.
- **Close-time graduation.** `closeAndGraduate` runs the full thread through the collection pipeline as a `poll-thread` source → extraction → resolution → new-entity discovery → evidence ledger → leaderboard finalize → highlight backfill. Idempotent via `Poll.graduatedAt`. An attribute-target poll ("best patio") creates/links the `patio` attribute to restaurants lacking it at close, identical to Reddit collection.

## Autocomplete poll lane

- **Polls as an autocomplete lane with zero reserved slots.** A `poll` result type joins the overflow pool behind the 3 reserved entity slots; relevance combines question-text match + entity-in-poll match + market match + activity/recency. The suggestion row shows an accent `BarChart3` icon; tap opens poll detail via `openAppSearchRoutePollsHome` / `openPollDetail`.
- **Toward unified relevance:** eventually replace the reserved-lane merge with a single relevance score across all candidate types (entity/query/poll), sorted purely by score (lexical + popularity + locality + freshness + light diversity), with polls just another candidate. Scoped to autocomplete only.

## Real-time updates

- **Per-poll live refresh.** `PollDetailPanel` subscribes to the `/polls` socket `poll:update` (filtered to its pollId, deferred past gestures) → comments/likes/leaderboard refresh without manual reload.
- The target system is per-poll rooms + granular event types (new comment, like delta, leaderboard shift, highlight ready), replacing today's global broadcast.

## Sheet, transition & chrome

- **Poll-detail full-screen nav-push transition.** A 3-part illusion (nav silhouette slides down + native sheet mask follows + the hard-clip lifts to full viewport), pivoting on one `sheetClipMode` signal, shared via `useNavHideIntent`.
- **Shared frost foundation + header parity.** Every sheet routes through one `FrostedGlassBackground`; white body layers sit below the header band so the header cutouts (grab-handle + close holes) reveal frost; `HeaderScrollDivider` is threaded to every non-search scene.
- **Sheets are non-dismissable by swipe with an elastic bottom; modals dismiss armed-outside.** Polls use `canSwipeDismiss:false` (the docked bar is permanent); modals use `useArmedOutsideDismiss` (dismiss on first move or lift, never touch-down). Poll detail dismisses via the X-button path; the clean drag-past-threshold → `onClose` route is the intended upgrade.

## Navigation foundation (search-from-anywhere)

- **Surrender search from anywhere → explore → return.** From any screen (poll creation/detail, profile, favorites) the user can run a search; on back-out the nested history walks them back to the exact origin scene at its captured snap, with in-progress state intact. This is a core nav invariant: the search dismiss target is the origin child via `previousOverlayRoute` + captured snap, and state preservation is free since `resolveMountedSceneKeys` never prunes.

## Moderation & abuse resistance

- **Food-aware Gemini moderation** on every comment/poll submit (`gemini-3.1-flash-lite` + `moderation-prompt.md`, conservative allow-by-default) — robust to "killer fries" / "to die for pasta".
- **Abuse resistance grounds in reality, not user-counting** (no trust scores or account caps — those are sybil-able). Restaurants are Google Place-gated (fakes are structurally impossible); dishes are AI plausibility-gated (jokes/nonsense are killed; plausible-but-fake dishes are created but rank low). User counts affect ranking, never existence.
- **Explicit create-dish / create-restaurant flows** get an instant Lite validation call (moderation + dish-plausibility); on rejection a poll comment stays in the thread untouched, but a create-form gets honest user-facing feedback.
- **Report action on comments** with rejection feedback surfaced, plus rate limits on poll writes (`@RateLimitTier('sensitive')`, per-user on comment/like/delete/create).

## Profile, share & restaurant surfacing

- **Profile poll cards** (created / contributed tabs) show live stats (comments · endorsers) via `/polls/me`, with contribution identity ("you commented / you endorsed") on cards and detail.
- **Share a poll** via deep link.
- **Restaurant-profile poll surfacing** splits into a Polls tab (every poll this restaurant ranked in + placement) and a Mentions/Anecdotes tab (every comment recommending it, sorted by likes — the Google-reviews-search superpower). They're different objects and don't share a list.
- **Graduation transparency.** Once closed and graduated, a subtle "results finalized" state shows the leaderboard is final and fed real evidence.

---

## Still to decide

- Does "poll of the week" (the app-poll pin) earn its keep? Validate engagement post-launch; pull the pin if users don't value it.
- The windowless-New/Trending rule says the Time filter should be Top-only — gate the chip's visibility there, or leave it applied to any sort?
- Poll-close notification: ship the in-app "results are in" state now and add push later, or build push up front?
- Should polls own a restaurant child route? Today an entity-span tap opens the restaurant under the search owner, so closing returns to search rather than the poll.
- Sequence the search-from-anywhere return build (a multi-cycle core-nav effort) ahead of creation-v2, since creation can't ship correctly until back-restore works.
- Richer subject filters (cuisine, by-entity) beyond the locked All · Polls · Discussions labels.
