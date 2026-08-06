#!/usr/bin/env ts-node
/**
 * INVARIANT: identity.author-identity-has-one-home
 *
 * Any read that exposes another person's name must go through
 * `publicAuthorIdentity`, so a deleted account renders as "Deleted user"
 * rather than as whatever a component happens to do with a null.
 *
 * THE INCIDENT. Deletion nulls `username` and `displayName`. Five surfaces
 * each invented their own fallback — `'?'`, `'user'`, a seeded pseudo-name, a
 * bare null, a blank byline — and NONE of them said "deleted". Nothing was
 * broken enough to fail a test; the thread just rendered a nameless comment.
 *
 * THE CHECK. A query that does not select `deletedAt` CANNOT decide the
 * question downstream however careful the mapping is, so the select must be
 * `AUTHOR_SELECT`-based — but selecting is not answering, so the file must
 * also CALL `publicAuthorIdentity`.
 *
 * WHAT THIS CANNOT DO, stated plainly so nobody mistakes a green run for a
 * proof. This is a text scan: it establishes that a file calls the resolver at
 * least once, NOT that every author-bearing path in that file does. A service
 * with three peer reads and one resolver call passes here while two paths ship
 * raw rows.
 *
 * The real enforcement is the TYPE. Where a DTO's author slot is declared as
 * `PublicAuthorIdentity` (see `ConversationPeerDto`), assigning a raw Prisma
 * row fails to compile — `isDeleted` is missing — and the caller cannot
 * forget. Prefer that everywhere an author crosses the wire; this scanner is
 * the backstop for the paths that are not yet typed that way, not a substitute
 * for typing them.
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

import { codeMatches } from './scanner-source';

/** Selects that legitimately take `username` WITHOUT `deletedAt`. */
const ALLOWED: Record<string, string> = {
  'src/modules/identity/public-author-identity.ts':
    'Defines AUTHOR_SELECT itself.',
  'src/shared/invariants/registry.ts':
    'Not a query: its `username: true` lives inside a mutation FIXTURE string — the deliberately-broken file this very invariant is proven against. It passed the old identifier-presence check only because it names `publicAuthorIdentity` in prose, which is the same false pass F2050 fixed.',
  'src/modules/identity/user.service.ts':
    'Two own-or-filtered reads: the public profile already filters deletedAt: null (a ghost has no profile page), and updateMe returns the caller their own row.',
  'src/modules/identity/username.service.ts':
    'Handle availability — reads the username column as a string, never as a byline.',
  'src/modules/identity/account-deletion.service.ts':
    'Collects held handles to burn them into reserved_usernames. Not a byline.',
  'src/modules/identity/person-data/person-data-eraser.service.ts':
    'Erasure executor.',
  'src/modules/polls/poll-graduation.service.ts':
    'Internal attribution for graduation bookkeeping; emits no byline.',
  'src/modules/messaging/share-package-resolver.service.ts':
    "Renders the share package title from the LIST owner's handle at share time; the recipient sees a package, not a profile.",
};

const files = execSync(
  `grep -rl "username: true" src --include="*.ts" || true`,
  { encoding: 'utf8' },
)
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .filter((f) => !f.includes('.spec.'));

if (files.length === 0) {
  // Missing tooling is a FAILURE, never a pass.
  console.error('FAIL: found no user selects at all — the scan is broken.');
  process.exit(1);
}

const failures: string[] = [];
for (const file of files) {
  if (ALLOWED[file]) continue;
  const src = readFileSync(file, 'utf8');
  // Selecting `deletedAt` is not enough — a file can select it and still ship
  // the raw row. The builder is the thing that decides what the world sees, so
  // the builder is what must be present.
  //
  // F2050: this used to test for the bare identifier, which an UNUSED IMPORT
  // satisfies. That is not a hypothetical — messaging.service.ts imported
  // `publicAuthorIdentity`, never called it, shipped the raw user row (leaking
  // `deletedAt` and rendering a deleted peer as two nulls), and this scanner
  // reported OK. A scanner an import can satisfy is not a scanner. Require the
  // CALL.
  // ...and against CODE, not prose: a comment explaining how carefully this
  // file handles deleted authors would otherwise satisfy the guard.
  if (!codeMatches(/publicAuthorIdentity\s*\(/, src, file)) {
    failures.push(
      `${file}: exposes a username without going through publicAuthorIdentity, ` +
        `so a deleted author renders as whatever this file does with a null. ` +
        `Use AUTHOR_SELECT + publicAuthorIdentity, or classify it in ALLOWED ` +
        `with a reason.`,
    );
  }
}
for (const file of Object.keys(ALLOWED)) {
  if (!files.includes(file)) {
    failures.push(
      `${file}: classified here but no longer selects username — stale entry.`,
    );
  }
}

if (failures.length) {
  console.error(
    'author-identity FAILED:\n' + failures.map((f) => `  - ${f}`).join('\n'),
  );
  process.exit(1);
}
console.log(
  `author-identity OK — ${files.length} user selects, all either AUTHOR_SELECT-based or classified.`,
);
