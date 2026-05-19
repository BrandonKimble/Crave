# Crave Performance Scenarios

This directory is the entry point for search submit/dismiss perf and parity
scenarios. Maestro flows drive user paths while the app owns measurement and
structured parity events.

The app-side switch is:

```sh
crave://perf-scenario?scenario=<name>&scenarioRunId=<id>&durationMs=<ms>
```

`scripts/perf-scenario-ios.sh` opens that URL, runs a Maestro flow, clears the
scenario, and writes a compact JSON report from `[SearchPerf]` logs.

```sh
yarn perf:scenario:ios maestro/perf/flows/<flow>.yaml <scenario_name>
```

For timing windows that Maestro cannot reliably hit, the app also exposes a
perf-only command lane:

```sh
crave://perf-scenario-command?action=<action>&delayMs=<ms>&scenarioRunId=<id>
```

The command lane is inert unless a perf scenario deep link invokes it. It routes
through existing runtime refs, so it should emit the same structured
`VisualReadiness` events as the product action path instead of faking contract
evidence.

## Flows

### Repeat Submit/Dismiss

```sh
yarn perf:scenario:ios maestro/perf/flows/search-submit-dismiss-repeat.yaml search_submit_dismiss_repeat
```

The repeat flow taps the Best restaurants shortcut, waits for the results close
action to appear, taps Close results, then repeats the submit/reveal/dismiss
cycle five times. It is intentionally focused on repeated result sheet reveal
and dismiss regressions rather than sheet dragging.

Validate repeat parity with:

```sh
yarn perf:scenario:contracts /tmp/perf-scenario-<run_id>.json
```

### Visual Parity

```sh
yarn perf:scenario:ios maestro/perf/flows/search-submit-visual-parity.yaml search_submit_visual_parity
```

The visual parity flow takes targeted screenshots around the recovered April 17
search UX baseline and emits structured reveal timing/source events. Validate it
with:

```sh
yarn perf:scenario:visual-contracts /tmp/perf-scenario-<run_id>.json
```

The default config is
`maestro/perf/contracts/search-submit-visual-parity.json`. It covers old-good
frosty constants, nav/toggle cutout geometry, shared sheet snap formula, reveal
ordering, card/marker timing when emitted, visual source constants, and targeted
sheet/chrome screenshot regions. It also checks that the visible nav cutout
does not expose sheet content, hidden-nav result screenshots keep the sheet
filled through the bottom band, the result sheet survives a post-search map drag,
and Search This Area appears with measured button geometry after that drag. The
route sheet frame source check allows the bounded native adapter rebind
subscription used to track snapshot/object changes, while still requiring
per-frame progress to stay in Reanimated shared values and rejecting a
`useSyncExternalStore` frame loop. The checker now hard-fails if the
`resultsEntering` screenshot is captured after `cards_pins_cover_reveal_started`
or if transition screenshots cannot prove the bottom band stays filled while
the nav hides and while results dismiss back to polls.
The scenario runner captures the transient `resultsEntering` and
`resultsClosePressUp` screenshots from runtime log events instead of Maestro
flow steps: the entering screenshot waits for the initial-loading results
header source and a pre-reveal nav/cutout lockstep sample, and the close
screenshot waits for a dismiss nav/cutout lockstep sample after
`results_dismiss_press_up_contract` but before bottom handoff.

### Search This Area

```sh
yarn perf:scenario:ios maestro/perf/flows/search-submit-search-this-area.yaml search_submit_search_this_area
```

The Search This Area flow is a promoted required scenario. It starts from
shortcut results, performs a real map pan, waits for the real Search this area
button, taps it, and waits for results again. Validate it with:

```sh
yarn perf:scenario:contracts /tmp/perf-scenario-<run_id>.json
```

The parity checker expects `search_this_area_submit_press_up_contract` plus the
shared rows/pins/labels/native-enter/cover-release contracts after the tap.

### Interrupt/Reversibility

```sh
yarn perf:scenario:ios maestro/perf/flows/search-submit-dismiss-interrupt.yaml search_submit_dismiss_interrupt
```

