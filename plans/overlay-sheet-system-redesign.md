> **[SUPERSEDED — supersession banner added 2026-08-03 (truth audit)]** This file is a raw
> ChatGPT transcript, not a plan — it is the _provenance_ of the overlay-sheet redesign line.
> Succession chain: this → `overlay-sheet-system-redesign-v2.md` → `overlay-sheet-system-redesign-v3.md`
> → `sheet-v4-foundation-plan.md` → `overlay-sheet-unification.md` → the scene-stack era
> (`page-switch-master-plan.md`) → `page-composition-from-scratch-design.md` (THE PAGE v2) →
> `page-world-derivation.md` → `residents-cutover-plan.md`. Do NOT build from this file.
> Every implementation file it names (`BottomSheetWithFlashList.tsx`, `SecondaryBottomSheet.tsx`,
> `overlays/PollsOverlay.tsx`, `screens/Search/index.tsx` as sheet orchestrator) is gone from
> `apps/mobile/src` as of today; the shipped sheet is `apps/mobile/src/tracksheet/` (default-on,
> `tracksheet/track-flip-store.ts:12`).

Is there any info out there about what approach Google Maps devs took with their bottom sheet + list implementations? My implementation is very low in JS performance and I’m curious if I can learn anything from the approach they have taken and why.

There **isn’t a direct, official deep-dive from Google engineers specifically documenting exactly how the Google Maps team implemented their bottom sheet + list system (e.g., exact view hierarchies, diffing strategies, rendering pipeline choices, etc.)** in the way you might find for an open-source project. That said, we _do_ have several credible clues and community/engineering signals you can learn from to understand why their implementation is performant — and what patterns they’re likely using under the hood.

---

## 📌 1. They _don’t_ use out-of-the-box bottom sheet components

Across Android development discussions (e.g., Reddit, StackOverflow), the consensus is that Maps doesn’t use the standard `BottomSheetDialogFragment` or the stock Material bottom sheet; instead, they use **a custom bottom sheet mechanism**, often with bespoke behavior that supports multiple states and gesture handling beyond what the standard library provides. Custom implementations are likely optimized at a lower level. ([Reddit][1])

- Community threads talking about “what type of bottom sheet Google Maps uses” conclude that it’s not a simple `BottomSheet` from the design library — hence why simple prompts/libraries don’t match its behavior. ([Reddit][1])
- Older StackOverflow threads show Google Maps bottom sheet behaving in _three distinct interaction phases_ (peek, expanded with toolbar, expanded without toolbar), something stock bottom sheets don’t offer without heavy customization. ([Stack Overflow][2])

**Key takeaway:** _Performance gains may come from a carefully tailored sheet implementation with fine-tuned state transitions and frame-budget-aware gesture handling._

---

## 📌 2. Likely tight integration with the map view

Part of what makes the Maps bottom sheet feel smooth is that the **map itself isn’t being resized or re-rendered on every bottom sheet drag.** There are references (e.g., in Medium posts about map + sheet interactions) where developers show that high-performance integrations:

- _Adjust the map’s UI overlay (e.g., pad UI controls) instead of resizing the entire map view._
- _Only adjust heavier states (like camera position) at key transition points rather than per-frame during drag._ ([Medium][3])

This pattern reduces expensive layout passes and avoids forcing the map to continuously relayout/recompose as the bottom sheet moves.

**Why this helps performance:**
Map rendering is usually GPU-accelerated and runs on a separate compositor than your app UI. If your sheet is forcing re-layout/measure for every pixel of movement, you’ll kill performance. Decoupling the map viewport from sheet movement avoids that.

---

## 📌 3. They probably avoid deep view hierarchies and excessive recomposition

Even if they use Compose internally on Android (which many parts of Android are migrating toward), performance best practices still apply:

- Flatten hierarchies where possible. Nested view hierarchies impose heavy measure/layout costs on each UI frame. ([Android Developers][4])
- Use derived state or other memoization mechanisms (in Compose) to prevent expensive recompositions for animations.
- Render large lists with virtualized scrolling (e.g., `LazyColumn` in Compose or `RecyclerView` on View system) to avoid layout constantly recalculating every child’s measurement.

These patterns are standard for high-performance Android UI, and anything as complex as Maps’ sheet + list _must_ use them to hit 60fps.

---

