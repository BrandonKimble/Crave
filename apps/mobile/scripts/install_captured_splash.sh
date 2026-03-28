#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: bash apps/mobile/scripts/install_captured_splash.sh /absolute/path/to/captured-splash.png" >&2
  exit 1
fi

SOURCE_PNG="$1"
ROOT="/Users/brandonkimble/crave-search/apps/mobile"

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
