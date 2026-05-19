# Reddit Collector Pipeline

## Shape

- Live ingestion:
  - Reddit API/archive source data -> `LLMPost[]`
  - `ExtractionPipelineService`
  - collection run + extraction runs + stored inputs + evidence events
  - unified processing
  - projection rebuild from active evidence

- Replay by extraction run:
  - existing `collection_extraction_inputs.input_payload`
  - exact stored chunk payloads replayed through `ExtractionPipelineService.processStoredInputs(...)`
  - source documents provide timestamps, scores, subreddit, and URLs for enrichment
  - `input_payload` stays model-facing only, with chunk-local source IDs such as `SRC001`
  - `collection_extraction_inputs.source_map` stores the replay-only mapping from `SRC###` refs back to canonical Reddit IDs

- Replay by collection run:
  - existing `collection_runs`
  - child `collection_extraction_runs`
  - exact stored chunk payloads replayed child-by-child into a new collection run

- Replay by date range:
  - `collection_source_documents`
  - rebuild `LLMPost[]` from stored source docs
  - `ExtractionPipelineService.processPosts(...)`

## Main Services

- [reddit-batch-processing.service.ts](/Users/brandonkimble/crave-search/apps/api/src/modules/content-processing/reddit-collector/reddit-batch-processing.service.ts): Live batch entrypoint.
- [extraction-pipeline.service.ts](/Users/brandonkimble/crave-search/apps/api/src/modules/content-processing/reddit-collector/extraction-pipeline.service.ts): Shared extraction path for live ingestion and replay.
- [collection-evidence.service.ts](/Users/brandonkimble/crave-search/apps/api/src/modules/content-processing/reddit-collector/collection-evidence.service.ts): Persists source docs, extraction runs, extraction inputs.
- [collection-evidence.service.ts](/Users/brandonkimble/crave-search/apps/api/src/modules/content-processing/reddit-collector/collection-evidence.service.ts): Persists source docs, collection runs, extraction runs, extraction inputs.
- [replay.service.ts](/Users/brandonkimble/crave-search/apps/api/src/modules/content-processing/reddit-collector/replay.service.ts): Replay orchestration.
- [projection-rebuild.service.ts](/Users/brandonkimble/crave-search/apps/api/src/modules/content-processing/reddit-collector/projection-rebuild.service.ts): Rebuilds projections from active evidence.
- [unified-processing.service.ts](/Users/brandonkimble/crave-search/apps/api/src/modules/content-processing/reddit-collector/unified-processing.service.ts): Persists entities, events, items, and triggers rebuild.

## Community / Market Boundary

- Reddit collection coverage is driven only by active community-to-market links in `collection_communities`.
- A market existing in `core_markets` does not automatically make it collectible.
- Search and polls can bootstrap locality markets for new areas, but those markets remain poll/search-only until a real community is linked manually.
- Keyword scheduling loads its targets from the linked collectable markets surfaced by `MarketRegistryService.listCommunityMarketTargets(...)`.

## Projection Notes

- `core_restaurant_items` stores:
  - direct menu-item metrics in the base item fields
  - derived support metrics from non-menu-item food/category/food-attribute evidence in `support_*`
- legacy category boost replay tables are no longer part of the pipeline

## Replay Commands

Replay from an existing extraction run:

```bash
yarn workspace api ts-node scripts/replay-extraction-run.ts --source-run <runId>
```

Replay from an existing extraction run and activate the new run immediately:

```bash
yarn workspace api ts-node scripts/replay-extraction-run.ts --source-run <runId> --activate
```

Replay from an existing collection run:

```bash
yarn workspace api ts-node scripts/replay-extraction-run.ts --source-collection-run <collectionRunId>
```

Replay from an existing collection run and activate the new runs immediately:

```bash
yarn workspace api ts-node scripts/replay-extraction-run.ts --source-collection-run <collectionRunId> --activate
```

Replay from stored source documents in a date range:

```bash
yarn workspace api ts-node scripts/replay-extraction-run.ts --platform reddit --community austinfood --start 2026-04-01 --end 2026-04-14
```

Date-range replay with activation:

```bash
yarn workspace api ts-node scripts/replay-extraction-run.ts --platform reddit --community austinfood --start 2026-04-01 --end 2026-04-14 --pipeline chronological --activate
```

## Pipeline Commands

Type-check the API:

```bash
yarn workspace api type-check
```

Build shared types first:

```bash
yarn workspace @crave-search/shared build
```

Run the existing production-fidelity pipeline test:

```bash
yarn workspace api ts-node test-pipeline.ts
```

Schedule archive collection manually:

```bash
yarn workspace api ts-node scripts/archive-collect.ts --subreddit austinfood --wait
```

## Notes

- `--activate` switches the selected source documents to the new extraction run before unified processing rebuilds projections.
- Replay by extraction run reuses the exact stored chunk payloads, not a re-chunked approximation.
- Replay requires `collection_extraction_inputs.source_map`; older stored inputs from before the `SRC###` cutover are not supported.
- Replay by date range can pull in parent post documents when comments in the range depend on older posts for context.
- Projection rebuild is order-independent because active evidence is the source of truth.
- `core_restaurant_items` now stores direct menu-item metrics plus separate derived support metrics; legacy category boost replay tables are no longer used.
- The LLM returns chunk-local `source_id` refs such as `SRC001`, and the collector resolves them back to canonical Reddit source IDs through the separately stored `source_map` before persisting events.