## 📌 4. Google Maps UI redesign uses _sheet overlays everywhere_

Design articles (e.g., Android Authority on Maps’ sheet redesign) point out that Google is aggressively moving to sheet-based navigation across the app — and they do so in a way that keeps the map content _visible and interactive behind it._ ([Android Authority][5])

This implies:

- The bottom sheet is a peer layer rendered over the map, rather than causing major layout shifts in the main screen.
- Animations and transitions are likely using highly optimized interpolators, gesture detection, and composited animations to avoid forced synchronous layout.

---

## 🚀 Performance Patterns _You_ Can Apply

While we don’t have Google’s exact source, here are **practical learnings** based on what’s known about high-performance mobile UI (and what Maps likely does):

### 🧠 Use a custom sheet with:

- Multi-state gesture tension and snapping logic.
- A _single composited animation driver_ (avoid remeasuring on every drag).
- Gesture handling separated from layout passes.

### 📊 Optimize list and UI rendering:

- Virtualize your list (e.g., `LazyColumn`, `RecyclerView`), only rendering visible items.
- Avoid deep nested views — flatten hierarchies where possible.

### 🎨 Separate map interaction from sheet logic:

- Don’t resize or reflow the map every frame; only adjust padding/UI overlay offsets. ([Medium][3])
- Only update expensive map interactions (like camera movements) at key states.

### 🧪 Profile aggressively:

- Use instruments like _Systrace_/\*_Android Studio Profiler_ (on Android) to find UI thread spikes.
- Look for layout passes >16ms — those kill smooth animations.

---

## 📌 Summary

| Topic                       | What’s likely true in Google Maps | How it helps                |
| --------------------------- | --------------------------------- | --------------------------- |
| Bottom sheet implementation | Custom, not stock Material        | Finer control + performance |
| Map integration             | Separate from sheet movement      | Avoids heavy reflow         |
| Gesture handling            | Optimized framework               | Smooth drag transitions     |
| List rendering              | Virtualized + sparse              | 60fps scrolling             |

---

## If you want deeper engineering references

There isn’t an official Maps UI engineering blog on this — but you _can_ look at:

- Google I/O and Android UI talks about performant UI patterns.
- Android Developers guidance on flattening layouts and Compose performance.
- Medium blog posts on custom sheet implementations (e.g., how padding adjustments can avoid heavy redraws). ([Medium][3])

If you can share details of your implementation (e.g., JS / React Native vs native), I can tailor specific performance suggestions based on your stack.

[1]: https://www.reddit.com/r/androiddev/comments/xjfjx4/what_type_of_bottom_sheet_dialog_that_google_map/?utm_source=chatgpt.com 'What type of bottom sheet dialog that google map use?'
[2]: https://stackoverflow.com/questions/34160423/how-to-mimic-google-maps-bottom-sheet-3-phases-behavior?utm_source=chatgpt.com "How to mimic Google Maps' bottom-sheet 3 phases ..."
[3]: https://medium.com/turo-engineering/adjusting-compose-google-map-while-bottom-sheet-moves-4a7465305137?utm_source=chatgpt.com 'Adjusting Compose Google Map While Bottom Sheet Moves'
[4]: https://developer.android.com/topic/performance/rendering/optimizing-view-hierarchies?utm_source=chatgpt.com 'Performance and view hierarchies | App quality'
[5]: https://www.androidauthority.com/google-maps-sheets-3548003/?utm_source=chatgpt.com 'Google Maps sheets redesign hits every last corner of ...'

I’m using react native with mapbox. I have a lot of bottomsheets like Google Maps but I use a library (not sure which one) and the main problematic sheet is my search results sheet with 20+ results on it and toggles and more - JS gets as low as 0 but honestly none of the other sheets stay at 60 when being flicked around and tend to hover at 20 to 30 and they don’t even have lists on them. Is it really possible to get them all to 60 fps?

Yeah — **it’s absolutely possible to have Google-Maps-style sheets feel like 60fps** in React Native… but the important nuance is:

- You can get **60fps sheet dragging** even while **JS is ~0 fps**, _if the drag animation is fully UI-thread driven_ (Reanimated + Gesture Handler).
- If your sheets hover at **20–30fps while being flicked**, that usually means the **UI thread** is getting hammered (layout, blur/shadows, overdraw, expensive view trees, Mapbox composition issues), _not_ just JS.

