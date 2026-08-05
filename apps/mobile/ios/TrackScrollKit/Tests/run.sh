#!/usr/bin/env bash
# The domain authority's falsifiers, compiled from the SAME header the app
# compiles. Host clang, no simulator (the MapLodKit pure-engine precedent).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$(mktemp -d)/track-domain-range-tests"
clang -std=c11 -Wall -Werror -o "$OUT" "$DIR/TrackDomainRangeTests.c" -lm
"$OUT"
