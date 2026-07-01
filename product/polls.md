# Polls

> **Rolling canonical vision — not a changelog.** Keep this file thin and *current*: it describes
> only what we want this area of the app to be **today**. When something changes, edit or delete the
> old text in place — never append "superseded"/"old"/"previously" notes, history, or pointers to
> past ideas. If you follow this file, you know exactly what we want. Execution detail + migrations
> live in `plans/`; business/gating rationale lives in `business/`.

---

Polls are Crave's community contribution layer: a per-market feed of "best X" questions where the **discussion thread is primary** and a ranked **endorsement leaderboard** is a read-model projected over it. A poll is not a structured vote proxy — it's a first-class collection source that flows through the *same* extraction → resolution → evidence pipeline as Reddit, so at close it **graduates into the objective Crave Score** with honest, explainable evidence. Polls and discussion are deliberately **free**, alongside ranking, search, map, and open-now/price: they drive contribution, virality, and feed the Score, so gating them would kill the flywheel. Crave+ gates the dish-level experience, not this.

## Core model

- **Thread is the source of truth; the leaderboard is a projection.** No vote or score is stored on the leaderboard — it's computed live from comments + endorsements.
- **The under-poll line + info modal teach it.** Under each poll, a short line invites participation — working version: **"Vote directly, or discuss below — both shape the poll."** — with an **ⓘ info button to its right** (same pattern as the Crave Score info modal) that opens a modal explaining the model precisely: the standings are a **live projection/estimate** computed from the votes and discussion below, re-sorting in real time as people take part, and graduating into the Crave Score at close. The inline line stays light and inviting; the modal carries the precise "how this works." (Exact wording being finalized.)
- **A poll thread is just another collection source.** At close, the whole thread is submitted to the collection pipeline as a poll-thread source; extracted mentions flow into the same evidence ledger the Score rebuilds from.
- **Two modes: ranked vs discussion.** Ranked polls have an inferred axis, a leaderboard, and graduation; discussion polls are pure thread — no axis, no leaderboard, no graduation. The LLM decides which at creation.
- **Axis shapes the subject.** Restaurant-axis polls endorse restaurants; dish-axis polls endorse a `(restaurant, dish-category)` pairing, held live as a poll-local composite key. Real Connections mint only at graduation, so the live leaderboard never writes unverified data into the shared core.
- **Collect greedily, project narrowly, finalize at close.** Live surfaces (highlighting, counts) are best-effort; canonical evidence is computed once at close.
- **No pre-seeding of options.** Cold start is acceptable; options emerge only from the discussion. Day-one usefulness comes from Reddit-seeded scores.

## Poll creation

- **Type-less, subject-first canvas.** No template picker. The user types a free-text **Subject/question** plus optional **Description**; the backend infers mode and axis. The options field is empty and non-editable ("Your ranking forms from the discussion") — options are never hand-seeded.
- **Description is the creator's organic seed.** It's treated like a comment: its entity spans seed the creator's endorsements into the live leaderboard at creation, and it's an extractable creator-authored unit at graduation.
- **Axis-inference confirm chip.** On high-confidence inference, show the inferred structure back ("Ranking: breakfast sandwiches · NYC") with an edit escape hatch; low/no confidence silently falls to discussion mode.
- **Market picker is a modal value-picker**, pre-selected to the map-resolved market you're on, with a full market list and search-across-markets.
- **Creation choreography** mirrors poll-detail's nav-push: on first open it auto-extends to the top snap with the subject focused and keyboard up; the keyboard dismisses the instant you drag the sheet and returns only at the top snap on a manual text-box tap.
- Media attach is out of scope for now, handled later by a shared app-wide media slice; the poll components keep a clean optional-media seam.

## Creation dedup (the volume valve)

- **Dedup, don't cap.** Most big-city pileup is duplication ("best tacos in Austin" asked ten times). Duplicates route to the existing poll rather than rejecting creation.
- **Dedup-first submit.** A fast precision-favoring text-similarity check runs over active market polls first (sub-100ms, no LLM) → on a match, the duplicate modal shows immediately. Only when there's no obvious dup does the LLM infer the subject, followed by an exact-entity dedup against active polls' resolved targets after resolution.
- **Duplicate modal.** A bottom sheet — "This looks like an active poll" — with **View the poll** (discard draft, open existing) or **Discard**. We never silently convert a draft into a comment.

## Feed curation