So the question becomes less “can RN do 60” and more “can my current implementation avoid UI-thread work while the sheet moves?” Most apps can, with some targeted changes.

## The big culprits in Mapbox + bottom sheets

### 1) The sheet animation is forcing layout every frame

If the sheet is animating **height** (or anything that causes re-layout) instead of **translateY**, you’ll tank FPS even if JS is idle.

**What you want:**

- The sheet moves via **transform: [{ translateY }]** (UI-thread), not by resizing.
- The content inside the sheet should not re-measure/reflow on every drag.

Many bottom sheet libs do this right, but it’s easy to accidentally reintroduce layout work via wrappers/styles.

### 2) Blur + shadows + transparency over a Map

Blur (Expo Blur) + big translucent surfaces + shadows over a live map is a classic 20–30fps recipe. It creates:

- expensive offscreen rendering
- lots of overdraw
- extra compositing against Mapbox’s GPU surface

**If you want 60 while dragging:**

- Avoid blur on the moving surface (or only enable blur when “settled”).
- Use a solid/semi-opaque background while dragging, then fade in blur after the gesture ends.

### 3) The sheet re-renders while you drag

Even if the gesture is on the UI thread, you can still cause UI-thread jank if the sheet subtree is huge/complex and you’re doing things that trigger updates during drag:

- state updates tied to animated position
- toggles/list items rerendering due to props changing
- dynamic styles recalculated in JS during movement

**Rule of thumb:** while the sheet is moving, _nothing should be re-rendering or re-measuring._

### 4) Mapbox + overlays interaction

Some setups cause Mapbox to recompose / re-layer when overlays animate on top (especially with transparency). This can show up as UI FPS drops even if the sheet is transform-driven.

## “Is it realistic that ALL sheets stay 60fps?”

**Dragging**: yes, that’s realistic.
**Dragging + complex content updating live**: not always, unless you’re very intentional.
**Dragging over blur + shadows + translucent layers + heavy content**: usually no — you’ll need compromises (like disabling blur during motion).

Google Maps makes compromises too: lots of effects are subtly reduced during interaction, and many transitions are GPU/compositor-friendly.

## What I’d do (in order) to get you to 60

### Step 1: Identify the sheet library (without guessing)

Most RN apps use one of these:

- `@gorhom/bottom-sheet` (Reanimated-driven, usually best)
- `react-native-bottom-sheet` variants
- `reanimated-bottom-sheet` (older)

Open your `package.json` and search for “bottom-sheet”. If it’s Gorhom and you’re still at 20–30fps, it’s almost certainly **UI-thread rendering/compositing**, not the gesture.

### Step 2: Confirm it’s UI-thread jank (not JS)

Turn on RN Perf Monitor and watch:

- **UI FPS** vs **JS FPS**
  If UI FPS drops with JS near 0 → you’re looking at **layout/compositing/overdraw** problems.

### Step 3: Remove effects during drag (big win)

- Disable blur while the sheet is being dragged; re-enable on settle.
- Reduce/remove shadows on the moving container (or only shadow the “handle” area).
- Avoid transparent backgrounds over Mapbox while moving.

This one change alone often takes “30fps” to “buttery”.

### Step 4: Freeze heavy content while dragging

Common pattern:

- While dragging: render a **lightweight shell** (or freeze list updates)
- When settled: render the full interactive list/toggles

With lists: keep FlashList, but make sure:

- `renderItem` is memoized (`React.memo`)
- stable `keyExtractor`
- avoid inline functions/styles in item rows
- avoid measuring text/layout repeatedly

### Step 5: Make sure the sheet moves by transform, not layout

Even with Gorhom, you can accidentally force layout work if your container depends on animated values in a way that triggers re-layout.

### Step 6: Watch out for “small” UI killers

These frequently crush UI FPS:

- large rounded corners + overflow clipping on moving views
- big shadows on large surfaces
- nested scroll views inside the sheet
- images without fixed size
- too many absolutely positioned layers

## The honest answer

- **Yes**, 60fps sheet movement is achievable in RN + Mapbox.
- If you’re seeing **20–30fps on sheets without lists**, that strongly suggests **blur/shadow/transparency/layout** issues (UI-thread), not “RN can’t do it.”
- You’ll likely need a couple **interaction-time compromises** (disable blur, reduce compositing, freeze heavy content) to make it consistent.

