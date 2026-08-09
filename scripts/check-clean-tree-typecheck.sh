#!/usr/bin/env bash
# @script-class: gate
# @run-by: lefthook.yml pre-push (job clean-tree-typecheck); also runnable by
#     hand as `bash scripts/check-clean-tree-typecheck.sh [ref]`.
#
# THE PHANTOM-TREE FENCE (F9986).
#
# On 2026-08-09 main was committed-broken on api type-check and every lane's
# own `tsc` had been green. Nobody was careless. The mechanism:
#
#   Lanes share ONE working tree. `tsc` reads the tree, which contains every
#   other lane's UNCOMMITTED edits. So a lane can typecheck a state that no
#   commit will ever reproduce.
#
# Concretely, that night: one lane removed the producers of
# `RestaurantResult.restaurantAliases`; a DIFFERENT lane had, uncommitted, the
# removal of the field from the shared type. Each half typechecks green beside
# the other half. Committed alone, the producer removal left a required field
# nobody supplied — seven errors on main, Railway's docker build dead, every
# staging deploy blocked.
#
# The rule "run tsc before committing" was already followed. It could not have
# helped: the compiler was reading a phantom. This is the invariant-registry
# doctrine applied to our own process — a rule a lane can satisfy and still
# break main is not a mechanism.
#
# WHAT THIS DOES. Checks out the commit being pushed into a THROWAWAY detached
# worktree — no uncommitted anything — and typechecks THAT. It is the exact
# check that diagnosed the incident, mechanized. Takes about a minute.
#
# THE PRISMA TRAP, and why this refuses instead of guessing.
# The generated Prisma client lives in the SHARED node_modules and is built
# from whatever `prisma/schema.prisma` looked like at generate time — usually
# some lane's dirty schema. Symlinking node_modules into a clean worktree
# therefore pairs committed SOURCE with an uncommitted-derived CLIENT: a second
# phantom, one layer down. During the incident this produced twelve confident
# errors about `Entity.aliases` that had nothing to do with the real break.
#
# Prisma records its input at node_modules/.prisma/client/schema.prisma, so the
# pairing is CHECKABLE. If it does not match the schema in the commit being
# pushed, this gate reports that it cannot trust the result and says how to fix
# it — rather than emitting errors it cannot stand behind. A gate that reports
# a verdict it knows is unfounded is worse than no gate: it teaches people to
# ignore it.
set -euo pipefail

REF="${1:-HEAD}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
# The worktree lives INSIDE the repo, deliberately. Node resolves modules by
# walking UP from the importing file, so a worktree nested here finds the real
# node_modules on its own. A worktree in /tmp with a symlinked node_modules does
# NOT: TypeScript resolves the symlink to its real path and then cannot locate
# @types at all, so EVERY commit fails on `TS2688 Cannot find type definition
# file for 'minimatch'`. That was this gate's first version, and it would have
# been RED on everything — by this repo's own law, exactly as useless as a gate
# that can only be green. Caught by requiring it to PASS on a known-good commit,
# not merely to fail on a known-bad one.
WORKTREE="$REPO_ROOT/.clean-typecheck-worktree"

cleanup() {
  git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [[ -n "${SKIP_CLEAN_TYPECHECK:-}" ]]; then
  # The loud hotfix escape, mirroring deploy.sh's --force. Announced, never
  # silent: a skipped gate must be legible in the transcript afterwards.
  echo "clean-tree-typecheck: SKIPPED (SKIP_CLEAN_TYPECHECK set) — main may not typecheck standalone"
  exit 0
fi

COMMIT="$(git -C "$REPO_ROOT" rev-parse --short "$REF")"
echo "clean-tree-typecheck: checking $COMMIT in a clean worktree (no uncommitted state)"

rm -rf "$WORKTREE"
git -C "$REPO_ROOT" worktree add -q --detach "$WORKTREE" "$REF"

# Dependencies come from the shared install (found by walking up), so there is
# no per-run `yarn install` to make this gate too slow to keep. Yarn only
# PARTIALLY hoists, though: each workspace also has its own node_modules for
# what could not go to the root, and without those `apps/mobile` fails on
# `TS2688 Cannot find type definition file for 'minimatch'` — its tsconfig
# names that type explicitly. Link the per-package trees too, or the gate is
# red on every commit for a reason that has nothing to do with the commit.
for PKG_DIR in packages/shared apps/api apps/mobile; do
  if [[ -d "$REPO_ROOT/$PKG_DIR/node_modules" && -d "$WORKTREE/$PKG_DIR" ]]; then
    ln -sfn "$REPO_ROOT/$PKG_DIR/node_modules" "$WORKTREE/$PKG_DIR/node_modules"
  fi
done

# TRUST BEFORE VERDICT. Establish that the generated Prisma client matches the
# schema in the commit BEFORE typechecking, not after — otherwise the run
# drowns the real break in artifact errors. During the incident, checking HEAD
# against a client generated from another lane's dirty schema produced twelve
# confident errors about `Entity.aliases` and ZERO about the actual defect.
GENERATED_SCHEMA="$REPO_ROOT/node_modules/.prisma/client/schema.prisma"
COMMITTED_SCHEMA="$WORKTREE/apps/api/prisma/schema.prisma"
if [[ -f "$GENERATED_SCHEMA" && -f "$COMMITTED_SCHEMA" ]] \
   && ! diff -q "$GENERATED_SCHEMA" "$COMMITTED_SCHEMA" >/dev/null 2>&1; then
  echo ""
  echo "clean-tree-typecheck: CANNOT VERIFY $COMMIT — regenerate Prisma first."
  echo ""
  echo "Your generated Prisma client was built from a DIFFERENT schema than the"
  echo "one in this commit (usually because a lane has prisma/schema.prisma"
  echo "dirty). Every Prisma-derived type would be checked against the wrong"
  echo "shape, so any verdict here — pass OR fail — would be about a database"
  echo "model that is not the one being pushed."
  echo ""
  echo "This is a REFUSAL, not a failure: the api has not been verified, so"
  echo "pushing now means pushing unchecked. Fix in seconds:"
  echo ""
  echo "  cd apps/api && npx prisma generate"
  echo ""
  echo "If the schema difference is another lane's uncommitted work, that lane"
  echo "owns it — regenerating locally is still safe and still correct for you."
  exit 1
fi

STATUS=0
for PKG in packages/shared apps/api apps/mobile; do
  [[ -f "$WORKTREE/$PKG/tsconfig.json" ]] || continue
  echo "  → $PKG"
  if ! (cd "$WORKTREE/$PKG" && npx tsc --noEmit -p tsconfig.json) 2>&1 | sed 's/^/    /'; then
    STATUS=1
  fi
done

if [[ $STATUS -ne 0 ]]; then
  echo ""
  echo "clean-tree-typecheck FAILED: $COMMIT does NOT typecheck on its own."
  echo ""
  echo "Your working tree is green because it holds other lanes' uncommitted"
  echo "edits. This is what CI and Railway's docker build will see, and it is"
  echo "what main will be. Usually the missing half belongs to another lane —"
  echo "find it and let its author land it; do not sweep their files into your"
  echo "commit (see scripts/check-lane-pathspec.sh)."
  exit 1
fi

echo "clean-tree-typecheck: $COMMIT typechecks standalone."
