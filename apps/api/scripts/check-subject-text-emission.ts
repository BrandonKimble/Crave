#!/usr/bin/env ts-node
/**
 * INVARIANT: signals.subject-text-emission
 *
 * A person's typed words may leave a query only if the read is scoped to that
 * person's own actor, or the words have cleared the k-anonymity floor
 * (`signal_emittable_terms`).
 *
 * WHY A CLOSED ALLOWLIST RATHER THAN A PATTERN. The previous guard counted
 * calls to a helper inside ONE file and called that the invariant. It passed
 * while `warm-query-embedding-cache` read the raw column and shipped the terms
 * to a third-party embedding API — the guard could not see the file, and no
 * amount of cleverness inside that file would have helped. A rule about every
 * query in the repo has to be checked against every query in the repo.
 *
 * So: every file that touches `subject_text` must appear below with a stated
 * classification. A new one fails until someone writes down which kind it is.
 * That is the point — the failure is the design review.
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

import { codeMatches } from './scanner-source';

type Classification =
  /** Reads only the caller's own acts (actor_id = the requesting user). */
  | 'own-scoped'
  /** Write / aggregate path: text moves between our own tables, never out. */
  | 'internal-pipeline'
  /** Emits across people, and joins signal_emittable_terms to do it. */
  | 'floored'
  /** Names the column in prose, policy, or a test — not a query. */
  | 'declaration';

const ALLOWED: Record<string, { class: Classification; why: string }> = {
  'src/modules/search/search-query-suggestion-lane-failure.spec.ts': {
    class: 'declaration',
    why: 'One COMMENT (line ~139) noting the ledger lowercases subjectText at write — prose about a fact proven elsewhere, no query, no read. Pulled in because file DISCOVERY is a raw grep (by design: prose touchers must be classified, and this classification is that review).',
  },
  'src/modules/search/search-query-interpretation.service.ts': {
    class: 'declaration',
    why: "One COMMENT (line ~619) explaining why the on_demand_ask signal carries the FUSED detected locale rather than the request header: subject_text keys demand on raw untagged text (A10), so detected_locale is the only record of which language's word is being held. The file EMITS a signal (it writes subject via signals.record) and never reads subject_text — the write path's own classification lives on signals.service.ts (internal-pipeline). Prose about that fact, no query, no read.",
  },
  'scripts/scanner-source.spec.ts': {
    class: 'declaration',
    why: 'Names the column inside a fixture STRING that proves the comment-stripper keeps SQL in a template literal — precisely so this guard is not blinded by the strip. No query, no read.',
  },
  'src/modules/signals/subject-text-floor.ts': {
    class: 'declaration',
    why: 'The floor itself — the doorway to the view and the statement of this rule.',
  },
  'src/modules/signals/subject-text-floor.integration.spec.ts': {
    class: 'declaration',
    why: 'Proves the floor holds against the real database and the real reader.',
  },
  'src/modules/search/demand-vocabulary-term-locale.integration.spec.ts': {
    class: 'declaration',
    why: "Seeds its OWN synthetic asks (three scratch actor uuids it deletes again) and drives the real sweep over them, to prove the known-set gate is scoped to the term's locale chain. It writes subject_text and reads only what the SERVICE returns — the service's own floored classification is the one that governs the emission; this file adds no read of anyone's real words.",
  },
  'src/modules/identity/person-data/person-data-class.ts': {
    class: 'declaration',
    why: "Declares the column's DELETION disposition (null_column). A different policy about the same column; deletion and exposure change for different reasons and are deliberately not fused.",
  },
  'src/modules/signals/signal-demand-read.service.ts': {
    class: 'floored',
    why: 'queryDemand + territoryUnmetAsks emit across people and join the view; the three personal lanes are own-scoped and must NOT (a floor there would hide your own history from you).',
  },
  'scripts/warm-query-embedding-cache.ts': {
    class: 'floored',
    why: 'Cross-person AND outbound (terms go to the embedding API). Joins the view. This is the read that proved the old guard was a proxy rather than the invariant.',
  },
  'src/modules/search/demand-vocabulary.service.ts': {
    class: 'floored',
    why: "Learns vocabulary from UNMET asks — cross-person and outbound to an LLM. Its own gate was MIN_ASKS = 1 over count(*), i.e. no floor at all: one person's single unmatched search went straight to a third party. Joins the view now.",
  },
  'src/modules/search/search.service.ts': {
    class: 'own-scoped',
    why: "Cache-reveal replay: re-records the requesting user's own search act, joined to signal_actors on their own user_id.",
  },
  'src/modules/signals/signals.service.ts': {
    class: 'internal-pipeline',
    why: 'The write path — where subject_text originates.',
  },
  'src/modules/signals/signal-demand-aggregate.service.ts': {
    class: 'internal-pipeline',
    why: 'signals -> signal_demand_daily rollup. Text moves between our tables at unchanged grain.',
  },
  'src/modules/signals/user-taste-profile.builder.ts': {
    class: 'internal-pipeline',
    why: "Builds the per-actor taste profile; the row is that one actor's own derived data and is deleted with them.",
  },
  'scripts/check-subject-text-emission.ts': {
    class: 'declaration',
    why: 'This scanner.',
  },
  'src/shared/invariants/registry.ts': {
    class: 'declaration',
    why: 'Registers this invariant; names the column inside its RED mutation string.',
  },
  'src/modules/identity/person-data/person-data-eraser.service.ts': {
    class: 'declaration',
    why: 'Names the column in a comment explaining erasure ORDER (null_column must precede sever, because the person-scope predicate needs the signal_actors mapping that sever destroys). Executes the declaration; does not read text.',
  },
  'src/modules/identity/person-data/person-data-erasure-proof.integration.spec.ts':
    {
      class: 'declaration',
      why: 'Seeds one signal WITH subject_text to prove the erasure ORDER destroys it before sever makes it unreachable. Writes the column; never emits it.',
    },
  'src/modules/identity/person-data/person-data-scope.integration.spec.ts': {
    class: 'declaration',
    why: "Proves each rule's SCOPE can reach the person; names subject_text only as a secondary column in its allowlist of reasons.",
  },
  'src/modules/signals/act-identity.ts': {
    class: 'internal-pipeline',
    why: 'A SQL BUILDER: emits `a.subject_text` as a dedupe/grouping key for callers. Never selects it out — the comment at line 73 says exactly that neither slot is read downstream.',
  },
  'src/modules/search/search-query-suggestion.service.ts': {
    class: 'declaration',
    why: 'Prose only — a note that the ledger lowercases subjectText at write. Its private k-floor was deleted 2026-08-03; the floor has one home.',
  },
  'src/modules/signals/signals.service.spec.ts': {
    class: 'declaration',
    why: 'Asserts the write path records the term.',
  },
  'src/modules/signals/signal-demand-read.service.spec.ts': {
    class: 'declaration',
    why: "Unit tests over the reader's SQL shape.",
  },
  'src/modules/search/on-demand-ask-signal.spec.ts': {
    class: 'declaration',
    why: 'Asserts an unmet ask records its term.',
  },
  'src/modules/search/search-signals-write.spec.ts': {
    class: 'declaration',
    why: 'Asserts the search write path records its term.',
  },
  'src/modules/polls/supply/demand-mass.reader.ts': {
    class: 'internal-pipeline',
    why: 'subject_text is a GROUPING dimension for act-identity dedupe inside a CTE; the outer select projects place + mass only. No text is returned.',
  },
};