The interrupt flow starts with a real shortcut tap, then uses the app-side
command lane to issue `close_then_submit_shortcut` with a precise delay inside
the interactive-before-bottom window. This tests runtime reversibility without
Maestro tap delivery latency.

Validate interrupt/reversibility with:

```sh
yarn perf:scenario:interrupt-contracts /tmp/perf-scenario-<run_id>.json
```

The interrupt contract expects `scenarioName=search_submit_dismiss_interrupt`
and fails if the resubmit does not start before the first bottom handoff.

### Market + Demand Validation

These flows are intentionally separate from the submit/dismiss parity suite.
Use them to validate TomTom market resolution, cache attribution, autocomplete
lane behavior, and Search This Area wiring without running the known fragile
visual parity contract.

The iOS runner defaults simulator CoreLocation to Austin
(`30.2672,-97.7431`). A flow can override the simulator location with a top-level
comment:

```yaml
# perf-scenario-sim-location: 46.7867,-92.1005
```

`PERF_SCENARIO_SIM_LOCATION_LAT` and `PERF_SCENARIO_SIM_LOCATION_LNG` still
override both the default and the flow comment when a one-off run needs a
specific location.

```sh
yarn node scripts/seed-market-demand-maestro-fixtures.js seed

yarn perf:scenario:ios maestro/perf/flows/market-demand/austin-search.yaml market_demand_austin_search
yarn perf:scenario:market-demand-contracts /tmp/perf-scenario-<run_id>.json

yarn perf:scenario:ios maestro/perf/flows/market-demand/spicewood-rollup-search.yaml market_demand_spicewood_rollup_search
yarn perf:scenario:market-demand-contracts /tmp/perf-scenario-<run_id>.json

yarn perf:scenario:ios maestro/perf/flows/market-demand/off-region-active-search.yaml market_demand_off_region_active_search
yarn perf:scenario:market-demand-contracts /tmp/perf-scenario-<run_id>.json

yarn perf:scenario:ios maestro/perf/flows/market-demand/passive-off-region.yaml market_demand_passive_off_region
yarn perf:scenario:market-demand-contracts /tmp/perf-scenario-<run_id>.json

yarn perf:scenario:ios maestro/perf/flows/market-demand/autocomplete-first-letter.yaml market_demand_autocomplete_first_letter
yarn perf:scenario:market-demand-contracts /tmp/perf-scenario-<run_id>.json

yarn perf:scenario:ios maestro/perf/flows/market-demand/autocomplete-query-lanes.yaml market_demand_autocomplete_query_lanes
yarn perf:scenario:market-demand-contracts /tmp/perf-scenario-<run_id>.json

yarn perf:scenario:ios maestro/perf/flows/market-demand/autocomplete-attribute-gate.yaml market_demand_autocomplete_attribute_gate
yarn perf:scenario:market-demand-contracts /tmp/perf-scenario-<run_id>.json

yarn perf:scenario:ios maestro/perf/flows/market-demand/autocomplete-noisy-attribute-gate.yaml market_demand_autocomplete_noisy_attribute_gate
yarn perf:scenario:market-demand-contracts /tmp/perf-scenario-<run_id>.json

yarn perf:scenario:ios maestro/perf/flows/market-demand/cache-repeat.yaml market_demand_cache_repeat
yarn perf:scenario:market-demand-contracts /tmp/perf-scenario-<run_id>.json

yarn perf:scenario:ios maestro/perf/flows/market-demand/search-this-area.yaml market_demand_search_this_area
yarn perf:scenario:market-demand-contracts /tmp/perf-scenario-<run_id>.json

yarn node scripts/seed-market-demand-maestro-fixtures.js cleanup
```

The market-demand contract checks structured app events only: API failures,
perf command failures, resolved market identity, cache-vs-backend reveal
metadata, passive market resolve responses, first-letter autocomplete, and the
Search This Area press-up event. It distinguishes normal visual reveals from
valid no-results reveals: empty result sets still must publish a ready source
frame, mark cards ready through the no-renderable-results gate, receive a native
mounted-hidden ACK, and commit without unresolved reveal watchdogs. It does not
enforce screenshot parity.

The measurement layer intentionally keeps the useful existing signals:

- JS frame sampler
- native UI frame sampler
- JS task latency sampler
- existing `[SearchPerf]` runtime/profiler attribution emitted by the app

Flows should describe real user paths where possible and include repeated-use
loops so degradation after two or three submit/dismiss cycles is visible. Use the
app-side command lane only for reversal/timing windows where Maestro action
delivery is the thing being measured instead of the app runtime.

## Contracts

The repeat parity checker consumes structured app probes from the scenario log. It
asserts that the cover gate releases only after card and map/native readiness,
marker enter starts after that gate, LOD emits no same-key pin/dot overlap,
pins and dots classify the same committed frame, cards are owned by the mounted
in-sheet body, shortcut submit and dismiss press-up transitions fan out as one
coordinated event, mounted result card counts reach the backend page count after
release, the first restaurant result row stays below the mounted header chrome
region, the results toggle/cutout bar is present in the mounted sheet, and
shortcut map source frames/native enter include pins, pin labels, and dots with
Mapbox placement collision preserved,
deleted external/hidden list paths remain absent.

The first-row/header assertion depends on a runtime `VisualReadiness` event named
`result_row_header_chrome_boundary_contract`. The runtime worker must emit it
when first result rows mount with `firstRowTopY`, `headerChromeBottomY`,
`rowHeaderOverlapPx`, `overlapsHeaderChrome`, `activeTab`, `surfaceMode`, and
`transactionId`. The contract fails until that event exists and proves
`firstRowTopY >= headerChromeBottomY` with zero overlap.

The same checker also has required coverage for non-shortcut scenarios:
`search_submit_natural` requires a real `natural_submit_attempt_contract`, and
`search_submit_search_this_area` requires a real
`search_this_area_submit_press_up_contract`. When those scenario names are used,
the checker fails if the path does not reach rows, pins, labels, native marker
enter/settle, and cover release after the non-shortcut submit event. API request
failures during any perf scenario are emitted as structured Scenario events with
`baseURL` and fail the parity contract instead of being hidden in console text.

Each run prints the contract result JSON to stdout and writes the same payload
next to the report by default. For `/tmp/perf-scenario-scenario-foo.json`, the
structured output path is `/tmp/perf-scenario-parity-contracts-foo.json`. Use
`--output <path>` to write somewhere else:

```sh
yarn perf:scenario:contracts /tmp/perf-scenario-<run_id>.json --output /tmp/contracts.json
```

Visual contract runs also print JSON to stdout and persist the same payload next
to the report. For `/tmp/perf-scenario-scenario-foo.json`, the default visual
output path is `/tmp/perf-scenario-visual-contracts-foo.json`. Use
`--output <path>` to override it:

```sh
yarn perf:scenario:visual-contracts /tmp/perf-scenario-<run_id>.json --output /tmp/visual-contracts.json
```

Use `--screenshot-dir <dir>` or `PERF_SCENARIO_SCREENSHOT_DIR=<dir>` when visual
parity screenshots are stored outside the repo root.

Interrupt contract runs also print JSON to stdout and persist the same payload
next to the report. For `/tmp/perf-scenario-scenario-foo.json`, the default
interrupt output path is `/tmp/perf-scenario-interrupt-contracts-foo.json`.

Submit/dismiss UX parity is split deliberately between structured and visual
contracts. Structured events prove same-callback state fanout, cover-gate
readiness, row-count parity, toggle ownership, LOD, and dismiss handoff order.
Screenshot contracts remain targeted at stable sheet/chrome pixels and avoid
map-tile regions.

## Reading Reports

`scripts/perf-scenario-report.js` emits both raw measured-loop summaries and
`measuredRepeatLoopTrimmed`. Use `measuredRepeatLoopTrimmed` as the decision
surface for product cuts: it removes first-submit/startup noise and focuses on
the repeated hot loop.

Do not start another product runtime cut from a single worst JS/UI number unless
the trimmed report points to a concrete app-level owner. Prefer correlations
that agree across sampler windows, profiler spans, work spans, native slices,
and visual readiness events. If the remaining cost is logging, sampler delivery,
RN/Hermes scheduling, or another boundary without an actionable owner, improve
measurement rather than cutting product architecture.
