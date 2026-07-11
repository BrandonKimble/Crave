#!/bin/bash
# Verified dev-client reload (root-cause fix for the stale-first-launch trap).
#
# WHY: the dev client persists its last bundle revision and requests a DELTA on the next
# launch. If that delta is computed while Metro's graph is still absorbing a batch of file
# writes, the client boots MIXED module revisions — a one-boot ReferenceError that clears on
# the next launch. This script makes freshness a VERIFIED fact instead of a double-relaunch
# superstition:
#   1. force a FULL graph build and wait for it to complete (curl blocks until served);
#   2. quiesce: rebuild again until two consecutive builds are byte-identical (the graph has
#      absorbed every pending write);
#   3. cold relaunch through the dev-client URL;
#   4. verify the booted session logged no ReferenceError; retry once, then fall back to
#      uninstall+reinstall (clears the client's cached revision) if still dirty.
#
# Usage: scripts/rig/reload-dev-client.sh [udid]
set -euo pipefail
UDID="${1:-7B0DD874-3496-46F7-9480-3EDDABCE2F31}"
BUNDLE_URL="http://localhost:8081/apps/mobile/AppEntry.bundle?platform=ios&dev=true"
DEV_CLIENT_URL="crave://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
APP_ID="com.brandonkimble.cravesearch"
METRO_LOG="/tmp/crave-metro.log"

hash_bundle() {
  # -f: a bundler ERROR page (HTTP 500) must not hash as a stable "quiescent" build.
  curl -sf "$BUNDLE_URL" | shasum -a 256 | cut -d' ' -f1
}

# 1+2: build until the graph is quiescent (two identical consecutive full builds).
previous_hash="$(hash_bundle)"
quiescent=false
for attempt in 1 2 3 4 5; do
  sleep 1
  current_hash="$(hash_bundle)"
  if [[ "$current_hash" == "$previous_hash" ]]; then
    quiescent=true
    break
  fi
  previous_hash="$current_hash"
done
if [[ "$quiescent" != "true" ]]; then
  echo "FATAL: bundle never quiesced (graph still churning after 5 rebuilds)" >&2
  exit 1
fi
echo "bundle quiescent: ${current_hash:0:12}"

boot_and_check() {
  xcrun simctl terminate "$UDID" "$APP_ID" 2>/dev/null || true
  sleep 1
  # Boot boundary = COUNT delta, not offsets (Metro's fd clobbers appended bytes and a
  # prior dirty boot's error stays in any tail window — counts only grow on a NEW error).
  local errors_before errors_after
  errors_before=$(tail -c 800000 "$METRO_LOG" 2>/dev/null | grep -ac "ReferenceError" || true)
  xcrun simctl launch "$UDID" "$APP_ID" >/dev/null 2>&1 || true
  sleep 2
  xcrun simctl openurl "$UDID" "$DEV_CLIENT_URL"
  sleep 10
  errors_after=$(tail -c 800000 "$METRO_LOG" 2>/dev/null | grep -ac "ReferenceError" || true)
  [[ "$errors_after" -le "$errors_before" ]]
}

if boot_and_check; then
  echo "boot clean"
  exit 0
fi
echo "boot dirty — retrying once"
if boot_and_check; then
  echo "boot clean on retry"
  exit 0
fi
echo "still dirty — clearing the dev client's cached revision (uninstall/reinstall)"
APP_PATH="$HOME/Library/Developer/Xcode/DerivedData/cravesearch-ebulueazabvxrcfekwsqmhnjeydn/Build/Products/Debug-iphonesimulator/cravesearch.app"
xcrun simctl uninstall "$UDID" "$APP_ID"
xcrun simctl install "$UDID" "$APP_PATH"
boot_and_check && echo "boot clean after reinstall"