/** A file classified `floored` must actually join the view. */
const FLOOR_JOIN = /signal_emittable_terms|emittableTermsJoinSql/;

const roots = ['src', 'scripts', 'prisma'];
const hits = execSync(
  `grep -rl "subject_text\\|subjectText" ${roots.join(' ')} --include="*.ts" --include="*.sql" || true`,
  { encoding: 'utf8', cwd: process.cwd() },
)
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  // Migrations are a historical record, not a live read surface.
  .filter((file) => !file.startsWith('prisma/migrations/'));

if (hits.length === 0) {
  // MISSING TOOLING IS A FAILURE, NEVER A PASS: a grep that matches nothing
  // where the column demonstrably exists means the scan did not run.
  console.error(
    'FAIL: scanned for subject_text and found NOTHING. The scan is broken, ' +
      'not the codebase clean.',
  );
  process.exit(1);
}

const failures: string[] = [];
for (const file of hits) {
  const entry = ALLOWED[file];
  if (!entry) {
    failures.push(
      `${file}: touches subject_text but is not classified. Add it to ALLOWED ` +
        `in this script with its classification and why — is it own-scoped, ` +
        `internal-pipeline, floored, or a declaration?`,
    );
    continue;
  }
  if (
    entry.class === 'floored' &&
    // CODE, not prose: `-- we deliberately do NOT join signal_emittable_terms`
    // would otherwise be a passing grade.
    !codeMatches(FLOOR_JOIN, readFileSync(file, 'utf8'), file)
  ) {
    failures.push(
      `${file}: classified 'floored' but does not join signal_emittable_terms.`,
    );
  }
}

for (const file of Object.keys(ALLOWED)) {
  if (!hits.includes(file)) {
    failures.push(
      `${file}: classified here but no longer touches subject_text — stale ` +
        `entry. Remove it, so the list keeps describing the code.`,
    );
  }
}

if (failures.length) {
  console.error(
    'subject-text-emission FAILED:\n' +
      failures.map((f) => `  - ${f}`).join('\n'),
  );
  process.exit(1);
}
console.log(
  `subject-text-emission OK — ${hits.length} files touch subject_text, all classified.`,
);
