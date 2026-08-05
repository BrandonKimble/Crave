#!/usr/bin/env bash
# The native engine's PURE falsifiers, compiled from the SAME headers the app
# compiles. Host clang, no simulator (the MapLodKit pure-engine precedent).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
status=0
for suite in TrackDomainRangeTests TrackEngineFactsTests; do
  echo "── $suite ──"
  clang -std=c11 -Wall -Werror -o "$TMP/$suite" "$DIR/$suite.c" -lm
  "$TMP/$suite" || status=1
done
exit "$status"