If you paste:

1. the bottom sheet library name from `package.json`, and
2. a screenshot of your Perf Monitor while dragging (UI/JS FPS),
   I can tell you pretty quickly which bucket you’re in and what to change first.

The UI stays pretty high around 60 but the JS often drops to near 0

That combo (UI ~60, JS ~0) is actually a **very specific and common “good-ish” failure mode** in RN:

- **Your sheet drag is running on the UI thread** (so it _can_ stay smooth).
- **Your JS thread is getting blocked** (so anything that needs JS—list updates, toggles responding instantly, network/state updates, search filtering, etc.) can stutter or “lag behind.”

So yes: **it’s normal for JS FPS to drop during heavy interactions**, and **Google Maps feels great because most of the interaction loop doesn’t depend on a JS thread at all**.

What matters is: do you _feel_ jank (missed touch, delayed presses, list “catching up”, toggles lag), or is it just the perf monitor number?

## Why JS drops to ~0 even when UI is 60

Typical causes:

### 1) You’re doing work on every drag frame on JS

Examples:

- `onChange` / `onAnimate` / `onScroll` handlers that call `setState`
- deriving visible results, sorting/filtering, computing distances, etc. as the sheet moves
- updating Mapbox camera / padding / selected marker in JS continuously

If any of those fire at 60hz and touch React state, JS will get wrecked.

### 2) Re-renders of a big subtree

Even if FlashList is efficient, if:

- parent state changes cause list props to change
- item rows aren’t memoized / stable props
- inline objects/functions are recreated
  …you can trigger continuous reconciliation.

### 3) Expensive effects/logging/allocations

- `console.log` in render paths (kills perf)
- large objects created every frame (styles, arrays, derived data)
- JSON parsing, map/reduce on big arrays, fuzzy search, etc.
- Hermes GC pauses (looks like JS FPS cliff)

## What to do (in the order that usually fixes it fastest)

### A) Make sure drag events do **not** hit React state

During sheet movement, aim for:

- **No `setState`**
- **No derived computations**
- **No Mapbox updates via JS per-frame**

If you need to react to position, keep it on the UI thread (Reanimated shared values). Only “commit” something to JS when the gesture ends (snap index settled).

**Pattern:** update JS on “settled”, not during drag.

### B) If you’re using Reanimated, audit `runOnJS`

`runOnJS` inside a high-frequency callback is a classic JS-FPS killer.

Bad (common):

- `useAnimatedScrollHandler` → `runOnJS(setSomething)` every scroll tick
- bottom sheet animated position → `runOnJS(updateUI)` continuously

Better:

- Keep it in shared values
- Debounce/throttle a JS update
- Only fire when crossing thresholds or on end

### C) “Freeze” heavy content while dragging

This is a Google-Maps-ish trick: while the sheet is actively moving, render a lighter version or prevent updates.

Examples:

- Don’t live-update search results while dragging
- Disable expensive row components until settled
- Defer list re-render until snap completes

In RN you can do:

- `InteractionManager.runAfterInteractions(() => { heavy work })` for recalcs
- maintain a `isInteracting` flag (set on gesture begin/end) and gate heavy work

### D) Make your list rows _boringly stable_

For FlashList:

- `renderItem` stable (`useCallback`)
- Row component wrapped in `React.memo`
- Avoid passing inline style objects, inline handlers; use `useCallback` + stable deps
- Use `extraData` carefully (it forces re-render)
- Prefer primitive props, avoid passing the whole `item` object if it changes identity

### E) Verify what’s blocking JS (don’t guess)

Fast ways:

- **Hermes profiling** (Chrome/Flipper) to see what functions spike during drag
- Turn off **LogBox** and remove logs
- Temporarily replace your row with a `<View style={{height:…}} />` skeleton:
  - If JS FPS recovers → it’s your row rendering / props churn
  - If it doesn’t → it’s global state updates / handlers / computations

## Interpreting your current situation

If **UI stays ~60**, your sheet gesture system is probably fine.
Your main job is to ensure **nothing important depends on JS while dragging**, and to **remove any “per-frame JS work”**.

If you tell me:

1. which bottom sheet library (check `package.json` for “bottom-sheet”), and
2. whether you’re doing anything in `onChange/onAnimate` or scroll handlers,
   …I can point to the highest-probability fix in your setup and what to change first.
