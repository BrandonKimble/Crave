#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: bash apps/mobile/scripts/install_captured_splash.sh /absolute/path/to/captured-splash.png" >&2
  exit 1
fi

SOURCE_PNG="$1"
# F867 (2026-08-03): this was a HARDCODED absolute path
# (`/Users/brandonkimble/crave-search/apps/mobile`) that a repo move broke — the directory
# does not exist, and under `set -euo pipefail` the first `cp` aborted, so the whole
# splash-capture pipeline (capture_splash_from_studio.sh calls this as its final step) was
# dead. Derived from THIS script's own location, the sibling generate-pin-shadow.mjs pattern:
# apps/mobile/scripts -> apps/mobile. The path is still absolute (CLAUDE.md's law); it is
# just no longer a guess about where the repo lives.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "$SOURCE_PNG" ]]; then
  echo "capture file not found: $SOURCE_PNG" >&2
  exit 1
fi

TARGETS=(
  "$ROOT/src/assets/splash.png"
  "$ROOT/ios/cravesearch/Images.xcassets/SplashScreen.imageset/image.png"
  "$ROOT/ios/cravesearch/Images.xcassets/SplashScreenBackground.imageset/image.png"
)

for target in "${TARGETS[@]}"; do
  cp "$SOURCE_PNG" "$target"
  echo "installed $target"
done