- **Live ⇄ Results primary split** (segmented sliding-pill toggle, default Live). "Results" is the weekly payoff; the two are distinct datasets, so the toggle refetches.
- **Default order is the silent nudge.** App/Crave polls pin on top (sparkles treatment); then user polls rank by demand alignment — higher demand ranks higher, nudging the community toward high-value subjects. Pinning applies only to the default sort.
- **User-selectable sorts: New / Top / Trending.** New is launch date; Top is distinct endorsers (engagement); Trending is decayed engagement velocity (heat half-life ≈ 3 days, distinct-user-counted, spam-resistant). All three are engagement-based, not entity-score — the score model is undefined for dish-axis and discussion polls.
- **Type filter: All · Polls · Discussions** (ranked vs discussion). We deliberately don't group on dish vs spot — "best tacos" is ambiguous (reads as a dish but ranks spots). Richer subject filters (cuisine, by-entity) come later.
- **Time filter: This Week / All Time**, mainly for Results; New and Trending are windowless.
- **Card differentiation.** User polls show a description snapshot (app polls usually won't), making them more human and inviting. Discussion-poll cards lead with the body preview and no bars (must never look empty); ranked-poll cards show leaderboard bars, a top-1 hook, and a Reddit-style footer.
- **Friend signal on cards.** Polls people you follow have engaged in carry the shared **FriendCluster** (stacked avatars; named friend = highest-affinity, tap to expand). Unlike the places' verb-first "Saved by …", the poll label is **subject-first and action-specific**: "**Sarah voted**" if the friend tapped to vote on the poll, or "**Sarah commented**" if they participated in the discussion (+ "and others"). If a friend did both, show "commented" (the richer action); the verb always follows the named highest-affinity friend. A strong, social reason to open a poll. (See `profile.md`.)
- **One shared toggle-strip shell** (frost + masked-hole cutouts + horizontal scroll) — the same primitive search renders through, so the strips never drift. The re-sortable feed disables FlashList MVCP, which otherwise anchors the old top row on re-sort and scrolls the strip off-screen.

## Cadence & scheduling

- **Creation is never time-gated.** The weekly rhythm is about results and app polls, not user creation.
- **User polls self-schedule a 3–14 day close window, default 7.** This avoids the Thursday-poll-gets-1-day problem, spreads close-load, and keeps a steady stream of fresh Live and freshly-Closed polls.
- **Per-user soft cap: 2 active polls per week per market** (rolling 7-day window, clear message, app/seeded polls excluded). No cap on comments or discussion.
- **App/Crave polls are the weekly editorial spine.** A demand-driven scheduler picks *what to ask* from real search demand, publishes Sunday with a 7-day window (closes the following Sunday — informs weekend dining, finalizes Sunday), and pins it as "poll of the week" under the default sort. This is a post-launch bet; pull the pin if unloved.
- **Demand-cooldown coupling.** A user poll targeting an entity bumps that entity's last-polled timestamp like the scheduler does, suppressing a redundant app poll on the same subject and naturally cooling its user polls over time.
- **Per-poll close is a mini-event** — an in-app "results are in" state, with a poll-close push notification as a later add.

## Comment threads, likes & endorsement

- **Threaded comment CRUD.** Post/edit/soft-delete, parent-child threading, shareable deeplink per comment, moderated on post; both ranked and discussion polls have threads.
- **Per-comment likes** (Reddit-style, unrestricted): toggle like/unlike for thread sort; a self-like is ignored for endorsement but allowed as a like. **Comment sort: Top (default) / New.**
- **Endorsement leaderboard = distinct users endorsing a subject**, deduped per `(user, subject, poll)`. Endorsing means authoring or liking a comment that *positively* names the subject (polarity from sentiment); the leaderboard "+1" button writes the same set, not a parallel tally. Liking three comments about Joe's counts as one endorsement.
- **Tap-to-endorse on the leaderboard bars.** TikTok-style full-width result bars you tap to endorse; the count is split-colored (digits flip white where the fill covers them), with a pink heat scale by rank. Only existing candidates can be endorsed — new candidates enter only via discussion.
- **Reddit-grade threading.** Vertical connector rails per ancestor level, tap-to-collapse a subtree (animated accordion), indent caps at 5 levels then flattens and @mentions the parent (IG/YouTube continuation, not a "Continue thread →" screen).
- **Persistent compose chin + reply float.** The compose box is pinned at the bottom, keyboard-tracked. Reply raises the chin with a pinned copy of the target ("Replying to {name}" + preview + ✕) and highlights the target row.
- **Entity-highlighted comment spans** render inline tappable highlights → restaurant profile or entity-scoped search for food.
- **Edit/delete are cheap.** Because authoritative collection runs only at close, only the final comment state is processed: edit re-runs the gazetteer; delete is soft-deleted and excluded at close.

## Entity linking & graduation into the Score

- **On-submit gazetteer highlighter (no LLM).** A candidate-phrase probe over known entity names + aliases (longest-match, shared with the search matcher) resolves known-entity spans for instant highlight, deeplink, and live leaderboard. It's a closed-set lookup, not a replacement for the open-set LLM extraction at close.
- **Live leaderboard vs authoritative scoring.** The leaderboard is gazetteer-live (free, ~95% accurate on "best X" polls, labeled "live tally · finalizes when the poll closes"); the expensive sentiment-weighted evidence finalizes at close, with per-comment async LLM only as an upgrade if the live tally drifts.
- **The poll is a sandbox; the gate is the global boundary.** New entities — even junk — show live in the poll's discussion and projection, but nothing reaches the real global system (search, profiles, Crave Scores) until it passes the plausibility gate at close.
- **Close-time graduation.** Closing runs the full thread through the collection pipeline as a poll-thread source: extraction → resolution → new-entity discovery → evidence ledger → leaderboard finalize → highlight backfill. It's idempotent. An attribute-target poll ("best patio") creates/links the `patio` attribute to restaurants lacking it at close, identical to Reddit collection.

## Autocomplete poll lane

- **Polls are an autocomplete lane with zero reserved slots.** A poll result joins the overflow pool behind the reserved entity slots; relevance combines question-text match, entity-in-poll match, market match, and activity/recency. The row shows an accent chart icon; tap opens poll detail.
- The direction is a single unified relevance score across all candidate types (entity, query, poll) sorted purely by score, with polls just another candidate — scoped to autocomplete only.

## Real-time updates

- **Per-poll live refresh.** Poll detail subscribes to its own poll's update events (deferred past gestures) so comments, likes, and the leaderboard refresh without manual reload. The target system is per-poll rooms with granular event types (new comment, like delta, leaderboard shift, highlight ready), replacing today's global broadcast.

## Sheet, transition & chrome

- **Poll-detail full-screen nav-push transition.** A 3-part illusion — nav silhouette slides down, native sheet mask follows, the hard-clip lifts to full viewport — pivoting on a single shared signal.
- **Shared frost foundation + header parity.** Every sheet routes through one frosted background; white body layers sit below the header band so the header cutouts (grab-handle + close holes) reveal frost, and the header scroll divider is threaded to every non-search scene.
- **Sheets are non-dismissable by swipe (the docked compose bar is permanent); modals dismiss armed-outside.** Poll detail dismisses via the X button; a clean drag-past-threshold dismiss is the intended upgrade.

## Navigation foundation (search-from-anywhere)

- **Search from anywhere → explore → return.** From any screen (poll creation/detail, profile, favorites) the user can run a search; on back-out the nested history walks them back to the exact origin scene at its captured snap, with in-progress state intact. The search dismiss target is the origin child plus its captured snap, and state preservation is free because mounted scenes are never pruned. This is a core nav invariant.

## Moderation & abuse resistance

- **Food-aware moderation** on every comment and poll submit — conservative, allow-by-default, robust to "killer fries" / "to die for pasta".
- **Abuse resistance grounds in reality, not user-counting** (no trust scores or account caps — those are sybil-able). Restaurants are Google Place-gated, so fakes are structurally impossible; dishes are AI plausibility-gated, so jokes and nonsense are killed while plausible-but-fake dishes are created but rank low. User counts affect ranking, never existence.
- **Explicit create-dish / create-restaurant flows** get an instant validation call (moderation + dish-plausibility). On rejection a poll comment stays in the thread untouched, but a create form gets honest user-facing feedback.
- **Report action on comments** with rejection feedback surfaced, plus per-user rate limits on poll writes.

## Profile, share & restaurant surfacing

- **Profile poll cards** (created / contributed tabs) show live stats (comments · endorsers) with contribution identity ("you commented / you endorsed") on cards and detail.
- **Share a poll** via deep link.
- **Restaurant-profile poll surfacing** splits into a Polls tab (every poll this restaurant ranked in, plus placement) and a Mentions/Anecdotes tab (every comment recommending it, sorted by likes — the Google-reviews-search superpower). They're different objects and don't share a list.
- **Graduation transparency.** Once closed and graduated, a subtle "results finalized" state shows the leaderboard is final and fed real evidence.

## Still to decide

- Does "poll of the week" (the app-poll pin) earn its keep? Validate engagement post-launch; pull the pin if users don't value it.
- The Time filter only makes sense for Results — gate the chip's visibility there, or leave it applied to any sort?
- Poll-close notification: ship the in-app "results are in" state now and add push later, or build push up front?
- Should polls own a restaurant child route? Today an entity-span tap opens the restaurant under the search owner, so closing returns to search rather than the poll.
- Sequence the search-from-anywhere return build (a multi-cycle core-nav effort) ahead of creation-v2, since creation can't ship correctly until back-restore works.
- Richer subject filters (cuisine, by-entity) beyond the All · Polls · Discussions labels.
