/**
 * @script-class: gate
 * @run-by: yarn invariants (campaign.attribution-crosses-every-queue-boundary)
 *
 * GATE: campaign attribution survives every async boundary.
 *
 * THE LAW (work-context.ts, D4): campaign attribution is AMBIENT
 * (AsyncLocalStorage), and ALS dies at every durable boundary — a BullMQ
 * enqueue, a batch job another process will poll. Code that crosses one must
 * CAPTURE the context into the payload (snapshotWorkContext() /
 * currentCampaignId()) and the far side must RE-ESTABLISH it
 * (runInWorkContext). Each historical miss was a real metering hole: the
 * enrichment queue (F352), the batch poll cron (D4, ~7% metered), the
 * attribute-ontology queue.
 *
 * ENFORCEMENT SHAPE:
 *  1. Every DECLARED campaign boundary pair below must keep both halves —
 *     a capture in the producer, a re-establish in the consumer.
 *  2. GROWTH TRIPWIRE: any file using @nestjs/bullmq's InjectQueue that is
 *     neither a declared producer nor in the reviewed list FAILS until a
 *     human classifies it (campaign-bearing → declare a pair; not → add to
 *     REVIEWED with the reason).
 *
 * RED PROOF: strip the `campaignId: currentCampaignId()` stash out of a
 * declared producer and this exits 1 naming the half that went missing.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const API = join(__dirname, '..');
const CAPTURE =
  /snapshotWorkContext\s*\(|currentCampaignId\s*\(|currentWorkContext\s*\(/;
const REESTABLISH = /runInWorkContext\s*\(/;

/** Producer → consumer, for every boundary campaign spend crosses. */
const BOUNDARIES: Array<{ producer: string; consumer: string }> = [
  {
    producer:
      'src/modules/restaurant-enrichment/restaurant-enrichment-queue.service.ts',
    consumer:
      'src/modules/restaurant-enrichment/restaurant-enrichment.worker.ts',
  },
  {
    producer:
      'src/modules/restaurant-enrichment/restaurant-secondary-location-expansion-queue.service.ts',
    consumer:
      'src/modules/restaurant-enrichment/restaurant-secondary-location-expansion.worker.ts',
  },
  {
    producer:
      'src/modules/attribute-ontology/attribute-ontology-queue.service.ts',
    consumer: 'src/modules/attribute-ontology/attribute-ontology.worker.ts',
  },
  {
    // The pooled batch rail: the runner stashes the ambient context on the
    // durable job (resumeContext); the batch service re-establishes it when
    // ingest resumes in whichever process polls the job to terminal state.
    producer: 'src/modules/external-integrations/llm/pooled-batch-runner.ts',
    consumer: 'src/modules/external-integrations/llm/gemini-batch.service.ts',
  },
];

/** InjectQueue users reviewed 2026-08-12 as NOT campaign-bearing at enqueue
 *  time, each with the reason. A new InjectQueue file must be classified. */
const REVIEWED = new Map<string, string>([
  [
    'src/shared/invariants/registry.ts',
    'DECLARES this gate (names InjectQueue in prose) so the invariant ' +
      'harness can prove it; the registry never enqueues anything',
  ],
  [
    'src/modules/restaurant-enrichment/restaurant-cuisine-extraction-queue.service.ts',
    'enqueued from the enrichment worker, which has already re-established ' +
      'the context; the cuisine job spends inside the batch-ingest wrap',
  ],
  [
    'src/modules/content-processing/reddit-collector/keyword-search-orchestrator.service.ts',
    'collection scheduling — campaign attribution rides runMetadata into the ' +
      'batch resumeContext (extraction-pipeline), not this queue payload',
  ],
  [
    'src/modules/content-processing/reddit-collector/chronological/chronological-collection.worker.ts',
    'chronological collection: steady-state Tier-2 lane, no campaign',
  ],
  [
    'src/modules/content-processing/reddit-collector/keyword-batch-processing.worker.ts',
    'consumer half of keyword collection; campaign rides runMetadata',
  ],
  [
    'src/modules/content-processing/reddit-collector/archive/archive-ingestion.service.ts',
    'archive load: its campaign is threaded explicitly through runMetadata',
  ],
  [
    'src/modules/content-processing/reddit-collector/chronological/collection-job-scheduler.service.ts',
    'scheduler — dispatches steady-state Tier-2 collection, no campaign',
  ],
  [
    'src/modules/content-processing/reddit-collector/chronological/chronological-batch.worker.ts',
    'consumer half of chronological collection, no campaign',
  ],
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

const failures: string[] = [];

for (const { producer, consumer } of BOUNDARIES) {
  let producerText: string;
  let consumerText: string;
  try {
    producerText = readFileSync(join(API, producer), 'utf-8');
  } catch {
    failures.push(
      `declared producer missing: ${producer} (moved? update BOUNDARIES)`,
    );
    continue;
  }
  try {
    consumerText = readFileSync(join(API, consumer), 'utf-8');
  } catch {
    failures.push(
      `declared consumer missing: ${consumer} (moved? update BOUNDARIES)`,
    );
    continue;
  }
  if (!CAPTURE.test(producerText)) {
    failures.push(
      `${producer}: no context CAPTURE (snapshotWorkContext/currentCampaignId) — ` +
        'campaign spend enqueued here will meter as unattributed',
    );
  }
  if (!REESTABLISH.test(consumerText)) {
    failures.push(
      `${consumer}: no runInWorkContext RE-ESTABLISH — the captured campaign ` +
        'dies at the boundary',
    );
  }
}

const producers = new Set(BOUNDARIES.map((b) => b.producer));
const srcFiles = walk(join(API, 'src'));
if (srcFiles.length === 0) {
  console.error('FAIL: scanned zero files — the scan itself is broken.');
  process.exit(1);
}
for (const file of srcFiles) {
  const rel = file.slice(API.length + 1);
  const text = readFileSync(file, 'utf-8');
  if (!/InjectQueue/.test(text)) continue;
  if (producers.has(rel) || REVIEWED.has(rel)) continue;
  failures.push(
    `${rel}: NEW queue boundary (InjectQueue) — classify it: campaign-bearing ` +
      '(declare a producer/consumer pair) or not (add to REVIEWED with the reason)',
  );
}

if (failures.length) {
  console.error('FAIL: campaign attribution does not survive every boundary:');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `OK: ${BOUNDARIES.length} declared boundaries intact; every InjectQueue user classified.`,
);
