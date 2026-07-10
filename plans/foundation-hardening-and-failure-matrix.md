# Foundation hardening + the failure matrix — ideal shape (design of record)

Owner commission (2026-07-09): "do it all — plan the MOST ideal long-term shape first,
size no object, then implement it all." Scope: (A) offline-resume as a structural
property, (B) the page-foundation spec table (foundation by construction), (C) the
persistent-header contract made loud, (D) the pre-launch failure matrix as a
REPEATABLE harness run against every existing page, (E) the dated cleanup debt.
Companion to plans/page-foundation-codification.md (items 2/3 land here) and the
product/README.md pre-launch gate.

## A. ONE reconnect primitive — offline resume is structural, never per-page

**The gap:** "the hang is finite" is the owner's offline law, but resume-on-reconnect
exists three different ways: search's inline offline→online edge subscription,
react-query's `onlineManager` for query surfaces, and NOTHING for the polls feed's
custom controller (an offline cold feed hangs forever — a law violation).

**Ideal shape:** the system-status store module exports the ONE edge:

```ts
subscribeToReconnect(listener: () => void): () => void
// single offline→online edge detection; every consumer subscribes to the edge,
// none re-implements it.
```

- Search's failure-resume rewires onto it (deletes its inline prev/next comparison).
- The polls feed controller subscribes: on reconnect, when visible and the system is
  usable, one quiet `refreshPollFeed({ skipSpinner: true })` — same supersede
  semantics as every other refresh; the ladder/seq guards already make it safe.
- Future surfaces get resume by subscribing — one line, no re-derivation. (react-query
  surfaces keep `onlineManager`; that IS this primitive for that framework.)
- Self-red-team notes: the polls resume fires a quiet in-place refresh even after a
  no-op blip — harmless by construction (skipSpinner never empties the list) and
  generous to the law. The reconnect EDGE on a real device stays on the owner's
  device-check queue (the sim's NetInfo wedges after host Wi-Fi flaps); the harness
  below therefore drives offline via a DEV LEVER, not real Wi-Fi.

## B. SceneFoundationSpec — the foundation decisions live in ONE compile-time table

**The gap:** skeleton specs are a `Partial<Record>` (silent omission) and the other
per-scene foundation decisions (strip kind, failure policy, header expectation) are
convention. The house seam is the metadata table + `Record<OverlayKey>` completeness —
"a forgotten key is a build error that names the key."

**Ideal shape:** `navigation/runtime/scene-foundation-spec.ts`:

```ts
export type SheetSceneKey = Exclude<OverlayKey, 'search' | 'sheetHost' | 'price' | 'scoreInfo'>;
// search owns its never-null page; sheetHost is the shell sentinel; price/scoreInfo
// are modals (outside the sheet foundation by design — stated, not implied).

export type SceneFoundationSpec = {
  skeleton: { rowType: SceneLoadingRowType; frostBacking?: boolean };
  strip: 'none' | 'frosted-strip';
  failure: 'announcer'; // the uniform standard; a literal so exceptions are impossible silently
  header: 'persistent'; // every sheet scene registers a persistent-header descriptor
};

export const SCENE_FOUNDATION_SPECS: Record<SheetSceneKey, SceneFoundationSpec> = { ... };
```

- `SCENE_STACK_BODY_SKELETON_SPECS` is DELETED; the host derives skeletons from the
  spec table. Adding an `OverlayKey` now fails compilation until every foundation
  decision is stated. ADDING_A_SCENE.md §5 rows point here.
- `strip`/`failure`/`header` are declarative documentation TODAY and enforcement
  hooks as consumers grow (the header assertion in C reads `header`).

## C. The persistent-header contract barks

**The gap:** a scene without a header descriptor silently renders null (dev-warn at
overwrite only). **Ideal:** the header host, on presenting a scene whose foundation
spec says `header: 'persistent'` with no registered descriptor, reports a LOUD dev
contract violation naming the key (prod behavior unchanged: graceful null). The
registry stays a runtime Map (module-scope registration is architecturally right);
the assertion makes the completeness RED-provable.

## D. The failure matrix as a repeatable harness (not a one-off walk)

**Ideal shape per the testing methodology:** the pre-launch gate's 4 cases become a
DRIVER + EVIDENCE bundle any session can rerun per page, forever:

`maestro/failure-matrix/run.sh <page>` — drives the sim through, per page:

1. **offline-enter**: kill connectivity signal (the rig lever: stop the API +
   `crave://` nav), assert skeleton persists + banner + back-out works, screenshot.
2. **online enter-failure**: API down (`kill -9` the :3000 process — the fail lever;
   SIGSTOP = the slow lever), drive the page enter, assert the uniform modal appears
   and dismissal returns to origin, screenshots.
3. **online action-failure**: page loaded, API down, drive one mutation/toggle,
   assert modal + page intact.
4. **no silent mutations**: grep the metro log window for the failure announcement on
   every driven mutation.

Evidence lands in a timestamped dir; markers (`=== MATRIX <page>/<case> ===`) bracket
the metro log. The EYE stays the oracle over the screenshots; the script guarantees
coverage and repeatability. Two self-red-team amendments:

- **Offline needs a RIG LEVER, not real Wi-Fi** (the sim NetInfo wedge). Dev-only
  perf command `set_system_offline` flips a `devOfflineOverride` on the system status
  store; while the override is set (**DEV** only) the NetInfo listener's writes are
  ignored. Command-bus-first, RED-provable (banner appears/disappears on command).
- **Expected outcomes are PER PAGE, from the doctrine**: mutations announce via the
  modal; the polls feed REFRESH failure is the blessed exception (retry ladder +
  deferred freshness state, never the modal) — the runbook encodes that so a quiet
  ladder isn't misread as a silent failure. Mutations needing signed-in state +
  seeded data (favorite hearts, poll votes) are listed as hands-on items, not faked. Run it NOW for: polls, bookmarks, profile, restaurant,
  search (search = the already-proven reference; re-run cheap). **Fix what it finds**
  (the polls reconnect gap in A is finding #1, pre-confirmed by code).

## E. The dated cleanup debt

- Delete the historical map-saga maestro flows (memory: "mostly historical
  throwaway"), KEEPING `maestro/market-demand/` (current), `map-accept.sh` (the
  canonical outer-shell example), and the new `failure-matrix/`.
- Sweep for references before deletion; nothing else may point at them.
- NOT touched: anything under the map surfaces ([LODDBG] stays per memory).

## Sequencing + gates

1. A (reconnect primitive + polls resume + search rewire) — jest/tsc, then matrix
   case 1 on polls proves the resume live.
2. B+C (spec table + derivations + header bark) — RED-proofs: delete a spec row →
   build error names the key; unregister a header in dev → violation names the key.
3. D (harness + full walk on 5 pages) — evidence bundle; fix findings as they land.
4. E (deletion sweep).
   Commits per step; owner feel items stay out (this is correctness, not feel).
